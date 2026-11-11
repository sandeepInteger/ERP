import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { CR_OPEN_STATUSES, Role } from "@erp/types";
import { forbidden, httpError, notFound, queryBool } from "../../lib/http.js";
import { assertCanEdit, assertSite, logEvent, personName } from "./ericsson.shared.js";

// The phone-first field screens' data. Safe for field crew: only sites they're on, and no
// money, documents or client details. Staff see the sites they're assigned to.

const IdParams = z.object({ id: z.string().min(1) });
const DAY = 86_400_000;
const ON_SITE_STEPS = ["EXECUTION", "VSS_AE202"] as const;

function siteWhere(user: { sub: string; role: string }): Prisma.EricssonSiteWhereInput {
  if (user.role === Role.FIELD_CREW) return { crew: { some: { userId: user.sub } } };
  return { OR: [{ pmId: user.sub }, { apmId: user.sub }, { deliveryLeadId: user.sub }, { coordinatorId: user.sub }, { crew: { some: { userId: user.sub } } }] };
}

const FIELD_SELECT = {
  id: true, siteCode: true, venueName: true, address: true, step: true, stepChangedAt: true,
  pm: { select: { firstName: true, lastName: true } },
  deliveryLead: { select: { firstName: true, lastName: true } },
  changeRequests: { select: { status: true } },
  dailyLogs: { select: { workDate: true }, orderBy: { workDate: "desc" as const }, take: 1 },
} as const;

type FieldRow = Prisma.EricssonSiteGetPayload<{ select: typeof FIELD_SELECT }>;

function shape(s: FieldRow, now: Date) {
  const today = now.toISOString().slice(0, 10);
  return {
    id: s.id,
    siteCode: s.siteCode,
    venueName: s.venueName,
    address: s.address,
    step: s.step,
    daysInStep: Math.max(0, Math.floor((now.getTime() - s.stepChangedAt.getTime()) / DAY)),
    pmName: personName(s.pm),
    deliveryLeadName: personName(s.deliveryLead),
    openChangeRequests: s.changeRequests.filter((c) => CR_OPEN_STATUSES.has(c.status)).length,
    loggedToday: s.dailyLogs[0]?.workDate.toISOString().slice(0, 10) === today,
  };
}

export async function fieldRoute(app: FastifyInstance) {
  const guard = { preHandler: app.authenticate };

  // ?all=true: every open site the person works on (for picking the site of an expense claim).
  app.get("/api/field/sites", guard, async (req) => {
    const { all } = z.object({ all: queryBool.optional() }).parse(req.query);
    const stepFilter: Prisma.EricssonSiteWhereInput = all ? { step: { not: "CLOSED" } } : { step: { in: [...ON_SITE_STEPS] } };
    const rows = await app.db.ericssonSite.findMany({
      where: { AND: [siteWhere(req.user), stepFilter] },
      select: FIELD_SELECT,
      orderBy: { siteCode: "asc" },
    });
    const now = new Date();
    return rows.map((r) => shape(r, now));
  });

  app.get("/api/field/sites/:id", guard, async (req) => {
    const { id } = IdParams.parse(req.params);
    const where: Prisma.EricssonSiteWhereInput = req.user.role === Role.FIELD_CREW ? { id, ...siteWhere(req.user) } : { id };
    const row = await app.db.ericssonSite.findFirst({ where, select: FIELD_SELECT });
    if (!row) throw req.user.role === Role.FIELD_CREW ? forbidden("You're not on this site's crew") : notFound("Site not found");
    return shape(row, new Date());
  });

  // Who is on a site's field crew. Set by the people who manage the site.
  app.put("/api/ericsson/sites/:id/crew", guard, async (req) => {
    assertCanEdit(req.user.role);
    const { id } = IdParams.parse(req.params);
    await assertSite(app, id);
    const { userIds } = z.object({ userIds: z.array(z.string().min(1)).max(50) }).parse(req.body);
    const ids = [...new Set(userIds)];
    const crew = await app.db.user.findMany({ where: { id: { in: ids }, role: "FIELD_CREW", isActive: true }, select: { id: true, firstName: true, lastName: true } });
    if (crew.length !== ids.length) throw httpError(400, "Everyone on the crew must be an active Field crew user");

    await app.db.$transaction([
      app.db.ericssonSiteCrew.deleteMany({ where: { siteId: id, userId: { notIn: ids } } }),
      app.db.ericssonSiteCrew.createMany({ data: ids.map((userId) => ({ siteId: id, userId })), skipDuplicates: true }),
    ]);
    await logEvent(app.db, id, req.user.sub, "CREW", crew.length ? `Field crew set: ${crew.map((c) => `${c.firstName} ${c.lastName}`).join(", ")}` : "Field crew cleared");
    return { userIds: ids };
  });
}
