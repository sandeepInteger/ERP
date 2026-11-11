import type { FastifyInstance } from "fastify";
import type { Role as DbRole } from "@prisma/client";
import { z } from "zod";

import { Role } from "@erp/types";
import { notFound } from "../../lib/http.js";

const IdParams = z.object({ id: z.string().min(1) });
const roles = z.array(z.nativeEnum(Role)).max(9).transform((r) => [...new Set(r)] as DbRole[]);

const UpdateRaciSchema = z.object({
  responsible: roles,
  accountable: roles,
  consulted: roles,
  informed: roles,
});

export async function raciRoute(app: FastifyInstance) {
  app.get("/api/raci", { preHandler: app.authenticate }, async (req) => {
    const { client } = z.object({ client: z.enum(["ERICSSON", "ATT"]) }).parse(req.query);
    return app.db.raciRule.findMany({ where: { client }, orderBy: { rank: "asc" } });
  });

  // Admins maintain the matrix. Consulted / Informed drive notifications on the matching
  // workflow step (see ericsson.notify.ts); button permissions stay in code (ERICSSON_ACTIONS).
  app.put("/api/raci/:id", { preHandler: app.requireRole(Role.ADMIN) }, async (req) => {
    const { id } = IdParams.parse(req.params);
    const b = UpdateRaciSchema.parse(req.body);
    const exists = await app.db.raciRule.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound("RACI row not found");
    return app.db.raciRule.update({ where: { id }, data: b });
  });
}
