import { Role } from "./roles.js";

// Ericsson IBS workflow vocabulary, from the Ericsson IBS SOP (docs/Ericsson IBS Project Work Flow 1.pdf).
// The Ericsson and AT&T workflows are deliberately separate: nothing here is shared with AT&T.
// Enum values mirror apps/api/prisma/schema.prisma — keep both in step.

export enum EricssonStep {
  DOCS_RECEIVED = "DOCS_RECEIVED",
  CROSS_VERIFICATION = "CROSS_VERIFICATION",
  SOV_RFX = "SOV_RFX",
  MATERIALS = "MATERIALS",
  EXECUTION = "EXECUTION",
  VSS_AE202 = "VSS_AE202",
  INVOICING = "INVOICING",
  CLOSED = "CLOSED",
}

/** Steps in workflow order. SOP steps 6 and 8 (change requests) run in parallel, not as a step. */
export const ERICSSON_STEP_ORDER: EricssonStep[] = [
  EricssonStep.DOCS_RECEIVED,
  EricssonStep.CROSS_VERIFICATION,
  EricssonStep.SOV_RFX,
  EricssonStep.MATERIALS,
  EricssonStep.EXECUTION,
  EricssonStep.VSS_AE202,
  EricssonStep.INVOICING,
  EricssonStep.CLOSED,
];

export const ERICSSON_STEPS: Record<EricssonStep, { sop: number | null; label: string; short: string }> = {
  [EricssonStep.DOCS_RECEIVED]: { sop: 1, label: "SOV, BOM, RFDS received", short: "Docs received" },
  [EricssonStep.CROSS_VERIFICATION]: { sop: 2, label: "Document cross-verification", short: "Verify" },
  [EricssonStep.SOV_RFX]: { sop: 3, label: "Accept SOV & request RFX", short: "SOV / RFX" },
  [EricssonStep.MATERIALS]: { sop: 4, label: "RFX receipt & material procurement", short: "Materials" },
  [EricssonStep.EXECUTION]: { sop: 5, label: "Work execution", short: "Execution" },
  [EricssonStep.VSS_AE202]: { sop: 7, label: "VSS & AE202 submission", short: "VSS & AE202" },
  [EricssonStep.INVOICING]: { sop: 9, label: "Invoicing & project closure", short: "Invoicing" },
  [EricssonStep.CLOSED]: { sop: null, label: "Closed", short: "Closed" },
};

export enum EricssonScope {
  IBS_ICI = "IBS_ICI",
  BBU_SWAP = "BBU_SWAP",
  MODERNIZATION = "MODERNIZATION",
  MACRO_INSTALL = "MACRO_INSTALL",
}

export const ERICSSON_SCOPE_LABELS: Record<EricssonScope, string> = {
  [EricssonScope.IBS_ICI]: "IBS IC&I",
  [EricssonScope.BBU_SWAP]: "BBU swap",
  [EricssonScope.MODERNIZATION]: "Modernization",
  [EricssonScope.MACRO_INSTALL]: "Macro install",
};

export enum EricssonDocType {
  SOV = "SOV",
  BOM = "BOM",
  RFDS = "RFDS",
  RFX = "RFX",
  MATERIAL_RECEIPT = "MATERIAL_RECEIPT",
  AE202 = "AE202",
  CR_APPROVAL = "CR_APPROVAL",
  INVOICE = "INVOICE",
  PHOTO = "PHOTO",
  OTHER = "OTHER",
}

export const ERICSSON_DOC_LABELS: Record<EricssonDocType, string> = {
  [EricssonDocType.SOV]: "SOV · Schedule of Values",
  [EricssonDocType.BOM]: "BOM · Bill of Materials",
  [EricssonDocType.RFDS]: "RFDS · Radio Frequency Data Sheet",
  [EricssonDocType.RFX]: "RFX authorization",
  [EricssonDocType.MATERIAL_RECEIPT]: "Material receipt",
  [EricssonDocType.AE202]: "AE202 installation proof",
  [EricssonDocType.CR_APPROVAL]: "CR approval",
  [EricssonDocType.INVOICE]: "Invoice",
  [EricssonDocType.PHOTO]: "Site photo",
  [EricssonDocType.OTHER]: "Other",
};

