import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { fastifyPlugin } from "fastify-plugin";

declare module "fastify" {
  interface FastifyInstance {
    db: PrismaClient;
  }
}

async function plugin(app: FastifyInstance) {
  const db = new PrismaClient({
    log: process.env["NODE_ENV"] === "development" ? ["warn", "error"] : ["error"],
  });

  await db.$connect();

  app.decorate("db", db);

  app.addHook("onClose", async () => {
    await db.$disconnect();
  });
}

export const dbPlugin = fastifyPlugin(plugin, { name: "db" });
