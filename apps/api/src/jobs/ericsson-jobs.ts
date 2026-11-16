import cron from "node-cron";
import type { FastifyInstance } from "fastify";
import type { Role as DbRole } from "@prisma/client";

import { ERICSSON_STEPS, ERICSSON_STEP_ORDER, EricssonList, EricssonStep } from "@erp/types";
import { notifyList, notifyUsers } from "../lib/notify.js";
import { loadWorkSites } from "../modules/ericsson/my-work.service.js";
import { siteTasks } from "../modules/ericsson/my-work.logic.js";
import { bimonthlyPeriod } from "../modules/ericsson/reports.logic.js";
import { FE_VISIT_LINK, shouldAutoClose, visitManagerId, visitManagerLink } from "../modules/ericsson/visits.logic.js";
import { logEvent } from "../modules/ericsson/ericsson.shared.js";
import { FE_VISIT_AUTO_CLOSE_HOURS } from "@erp/types";
import { escalationsDue, isWeekdayAfter, localIsoDate, reportDayAfter } from "./ericsson-jobs.logic.js";

// Scheduled Ericsson notifications. Every job is idempotent (dedupe keys), so running it
// every 15 minutes, twice, or by hand from the admin screen never double-notifies.
const CLIENT = "ERICSSON";
const DIGEST_HOUR = Number(process.env["DIGEST_HOUR"] ?? 8);

export interface JobSummary { escalations: number; standup: boolean; report: boolean; visitsClosed: number }

