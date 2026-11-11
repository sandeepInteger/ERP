import type { FastifyInstance } from "fastify";

import { emailEnabled } from "../../lib/email.js";
import { DevLoginSchema } from "./auth.schema.js";
import {
  REFRESH_COOKIE, issueSession, logoutService, meService, refreshService, setRefreshCookie,
} from "./auth.service.js";

/**
 * Developer sign-in: only when DEV_LOGIN=true AND the server is not production
 * (local development, or the Docker test stack with NODE_ENV=test).
 */
export function devLoginEnabled(): boolean {
  return process.env["DEV_LOGIN"] === "true" && process.env["NODE_ENV"] !== "production";
}

export async function authRoute(app: FastifyInstance) {
  app.post("/api/auth/refresh", async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (!token) return reply.status(401).send({ error: "No refresh token" });

    const result = await refreshService(app, token);
    setRefreshCookie(reply, result.refreshToken);
    return reply.send({ accessToken: result.accessToken });
  });

  app.post("/api/auth/logout", { preHandler: app.authenticate }, async (req, reply) => {
    await logoutService(app, req.user.sessionId);
    reply.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    return reply.status(204).send();
  });

  app.get("/api/auth/me", { preHandler: app.authenticate }, async (req) => meService(app, req.user.sub));

  // Tells the login page which sign-in options to show.
  app.get("/api/auth/options", async () => ({
    microsoft: Boolean(process.env["AZURE_TENANT_ID"] && process.env["AZURE_CLIENT_ID"]),
    devLogin: devLoginEnabled(),
    // Field crew sign in with an emailed code. Without SMTP it only works where dev login is on (code shown on screen).
    emailCode: emailEnabled() || devLoginEnabled(),
  }));

  if (!devLoginEnabled()) return;

  app.log.warn("DEV_LOGIN is on: /api/auth/dev-login signs in any active user by email. Never enable outside local development.");

  app.get("/api/auth/dev-users", async () =>
    app.db.user.findMany({
      where: { isActive: true },
      select: { email: true, firstName: true, lastName: true, role: true },
      orderBy: [{ role: "asc" }, { firstName: "asc" }],
    }),
  );

  app.post("/api/auth/dev-login", async (req, reply) => {
    const { email } = DevLoginSchema.parse(req.body);
    const user = await app.db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, isActive: true } });
    if (!user) return reply.status(404).send({ error: "No active user with that email" });

    const { accessToken, refreshToken } = await issueSession(app, user, req.ip, req.headers["user-agent"] ?? "");
    setRefreshCookie(reply, refreshToken);
    return reply.send({ accessToken });
  });
}