/** The three documents SOP step 1 requires before cross-verification. */
export const ERICSSON_INTAKE_DOCS = [EricssonDocType.SOV, EricssonDocType.BOM, EricssonDocType.RFDS] as const;

export enum MaterialStatus {
  CLIENT_SUPPLIED = "CLIENT_SUPPLIED",
  IN_STOCK = "IN_STOCK",
  TO_ORDER = "TO_ORDER",
  ORDERED = "ORDERED",
  SHIPPED = "SHIPPED",
  RECEIVED = "RECEIVED",
  BACK_ORDERED = "BACK_ORDERED",
}

export const MATERIAL_STATUS_LABELS: Record<MaterialStatus, string> = {
  [MaterialStatus.CLIENT_SUPPLIED]: "Ericsson supplied",
  [MaterialStatus.IN_STOCK]: "In stock",
  [MaterialStatus.TO_ORDER]: "To order",
  [MaterialStatus.ORDERED]: "Ordered",
  [MaterialStatus.SHIPPED]: "Shipped",
  [MaterialStatus.RECEIVED]: "Received",
  [MaterialStatus.BACK_ORDERED]: "Back-ordered",
};

/** Material lines in these states are covered: execution can start. */
export const MATERIAL_COVERED = new Set<string>([
  MaterialStatus.CLIENT_SUPPLIED,
  MaterialStatus.IN_STOCK,
  MaterialStatus.RECEIVED,
]);

export enum ChangeRequestType {
  EXTRA_VISIT = "EXTRA_VISIT",
  SCOPE_DEVIATION = "SCOPE_DEVIATION",
  SUB_VENDOR = "SUB_VENDOR",
  EXTRA_MATERIAL = "EXTRA_MATERIAL",
}

export const CR_TYPE_LABELS: Record<ChangeRequestType, string> = {
  [ChangeRequestType.EXTRA_VISIT]: "Extra visit / day",
  [ChangeRequestType.SCOPE_DEVIATION]: "Scope deviation",
  [ChangeRequestType.SUB_VENDOR]: "Sub-vendor work",
  [ChangeRequestType.EXTRA_MATERIAL]: "Extra materials",
};

/** SOP step 6.3: sub-vendor work requested by the Ericsson PM carries a 3% pass-through on the quote. */
export const SUB_VENDOR_PASS_THROUGH_PCT = 3;

export enum ChangeRequestStatus {
  PM_REVIEW = "PM_REVIEW",
  SUBMITTED = "SUBMITTED",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  WITHDRAWN = "WITHDRAWN",
}

export const CR_STATUS_LABELS: Record<ChangeRequestStatus, string> = {
  [ChangeRequestStatus.PM_REVIEW]: "PM review",
  [ChangeRequestStatus.SUBMITTED]: "Awaiting Ericsson",
  [ChangeRequestStatus.APPROVED]: "Approved",
  [ChangeRequestStatus.REJECTED]: "Rejected",
  [ChangeRequestStatus.WITHDRAWN]: "Withdrawn",
};

/** CRs in these states still block closing the site. */
export const CR_OPEN_STATUSES = new Set<string>([ChangeRequestStatus.PM_REVIEW, ChangeRequestStatus.SUBMITTED]);

export enum VssOutcome {
  PASSED = "PASSED",
  PASSED_WITH_PUNCH_LIST = "PASSED_WITH_PUNCH_LIST",
  FAILED = "FAILED",
}

export const VSS_OUTCOME_LABELS: Record<VssOutcome, string> = {
  [VssOutcome.PASSED]: "Passed",
  [VssOutcome.PASSED_WITH_PUNCH_LIST]: "Passed with punch list",
  [VssOutcome.FAILED]: "Failed · revisit needed",
};

