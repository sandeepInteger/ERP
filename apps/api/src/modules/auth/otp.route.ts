import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { EMAIL_CODE_ROLES } from "@erp/types";
import { emailEnabled, sendEmail } from "../../lib/email.js";
import { httpError } from "../../lib/http.js";
import { devLoginEnabled } from "./auth.route.js";
import { issueSession, setRefreshCookie } from "./auth.service.js";
import { CODE_TTL_MS, MAX_CODES_PER_HOUR, codeMatches, codeState, hashCode, newCode } from "./otp.logic.js";

// Field crew sign in with a 6-digit code emailed to their organisation address.
// Staff roles use Microsoft; a staff email asking for a code gets nothing.

const RequestSchema = z.object({ email: z.string().trim().toLowerCase().email() });
const VerifySchema = z.object({ email: z.string().trim().toLowerCase().email(), code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });

const secret = () => process.env["JWT_REFRESH_SECRET"] ?? process.env["JWT_SECRET"] ?? "";

export async function otpRoute(app: FastifyInstance) {
  // Per-IP limits on top of the per-user ones below. Strict by default; test servers (dev login on)
  // allow more so repeated automated runs from one machine don't lock themselves out.
  const ipLimit = Number(process.env["OTP_IP_LIMIT"] ?? (devLoginEnabled() ? 200 : 10));
  const limit = (max: number) => ({ config: { rateLimit: { max, timeWindow: "15 minutes" } } });

  app.post("/api/auth/otp/request", limit(ipLimit), async (req) => {
    const { email } = RequestSchema.parse(req.body);
    const user = await app.db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, isActive: true } });

    // Same answer whether or not the email exists, so the form can't be used to discover accounts.
    const generic = { sent: true, expiresInMinutes: CODE_TTL_MS / 60_000 };
    if (!user || !EMAIL_CODE_ROLES.has(user.role)) {
      req.log.info({ email }, "Sign-in code requested for an email that can't use codes");
      return generic;
    }

    const recent = await app.db.loginCode.count({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
    if (recent >= MAX_CODES_PER_HOUR) throw httpError(429, "Too many codes requested. Wait an hour, or ask your PM.");

    const code = newCode();
    const now = new Date();
    await app.db.$transaction([
      // A new code replaces any earlier one.
      app.db.loginCode.updateMany({ where: { userId: user.id, usedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } }),
      app.db.loginCode.create({
        data: { userId: user.id, codeHash: hashCode(user.id, code, secret()), expiresAt: new Date(now.getTime() + CODE_TTL_MS), ip: req.ip },
      }),
    ]);

    await sendEmail(app.log, [user.email], `Your sign-in code: ${code}`,
      `Hi ${user.firstName},\n\nYour Integer ERP sign-in code is ${code}. It works once, for ${CODE_TTL_MS / 60_000} minutes.\n\nIf you didn't ask for it, ignore this email.`,
      "/login");

    // Local / test servers without email: hand the code back so the flow can be tried.
    if (!emailEnabled()) {
      if (devLoginEnabled()) return { ...generic, devCode: code };
      req.log.warn({ userId: user.id }, "Sign-in code created but SMTP is not configured: the user cannot receive it");
    }
    return generic;
  });

  app.post("/api/auth/otp/verify", limit(ipLimit * 2), async (req, reply) => {
    const { email, code } = VerifySchema.parse(req.body);
    const wrong = () => httpError(401, "That code is wrong or has expired. Request a new one.");

    const user = await app.db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, isActive: true } });
    if (!user || !EMAIL_CODE_ROLES.has(user.role)) throw wrong();

    const row = await app.db.loginCode.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    const now = new Date();
    if (!row || codeState(row, now) !== "OK") throw wrong();

    if (!codeMatches(user.id, code, secret(), row.codeHash)) {
      await app.db.loginCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      throw wrong();
    }
    // Single use: only the request that flips usedAt wins.
    const { count } = await app.db.loginCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
    if (count === 0) throw wrong();

    const { accessToken, refreshToken } = await issueSession(app, user, req.ip, req.headers["user-agent"] ?? "");
    setRefreshCookie(reply, refreshToken);
    return reply.send({ accessToken });
  });
}
