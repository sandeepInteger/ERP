import type { FastifyInstance } from "fastify";
import { Prisma, type EricssonScope as DbScope, type EricssonStep as DbStep, type VssOutcome as DbVss } from "@prisma/client";

import {
  CR_OPEN_STATUSES, ERICSSON_ACTIONS, ERICSSON_STEPS, ERICSSON_STEP_ORDER, EricssonAction, EricssonStep,
  VSS_OUTCOME_LABELS, canPerformEricssonAction,
} from "@erp/types";
import { day, defined, forbidden, httpError, notFound } from "../../lib/http.js";
import { PERSON_SELECT, loadSnapshot, logEvent, personName } from "./ericsson.shared.js";
import { NEXT_STEP, availableActions, gateFailures } from "./ericsson.workflow.js";
import { onSiteAction } from "./ericsson.notify.js";
import type { CreateSiteBody, ListSitesQuery, SiteActionBody, UpdateSiteBody } from "./sites.schema.js";

const DAY_MS = 86_400_000;

function daysSince(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY_MS));
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function listSites(app: FastifyInstance, q: ListSitesQuery, viewerId: string) {
  const and: Prisma.EricssonSiteWhereInput[] = [];
  if (q.step) and.push({ step: q.step as DbStep });
  else if (!q.includeClosed) and.push({ step: { not: "CLOSED" } });
  if (q.scope) and.push({ scope: q.scope as DbScope });
  if (q.search) {
    const contains = { contains: q.search, mode: "insensitive" as const };
    and.push({ OR: [{ siteCode: contains }, { venueName: contains }, { rfxNumber: contains }, { ericssonRef: contains }] });
  }
  if (q.mine) {
    and.push({ OR: [{ pmId: viewerId }, { apmId: viewerId }, { deliveryLeadId: viewerId }, { coordinatorId: viewerId }] });
  }

  const sites = await app.db.ericssonSite.findMany({
    where: { AND: and },
    orderBy: [{ stepChangedAt: "asc" }],
    select: {
      id: true, siteCode: true, venueName: true, scope: true, step: true, stepChangedAt: true,
      rfxNumber: true, sovValue: true, targetDate: true,
      pm: { select: PERSON_SELECT }, deliveryLead: { select: PERSON_SELECT },
      changeRequests: { select: { status: true } },
      _count: { select: { discrepancies: { where: { isResolved: false } } } },
    },
  });

  return sites.map((s) => ({
    id: s.id,
    siteCode: s.siteCode,
    venueName: s.venueName,
    scope: s.scope,
    step: s.step,
    daysInStep: daysSince(s.stepChangedAt),
    rfxNumber: s.rfxNumber,
    sovValue: s.sovValue,
    targetDate: s.targetDate,
    pmName: personName(s.pm),
    deliveryLeadName: personName(s.deliveryLead),
    openChangeRequests: s.changeRequests.filter((c) => CR_OPEN_STATUSES.has(c.status)).length,
    openDiscrepancies: s._count.discrepancies,
  }));
}

// ─── Detail ──────────────────────────────────────────────────────────────────

export async function getSite(app: FastifyInstance, id: string, viewerRole: string) {
  const site = await app.db.ericssonSite.findUnique({
    where: { id },
    include: {
      pm: { select: PERSON_SELECT },
      apm: { select: PERSON_SELECT },
      deliveryLead: { select: PERSON_SELECT },
      coordinator: { select: PERSON_SELECT },
      documents: { orderBy: { uploadedAt: "desc" }, include: { uploadedBy: { select: PERSON_SELECT } } },
      discrepancies: {
        orderBy: { createdAt: "asc" },
        include: { raisedBy: { select: PERSON_SELECT }, resolvedBy: { select: PERSON_SELECT } },
      },
      clientQueries: { orderBy: { createdAt: "asc" }, include: { author: { select: PERSON_SELECT } } },
      materials: { orderBy: { createdAt: "asc" } },
      changeRequests: { orderBy: { number: "desc" }, include: { raisedBy: { select: PERSON_SELECT } } },
      dailyLogs: { orderBy: { workDate: "desc" }, include: { author: { select: PERSON_SELECT } } },
      events: { orderBy: { createdAt: "desc" }, take: 100, include: { actor: { select: PERSON_SELECT } } },
      crew: { include: { user: { select: PERSON_SELECT } }, orderBy: { createdAt: "asc" } },
      workItems: {
        where: { status: { not: "CANCELLED" } },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        include: {
          assignee: { select: PERSON_SELECT },
          updates: { orderBy: { createdAt: "desc" }, take: 5, include: { user: { select: PERSON_SELECT } } },
        },
      },
    },
  });
  if (!site) throw notFound("Site not found");

  const snapshot = await loadSnapshot(app.db, id);
  return { ...site, daysInStep: daysSince(site.stepChangedAt), actions: availableActions(viewerRole, snapshot) };
}

