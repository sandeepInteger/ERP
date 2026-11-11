import { ERICSSON_INTAKE_DOCS, EricssonStep, LEADERSHIP_ROLES, MATERIAL_COVERED, Role, VssOutcome } from "@erp/types";

// "My work": turns each site's current state into the next tasks, and gives each task to the
// person assigned to the site in the role that the RACI makes Responsible for it.
// Leadership (Admin, Ops leader, Sales leader) sees every overdue task as an escalation.

export const STALE_DAYS = 3;
/** SOP Appendix E: IC&I scopes are quoted at 4 days on site. */
export const IC_I_BASELINE_DAYS = 4;

export type Slot = "pm" | "apm" | "deliveryLead" | "coordinator";
export type Urgency = "OVERDUE" | "TODAY" | "UPCOMING";

export interface WorkSite {
  id: string;
  siteCode: string;
  venueName: string;
  step: EricssonStep;
  stepChangedAt: Date;
  assignees: Partial<Record<Slot, string | null>>;
  docTypes: ReadonlySet<string>;
  openDiscrepancies: number;
  rfxRequestedAt: Date | null;
  materialStatuses: readonly string[];
  lastLogDate: Date | null;
  dailyLogCount: number;
  vssOutcome: string | null;
  ae202SubmittedAt: Date | null;
  invoiceUploadedAt: Date | null;
  changeRequests: { id: string; number: number; title: string; status: string; raisedById: string; updatedAt: Date }[];
}

export interface Task {
  key: string;
  siteId: string;
  siteCode: string;
  venueName: string;
  title: string;
  detail: string;
  /** Which site tab the task's button opens. */
  tab: "overview" | "documents" | "verification" | "materials" | "crs" | "log";
  ageDays: number;
  urgency: Urgency;
  /** Who it is assigned to; null when the site has nobody in that slot. */
  assigneeId: string | null;
  /** Shown to leadership only because it is overdue (not their own task). */
  escalation: boolean;
}

const DAY = 86_400_000;
const age = (from: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY));
const sameDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

function urgencyOf(ageDays: number, dueToday = false): Urgency {
  if (ageDays >= STALE_DAYS) return "OVERDUE";
  return dueToday || ageDays >= 1 ? "TODAY" : "UPCOMING";
}

