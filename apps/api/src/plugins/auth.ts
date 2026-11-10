import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { fastifyPlugin } from "fastify-plugin";

import type { Role } from "@erp/types";

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  sessionId: string;
  tokenVersion: number;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: Role[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function plugin(app: FastifyInstance) {
  // Verifies the access token, then checks the user is still active and the token
  // was not revoked (tokenVersion bumps on deactivation or a role change).
  app.decorate("authenticate", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      await reply.status(401).send({ error: "Unauthorized" });
      return;
    }
    const user = await req.server.db.user.findUnique({
      where: { id: req.user.sub },
      select: { isActive: true, tokenVersion: true, role: true },
    });
    if (!user || !user.isActive || user.tokenVersion !== req.user.tokenVersion) {
      await reply.status(401).send({ error: "Unauthorized" });
      return;
    }
  });

  app.decorate(
    "requireRole",
    (...roles: Role[]) =>
      async (req: FastifyRequest, reply: FastifyReply) => {
        await app.authenticate(req, reply);
        if (reply.sent) return;
        if (!roles.includes(req.user.role)) {
          await reply.status(403).send({ error: "Forbidden" });
        }
      },
  );
}

export const authPlugin = fastifyPlugin(plugin, { name: "auth", dependencies: ["db"] });