// ─── Create / update ─────────────────────────────────────────────────────────

async function assertAssignees(app: FastifyInstance, ids: (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter((x): x is string => typeof x === "string"))];
  if (!wanted.length) return;
  const found = await app.db.user.count({ where: { id: { in: wanted }, isActive: true } });
  if (found !== wanted.length) throw httpError(400, "An assigned person is not an active user");
}

export async function createSite(app: FastifyInstance, body: CreateSiteBody, actorId: string) {
  await assertAssignees(app, [body.pmId, body.apmId, body.deliveryLeadId, body.coordinatorId]);
  try {
    return await app.db.$transaction(async (tx) => {
      const site = await tx.ericssonSite.create({
        data: {
          ...defined({
            ericssonRef: body.ericssonRef, address: body.address, venueSqft: body.venueSqft,
            clientPmName: body.clientPmName, clientPmEmail: body.clientPmEmail, notes: body.notes,
            pmId: body.pmId, apmId: body.apmId, deliveryLeadId: body.deliveryLeadId, coordinatorId: body.coordinatorId,
          }),
          siteCode: body.siteCode,
          venueName: body.venueName,
          scope: body.scope as DbScope,
          ...(body.targetDate ? { targetDate: day(body.targetDate) } : {}),
          createdById: actorId,
        },
      });
      await logEvent(tx, site.id, actorId, "SITE_CREATED", `Site assignment ${site.siteCode} logged`);
      return site;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw httpError(409, "A site with this site ID already exists");
    }
    throw e;
  }
}

export async function updateSite(app: FastifyInstance, id: string, body: UpdateSiteBody, actorId: string) {
  await assertAssignees(app, [body.pmId, body.apmId, body.deliveryLeadId, body.coordinatorId]);
  const { targetDate, scope, ...rest } = body;
  const site = await app.db.ericssonSite.update({
    where: { id },
    data: {
      ...defined(rest),
      ...(scope ? { scope: scope as DbScope } : {}),
      ...(targetDate !== undefined ? { targetDate: targetDate ? day(targetDate) : null } : {}),
    },
  }).catch((e: unknown) => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") throw notFound("Site not found");
    throw e;
  });
  await logEvent(app.db, id, actorId, "SITE_UPDATED", "Site details updated");
  return site;
}

// ─── Workflow actions ────────────────────────────────────────────────────────

function actionData(body: SiteActionBody, now: Date): Prisma.EricssonSiteUpdateInput {
  switch (body.action) {
    case EricssonAction.ACCEPT_SOV:
      return { sovValue: body.sovValue, sovVersion: body.sovVersion, sovAcceptedAt: now };
    case EricssonAction.REQUEST_RFX:
      return { rfxRequestedAt: now };
    case EricssonAction.RECORD_RFX:
      return { rfxNumber: body.rfxNumber, rfxReceivedAt: day(body.receivedOn), rfxAcceptedAt: now };
    case EricssonAction.START_EXECUTION:
      return { executionStartedAt: now };
    case EricssonAction.COMPLETE_SOW:
      return { sowCompletedAt: now };
    case EricssonAction.RECORD_VSS:
      return { vssDate: day(body.vssDate), vssOutcome: body.outcome as DbVss };
    case EricssonAction.SUBMIT_AE202:
      return { ae202SubmittedAt: now };
    case EricssonAction.STAMP_AE202:
      return { ae202StampedAt: now };
    case EricssonAction.UPLOAD_INVOICE:
      return { srmInvoiceNumber: body.srmInvoiceNumber, invoiceUploadedAt: now };
    case EricssonAction.APPROVE_INVOICE:
      return { invoiceApprovedAt: now };
    case EricssonAction.CLOSE_SITE:
      return { closedAt: now };
    case EricssonAction.SUBMIT_FOR_VERIFICATION:
      return {};
  }
}

function actionMessage(body: SiteActionBody): string {
  switch (body.action) {
    case EricssonAction.ACCEPT_SOV:
      return `SOV v${body.sovVersion} accepted ($${body.sovValue.toLocaleString("en-US")})`;
    case EricssonAction.RECORD_RFX:
      return `RFX ${body.rfxNumber} recorded and accepted`;
    case EricssonAction.RECORD_VSS:
      return `VSS on ${body.vssDate}: ${VSS_OUTCOME_LABELS[body.outcome]}`;
    case EricssonAction.UPLOAD_INVOICE:
      return `Invoice ${body.srmInvoiceNumber} uploaded to SRM`;
    default:
      return ERICSSON_ACTIONS[body.action].label;
  }
}

