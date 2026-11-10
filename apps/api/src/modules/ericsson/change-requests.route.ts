import type { FastifyInstance } from "fastify";
import type { ChangeRequestStatus as DbCrStatus, ChangeRequestType as DbCrType, Prisma } from "@prisma/client";
import { z } from "zod";

import { CR_STATUS_LABELS, ChangeRequestStatus, ChangeRequestType } from "@erp/types";
import { httpError, notFound } from "../../lib/http.js";
import { PERSON_SELECT, assertCanEdit, assertSite, logEvent } from "./ericsson.shared.js";
import { crNumberLabel, crTotal, crTransitionError } from "./change-requests.logic.js";

// SOP steps 6 and 8: change requests, a parallel track to the site steps.

const IdParams = z.object({ id: z.string().min(1) });
const money = z.number().nonnegative().max(9_999_999_999);

const CreateCrSchema = z.object({
  type: z.nativeEnum(ChangeRequestType),
  title: z.string().trim().min(1).max(160),
  reason: z.string().trim().min(1).max(4000),
  extraDays: z.number().min(0).max(365).optional(),
  amount: money.default(0),
  vendorQuote: money.default(0),
});

const TransitionSchema = z.object({
  to: z.nativeEnum(ChangeRequestStatus),
  note: z.string().trim().max(2000).optional(),
});

const ListCrQuerySchema = z.object({
  status: z.nativeEnum(ChangeRequestStatus).optional(),
  siteId: z.string().optional(),
});

export async function ericssonChangeRequestsRoute(app: FastifyInstance) {
  const guard = { preHandler: app.authenticate };

  app.get("/api/ericsson/change-requests", guard, async (req) => {
    const q = ListCrQuerySchema.parse(req.query);
    const where: Prisma.EricssonChangeRequestWhereInput = {
      ...(q.status ? { status: q.status as DbCrStatus } : {}),
      ...(q.siteId ? { siteId: q.siteId } : {}),
    };
    return app.db.ericssonChangeRequest.findMany({
      where,
      orderBy: { number: "desc" },
      include: {
        site: { select: { id: true, siteCode: true, venueName: true } },
        raisedBy: { select: PERSON_SELECT },
        reviewedBy: { select: PERSON_SELECT },
      },
    });
  });

  app.post("/api/ericsson/sites/:id/change-requests", guard, async (req, reply) => {
    assertCanEdit(req.user.role);
    const { id } = IdParams.parse(req.params);
    const site = await assertSite(app, id);
    if (site.step === "CLOSED") throw httpError(409, "This site is closed");
    const b = CreateCrSchema.parse(req.body);
    const price = crTotal({ type: b.type, amount: b.amount, vendorQuote: b.vendorQuote });

    const cr = await app.db.ericssonChangeRequest.create({
      data: {
        siteId: id,
        type: b.type as DbCrType,
        title: b.title,
        reason: b.reason,
        extraDays: b.extraDays ?? null,
        amount: price.amount,
        vendorQuote: price.vendorQuote,
        passThroughPct: price.passThroughPct,
        total: price.total,
        raisedById: req.user.sub,
      },
    });
    await logEvent(app.db, id, req.user.sub, "CR_RAISED", `${crNumberLabel(cr.number)} raised: ${cr.title} ($${price.total.toLocaleString("en-US")})`);
    return reply.status(201).send(cr);
  });

  app.post("/api/ericsson/change-requests/:id/transition", guard, async (req) => {
    const { id } = IdParams.parse(req.params);
    const { to, note } = TransitionSchema.parse(req.body);
    const cr = await app.db.ericssonChangeRequest.findUnique({ where: { id } });
    if (!cr) throw notFound("Change request not found");

    const err = crTransitionError(cr.status as ChangeRequestStatus, to, { role: req.user.role, isRaiser: cr.raisedById === req.user.sub });
    if (err) throw httpError(cr.status === to ? 409 : 403, err);

    const now = new Date();
    const data: Prisma.EricssonChangeRequestUncheckedUpdateManyInput = { status: to as DbCrStatus };
    if (to === ChangeRequestStatus.SUBMITTED) Object.assign(data, { submittedAt: now, reviewedAt: now, reviewedById: req.user.sub });
    if (to === ChangeRequestStatus.APPROVED || to === ChangeRequestStatus.REJECTED) Object.assign(data, { decidedAt: now, decisionNote: note ?? null });
    if (to === ChangeRequestStatus.PM_REVIEW) Object.assign(data, { submittedAt: null, decidedAt: null });

    // Guard on the old status so a double-click cannot apply the same move twice.
    const updated = await app.db.ericssonChangeRequest.updateMany({ where: { id, status: cr.status }, data });
    if (updated.count === 0) throw httpError(409, "This CR changed meanwhile; reload and try again");

    await logEvent(app.db, cr.siteId, req.user.sub, "CR_STATUS",
      `${crNumberLabel(cr.number)}: ${CR_STATUS_LABELS[cr.status as ChangeRequestStatus]} → ${CR_STATUS_LABELS[to]}${note ? ` · ${note}` : ""}`);
    return app.db.ericssonChangeRequest.findUnique({ where: { id } });
  });
}
