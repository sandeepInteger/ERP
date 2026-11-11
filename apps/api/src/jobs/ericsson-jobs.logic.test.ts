import { describe, expect, it } from "vitest";

import type { Task } from "../modules/ericsson/my-work.logic.js";
import { escalationsDue, isWeekdayAfter, reportDayAfter } from "./ericsson-jobs.logic.js";

function task(ageDays: number, urgency: Task["urgency"] = "OVERDUE"): Task {
  return {
    key: `s1:x${ageDays}`, siteId: "s1", siteCode: "E-1", venueName: "V", title: "T", detail: "", tab: "overview",
    ageDays, urgency, assigneeId: "u1", escalation: false,
  };
}

const RULES = [
  { level: 1, afterDays: 3, roles: ["PROJECT_MANAGER"] },
  { level: 2, afterDays: 5, roles: ["OPS_LEADER"] },
  { level: 3, afterDays: 8, roles: ["SALES_LEADER", "ASSOCIATE_PM"] },
];

describe("escalationsDue", () => {
  it("fires every level whose threshold the task has reached", () => {
    expect(escalationsDue([task(4)], RULES).map((e) => e.level)).toEqual([1]);
    expect(escalationsDue([task(6)], RULES).map((e) => e.level)).toEqual([1, 2]);
    expect(escalationsDue([task(9)], RULES).map((e) => e.level)).toEqual([1, 2, 3]);
  });

  it("ignores tasks that are not overdue", () => {
    expect(escalationsDue([task(9, "TODAY")], RULES)).toEqual([]);
  });

  it("splits site roles from org-wide roles and keys by level", () => {
    const [l1, , l3] = escalationsDue([task(9)], RULES);
    expect(l1).toMatchObject({ siteSlots: ["pm"], orgRoles: [], dedupeKey: "esc:s1:x9:L1" });
    expect(l3).toMatchObject({ siteSlots: ["apm"], orgRoles: ["SALES_LEADER"] });
  });
});

describe("schedule windows", () => {
  it("stand-up digest runs on weekdays from 8:00", () => {
    expect(isWeekdayAfter(new Date(2026, 10, 11, 8, 5), 8)).toBe(true); // Wednesday
    expect(isWeekdayAfter(new Date(2026, 10, 11, 7, 59), 8)).toBe(false);
    expect(isWeekdayAfter(new Date(2026, 10, 14, 9, 0), 8)).toBe(false); // Saturday
  });

  it("report reminder runs on the 1st and 16th", () => {
    expect(reportDayAfter(new Date(2026, 10, 16, 9, 0), 8)).toBe(true);
    expect(reportDayAfter(new Date(2026, 10, 1, 9, 0), 8)).toBe(true);
    expect(reportDayAfter(new Date(2026, 10, 15, 9, 0), 8)).toBe(false);
  });
});
