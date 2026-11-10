import {
  ERICSSON_ACTIONS, ERICSSON_INTAKE_DOCS, ERICSSON_STEPS, EricssonAction, EricssonDocType, EricssonStep,
  MATERIAL_COVERED, VssOutcome, canPerformEricssonAction,
} from "@erp/types";

// Gate rules for the Ericsson IBS workflow (SOP steps 1–9). Pure functions over a
// snapshot of the site, so every rule is unit-tested without a database.

export interface SiteSnapshot {
  step: EricssonStep;
  docTypes: ReadonlySet<string>;
  openDiscrepancies: number;
  sovAcceptedAt: Date | null;
  rfxAcceptedAt: Date | null;
  materialStatuses: readonly string[];
  dailyLogCount: number;
  vssOutcome: string | null;
  ae202SubmittedAt: Date | null;
  ae202StampedAt: Date | null;
  invoiceUploadedAt: Date | null;
  invoiceApprovedAt: Date | null;
  openChangeRequests: number;
}

/** The step a site moves to after the action succeeds; absent = it stays where it is. */
export const NEXT_STEP: Partial<Record<EricssonAction, EricssonStep>> = {
  [EricssonAction.SUBMIT_FOR_VERIFICATION]: EricssonStep.CROSS_VERIFICATION,
  [EricssonAction.ACCEPT_SOV]: EricssonStep.SOV_RFX,
  [EricssonAction.RECORD_RFX]: EricssonStep.MATERIALS,
  [EricssonAction.START_EXECUTION]: EricssonStep.EXECUTION,
  [EricssonAction.COMPLETE_SOW]: EricssonStep.VSS_AE202,
  [EricssonAction.STAMP_AE202]: EricssonStep.INVOICING,
  [EricssonAction.CLOSE_SITE]: EricssonStep.CLOSED,
};

const PASSING_VSS = new Set<string>([VssOutcome.PASSED, VssOutcome.PASSED_WITH_PUNCH_LIST]);

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Why the action cannot run on this site right now. Empty = the gate is open. */
export function gateFailures(action: EricssonAction, s: SiteSnapshot): string[] {
  const def = ERICSSON_ACTIONS[action];
  if (s.step !== def.step) {
    return [`The site is at "${ERICSSON_STEPS[s.step].label}"; this action belongs to "${ERICSSON_STEPS[def.step].label}".`];
  }

  const out: string[] = [];
  switch (action) {
    case EricssonAction.SUBMIT_FOR_VERIFICATION:
      for (const t of ERICSSON_INTAKE_DOCS) if (!s.docTypes.has(t)) out.push(`Upload the ${t}.`);
      break;
    case EricssonAction.ACCEPT_SOV:
      if (s.openDiscrepancies > 0) out.push(`${plural(s.openDiscrepancies, "discrepancy is", "discrepancies are")} still open.`);
      break;
    case EricssonAction.REQUEST_RFX:
    case EricssonAction.RECORD_RFX:
      if (!s.sovAcceptedAt) out.push("Accept the SOV first.");
      break;
    case EricssonAction.START_EXECUTION: {
      if (!s.rfxAcceptedAt) out.push("Record and accept the RFX first.");
      const uncovered = s.materialStatuses.filter((st) => !MATERIAL_COVERED.has(st)).length;
      if (uncovered > 0) out.push(`${plural(uncovered, "material line is", "material lines are")} not received yet.`);
      break;
    }
    case EricssonAction.COMPLETE_SOW:
      if (s.dailyLogCount === 0) out.push("Add at least one daily log.");
      break;
    case EricssonAction.RECORD_VSS:
      if (s.ae202StampedAt) out.push("The AE202 is already stamped.");
      break;
    case EricssonAction.SUBMIT_AE202:
      if (!s.vssOutcome || !PASSING_VSS.has(s.vssOutcome)) out.push("Record a passing VSS first.");
      if (!s.docTypes.has(EricssonDocType.AE202)) out.push("Upload the AE202 installation proof.");
      break;
    case EricssonAction.STAMP_AE202:
      if (!s.ae202SubmittedAt) out.push("Submit the AE202 to the client first.");
      break;
    case EricssonAction.UPLOAD_INVOICE:
      if (s.openChangeRequests > 0) out.push(`${plural(s.openChangeRequests, "change request is", "change requests are")} still open.`);
      break;
    case EricssonAction.APPROVE_INVOICE:
      if (!s.invoiceUploadedAt) out.push("Record the SRM upload first.");
      break;
    case EricssonAction.CLOSE_SITE:
      if (!s.invoiceApprovedAt) out.push("Record Ericsson's invoice approval first.");
      if (s.openChangeRequests > 0) out.push(`${plural(s.openChangeRequests, "change request is", "change requests are")} still open.`);
      break;
  }
  return out;
}

export interface AvailableAction {
  action: EricssonAction;
  label: string;
  /** The viewer's role may perform it (RACI). */
  allowed: boolean;
  /** Gate failures; empty when the action can run now. */
  blockers: string[];
}

/** Every action belonging to the site's current step, with the viewer's permission and blockers. */
export function availableActions(role: string, s: SiteSnapshot): AvailableAction[] {
  return (Object.keys(ERICSSON_ACTIONS) as EricssonAction[])
    .filter((a) => ERICSSON_ACTIONS[a].step === s.step)
    .map((a) => ({
      action: a,
      label: ERICSSON_ACTIONS[a].label,
      allowed: canPerformEricssonAction(role, a),
      blockers: gateFailures(a, s),
    }));
}
