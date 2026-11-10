import {
  ChangeRequestStatus, ChangeRequestType, ERICSSON_CR_DECIDE_ROLES, ERICSSON_EDIT_ROLES, SUB_VENDOR_PASS_THROUGH_PCT,
} from "@erp/types";

// Change-request pricing and status rules (SOP steps 6 and 8). Pure, unit-tested.

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** SOP 6.3: only sub-vendor work carries the pass-through, at 3% of the vendor quote. */
export function passThroughPctFor(type: ChangeRequestType): number {
  return type === ChangeRequestType.SUB_VENDOR ? SUB_VENDOR_PASS_THROUGH_PCT : 0;
}

export function crTotal(input: { type: ChangeRequestType; amount: number; vendorQuote: number }) {
  const vendorQuote = input.type === ChangeRequestType.SUB_VENDOR ? input.vendorQuote : 0;
  const pct = passThroughPctFor(input.type);
  const passThrough = round2(vendorQuote * (pct / 100));
  return {
    amount: round2(input.amount),
    vendorQuote: round2(vendorQuote),
    passThroughPct: pct,
    passThrough,
    total: round2(input.amount + vendorQuote + passThrough),
  };
}

/**
 * Allowed moves. PM review → sent to Ericsson → approved / rejected. A rejected CR can
 * be revised and go back to PM review; an open CR can be withdrawn.
 */
export const CR_TRANSITIONS: Record<ChangeRequestStatus, ChangeRequestStatus[]> = {
  [ChangeRequestStatus.PM_REVIEW]: [ChangeRequestStatus.SUBMITTED, ChangeRequestStatus.WITHDRAWN],
  [ChangeRequestStatus.SUBMITTED]: [ChangeRequestStatus.APPROVED, ChangeRequestStatus.REJECTED, ChangeRequestStatus.WITHDRAWN],
  [ChangeRequestStatus.REJECTED]: [ChangeRequestStatus.PM_REVIEW, ChangeRequestStatus.WITHDRAWN],
  [ChangeRequestStatus.APPROVED]: [],
  [ChangeRequestStatus.WITHDRAWN]: [],
};

export function crTransitionError(
  from: ChangeRequestStatus,
  to: ChangeRequestStatus,
  actor: { role: string; isRaiser: boolean },
): string | null {
  if (!CR_TRANSITIONS[from].includes(to)) return `A CR that is ${from} cannot move to ${to}`;
  switch (to) {
    case ChangeRequestStatus.SUBMITTED:
    case ChangeRequestStatus.APPROVED:
    case ChangeRequestStatus.REJECTED:
      return ERICSSON_CR_DECIDE_ROLES.has(actor.role) ? null : "Only the PM can send CRs to Ericsson or record Ericsson's decision";
    case ChangeRequestStatus.WITHDRAWN:
      return ERICSSON_CR_DECIDE_ROLES.has(actor.role) || actor.isRaiser ? null : "Only the PM or the person who raised it can withdraw a CR";
    case ChangeRequestStatus.PM_REVIEW:
      return ERICSSON_EDIT_ROLES.has(actor.role) ? null : "Your role cannot resubmit CRs";
  }
}

export function crNumberLabel(n: number): string {
  return `CR-${String(n).padStart(4, "0")}`;
}
