import { ERICSSON_EDIT_ROLES, Role, WorkItemStatus } from "@erp/types";

// Crew work items: who may update them, and what an update does. Pure, unit-tested.

export interface WorkItemRef {
  assigneeId: string;
  status: WorkItemStatus;
}

/** The assigned crew member updates their own item; site managers can update any (to cover or correct). */
export function updateError(item: WorkItemRef, user: { id: string; role: string }, to: WorkItemStatus): string | null {
  if (item.status === WorkItemStatus.CANCELLED) return "This work item was cancelled";
  const isAssignee = item.assigneeId === user.id;
  const isManager = user.role !== Role.FIELD_CREW && ERICSSON_EDIT_ROLES.has(user.role);
  if (!isAssignee && !isManager) return "You can only update work assigned to you";
  if (to === WorkItemStatus.CANCELLED && !isManager) return "Only the PM or delivery lead can cancel work";
  return null;
}

/** Fields an update writes onto the item: status, and completedAt set on DONE / cleared on reopen. */
export function itemPatch(from: WorkItemStatus, to: WorkItemStatus, now: Date): { status: WorkItemStatus; completedAt?: Date | null } {
  if (to === WorkItemStatus.DONE && from !== WorkItemStatus.DONE) return { status: to, completedAt: now };
  if (to !== WorkItemStatus.DONE && from === WorkItemStatus.DONE) return { status: to, completedAt: null };
  return { status: to };
}
