import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyHelmet from "@fastify/helmet";
import fastifyJwt from "@fastify/jwt";
import fastifyMultipart from "@fastify/multipart";
import fastifyRateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { ZodError } from "zod";

import { auditHook } from "./middleware/audit.js";
import { authPlugin } from "./plugins/auth.js";
import { dbPlugin } from "./plugins/db.js";
import { MAX_UPLOAD_BYTES } from "./lib/storage.js";
import { healthRoute } from "./modules/health/health.route.js";
import { authRoute } from "./modules/auth/auth.route.js";
import { ssoRoute } from "./modules/auth/sso.route.js";
import { otpRoute } from "./modules/auth/otp.route.js";
import { fieldRoute } from "./modules/ericsson/field.route.js";
import { visitsRoute } from "./modules/ericsson/visits.route.js";
import { ericssonWorkItemsRoute } from "./modules/ericsson/work-items.route.js";
import { ericssonClaimsRoute } from "./modules/ericsson/claims.route.js";
import { usersRoute } from "./modules/users/users.route.js";
import { raciRoute } from "./modules/raci/raci.route.js";
import { ericssonSitesRoute } from "./modules/ericsson/sites.route.js";
import { ericssonDocumentsRoute } from "./modules/ericsson/documents.route.js";
import { ericssonVerificationRoute } from "./modules/ericsson/verification.route.js";
import { ericssonMaterialsRoute } from "./modules/ericsson/materials.route.js";
import { ericssonChangeRequestsRoute } from "./modules/ericsson/change-requests.route.js";
import { ericssonDailyLogsRoute } from "./modules/ericsson/daily-logs.route.js";
import { ericssonMyWorkRoute } from "./modules/ericsson/my-work.route.js";
import { ericssonExpensesRoute } from "./modules/ericsson/expenses.route.js";
import { ericssonReportsRoute } from "./modules/ericsson/reports.route.js";
import { notificationsRoute } from "./modules/notifications/notifications.route.js";
import { settingsRoute } from "./modules/settings/settings.route.js";
import { registerEricssonJobs } from "./jobs/ericsson-jobs.js";

export async function buildApp() {
  const app = Fastify({
    logger:
      process.env["NODE_ENV"] === "development"
        ? { level: "debug", transport: { target: "pino-pretty", options: {} } }
        : { level: process.env["LOG_LEVEL"] ?? "info" },
  });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
      },
    },
  });

  await app.register(fastifyCors, {
    origin: (process.env["CORS_ORIGINS"] ?? "").split(",").filter(Boolean),
    credentials: true,
  });

  await app.register(fastifyCookie, {
    secret: process.env["JWT_REFRESH_SECRET"] ?? "dev-cookie-secret-change-in-prod",
  });

  await app.register(fastifyJwt, {
    secret: process.env["JWT_SECRET"] ?? "",
    cookie: { cookieName: "refresh_token", signed: false },
  });

  // In-memory store: one API instance. Move to Redis (as HRMS does) when it scales out.
  await app.register(fastifyRateLimit, { max: 300, timeWindow: "1 minute" });

  await app.register(fastifyMultipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  await app.register(dbPlugin);
  await app.register(authPlugin);

  app.addHook("onResponse", auditHook);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: "Validation error", issues: err.errors });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const message = err.message || "Internal server error";
    if (status >= 500) {
      const userId = (req.user as { sub?: string } | undefined)?.sub ?? null;
      app.log.error({ err, status, method: req.method, url: req.url, userId }, message);
    }
    const details = (err as { details?: unknown }).details;
    return reply.status(status).send(details === undefined ? { error: message } : { error: message, details });
  });

  await app.register(healthRoute);
  await app.register(authRoute);
  await app.register(ssoRoute);
  await app.register(otpRoute);
  await app.register(fieldRoute);
  await app.register(visitsRoute);
  await app.register(ericssonWorkItemsRoute);
  await app.register(ericssonClaimsRoute);
  await app.register(usersRoute);
  await app.register(raciRoute);
  await app.register(ericssonSitesRoute);
  await app.register(ericssonDocumentsRoute);
  await app.register(ericssonVerificationRoute);
  await app.register(ericssonMaterialsRoute);
  await app.register(ericssonChangeRequestsRoute);
  await app.register(ericssonDailyLogsRoute);
  await app.register(ericssonMyWorkRoute);
  await app.register(ericssonExpensesRoute);
  // Before ericssonSitesRoute would matter only if paths overlapped: /sites/export is static, /sites/:id is not.
  await app.register(ericssonReportsRoute);
  await app.register(notificationsRoute);
  await app.register(settingsRoute);

  registerEricssonJobs(app);

  return app;
}
