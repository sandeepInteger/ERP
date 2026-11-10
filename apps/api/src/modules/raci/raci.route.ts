import type { FastifyInstance } from "fastify";
import { z } from "zod";

export async function raciRoute(app: FastifyInstance) {
  app.get("/api/raci", { preHandler: app.authenticate }, async (req) => {
    const { client } = z.object({ client: z.enum(["ERICSSON", "ATT"]) }).parse(req.query);
    return app.db.raciRule.findMany({ where: { client }, orderBy: { rank: "asc" } });
  });
}
