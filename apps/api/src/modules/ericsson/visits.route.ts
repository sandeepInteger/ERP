import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { FE_LOCATION_VIEW_ROLES, Role } from "@erp/types";
import { forbidden, httpError, notFound } from "../../lib/http.js";
import { assertCanWorkOnSite, logEvent, personName } from "./ericsson.shared.js";
import { acceptPoints, checkInDistance, isFar, locationIntervalSeconds, visitMinutes } from "./visits.logic.js";

// Field engineer site visits: Check in / Check out with location, and the location points the phone
// sends while checked in. Location is only ever recorded inside a visit, and only after the FE agreed.
// FEs see only their own visit; FE_LOCATION_VIEW_ROLES see a site's visits and trails.

const IdParams = z.object({ id: z.string().min(1) });
const LAT = z.number().min(-90).max(90);
const LNG = z.number().min(-180).max(180);
const ACCURACY = z.number().min(0).max(100_000).optional();

const CheckInSchema = z.object({
  lat: LAT,
  lng: LNG,
  accuracy: ACCURACY,
  source: z.enum(["app", "browser"]).default("browser"),
  /** Must be true the first time (records the FE's agreement). */
  consent: z.boolean().optional(),
});

const CheckOutSchema = z.object({ lat: LAT.optional(), lng: LNG.optional(), accuracy: ACCURACY })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), { message: "Give both lat and lng, or neither" });

const PointsSchema = z.object({
  points: z.array(z.object({ lat: LAT, lng: LNG, accuracy: ACCURACY, recordedAt: z.string().datetime() })).min(1).max(200),
});

const VISIT_INCLUDE = {
  site: { select: { id: true, siteCode: true, venueName: true } },
  user: { select: { id: true, firstName: true, lastName: true } },
  points: { orderBy: { recordedAt: "desc" as const }, take: 1, select: { lat: true, lng: true, accuracy: true, recordedAt: true } },
  _count: { select: { points: true } },
} as const;

type VisitRow = {
  id: string; siteId: string; userId: string; checkInAt: Date; checkInLat: number; checkInLng: number; checkInAccuracy: number | null;
  checkInDistanceM: number | null; checkOutAt: Date | null; checkOutLat: number | null; checkOutLng: number | null;
  checkOutAccuracy: number | null; checkOutBy: string | null; source: string;
  site: { id: string; siteCode: string; venueName: string };
  user: { id: string; firstName: string; lastName: string };
  points: { lat: number; lng: number; accuracy: number | null; recordedAt: Date }[];
  _count: { points: number };
};

function shapeVisit(v: VisitRow, now: Date) {
  return {
    id: v.id,
    site: v.site,
    user: { id: v.user.id, name: personName(v.user) },
    checkInAt: v.checkInAt,
    checkIn: { lat: v.checkInLat, lng: v.checkInLng, accuracy: v.checkInAccuracy },
    distanceM: v.checkInDistanceM,
    far: isFar(v.checkInDistanceM),
    checkOutAt: v.checkOutAt,
    checkOut: v.checkOutLat != null && v.checkOutLng != null ? { lat: v.checkOutLat, lng: v.checkOutLng, accuracy: v.checkOutAccuracy } : null,
    checkOutBy: v.checkOutBy,
    minutes: visitMinutes(v, now),
    source: v.source,
    pointCount: v._count.points,
    lastPoint: v.points[0] ?? null,
  };
}

function assertCanViewLocation(role: string) {
  if (!FE_LOCATION_VIEW_ROLES.has(role)) throw forbidden("Only the PM, delivery lead and leadership can see field engineers' locations");
}

