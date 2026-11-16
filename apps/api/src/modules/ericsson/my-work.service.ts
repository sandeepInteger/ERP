import type { PrismaClient } from "@prisma/client";

import type { EricssonStep } from "@erp/types";
import type { WorkSite } from "./my-work.logic.js";

export interface LoadedWorkSite extends WorkSite {
  hasEmptySlot: boolean;
}

/** Every site that can still produce a task (open, or closed with an open CR), shaped for my-work.logic. */
export async function loadWorkSites(db: PrismaClient): Promise<LoadedWorkSite[]> {
  const rows = await db.ericssonSite.findMany({
    where: {
      OR: [
        { step: { not: "CLOSED" } },
        { changeRequests: { some: { status: { in: ["PM_REVIEW", "SUBMITTED", "REJECTED"] } } } },
      ],
    },
    select: {
      id: true, siteCode: true, venueName: true, step: true, stepChangedAt: true,
      pmId: true, apmId: true, deliveryLeadId: true, coordinatorId: true,
      rfxRequestedAt: true, vssOutcome: true, ae202SubmittedAt: true, invoiceUploadedAt: true, invoiceApprovedAt: true,
      documents: { select: { type: true } },
      materials: { select: { status: true } },
      dailyLogs: { select: { workDate: true }, orderBy: { workDate: "desc" }, take: 1 },
      changeRequests: {
        where: { status: { in: ["PM_REVIEW", "SUBMITTED", "REJECTED"] } },
        select: { id: true, number: true, title: true, status: true, raisedById: true, updatedAt: true },
      },
      _count: { select: { dailyLogs: true, discrepancies: { where: { isResolved: false } } } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    siteCode: r.siteCode,
    venueName: r.venueName,
    step: r.step as unknown as EricssonStep,
    stepChangedAt: r.stepChangedAt,
    assignees: { pm: r.pmId, apm: r.apmId, deliveryLead: r.deliveryLeadId, coordinator: r.coordinatorId },
    docTypes: new Set(r.documents.map((d) => d.type)),
    openDiscrepancies: r._count.discrepancies,
    rfxRequestedAt: r.rfxRequestedAt,
    materialStatuses: r.materials.map((m) => m.status),
    lastLogDate: r.dailyLogs[0]?.workDate ?? null,
    dailyLogCount: r._count.dailyLogs,
    vssOutcome: r.vssOutcome,
    ae202SubmittedAt: r.ae202SubmittedAt,
    invoiceUploadedAt: r.invoiceUploadedAt,
    invoiceApprovedAt: r.invoiceApprovedAt,
    changeRequests: r.changeRequests,
    hasEmptySlot: r.step !== "CLOSED" && (!r.pmId || !r.apmId || !r.deliveryLeadId),
  }));
}
