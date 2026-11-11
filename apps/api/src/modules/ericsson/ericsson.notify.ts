import type { FastifyInstance } from "fastify";

import {
  CR_STATUS_LABELS, ERICSSON_ACTIONS, ERICSSON_ACTION_RACI_TASK, ERICSSON_STEPS, ChangeRequestStatus, EricssonAction, EricssonList,
  type EricssonStep,
} from "@erp/types";
import { notifyList, notifyUsers } from "../../lib/notify.js";
import { NEXT_STEP } from "./ericsson.workflow.js";
import { crNumberLabel } from "./change-requests.logic.js";

// Workflow events → who hears about them. Called fire-and-forget after the action commits.
const CLIENT = "ERICSSON";

async function siteTeam(app: FastifyInstance, siteId: string) {
  return app.db.ericssonSite.findUnique({
    where: { id: siteId },
    select: { id: true, siteCode: true, venueName: true, pmId: true, apmId: true, deliveryLeadId: true, coordinatorId: true },
  });
}

const without = (ids: (string | null)[], actorId: string) => ids.filter((x) => x && x !== actorId);

export async function onSiteAction(app: FastifyInstance, siteId: string, action: EricssonAction, actorId: string) {
  const s = await siteTeam(app, siteId);
  if (!s) return;
  const link = `/ericsson/sites/${s.id}`;
  const next = NEXT_STEP[action];

  // The whole site team hears when the site moves to a new step.
  if (next) {
    await notifyUsers(app, without([s.pmId, s.apmId, s.deliveryLeadId, s.coordinatorId], actorId), {
      type: "SITE_STEP",
      title: `${s.siteCode} moved to ${ERICSSON_STEPS[next as EricssonStep].label}`,
      body: `${s.venueName}: ${ERICSSON_ACTIONS[action].label}.`,
      link, siteId,
    });
  }

  const list: Partial<Record<EricssonAction, EricssonList>> = {
    [EricssonAction.ACCEPT_SOV]: EricssonList.SOV_RFX_ACCEPTANCE,
    [EricssonAction.RECORD_RFX]: EricssonList.SOV_RFX_ACCEPTANCE,
    [EricssonAction.COMPLETE_SOW]: EricssonList.DELIVERY_STATUS,
    [EricssonAction.CLOSE_SITE]: EricssonList.DELIVERY_STATUS,
    [EricssonAction.STAMP_AE202]: EricssonList.SITE_INVOICING,
  };
  // RACI: Consulted and Informed roles for this step. Delivery roles mean the site's own
  // person in that slot; any other role means everyone active with it.
  const rule = await app.db.raciRule.findUnique({ where: { client_taskKey: { client: CLIENT, taskKey: ERICSSON_ACTION_RACI_TASK[action] } } });
  const raciRoles = [...new Set([...(rule?.consulted ?? []), ...(rule?.informed ?? [])])];
  if (raciRoles.length) {
    const slotOf: Record<string, string | null> = {
      PROJECT_MANAGER: s.pmId, ASSOCIATE_PM: s.apmId, DELIVERY_LEAD: s.deliveryLeadId, COORDINATOR: s.coordinatorId,
    };
    const siteIds = raciRoles.filter((r) => r in slotOf).map((r) => slotOf[r] ?? null);
    const orgRoles = raciRoles.filter((r) => !(r in slotOf));
    const orgIds = orgRoles.length
      ? (await app.db.user.findMany({ where: { isActive: true, role: { in: orgRoles } }, select: { id: true } })).map((u) => u.id)
      : [];
    await notifyUsers(app, without([...siteIds, ...orgIds], actorId), {
      type: "RACI_INFORMED",
      title: `${s.siteCode}: ${ERICSSON_ACTIONS[action].label}`,
      body: `${s.venueName} · you're consulted / informed on "${rule!.task}" in the RACI.`,
      link, siteId,
    });
  }

  const key = list[action];
  if (key) {
    const title: Record<EricssonList, string> = {
      [EricssonList.SOV_RFX_ACCEPTANCE]: action === EricssonAction.ACCEPT_SOV ? `${s.siteCode}: SOV accepted, RFX to request` : `${s.siteCode}: RFX recorded`,
      [EricssonList.DELIVERY_STATUS]: action === EricssonAction.CLOSE_SITE ? `${s.siteCode} closed` : `${s.siteCode}: SOW complete`,
      [EricssonList.SITE_INVOICING]: `${s.siteCode} ready to invoice (AE202 stamped)`,
      [EricssonList.DAILY_STANDUP]: "", [EricssonList.REVENUE_COST_REPORT]: "", [EricssonList.VENDOR_ONBOARDING]: "", [EricssonList.VENDOR_INVOICING]: "",
    };
    await notifyList(app, CLIENT, key, { type: `LIST_${key}`, title: title[key], body: s.venueName, link, siteId });
  }
}

export async function onDiscrepancyRaised(app: FastifyInstance, siteId: string, item: string, actorId: string) {
  const s = await siteTeam(app, siteId);
  if (!s) return;
  await notifyUsers(app, without([s.pmId], actorId), {
    type: "DISCREPANCY", title: `${s.siteCode}: discrepancy flagged`, body: `${item} doesn't match across SOV, BOM and RFDS.`,
    link: `/ericsson/sites/${s.id}?tab=verification`, siteId,
  });
}

export async function onCrEvent(app: FastifyInstance, crId: string, actorId: string) {
  const cr = await app.db.ericssonChangeRequest.findUnique({
    where: { id: crId },
    include: { site: { select: { id: true, siteCode: true, pmId: true, apmId: true } } },
  });
  if (!cr) return;
  const label = `${crNumberLabel(cr.number)} (${cr.site.siteCode})`;
  const n = { link: `/ericsson/sites/${cr.site.id}?tab=crs`, siteId: cr.site.id, body: cr.title };
  const status = cr.status as ChangeRequestStatus;
  const subVendor = cr.type === "SUB_VENDOR";

  if (status === ChangeRequestStatus.PM_REVIEW) {
    await notifyUsers(app, without([cr.site.pmId], actorId), { ...n, type: "CR_REVIEW", title: `${label} needs your review` });
    if (subVendor && !cr.submittedAt) {
      await notifyList(app, CLIENT, EricssonList.VENDOR_ONBOARDING, { ...n, type: "LIST_VENDOR_ONBOARDING", title: `Sub-vendor needed: ${label}` });
    }
    return;
  }
  await notifyUsers(app, without([cr.raisedById, cr.site.apmId], actorId), {
    ...n, type: "CR_STATUS", title: `${label}: ${CR_STATUS_LABELS[status]}`,
    ...(cr.decisionNote ? { body: `${cr.title} · ${cr.decisionNote}` } : {}),
  });
  if (status === ChangeRequestStatus.APPROVED) {
    await notifyList(app, CLIENT, EricssonList.SITE_INVOICING, { ...n, type: "LIST_SITE_INVOICING", title: `${label} approved: add it to the invoice` });
    if (subVendor) await notifyList(app, CLIENT, EricssonList.VENDOR_INVOICING, { ...n, type: "LIST_VENDOR_INVOICING", title: `Sub-vendor work approved: ${label}` });
  }
}
