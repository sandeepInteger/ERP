import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { assertCanEdit } from "./ericsson.shared.js";
import { hideSiteMoney } from "./money.logic.js";
import { CreateSiteSchema, ListSitesQuerySchema, SiteActionSchema, UpdateSiteSchema } from "./sites.schema.js";
import { createSite, getSite, listSites, performAction, summary, updateSite } from "./sites.service.js";

const IdParams = z.object({ id: z.string().min(1) });

// Ericsson IBS sites (/api/ericsson/*). Everyone signed in can read; ERICSSON_EDIT_ROLES
// can change; workflow actions are checked per action against the RACI (ERICSSON_ACTIONS).
export async function ericssonSitesRoute(app: FastifyInstance) {
  const guard = { preHandler: app.authenticate };

  app.get("/api/ericsson/summary", guard, async (req) => summary(app, req.user.role));

  app.get("/api/ericsson/sites", guard, async (req) => listSites(app, ListSitesQuerySchema.parse(req.query), req.user.sub, req.user.role));

  app.post("/api/ericsson/sites", guard, async (req, reply) => {
    assertCanEdit(req.user.role);
    const body = CreateSiteSchema.parse(req.body);
    return reply.status(201).send(await createSite(app, body, req.user.sub));
  });

  app.get("/api/ericsson/sites/:id", guard, async (req) => {
    const { id } = IdParams.parse(req.params);
    return getSite(app, id, req.user.role);
  });

  app.patch("/api/ericsson/sites/:id", guard, async (req) => {
    assertCanEdit(req.user.role);
    const { id } = IdParams.parse(req.params);
    return hideSiteMoney(await updateSite(app, id, UpdateSiteSchema.parse(req.body), req.user.sub), req.user.role);
  });

  app.post("/api/ericsson/sites/:id/actions", guard, async (req) => {
    const { id } = IdParams.parse(req.params);
    const body = SiteActionSchema.parse(req.body);
    await performAction(app, id, body, { id: req.user.sub, role: req.user.role });
    return getSite(app, id, req.user.role);
  });
}
