import { DELIVERY_ROLES } from "@erp/types";
import type { Slot, Task } from "../modules/ericsson/my-work.logic.js";

// Pure rules for the scheduled Ericsson jobs (escalation, stand-up digest, report reminder).

export interface EscalationRuleInput {
  level: number;
  afterDays: number;
  roles: string[];
}

export interface EscalationDue {
  task: Task;
  level: number;
  /** Site-scoped roles: the site's own person in that slot (PM, APM, delivery lead, coordinator). */
  siteSlots: Slot[];
  /** Org-wide roles (leadership, finance): everyone active with that role. */
  orgRoles: string[];
  dedupeKey: string;
}

const SLOT_OF_ROLE: Record<string, Slot> = {
  PROJECT_MANAGER: "pm",
  ASSOCIATE_PM: "apm",
  DELIVERY_LEAD: "deliveryLead",
  COORDINATOR: "coordinator",
};

/**
 * Every (task, level) whose threshold has been reached. Each level fires once per task:
 * the dedupe key carries the level, so reaching level 2 later notifies level 2 only.
 */
export function escalationsDue(tasks: Task[], rules: EscalationRuleInput[]): EscalationDue[] {
  const out: EscalationDue[] = [];
  for (const task of tasks) {
    if (task.urgency !== "OVERDUE") continue;
    for (const rule of rules) {
      if (task.ageDays < rule.afterDays) continue;
      out.push({
        task,
        level: rule.level,
        siteSlots: rule.roles.filter((r) => DELIVERY_ROLES.has(r)).map((r) => SLOT_OF_ROLE[r]!).filter(Boolean),
        orgRoles: rule.roles.filter((r) => !DELIVERY_ROLES.has(r)),
        dedupeKey: `esc:${task.key}:L${rule.level}`,
      });
    }
  }
  return out;
}

/** Weekday at or after the given local hour. */
export function isWeekdayAfter(now: Date, hour: number): boolean {
  const day = now.getDay();
  return day >= 1 && day <= 5 && now.getHours() >= hour;
}

/** The bimonthly report is due on the 1st and the 16th, from the given hour. */
export function reportDayAfter(now: Date, hour: number): boolean {
  return (now.getDate() === 1 || now.getDate() === 16) && now.getHours() >= hour;
}

export function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
