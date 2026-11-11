import {
  ChangeRequestStatus, ERICSSON_STEPS, EricssonStep, MaterialStatus, WorkItemStatus, type EricssonAction,
} from "@erp/types";
import type { BadgeTone } from "../components/ui/badge.js";

// Response shapes of /api/ericsson/*. Decimals arrive as strings, dates as ISO strings.

export interface Person { id: string; firstName: string; lastName: string; email: string }

export interface SiteRow {
  id: string;
  siteCode: string;
  venueName: string;
  scope: string;
  step: EricssonStep;
  daysInStep: number;
  rfxNumber: string | null;
  sovValue: string | null;
  targetDate: string | null;
  pmName: string | null;
  deliveryLeadName: string | null;
  openChangeRequests: number;
  openDiscrepancies: number;
}

export interface SiteDocument {
  id: string; type: string; fileName: string; mimeType: string; sizeBytes: number; version: number;
  uploadedAt: string; uploadedBy: Person;
}
export interface Discrepancy {
  id: string; item: string; sovValue: string | null; bomValue: string | null; rfdsValue: string | null; note: string | null;
  isResolved: boolean; resolution: string | null; createdAt: string; resolvedAt: string | null;
  raisedBy: Person; resolvedBy: Person | null;
}
export interface ClientQuery { id: string; direction: "OUTBOUND" | "INBOUND"; body: string; createdAt: string; author: Person }
export interface MaterialLine {
  id: string; item: string; bomQty: number; clientSuppliedQty: number; orderQty: number; orderRef: string | null;
  shipTo: string | null; eta: string | null; unitCost: string | null; status: MaterialStatus;
}
export interface ChangeRequest {
  id: string; number: number; type: string; title: string; reason: string; extraDays: string | null;
  amount: string; vendorQuote: string; passThroughPct: string; total: string; status: ChangeRequestStatus;
  raisedById: string; raisedBy: Person; createdAt: string; submittedAt: string | null; decidedAt: string | null; decisionNote: string | null;
  site?: { id: string; siteCode: string; venueName: string };
}
export interface DailyLog {
  id: string; workDate: string; summary: string; crewCount: number; hoursEach: string; blocked: boolean; blockerNote: string | null;
  author: Person;
}
export interface SiteEvent { id: string; type: string; message: string; createdAt: string; actor: Person | null }
export interface AvailableAction { action: EricssonAction; label: string; allowed: boolean; blockers: string[] }

export interface SiteDetail {
  id: string; siteCode: string; ericssonRef: string | null; venueName: string; address: string | null; scope: string;
  venueSqft: number | null; clientPmName: string | null; clientPmEmail: string | null; targetDate: string | null; notes: string | null;
  step: EricssonStep; stepChangedAt: string; daysInStep: number;
  pm: Person | null; apm: Person | null; deliveryLead: Person | null; coordinator: Person | null;
  verificationLoops: number; sovValue: string | null; sovVersion: number | null; sovAcceptedAt: string | null;
  rfxNumber: string | null; rfxRequestedAt: string | null; rfxReceivedAt: string | null; rfxAcceptedAt: string | null;
  executionStartedAt: string | null; sowCompletedAt: string | null;
  vssDate: string | null; vssOutcome: string | null; ae202SubmittedAt: string | null; ae202StampedAt: string | null;
  srmInvoiceNumber: string | null; invoiceUploadedAt: string | null; invoiceApprovedAt: string | null; closedAt: string | null;
  documents: SiteDocument[]; discrepancies: Discrepancy[]; clientQueries: ClientQuery[]; materials: MaterialLine[];
  changeRequests: ChangeRequest[]; dailyLogs: DailyLog[]; events: SiteEvent[]; actions: AvailableAction[];
  crew: { user: Person }[];
  workItems: WorkItem[];
}

export interface Summary {
  counts: Record<EricssonStep, number>;
  activeSites: number;
  awaitingRfx: number;
  readyToInvoice: number;
  openChangeRequests: number;
  pendingCrValue: number;
  unbilledValue: number;
  attention: { kind: string; siteId: string; siteCode: string; title: string; detail: string; days: number }[];
}

export interface UserOption { id: string; firstName: string; lastName: string; role: string; email: string }

// ─── Display helpers ─────────────────────────────────────────────────────────

export function stepLabel(step: EricssonStep): string {
  const s = ERICSSON_STEPS[step];
  return s.sop ? `${s.sop} · ${s.short}` : s.short;
}

export function stepTone(step: EricssonStep): BadgeTone {
  switch (step) {
    case EricssonStep.DOCS_RECEIVED: return "neutral";
    case EricssonStep.CROSS_VERIFICATION:
    case EricssonStep.SOV_RFX:
    case EricssonStep.MATERIALS: return "warning";
    case EricssonStep.EXECUTION:
    case EricssonStep.VSS_AE202: return "info";
    case EricssonStep.INVOICING: return "success";
    case EricssonStep.CLOSED: return "outline";
  }
}

export function materialTone(s: MaterialStatus): BadgeTone {
  switch (s) {
    case MaterialStatus.BACK_ORDERED: return "error";
    case MaterialStatus.TO_ORDER:
    case MaterialStatus.ORDERED: return "warning";
    case MaterialStatus.SHIPPED: return "info";
    default: return "success";
  }
}

export function crTone(s: ChangeRequestStatus): BadgeTone {
  switch (s) {
    case ChangeRequestStatus.PM_REVIEW: return "info";
    case ChangeRequestStatus.SUBMITTED: return "warning";
    case ChangeRequestStatus.APPROVED: return "success";
    case ChangeRequestStatus.REJECTED: return "error";
    case ChangeRequestStatus.WITHDRAWN: return "neutral";
  }
}

export function workTone(s: WorkItemStatus): BadgeTone {
  switch (s) {
    case WorkItemStatus.TODO: return "neutral";
    case WorkItemStatus.IN_PROGRESS: return "info";
    case WorkItemStatus.DONE: return "success";
    case WorkItemStatus.BLOCKED: return "error";
    case WorkItemStatus.CANCELLED: return "outline";
  }
}

export interface WorkItem {
  id: string; title: string; description: string | null; status: WorkItemStatus; dueDate: string | null;
  completedAt: string | null; assigneeId: string; assignee: Person;
  updates: { id: string; status: WorkItemStatus; hours: string; note: string | null; photoCount: number; workDate: string; createdAt: string; user: Person }[];
}

export function crLabel(n: number): string {
  return `CR-${String(n).padStart(4, "0")}`;
}
