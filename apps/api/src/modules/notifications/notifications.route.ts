import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { notFound } from "../../lib/http.js";

const IdParams = z.object({ id: z.string().min(1) });

// The signed-in user's own notifications (the bell). Nobody can read anyone else's.
export async function notificationsRoute(app: FastifyInstance) {
  const guard = { preHandler: app.authenticate };

  app.get("/api/notifications", guard, async (req) => {
    const [items, unread] = await Promise.all([
      app.db.notification.findMany({ where: { userId: req.user.sub }, orderBy: { createdAt: "desc" }, take: 50 }),
      app.db.notification.count({ where: { userId: req.user.sub, readAt: null } }),
    ]);
    return { items, unread };
  });

  app.post("/api/notifications/:id/read", guard, async (req) => {
    const { id } = IdParams.parse(req.params);
    const { count } = await app.db.notification.updateMany({ where: { id, userId: req.user.sub, readAt: null }, data: { readAt: new Date() } });
    if (count === 0 && !(await app.db.notification.findFirst({ where: { id, userId: req.user.sub }, select: { id: true } }))) {
      throw notFound("Notification not found");
    }
    return { ok: true };
  });

  app.post("/api/notifications/read-all", guard, async (req) => {
    const { count } = await app.db.notification.updateMany({ where: { userId: req.user.sub, readAt: null }, data: { readAt: new Date() } });
    return { marked: count };
  });
}
