import type { FastifyInstance } from "fastify";
import type { MaterialStatus as DbMaterialStatus } from "@prisma/client";
import { z } from "zod";

import { MATERIAL_STATUS_LABELS, MaterialStatus } from "@erp/types";
import { day, defined, notFound } from "../../lib/http.js";
import { assertCanEdit, assertSite, logEvent } from "./ericsson.shared.js";

// SOP step 4: BOM lines, what Ericsson supplies, and what Integer orders.

const IdParams = z.object({ id: z.string().min(1) });
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const qty = z.number().int().min(0).max(1_000_000);

const CreateMaterialSchema = z.object({
  item: z.string().trim().min(1).max(160),
  bomQty: qty,
  clientSuppliedQty: qty.optional(),
  orderQty: qty.optional(),
  orderRef: z.string().trim().max(60).optional(),
  shipTo: z.string().trim().max(60).optional(),
  eta: DATE.optional(),
  unitCost: z.number().nonnegative().max(9_999_999).optional(),
  status: z.nativeEnum(MaterialStatus),
});

const UpdateMaterialSchema = z.object({
  item: z.string().trim().min(1).max(160).optional(),
  bomQty: qty.optional(),
  clientSuppliedQty: qty.optional(),
  orderQty: qty.optional(),
  orderRef: z.string().trim().max(60).nullable().optional(),
  shipTo: z.string().trim().max(60).nullable().optional(),
  eta: DATE.nullable().optional(),
  unitCost: z.number().nonnegative().max(9_999_999).nullable().optional(),
  status: z.nativeEnum(MaterialStatus).optional(),
});

export async function ericssonMaterialsRoute(app: FastifyInstance) {
  const guard = { preHandler: app.authenticate };

  app.post("/api/ericsson/sites/:id/materials", guard, async (req, reply) => {
    assertCanEdit(req.user.role);
    const { id } = IdParams.parse(req.params);
    await assertSite(app, id);
    const { eta, status, ...rest } = CreateMaterialSchema.parse(req.body);
    const row = await app.db.ericssonMaterialLine.create({
      data: {
        ...defined(rest),
        item: rest.item,
        bomQty: rest.bomQty,
        siteId: id,
        status: status as DbMaterialStatus,
        ...(eta ? { eta: day(eta) } : {}),
      },
    });
    await logEvent(app.db, id, req.user.sub, "MATERIAL_ADDED", `Material line added: ${row.item} × ${row.bomQty}`);
    return reply.status(201).send(row);
  });

  app.patch("/api/ericsson/materials/:id", guard, async (req) => {
    assertCanEdit(req.user.role);
    const { id } = IdParams.parse(req.params);
    const existing = await app.db.ericssonMaterialLine.findUnique({ where: { id } });
    if (!existing) throw notFound("Material line not found");
    const { eta, status, ...rest } = UpdateMaterialSchema.parse(req.body);
    const row = await app.db.ericssonMaterialLine.update({
      where: { id },
      data: {
        ...defined(rest),
        ...(status ? { status: status as DbMaterialStatus } : {}),
        ...(eta !== undefined ? { eta: eta ? day(eta) : null } : {}),
      },
    });
    if (status && status !== existing.status) {
      await logEvent(app.db, existing.siteId, req.user.sub, "MATERIAL_STATUS",
        `${row.item}: ${MATERIAL_STATUS_LABELS[existing.status as MaterialStatus]} → ${MATERIAL_STATUS_LABELS[status]}`);
    }
    return row;
  });

  app.delete("/api/ericsson/materials/:id", guard, async (req, reply) => {
    assertCanEdit(req.user.role);
    const { id } = IdParams.parse(req.params);
    const existing = await app.db.ericssonMaterialLine.findUnique({ where: { id } });
    if (!existing) throw notFound("Material line not found");
    await app.db.ericssonMaterialLine.delete({ where: { id } });
    await logEvent(app.db, existing.siteId, req.user.sub, "MATERIAL_REMOVED", `Material line removed: ${existing.item}`);
    return reply.status(204).send();
  });
}