export async function performAction(app: FastifyInstance, siteId: string, body: SiteActionBody, actor: { id: string; role: string }) {
  if (!canPerformEricssonAction(actor.role, body.action)) {
    throw forbidden(`Your role cannot "${ERICSSON_ACTIONS[body.action].label}"`);
  }

  const updated = await app.db.$transaction(async (tx) => {
    // Lock the row so two people clicking at once cannot both pass the gate.
    await tx.$executeRaw`SELECT id FROM ericsson_sites WHERE id = ${siteId} FOR UPDATE`;
    const snapshot = await loadSnapshot(tx, siteId);
    const failures = gateFailures(body.action, snapshot);
    if (failures.length) throw httpError(409, failures[0] ?? "Not allowed yet", { blockers: failures });

    const now = new Date();
    const next = NEXT_STEP[body.action];
    const site = await tx.ericssonSite.update({
      where: { id: siteId },
      data: { ...actionData(body, now), ...(next ? { step: next as DbStep, stepChangedAt: now } : {}) },
    });
    const moved = next ? ` → ${ERICSSON_STEPS[next].label}` : "";
    await logEvent(tx, siteId, actor.id, body.action, actionMessage(body) + moved);
    return site;
  });
  // After commit; never fails the action.
  void onSiteAction(app, siteId, body.action, actor.id);
  return updated;
}

// ─── Dashboard summary ───────────────────────────────────────────────────────

const STALE_DAYS = 3;

export async function summary(app: FastifyInstance) {
  const [byStep, openCrs, sites] = await Promise.all([
    app.db.ericssonSite.groupBy({ by: ["step"], _count: { _all: true } }),
    app.db.ericssonChangeRequest.findMany({
      where: { status: { in: ["PM_REVIEW", "SUBMITTED"] } },
      select: { id: true, number: true, title: true, total: true, status: true, updatedAt: true, site: { select: { id: true, siteCode: true } } },
    }),
    app.db.ericssonSite.findMany({
      where: { step: { not: "CLOSED" } },
      select: {
        id: true, siteCode: true, venueName: true, step: true, stepChangedAt: true, sovValue: true,
        rfxRequestedAt: true, rfxAcceptedAt: true, executionStartedAt: true, invoiceUploadedAt: true,
        materials: { where: { status: "BACK_ORDERED" }, select: { item: true, eta: true } },
        _count: { select: { discrepancies: { where: { isResolved: false } } } },
      },
    }),
  ]);

  const counts = Object.fromEntries(ERICSSON_STEP_ORDER.map((s) => [s, 0])) as Record<EricssonStep, number>;
  for (const row of byStep) counts[row.step as unknown as EricssonStep] = row._count._all;

  // Work done but not yet invoiced: SOV value of sites past execution start without an SRM upload.
  const unbilled = sites
    .filter((s) => s.executionStartedAt && !s.invoiceUploadedAt)
    .reduce((sum, s) => sum + Number(s.sovValue ?? 0), 0);

  const attention: { kind: string; siteId: string; siteCode: string; title: string; detail: string; days: number }[] = [];
  for (const s of sites) {
    const inStep = daysSince(s.stepChangedAt);
    if (s.step === "CROSS_VERIFICATION" && s._count.discrepancies > 0 && inStep >= STALE_DAYS) {
      attention.push({ kind: "DISCREPANCY", siteId: s.id, siteCode: s.siteCode, title: `${s._count.discrepancies} open discrepancies`, detail: s.venueName, days: inStep });
    }
    if (s.step === "SOV_RFX" && s.rfxRequestedAt && !s.rfxAcceptedAt && daysSince(s.rfxRequestedAt) >= STALE_DAYS) {
      attention.push({ kind: "RFX", siteId: s.id, siteCode: s.siteCode, title: "RFX not received", detail: s.venueName, days: daysSince(s.rfxRequestedAt) });
    }
    for (const m of s.materials) {
      attention.push({ kind: "MATERIAL", siteId: s.id, siteCode: s.siteCode, title: `Back-ordered: ${m.item}`, detail: m.eta ? `ETA ${m.eta.toISOString().slice(0, 10)}` : "No ETA", days: inStep });
    }
  }
  for (const cr of openCrs) {
    const age = daysSince(cr.updatedAt);
    if (cr.status === "SUBMITTED" && age >= STALE_DAYS) {
      attention.push({ kind: "CR", siteId: cr.site.id, siteCode: cr.site.siteCode, title: `CR-${String(cr.number).padStart(4, "0")} awaiting Ericsson`, detail: cr.title, days: age });
    }
  }
  attention.sort((a, b) => b.days - a.days);

  return {
    counts,
    activeSites: sites.length,
    awaitingRfx: counts[EricssonStep.SOV_RFX],
    readyToInvoice: counts[EricssonStep.INVOICING],
    openChangeRequests: openCrs.length,
    pendingCrValue: openCrs.reduce((sum, c) => sum + Number(c.total), 0),
    unbilledValue: unbilled,
    attention: attention.slice(0, 20),
  };
}
