import type { FastifyRequest, FastifyReply } from "fastify";

// Records every authenticated write. Reads are not audited (too noisy for a tracker).
const SKIP_PATHS = new Set(["/health"]);

export async function auditHook(req: FastifyRequest, reply: FastifyReply) {
  if (SKIP_PATHS.has(req.url)) return;

  const user = (req as FastifyRequest & { user?: { sub: string; sessionId: string } }).user;
  if (!user?.sub) return;

  const eventType = methodToEventType(req.method);
  if (!eventType) return;

  try {
    await req.server.db.auditLog.create({
      data: {
        userId: user.sub,
        sessionId: user.sessionId,
        eventType,
        resourceType: urlToResourceType(req.url),
        resourceId: (req.params as Record<string, string> | undefined)?.["id"] ?? null,
        ip: req.ip,
        userAgent: req.headers["user-agent"] ?? "",
        statusCode: reply.statusCode,
        path: req.url,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to write audit log");
  }
}

function methodToEventType(method: string): string | null {
  switch (method.toUpperCase()) {
    case "POST":
      return "RECORD_CREATED";
    case "PUT":
    case "PATCH":
      return "RECORD_UPDATED";
    case "DELETE":
      return "RECORD_DELETED";
    default:
      return null;
  }
}

function urlToResourceType(url: string): string {
  const path = url.split("?")[0] ?? url;
  return path.split("/").slice(2, 4).join("/") || "unknown";
}
