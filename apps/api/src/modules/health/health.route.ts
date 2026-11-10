import type { FastifyInstance } from "fastify";

export async function healthRoute(app: FastifyInstance) {
  app.get("/health", async () => {
    await app.db.$queryRaw`SELECT 1`;
    return { status: "ok" };
  });
}
