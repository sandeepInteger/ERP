import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { forbidden, notFound } from "../../lib/http.js";
import { canViewOthersWork, tasksFor } from "./my-work.logic.js";
import { loadWorkSites } from "./my-work.service.js";

const QuerySchema = z.object({ userId: z.string().min(1).optional() });

export async function ericssonMyWorkRoute(app: FastifyInstance) {
  // The viewer's tasks. Leadership and PMs may pass ?userId= to see someone else's inbox.
  app.get("/api/ericsson/my-work", { preHandler: app.authenticate }, async (req) => {
    const { userId } = QuerySchema.parse(req.query);
    let viewer = { id: req.user.sub, role: req.user.role as string };
    if (userId && userId !== req.user.sub) {
      if (!canViewOthersWork(req.user.role)) throw forbidden("You can only see your own work");
      const other = await app.db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
      if (!other) throw notFound("User not found");
      viewer = other;
    }

    const sites = await loadWorkSites(app.db);
    // Sites with an empty slot: nobody gets those tasks, so leadership should hear about it.
    const unassigned = sites.filter((s) => s.hasEmptySlot).map((s) => ({ id: s.id, siteCode: s.siteCode }));
    return { userId: viewer.id, tasks: tasksFor(viewer, sites, new Date()), unassigned };
  });
}