export async function runEricssonJobs(app: FastifyInstance, now = new Date()): Promise<JobSummary> {
  const sites = await loadWorkSites(app.db);
  const tasks = sites.flatMap((s) => siteTasks(s, now));
  const summary: JobSummary = { escalations: 0, standup: false, report: false, visitsClosed: 0 };

  // 1. Escalations.
  const rules = await app.db.escalationRule.findMany({ where: { client: CLIENT }, orderBy: { level: "asc" } });
  const due = escalationsDue(tasks, rules.map((r) => ({ level: r.level, afterDays: r.afterDays, roles: r.roles })));
  if (due.length) {
    const orgRoles = [...new Set(due.flatMap((d) => d.orgRoles))];
    const orgUsers = orgRoles.length
      ? await app.db.user.findMany({ where: { isActive: true, role: { in: orgRoles as DbRole[] } }, select: { id: true, role: true } })
      : [];
    const byId = new Map(sites.map((s) => [s.id, s]));
    for (const d of due) {
      const site = byId.get(d.task.siteId);
      const recipients = [
        ...(d.level === 1 ? [d.task.assigneeId] : []),
        ...d.siteSlots.map((slot) => site?.assignees[slot] ?? null),
        ...orgUsers.filter((u) => d.orgRoles.includes(u.role)).map((u) => u.id),
      ];
      await notifyUsers(app, recipients, {
        type: "ESCALATION",
        title: `Escalation L${d.level}: ${d.task.title} (${d.task.siteCode})`,
        body: `Overdue ${d.task.ageDays} days · ${d.task.venueName} · ${d.task.detail}`,
        link: `/ericsson/sites/${d.task.siteId}${d.task.tab === "overview" ? "" : `?tab=${d.task.tab}`}`,
        siteId: d.task.siteId,
        dedupeKey: d.dedupeKey,
      });
      summary.escalations++;
    }
  }

  // 2. Daily stand-up digest (Appendix C: daily stand-up call).
  if (isWeekdayAfter(now, DIGEST_HOUR)) {
    const open = sites.filter((s) => s.step !== EricssonStep.CLOSED);
    const counts = ERICSSON_STEP_ORDER.filter((s) => s !== EricssonStep.CLOSED)
      .map((st) => [st, open.filter((s) => s.step === st).length] as const)
      .filter(([, n]) => n > 0)
      .map(([st, n]) => `${ERICSSON_STEPS[st].short}: ${n}`);
    const overdue = tasks.filter((t) => t.urgency === "OVERDUE").sort((a, b) => b.ageDays - a.ageDays);
    const lines = [
      `${open.length} active sites · ${counts.join(" · ") || "none"}`,
      `${overdue.length} overdue tasks${overdue.length ? ":" : "."}`,
      ...overdue.slice(0, 8).map((t) => `• ${t.siteCode}: ${t.title} (${t.ageDays} d)`),
    ];
    await notifyList(app, CLIENT, EricssonList.DAILY_STANDUP, {
      type: "STANDUP_DIGEST",
      title: `Stand-up digest · ${localIsoDate(now)}`,
      body: lines.join("\n"),
      link: "/dashboard",
      dedupeKey: `standup:${localIsoDate(now)}`,
    });
    summary.standup = true;
  }

  // 3. Bimonthly revenue / cost report for the period that just ended.
  if (reportDayAfter(now, DIGEST_HOUR)) {
    const p = bimonthlyPeriod(new Date(now.getTime() - 86_400_000));
    await notifyList(app, CLIENT, EricssonList.REVENUE_COST_REPORT, {
      type: "REPORT_DUE",
      title: `Revenue & cost report ready: ${p.from} to ${p.to}`,
      body: "The bimonthly revenue / cost report for the period that just ended is ready to review and export.",
      link: "/ericsson/reports",
      dedupeKey: `revcost:${p.from}`,
    });
    summary.report = true;
  }

  // 4. Site visits an FE forgot to check out of: close them (location sharing stops) and tell the FE and their manager.
  const open = await app.db.ericssonSiteVisit.findMany({
    where: { checkOutAt: null, checkInAt: { lt: new Date(now.getTime() - FE_VISIT_AUTO_CLOSE_HOURS * 3_600_000) } },
    select: { id: true, siteId: true, checkInAt: true, checkOutAt: true, user: { select: { id: true, firstName: true, lastName: true, managerId: true } }, site: { select: { siteCode: true, deliveryLeadId: true, pmId: true } } },
  });
  for (const v of open.filter((x) => shouldAutoClose(x, now))) {
    const { count } = await app.db.ericssonSiteVisit.updateMany({ where: { id: v.id, checkOutAt: null }, data: { checkOutAt: now, checkOutBy: "AUTO" } });
    if (!count) continue;
    const name = `${v.user.firstName} ${v.user.lastName}`;
    await logEvent(app.db, v.siteId, null, "CHECK_OUT", `${name} was checked out automatically after ${FE_VISIT_AUTO_CLOSE_HOURS} hours`);
    // The FE gets a link to their own home screen; the manager (FE manager → site DL → site PM) a page their role can open.
    const notice = {
      type: "VISIT_AUTO_CLOSED",
      title: `Checked out automatically: ${name} at ${v.site.siteCode}`,
      body: `The visit was still open after ${FE_VISIT_AUTO_CLOSE_HOURS} hours, so location sharing was stopped. Remember to press Check out when leaving the site.`,
      siteId: v.siteId,
      dedupeKey: `visit-auto-close:${v.id}`,
    };
    await notifyUsers(app, [v.user.id], { ...notice, link: FE_VISIT_LINK });
    const managerId = visitManagerId(v.user, v.site);
    const manager = managerId ? await app.db.user.findUnique({ where: { id: managerId }, select: { role: true } }) : null;
    if (managerId && manager) await notifyUsers(app, [managerId], { ...notice, link: visitManagerLink(v.siteId, manager.role) });
    summary.visitsClosed++;
  }

  return summary;
}

/** Runs every 15 minutes. Set JOBS_ENABLED=false to switch off (e.g. on a second API instance). */
export function registerEricssonJobs(app: FastifyInstance) {
  if (process.env["JOBS_ENABLED"] === "false") {
    app.log.info("Scheduled jobs disabled (JOBS_ENABLED=false)");
    return;
  }
  let running = false;
  const task = cron.schedule("*/15 * * * *", async () => {
    if (running) return;
    running = true;
    try {
      const s = await runEricssonJobs(app);
      app.log.info(s, "Ericsson jobs ran");
    } catch (err) {
      app.log.error({ err }, "Ericsson jobs failed");
    } finally {
      running = false;
    }
  });
  app.addHook("onClose", async () => { await task.stop(); });
}