/** Every open task on one site, before filtering by viewer. */
export function siteTasks(s: WorkSite, now: Date): Task[] {
  const out: Task[] = [];
  const inStep = age(s.stepChangedAt, now);
  const base = { siteId: s.id, siteCode: s.siteCode, venueName: s.venueName, escalation: false };
  const add = (slot: Slot, key: string, title: string, detail: string, tab: Task["tab"], ageDays = inStep, dueToday = false) =>
    out.push({ ...base, key: `${s.id}:${key}`, title, detail, tab, ageDays, urgency: urgencyOf(ageDays, dueToday), assigneeId: s.assignees[slot] ?? null });

  switch (s.step) {
    case EricssonStep.DOCS_RECEIVED: {
      const missing = ERICSSON_INTAKE_DOCS.filter((t) => !s.docTypes.has(t));
      if (missing.length) add("coordinator", "docs", `Upload the ${missing.join(", ")}`, "Step 1 · source documents from Ericsson", "documents");
      else add("coordinator", "submit", "Send to cross-verification", "Step 1 · all three documents are in", "overview");
      break;
    }
    case EricssonStep.CROSS_VERIFICATION:
      if (s.openDiscrepancies > 0) {
        add("apm", "discrepancies", `Resolve ${s.openDiscrepancies} open ${s.openDiscrepancies === 1 ? "discrepancy" : "discrepancies"}`, "Step 2 · chase the Ericsson PM", "verification");
      } else {
        add("apm", "accept-sov", "Review and accept the SOV", "Step 2 · no open discrepancies", "overview");
      }
      break;
    case EricssonStep.SOV_RFX:
      if (!s.rfxRequestedAt) add("apm", "request-rfx", "Request the RFX number", "Step 3 · SOV accepted", "overview");
      else add("apm", "chase-rfx", "Chase the RFX number", "Step 3 · requested, not received", "overview", age(s.rfxRequestedAt, now));
      break;
    case EricssonStep.MATERIALS: {
      const open = s.materialStatuses.filter((m) => !MATERIAL_COVERED.has(m)).length;
      if (open) add("apm", "materials", `${open} material ${open === 1 ? "line" : "lines"} to order or receive`, "Step 4 · BOM not covered yet", "materials");
      else add("apm", "start", "Start work execution", "Step 4 · all material covered", "overview");
      break;
    }
    case EricssonStep.EXECUTION:
      if (!s.lastLogDate || !sameDay(s.lastLogDate, now)) {
        add("deliveryLead", `log-${now.toISOString().slice(0, 10)}`, "Add today's daily log", "Step 5 · crew, hours, photos, blockers", "log", 0, true);
      }
      if (s.dailyLogCount > 0) {
        // Work in progress is not late until it runs past the SOP's 4-day IC&I baseline (Appendix E).
        const day = inStep + 1;
        out.push({
          ...base, key: `${s.id}:sow`, title: "Mark the SOW complete when work is done",
          detail: day > IC_I_BASELINE_DAYS ? `Step 5 · day ${day}, past the ${IC_I_BASELINE_DAYS}-day baseline: raise a CR if needed` : `Step 5 · day ${day} of ${IC_I_BASELINE_DAYS}`,
          tab: "overview", ageDays: inStep, urgency: day > IC_I_BASELINE_DAYS ? "OVERDUE" : "UPCOMING", assigneeId: s.assignees.deliveryLead ?? null,
        });
      }
      break;
    case EricssonStep.VSS_AE202:
      if (!s.vssOutcome || s.vssOutcome === VssOutcome.FAILED) add("deliveryLead", "vss", s.vssOutcome ? "Revisit the site and redo the VSS" : "Run the VSS with the client", "Step 7", "overview");
      else if (!s.ae202SubmittedAt) add("deliveryLead", "ae202", "Submit the AE202 with installation proof", "Step 7 · VSS passed", "documents");
      else add("deliveryLead", "stamp", "Get the client's stamp on the AE202", "Step 7 · AE202 submitted", "overview", age(s.ae202SubmittedAt, now));
      break;
    case EricssonStep.INVOICING:
      if (!s.invoiceUploadedAt) add("apm", "invoice", "Upload the invoice to the Ericsson SRM portal", "Step 9 · AE202 stamped", "overview");
      else add("apm", "invoice-approval", "Follow up on Ericsson's invoice approval", "Step 9 · invoice uploaded", "overview", age(s.invoiceUploadedAt, now));
      break;
    case EricssonStep.CLOSED:
      break;
  }

  for (const cr of s.changeRequests) {
    const label = `CR-${String(cr.number).padStart(4, "0")}`;
    const crAge = age(cr.updatedAt, now);
    const crBase = { ...base, tab: "crs" as const, ageDays: crAge };
    if (cr.status === "PM_REVIEW") {
      out.push({ ...crBase, key: `${cr.id}:review`, title: `Review ${label} and send it to Ericsson`, detail: cr.title, urgency: urgencyOf(crAge, true), assigneeId: s.assignees.pm ?? null });
    } else if (cr.status === "SUBMITTED") {
      out.push({ ...crBase, key: `${cr.id}:decision`, title: `Get Ericsson's decision on ${label}`, detail: cr.title, urgency: urgencyOf(crAge), assigneeId: s.assignees.pm ?? null });
    } else if (cr.status === "REJECTED") {
      out.push({ ...crBase, key: `${cr.id}:revise`, title: `Revise or withdraw ${label}`, detail: `Rejected · ${cr.title}`, urgency: urgencyOf(crAge, true), assigneeId: cr.raisedById });
    }
  }
  return out;
}

/** Tasks the viewer should see: their own, plus every overdue task when they are leadership. */
export function tasksFor(viewer: { id: string; role: string }, sites: WorkSite[], now: Date): Task[] {
  const leadership = LEADERSHIP_ROLES.has(viewer.role);
  const out: Task[] = [];
  for (const site of sites) {
    for (const t of siteTasks(site, now)) {
      if (t.assigneeId === viewer.id) out.push(t);
      else if (leadership && t.urgency === "OVERDUE") out.push({ ...t, escalation: true });
    }
  }
  const order: Record<Urgency, number> = { OVERDUE: 0, TODAY: 1, UPCOMING: 2 };
  return out.sort((a, b) => order[a.urgency] - order[b.urgency] || b.ageDays - a.ageDays);
}

/** Roles that may see another person's inbox (to cover for them or check workload). */
export function canViewOthersWork(role: string): boolean {
  return LEADERSHIP_ROLES.has(role) || role === Role.PROJECT_MANAGER;
}

/** The role that sits in each site slot. The unit test checks each task's slot can perform its action. */
export const SLOT_ROLE: Record<Slot, Role> = {
  pm: Role.PROJECT_MANAGER,
  apm: Role.ASSOCIATE_PM,
  deliveryLead: Role.DELIVERY_LEAD,
  coordinator: Role.COORDINATOR,
};
