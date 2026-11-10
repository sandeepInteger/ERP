import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { Role } from "@erp/types";
import { queryBool } from "../../lib/http.js";
import { CreateUserSchema, UpdateUserSchema } from "./users.schema.js";
import { createUser, listUsers, updateUser } from "./users.service.js";

export async function usersRoute(app: FastifyInstance) {
  // Everyone signed in can list active users: the site forms need them for assignment.
  app.get("/api/users", { preHandler: app.authenticate }, async (req) => {
    const { all } = z.object({ all: queryBool.optional() }).parse(req.query);
    return listUsers(app, Boolean(all) && req.user.role === Role.ADMIN);
  });

  app.post("/api/users", { preHandler: app.requireRole(Role.ADMIN) }, async (req, reply) => {
    const body = CreateUserSchema.parse(req.body);
    return reply.status(201).send(await createUser(app, body));
  });

  app.patch("/api/users/:id", { preHandler: app.requireRole(Role.ADMIN) }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = UpdateUserSchema.parse(req.body);
    return updateUser(app, id, body, req.user.sub);
  });
}
