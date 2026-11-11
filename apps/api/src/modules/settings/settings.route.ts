import type { FastifyInstance } from "fastify";
import type { Role as DbRole } from "@prisma/client";
import { z } from "zod";

import { ERICSSON_LIST_TRIGGERS, LEADERSHIP_ROLES, Role, type EricssonList } from "@erp/types";
import { emailEnabled } from "../../lib/email.js";
import { forbidden, httpError, notFound } from "../../lib/http.js";
import { runEricssonJobs } from "../../jobs/ericsson-jobs.js";

// Admin settings for notifications: distribution lists (SOP Appendix C) and escalation levels.
// Leadership can read them; only admins change them.

const IdParams = z.object({ id: z.string().min(1) });
const ClientQuery = z.object({ client: z.enum(["ERICSSON", "ATT"]).default("ERICSSON") });

const UpdateListSchema = z.object({
  userIds: z.array(z.string().min(1)).max(100),
  emails: z.array(z.string().trim().toLowerCase().email()).max(50),
});

const UpdateRulesSchema = z.object({
  rules: z.array(z.object({
    level: z.number().int().min(1).max(5),
    afterDays: z.number().int().min(1).max(90),
    roles: z.array(z.nativeEnum(Role)).min(1),
  })).min(1).max(5),
});

export async function settingsRoute(app: FastifyInstance) {
  const canRead = (role: string) => LEADERSHIP_ROLES.has(role) || role === Role.PROJECT_MANAGER;

  app.get("/api/settings/notifications", { preHandler: app.authenticate }, async (req) => {
    if (!canRead(req.user.role)) throw forbidden();
    const { client } = ClientQuery.parse(req.query);
    const [lists, rules] = await Promise.all([
      app.db.distributionList.findMany({ where: { client }, orderBy: { rank: "asc" } }),
      app.db.escalationRule.findMany({ where: { client }, orderBy: { level: "asc" } }),
    ]);
    return {
      emailEnabled: emailEnabled(),
      lists: lists.map((l) => ({ ...l, trigger: ERICSSON_LIST_TRIGGERS[l.key as EricssonList] ?? "" })),
      rules,
    };
  });

  app.put("/api/settings/distribution-lists/:id", { preHandler: app.requireRole(Role.ADMIN) }, async (req) => {
    const { id } = IdParams.parse(req.params);
    const b = UpdateListSchema.parse(req.body);
    const users = await app.db.user.count({ where: { id: { in: b.userIds } } });
    if (users !== new Set(b.userIds).size) throw httpError(400, "A recipient is not a user");
    const exists = await app.db.distributionList.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound("List not found");
    return app.db.distributionList.update({ where: { id }, data: { userIds: [...new Set(b.userIds)], emails: [...new Set(b.emails)] } });
  });

  // Replaces the whole ladder at once, so levels can't end up out of order.
  app.put("/api/settings/escalation-rules", { preHandler: app.requireRole(Role.ADMIN) }, async (req) => {
    const { client } = ClientQuery.parse(req.query);
    const { rules } = UpdateRulesSchema.parse(req.body);
    const sorted = [...rules].sort((a, b) => a.level - b.level);
    sorted.forEach((r, i) => {
      if (r.level !== i + 1) throw httpError(400, "Levels must be 1, 2, 3 … with no gaps");
      if (i > 0 && r.afterDays <= sorted[i - 1]!.afterDays) throw httpError(400, "Each level must start later than the one before");
    });
    await app.db.$transaction([
      app.db.escalationRule.deleteMany({ where: { client } }),
      app.db.escalationRule.createMany({ data: sorted.map((r) => ({ client, level: r.level, afterDays: r.afterDays, roles: r.roles as DbRole[] })) }),
    ]);
    return app.db.escalationRule.findMany({ where: { client }, orderBy: { level: "asc" } });
  });

  // Runs the scheduled jobs now (they also run every 15 minutes). Safe to repeat: everything is deduplicated.
  app.post("/api/admin/jobs/run", { preHandler: app.requireRole(Role.ADMIN) }, async () => runEricssonJobs(app));
}
