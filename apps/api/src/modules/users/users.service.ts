import type { FastifyInstance } from "fastify";
import { Prisma, type Role as DbRole } from "@prisma/client";

import { defined, httpError } from "../../lib/http.js";
import type { CreateUserBody, UpdateUserBody } from "./users.schema.js";

export const USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  designation: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  managerId: true,
} as const;

async function assertManager(app: FastifyInstance, managerId: string | null | undefined, userId?: string) {
  if (!managerId) return;
  if (managerId === userId) throw httpError(400, "Someone can't be their own manager");
  const m = await app.db.user.findUnique({ where: { id: managerId }, select: { isActive: true, role: true } });
  if (!m?.isActive || m.role === "FIELD_CREW" || m.role === "VIEWER") throw httpError(400, "The manager must be an active staff user");
}

export async function listUsers(app: FastifyInstance, includeInactive: boolean) {
  return app.db.user.findMany({
    where: includeInactive ? {} : { isActive: true },
    select: USER_SELECT,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });
}

export async function createUser(app: FastifyInstance, body: CreateUserBody) {
  await assertManager(app, body.managerId);
  try {
    return await app.db.user.create({
      data: { ...defined(body), email: body.email, firstName: body.firstName, lastName: body.lastName, role: body.role as DbRole },
      select: USER_SELECT,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw httpError(409, "A user with this email already exists");
    }
    throw e;
  }
}

export async function updateUser(app: FastifyInstance, id: string, body: UpdateUserBody, actorId: string) {
  const existing = await app.db.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
  if (!existing) throw httpError(404, "User not found");
  if (id === actorId && (body.isActive === false || (body.role && body.role !== existing.role))) {
    throw httpError(400, "You cannot change your own role or deactivate yourself");
  }
  await assertManager(app, body.managerId, id);

  // A role change or deactivation must take effect now, not when the 8h token expires.
  const revoke = (body.role !== undefined && body.role !== existing.role) || (body.isActive === false && existing.isActive);

  const user = await app.db.user.update({
    where: { id },
    data: {
      ...defined({ firstName: body.firstName, lastName: body.lastName, designation: body.designation, isActive: body.isActive, managerId: body.managerId }),
      ...(body.role ? { role: body.role as DbRole } : {}),
      ...(revoke ? { tokenVersion: { increment: 1 } } : {}),
    },
    select: USER_SELECT,
  });
  if (revoke) {
    await app.db.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  return user;
}
