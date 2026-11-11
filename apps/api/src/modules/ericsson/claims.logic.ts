import {
  ERICSSON_FINANCE_VIEW_ROLES, EXPENSE_APPROVER_OVERRIDE_ROLES, ExpenseCategory, ExpenseStatus, FE_EXPENSE_TYPES, Role,
} from "@erp/types";

// Field engineer expense claims: who approves, who may decide, who may see. Pure, unit-tested.

/**
 * The FE's own manager approves. If they have none, the site's delivery lead, then its PM.
 * Never the person who submitted it.
 */
export function resolveApprover(
  submitter: { id: string; managerId: string | null },
  site: { deliveryLeadId: string | null; pmId: string | null },
): string | null {
  for (const candidate of [submitter.managerId, site.deliveryLeadId, site.pmId]) {
    if (candidate && candidate !== submitter.id) return candidate;
  }
  return null;
}

export interface ClaimRef {
  createdById: string;
  approverId: string | null;
  status: ExpenseStatus;
}

export function decideError(claim: ClaimRef, user: { id: string; role: string }): string | null {
  if (claim.status !== ExpenseStatus.SUBMITTED) return "This claim has already been decided";
  if (claim.createdById === user.id) return "You can't approve your own expense";
  if (claim.approverId === user.id || EXPENSE_APPROVER_OVERRIDE_ROLES.has(user.role)) return null;
  return "Only the engineer's manager can approve this expense";
}

/**
 * Who may see a claim (and its receipt). Finance and other money roles only once it's approved:
 * until then it isn't a legitimate cost.
 */
export function canViewClaim(claim: ClaimRef, user: { id: string; role: string }): boolean {
  if (claim.createdById === user.id || claim.approverId === user.id) return true;
  if (EXPENSE_APPROVER_OVERRIDE_ROLES.has(user.role)) return true;
  return claim.status === ExpenseStatus.APPROVED && ERICSSON_FINANCE_VIEW_ROLES.has(user.role) && user.role !== Role.FIELD_CREW;
}

export function categoryFor(claimType: string): ExpenseCategory {
  return FE_EXPENSE_TYPES.find((t) => t.key === claimType)?.category ?? ExpenseCategory.OTHER;
}

export const RECEIPT_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
