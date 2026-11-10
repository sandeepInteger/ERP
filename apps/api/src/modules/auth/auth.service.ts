import bcrypt from "bcryptjs";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { User } from "@prisma/client";

import type { Role } from "@erp/types";
import { httpError } from "../../lib/http.js";

const ACCESS_TOKEN_TTL = "8h";
export const REFRESH_TTL_SEC = 7 * 24 * 60 * 60;
export const REFRESH_COOKIE = "refresh_token";

// @fastify/jwt types sign() for the access-token payload; a refresh token carries
// only the session id. Called as a method so sign() keeps its `this`.
type SignRefresh = (payload: { sessionId: string }, opts: { expiresIn: string }) => string;
function signRefreshToken(app: FastifyInstance, sessionId: string): string {
  return (app.jwt.sign as unknown as SignRefresh)({ sessionId }, { expiresIn: `${REFRESH_TTL_SEC}s` });
}

export function setRefreshCookie(reply: FastifyReply, token: string) {
  reply.setCookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    maxAge: REFRESH_TTL_SEC,
    path: "/api/auth",
  });
}

function accessPayload(user: User, sessionId: string) {
  return {
    sub: user.id,
    email: user.email,
    role: user.role as unknown as Role,
    sessionId,
    tokenVersion: user.tokenVersion,
  };
}

/**
 * Opens a session for a user who has just proved who they are (Microsoft sign-in, or
 * developer sign-in locally). Returns both tokens; the caller sets the refresh cookie.
 */
export async function issueSession(app: FastifyInstance, user: User, ip: string, userAgent: string) {
  const session = await app.db.userSession.create({
    data: {
      userId: user.id,
      ip,
      userAgent,
      expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
    },
  });

  const accessToken = app.jwt.sign(accessPayload(user, session.sessionId), { expiresIn: ACCESS_TOKEN_TTL });
  const refreshToken = signRefreshToken(app, session.sessionId);
  const refreshHash = await bcrypt.hash(refreshToken, 10);

  await app.db.user.update({
    where: { id: user.id },
    data: { refreshTokenHash: refreshHash, lastLoginAt: new Date() },
  });

  return { accessToken, refreshToken };
}

export async function refreshService(app: FastifyInstance, rawRefreshToken: string) {
  let payload: { sessionId: string };
  try {
    payload = app.jwt.verify<{ sessionId: string }>(rawRefreshToken);
  } catch {
    throw httpError(401, "Invalid refresh token");
  }

  const session = await app.db.userSession.findUnique({
    where: { sessionId: payload.sessionId },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw httpError(401, "Session expired");
  }
  if (!session.user.isActive || !session.user.refreshTokenHash) {
    throw httpError(401, "Invalid session");
  }
  if (!(await bcrypt.compare(rawRefreshToken, session.user.refreshTokenHash))) {
    throw httpError(401, "Invalid refresh token");
  }

  const accessToken = app.jwt.sign(accessPayload(session.user, session.sessionId), { expiresIn: ACCESS_TOKEN_TTL });
  const refreshToken = signRefreshToken(app, session.sessionId);
  await app.db.user.update({
    where: { id: session.userId },
    data: { refreshTokenHash: await bcrypt.hash(refreshToken, 10) },
  });

  return { accessToken, refreshToken };
}

export async function logoutService(app: FastifyInstance, sessionId: string) {
  await app.db.userSession.updateMany({
    where: { sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function meService(app: FastifyInstance, userId: string) {
  const user = await app.db.user.findUnique({ where: { id: userId } });
  if (!user) throw httpError(404, "User not found");
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    designation: user.designation,
    role: user.role,
  };
}
