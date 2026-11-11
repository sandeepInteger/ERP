import type { FastifyInstance } from "fastify";
import type { Prisma, PrismaClient } from "@prisma/client";

import { CR_OPEN_STATUSES, ERICSSON_EDIT_ROLES, Role, WORK_OPEN_STATUSES, type EricssonStep } from "@erp/types";
import { forbidden, notFound } from "../../lib/http.js";
import type { SiteSnapshot } from "./ericsson.workflow.js";

type Db = PrismaClient | Prisma.TransactionClient;

export function assertCanEdit(role: string): void {
  if (!ERICSSON_EDIT_ROLES.has(role)) throw forbidden("Your role can view Ericsson sites but not change them");
}

/**
 * Field work on a site (daily log, photos, raising a CR): field crew only on sites they're
 * assigned to; everyone else needs an editing role.
 */
export async function assertCanWorkOnSite(app: FastifyInstance, user: { sub: string; role: string }, siteId: string): Promise<void> {
  if (user.role === Role.FIELD_CREW) {
    const onCrew = await app.db.ericssonSiteCrew.findUnique({ where: { siteId_userId: { siteId, userId: user.sub } }, select: { siteId: true } });
    if (!onCrew) throw forbidden("You're not on this site's crew");
    return;
  }
  assertCanEdit(user.role);
}

export async function assertSite(app: FastifyInstance, siteId: string) {
  const site = await app.db.ericssonSite.findUnique({ where: { id: siteId }, select: { id: true, siteCode: true, step: true } });
  if (!site) throw notFound("Site not found");
  return site;
}

/** Adds a line to the site's activity trail. */
export async function logEvent(db: Db, siteId: string, actorId: string | null, type: string, message: string) {
  await db.ericssonSiteEvent.create({ data: { siteId, actorId, type, message } });
}

/** Everything the workflow gates look at, in one round of queries. */
export async function loadSnapshot(db: Db, siteId: string): Promise<SiteSnapshot> {
  const site = await db.ericssonSite.findUnique({
    where: { id: siteId },
    select: {
      step: true, sovAcceptedAt: true, rfxAcceptedAt: true, vssOutcome: true,
      ae202SubmittedAt: true, ae202StampedAt: true, invoiceUploadedAt: true, invoiceApprovedAt: true,
      documents: { select: { type: true } },
      materials: { select: { status: true } },
      changeRequests: { select: { status: true } },
      _count: { select: { dailyLogs: true, discrepancies: { where: { isResolved: false } } } },
      workItems: { select: { status: true, _count: { select: { updates: true } } } },
    },
  });
  if (!site) throw notFound("Site not found");
  return {
    workUpdateCount: site.workItems.reduce((n, w) => n + w._count.updates, 0),
    openWorkItems: site.workItems.filter((w) => WORK_OPEN_STATUSES.has(w.status)).length,
    step: site.step as unknown as EricssonStep,
    docTypes: new Set(site.documents.map((d) => d.type)),
    openDiscrepancies: site._count.discrepancies,
    sovAcceptedAt: site.sovAcceptedAt,
    rfxAcceptedAt: site.rfxAcceptedAt,
    materialStatuses: site.materials.map((m) => m.status),
    dailyLogCount: site._count.dailyLogs,
    vssOutcome: site.vssOutcome,
    ae202SubmittedAt: site.ae202SubmittedAt,
    ae202StampedAt: site.ae202StampedAt,
    invoiceUploadedAt: site.invoiceUploadedAt,
    invoiceApprovedAt: site.invoiceApprovedAt,
    openChangeRequests: site.changeRequests.filter((c) => CR_OPEN_STATUSES.has(c.status)).length,
  };
}

export const PERSON_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;

export function personName(p: { firstName: string; lastName: string } | null | undefined): string | null {
  return p ? `${p.firstName} ${p.lastName}` : null;
}
