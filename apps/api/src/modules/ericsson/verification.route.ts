import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { notFound } from "../../lib/http.js";
import { assertCanEdit, assertSite, logEvent } from "./ericsson.shared.js";
import { onDiscrepancyRaised } from "./ericsson.notify.js";

// SOP step 2: line-by-line discrepancies between SOV, BOM and RFDS, and the
// question thread with the Ericsson PM that resolves them.

const IdParams = z.object({ id: z.string().min(1) });
const val = z.string().trim().max(120).optional();

const CreateDiscrepancySchema = z.object({
  item: z.string().trim().min(1).max(160),
  sovValue: val,
  bomValue: val,
  rfdsValue: val,
  note: z.string().trim().max(2000).optional(),
});

const ResolveDiscrepancySchema = z.object({
  resolution: z.string().trim().min(1).max(2000),
});

const CreateQuerySchema = z.object({
  direction: z.enum(["OUTBOUND", "INBOUND"]),
  body: z.string().trim().min(1).max(4000),
});

export async function ericssonVerificationRoute(app: FastifyInstance) {
  const guard = { preHandler: app.authenticate };

  app.post("/api/ericsson/sites/:id/discrepancies", guard, async (req, reply) => {
    assertCanEdit(req.user.role);
    const { id } = IdParams.parse(req.params);
    await assertSite(app, id);
    const b = CreateDiscrepancySchema.parse(req.body);
    const row = await app.db.ericssonDiscrepancy.create({
      data: {
        siteId: id,
        item: b.item,
        sovValue: b.sovValue ?? null,
        bomValue: b.bomValue ?? null,
        rfdsValue: b.rfdsValue ?? null,
        note: b.note ?? null,
        raisedById: req.user.sub,
      },
    });
    await logEvent(app.db, id, req.user.sub, "DISCREPANCY_RAISED", `Discrepancy flagged: ${b.item}`);
    void onDiscrepancyRaised(app, id, b.item, req.user.sub);
    return reply.status(201).send(row);
  });

  app.post("/api/ericsson/discrepancies/:id/resolve", guard, async (req) => {
    assertCanEdit(req.user.role);
    const { id } = IdParams.parse(req.params);
    const { resolution } = ResolveDiscrepancySchema.parse(req.body);
    const existing = await app.db.ericssonDiscrepancy.findUnique({ where: { id } });
    if (!existing) throw notFound("Discrepancy not found");
    const row = await app.db.ericssonDiscrepancy.update({
      where: { id },
      data: { isResolved: true, resolution, resolvedById: req.user.sub, resolvedAt: new Date() },
    });
    await logEvent(app.db, existing.siteId, req.user.sub, "DISCREPANCY_RESOLVED", `Discrepancy resolved: ${existing.item}`);
    return row;
  });

  app.post("/api/ericsson/discrepancies/:id/reopen", guard, async (req) => {
    assertCanEdit(req.user.role);
    const { id } = IdParams.parse(req.params);
    const existing = await app.db.ericssonDiscrepancy.findUnique({ where: { id } });
    if (!existing) throw notFound("Discrepancy not found");
    const row = await app.db.ericssonDiscrepancy.update({
      where: { id },
      data: { isResolved: false, resolution: null, resolvedById: null, resolvedAt: null },
    });
    await logEvent(app.db, existing.siteId, req.user.sub, "DISCREPANCY_REOPENED", `Discrepancy reopened: ${existing.item}`);
    return row;
  });

  // OUTBOUND = questions sent to the Ericsson PM (each one is a verification loop);
  // INBOUND = the Ericsson PM's answer, logged by whoever received it.
  app.post("/api/ericsson/sites/:id/client-queries", guard, async (req, reply) => {
    assertCanEdit(req.user.role);
    const { id } = IdParams.parse(req.params);
    await assertSite(app, id);
    const b = CreateQuerySchema.parse(req.body);
    const row = await app.db.$transaction(async (tx) => {
      const q = await tx.ericssonClientQuery.create({ data: { siteId: id, direction: b.direction, body: b.body, authorId: req.user.sub } });
      if (b.direction === "OUTBOUND") {
        await tx.ericssonSite.update({ where: { id }, data: { verificationLoops: { increment: 1 } } });
      }
      await logEvent(tx, id, req.user.sub, "CLIENT_QUERY",
        b.direction === "OUTBOUND" ? "Questions sent to the Ericsson PM" : "Reply from the Ericsson PM logged");
      return q;
    });
    return reply.status(201).send(row);
  });
}