// ─── Site actions and who may perform them ──────────────────────────────────
// From SOP Appendix B (RACI): the Responsible role(s) for each task. Leadership
// (Admin, Ops leader) can always act. Enforced by the API, used by the web app
// to decide which buttons to show.

export enum EricssonAction {
  SUBMIT_FOR_VERIFICATION = "SUBMIT_FOR_VERIFICATION",
  ACCEPT_SOV = "ACCEPT_SOV",
  REQUEST_RFX = "REQUEST_RFX",
  RECORD_RFX = "RECORD_RFX",
  START_EXECUTION = "START_EXECUTION",
  COMPLETE_SOW = "COMPLETE_SOW",
  RECORD_VSS = "RECORD_VSS",
  SUBMIT_AE202 = "SUBMIT_AE202",
  STAMP_AE202 = "STAMP_AE202",
  UPLOAD_INVOICE = "UPLOAD_INVOICE",
  APPROVE_INVOICE = "APPROVE_INVOICE",
  CLOSE_SITE = "CLOSE_SITE",
}

const PM = Role.PROJECT_MANAGER;
const APM = Role.ASSOCIATE_PM;
const DL = Role.DELIVERY_LEAD;
const PC = Role.COORDINATOR;

export const ERICSSON_ACTIONS: Record<EricssonAction, { step: EricssonStep; label: string; roles: Role[] }> = {
  [EricssonAction.SUBMIT_FOR_VERIFICATION]: { step: EricssonStep.DOCS_RECEIVED, label: "Send to cross-verification", roles: [PM, APM, PC] },
  [EricssonAction.ACCEPT_SOV]: { step: EricssonStep.CROSS_VERIFICATION, label: "Accept SOV", roles: [PM, APM] },
  [EricssonAction.REQUEST_RFX]: { step: EricssonStep.SOV_RFX, label: "Request RFX", roles: [PM, APM] },
  [EricssonAction.RECORD_RFX]: { step: EricssonStep.SOV_RFX, label: "Record & accept RFX", roles: [PM, APM] },
  [EricssonAction.START_EXECUTION]: { step: EricssonStep.MATERIALS, label: "Start work execution", roles: [PM, APM, DL] },
  [EricssonAction.COMPLETE_SOW]: { step: EricssonStep.EXECUTION, label: "Mark SOW complete", roles: [PM, DL] },
  [EricssonAction.RECORD_VSS]: { step: EricssonStep.VSS_AE202, label: "Record VSS", roles: [PM, DL] },
  [EricssonAction.SUBMIT_AE202]: { step: EricssonStep.VSS_AE202, label: "Submit AE202", roles: [PM, DL] },
  [EricssonAction.STAMP_AE202]: { step: EricssonStep.VSS_AE202, label: "Record client stamp", roles: [PM, APM, DL] },
  [EricssonAction.UPLOAD_INVOICE]: { step: EricssonStep.INVOICING, label: "Record SRM upload", roles: [PM, APM] },
  [EricssonAction.APPROVE_INVOICE]: { step: EricssonStep.INVOICING, label: "Record Ericsson approval", roles: [PM, APM] },
  [EricssonAction.CLOSE_SITE]: { step: EricssonStep.INVOICING, label: "Close site", roles: [PM] },
};

const ALWAYS_ACT = new Set<string>([Role.ADMIN, Role.OPS_LEADER]);

export function canPerformEricssonAction(role: string, action: EricssonAction): boolean {
  return ALWAYS_ACT.has(role) || (ERICSSON_ACTIONS[action].roles as string[]).includes(role);
}

/** Roles that can create and edit sites, discrepancies, materials, logs and CRs. */
export const ERICSSON_EDIT_ROLES = new Set<string>([Role.ADMIN, Role.OPS_LEADER, PM, APM, DL, PC]);

/** Roles that can approve or reject CRs at PM review and record Ericsson's decision. */
export const ERICSSON_CR_DECIDE_ROLES = new Set<string>([Role.ADMIN, Role.OPS_LEADER, PM]);
