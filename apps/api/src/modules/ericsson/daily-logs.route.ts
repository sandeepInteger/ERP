import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { day } from "../../lib/http.js";
import { assertCanWorkOnSite, assertSite, logEvent } from "./ericsson.shared.js";

// SOP step 5: daily progress from the site (summary, crew, hours, blockers).

const IdParams = z.object({ id: z.string().min(1) });

const CreateDailyLogSchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  summary: z.string().trim().min(1).max(4000),
  crewCount: z.number().int().min(1).max(200),
  hoursEach: z.number().positive().max(24),
  blocked: z.boolean().default(false),
  blockerNote: z.string().trim().max(2000).optional(),
});

export async function ericssonDailyLogsRoute(app: FastifyInstance) {
  const guard = { preHandler: app.authenticate };

  app.post("/api/ericsson/sites/:id/daily-logs", guard, async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    await assertSite(app, id);
    await assertCanWorkOnSite(app, req.user, id);
    const b = CreateDailyLogSchema.parse(req.body);
    const row = await app.db.ericssonDailyLog.create({
      data: {
        siteId: id,
        workDate: day(b.workDate),
        summary: b.summary,
        crewCount: b.crewCount,
        hoursEach: b.hoursEach,
        blocked: b.blocked,
        blockerNote: b.blocked ? (b.blockerNote ?? null) : null,
        authorId: req.user.sub,
      },
    });
    const hours = b.crewCount * b.hoursEach;
    await logEvent(app.db, id, req.user.sub, "DAILY_LOG",
      `Daily log for ${b.workDate}: crew of ${b.crewCount}, ${hours} labor hrs${b.blocked ? " · work was blocked" : ""}`);
    return reply.status(201).send(row);
  });
}