export async function visitsRoute(app: FastifyInstance) {
  const guard = { preHandler: app.authenticate };
  const intervalSeconds = () => locationIntervalSeconds(process.env["FE_LOCATION_INTERVAL_SECONDS"]);

  // ─── Field engineer ────────────────────────────────────────────────────────

  /** The FE's open visit (if any), whether they've agreed to location sharing, and how often to send location. */
  app.get("/api/field/visits/current", guard, async (req) => {
    const [user, open] = await Promise.all([
      app.db.user.findUnique({ where: { id: req.user.sub }, select: { locationConsentAt: true } }),
      app.db.ericssonSiteVisit.findFirst({ where: { userId: req.user.sub, checkOutAt: null }, include: VISIT_INCLUDE, orderBy: { checkInAt: "desc" } }),
    ]);
    return { intervalSeconds: intervalSeconds(), consentAt: user?.locationConsentAt ?? null, visit: open ? shapeVisit(open, new Date()) : null };
  });

  app.post("/api/field/sites/:id/check-in", guard, async (req, reply) => {
    if (req.user.role !== Role.FIELD_CREW) throw forbidden("Check-in is for field engineers");
    const { id: siteId } = IdParams.parse(req.params);
    const body = CheckInSchema.parse(req.body);
    await assertCanWorkOnSite(app, req.user, siteId);

    const user = await app.db.user.findUniqueOrThrow({ where: { id: req.user.sub }, select: { locationConsentAt: true, firstName: true, lastName: true } });
    if (!user.locationConsentAt && body.consent !== true) {
      throw httpError(400, "Please agree to location sharing before checking in", { code: "CONSENT_REQUIRED" });
    }
    const site = await app.db.ericssonSite.findUniqueOrThrow({ where: { id: siteId }, select: { latitude: true, longitude: true, step: true } });
    if (site.step === "CLOSED") throw httpError(409, "This site is closed");
    const distanceM = checkInDistance(site, body);

    const visit = await app.db.$transaction(async (tx) => {
      // One open visit per FE: serialise this FE's check-ins so two taps can't open two visits.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user.sub}))`;
      const open = await tx.ericssonSiteVisit.findFirst({ where: { userId: req.user.sub, checkOutAt: null }, select: { site: { select: { siteCode: true } } } });
      if (open) throw httpError(409, `You're already checked in at ${open.site.siteCode}. Check out there first.`);
      if (!user.locationConsentAt) await tx.user.update({ where: { id: req.user.sub }, data: { locationConsentAt: new Date() } });
      const now = new Date();
      return tx.ericssonSiteVisit.create({
        data: {
          siteId, userId: req.user.sub, checkInAt: now, source: body.source,
          checkInLat: body.lat, checkInLng: body.lng, checkInAccuracy: body.accuracy ?? null, checkInDistanceM: distanceM,
          points: { create: { lat: body.lat, lng: body.lng, accuracy: body.accuracy ?? null, recordedAt: now } },
        },
        include: VISIT_INCLUDE,
      });
    });

    const where = distanceM == null ? "" : ` (${distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${distanceM} m`} from the site${isFar(distanceM) ? ", outside the site area" : ""})`;
    await logEvent(app.db, siteId, req.user.sub, "CHECK_IN", `${personName(user)} checked in${where}`);
    reply.code(201);
    return { visit: shapeVisit(visit, new Date()), intervalSeconds: intervalSeconds() };
  });

  /** Location points taken while checked in. Late uploads (phone was offline) are accepted if they fall inside the visit. */
  app.post("/api/field/visits/:id/points", guard, async (req) => {
    const { id } = IdParams.parse(req.params);
    const { points } = PointsSchema.parse(req.body);
    const visit = await app.db.ericssonSiteVisit.findUnique({ where: { id }, select: { userId: true, checkInAt: true, checkOutAt: true } });
    if (!visit) throw notFound("Visit not found");
    if (visit.userId !== req.user.sub) throw forbidden("This isn't your visit");
    const ok = acceptPoints(visit, points.map((p) => ({ ...p, recordedAt: new Date(p.recordedAt) })), new Date());
    const { count } = ok.length
      ? await app.db.ericssonLocationPoint.createMany({
        data: ok.map((p) => ({ visitId: id, lat: p.lat, lng: p.lng, accuracy: p.accuracy ?? null, recordedAt: p.recordedAt })),
        skipDuplicates: true,
      })
      : { count: 0 };
    return { saved: count, ignored: points.length - ok.length, open: visit.checkOutAt === null };
  });

  app.post("/api/field/visits/:id/check-out", guard, async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = CheckOutSchema.parse(req.body ?? {});
    const visit = await app.db.ericssonSiteVisit.findUnique({ where: { id }, select: { userId: true, siteId: true, checkOutAt: true, user: { select: { firstName: true, lastName: true } } } });
    if (!visit) throw notFound("Visit not found");
    if (visit.userId !== req.user.sub) throw forbidden("This isn't your visit");
    if (visit.checkOutAt) throw httpError(409, "Already checked out");
    const now = new Date();
    const updated = await app.db.ericssonSiteVisit.update({
      where: { id },
      data: {
        checkOutAt: now, checkOutBy: "FE",
        checkOutLat: body.lat ?? null, checkOutLng: body.lng ?? null, checkOutAccuracy: body.accuracy ?? null,
        ...(body.lat !== undefined && body.lng !== undefined
          ? { points: { create: { lat: body.lat, lng: body.lng, accuracy: body.accuracy ?? null, recordedAt: now } } }
          : {}),
      },
      include: VISIT_INCLUDE,
    });
    const shaped = shapeVisit(updated, now);
    await logEvent(app.db, visit.siteId, req.user.sub, "CHECK_OUT", `${personName(visit.user)} checked out after ${hoursAndMinutes(shaped.minutes)}`);
    return { visit: shaped };
  });

  // ─── Managers ──────────────────────────────────────────────────────────────

  /** A site's visits, newest first (who is on site now = open ones). */
  app.get("/api/ericsson/sites/:id/visits", guard, async (req) => {
    assertCanViewLocation(req.user.role);
    const { id } = IdParams.parse(req.params);
    const rows = await app.db.ericssonSiteVisit.findMany({ where: { siteId: id }, include: VISIT_INCLUDE, orderBy: { checkInAt: "desc" }, take: 100 });
    const now = new Date();
    return rows.map((r) => shapeVisit(r, now));
  });

  /** The full location trail of one visit, oldest first. */
  app.get("/api/ericsson/visits/:id/points", guard, async (req) => {
    assertCanViewLocation(req.user.role);
    const { id } = IdParams.parse(req.params);
    const visit = await app.db.ericssonSiteVisit.findUnique({ where: { id }, select: { id: true } });
    if (!visit) throw notFound("Visit not found");
    return app.db.ericssonLocationPoint.findMany({ where: { visitId: id }, orderBy: { recordedAt: "asc" }, select: { lat: true, lng: true, accuracy: true, recordedAt: true } });
  });

  /** A manager closes a visit the FE forgot to check out of. */
  app.post("/api/ericsson/visits/:id/check-out", guard, async (req) => {
    assertCanViewLocation(req.user.role);
    const { id } = IdParams.parse(req.params);
    const visit = await app.db.ericssonSiteVisit.findUnique({ where: { id }, select: { siteId: true, checkOutAt: true, user: { select: { firstName: true, lastName: true } } } });
    if (!visit) throw notFound("Visit not found");
    if (visit.checkOutAt) throw httpError(409, "Already checked out");
    const now = new Date();
    const updated = await app.db.ericssonSiteVisit.update({ where: { id }, data: { checkOutAt: now, checkOutBy: "MANAGER" }, include: VISIT_INCLUDE });
    await logEvent(app.db, visit.siteId, req.user.sub, "CHECK_OUT", `${personName(visit.user)} was checked out by a manager`);
    return { visit: shapeVisit(updated, now) };
  });
}

export function hoursAndMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}
