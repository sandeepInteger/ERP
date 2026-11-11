// Field engineers (role FIELD_CREW) are deny-by-default: app.authenticate rejects every route not
// listed here. Keys are "<METHOD> <route pattern>" exactly as Fastify registers them.
// Item- and site-level checks (only *their* work, sites and claims; only photos) happen in the routes.
// FEs update their own assigned work items; they do not submit the site's headcount daily log.

export const CREW_ALLOWED_ROUTES = new Set<string>([
  "GET /api/auth/me",
  "POST /api/auth/logout",
  "GET /api/notifications",
  "POST /api/notifications/:id/read",
  "POST /api/notifications/read-all",
  "GET /api/field/sites",
  "GET /api/field/sites/:id",
  "GET /api/field/my-work",
  "GET /api/field/work-items/:id",
  "POST /api/field/work-items/:id/updates",
  "GET /api/field/expenses",
  "POST /api/field/expenses",
  "DELETE /api/field/expenses/:id",
  "GET /api/expenses/:id/receipt",
  "POST /api/ericsson/sites/:id/documents",
  "POST /api/ericsson/sites/:id/change-requests",
  // Site visits: check in / out and the location trail of their own open visit (checked in the route).
  "GET /api/field/visits/current",
  "POST /api/field/sites/:id/check-in",
  "POST /api/field/visits/:id/points",
  "POST /api/field/visits/:id/check-out",
]);

export function crewMayCall(method: string, routePattern: string | undefined): boolean {
  return routePattern !== undefined && CREW_ALLOWED_ROUTES.has(`${method.toUpperCase()} ${routePattern}`);
}
