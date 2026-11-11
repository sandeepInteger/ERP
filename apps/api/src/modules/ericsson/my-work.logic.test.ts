import { describe, expect, it } from "vitest";

import { EricssonAction, EricssonStep, Role, canPerformEricssonAction } from "@erp/types";
import { SLOT_ROLE, siteTasks, tasksFor, type WorkSite } from "./my-work.logic.js";

const NOW = new Date("2026-11-11T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function site(over: Partial<WorkSite> = {}): WorkSite {
  return {
    id: "s1", siteCode: "E-1", venueName: "Venue", step: EricssonStep.DOCS_RECEIVED, stepChangedAt: daysAgo(0),
    assignees: { pm: "pm", apm: "apm", deliveryLead: "dl", coordinator: "pc" },
    docTypes: new Set(), openDiscrepancies: 0, rfxRequestedAt: null, materialStatuses: [], lastLogDate: null,
    dailyLogCount: 0, vssOutcome: null, ae202SubmittedAt: null, invoiceUploadedAt: null, changeRequests: [],
    ...over,
  };
}

describe("siteTasks", () => {
  it("step 1 asks the coordinator for the missing documents", () => {
    const [t] = siteTasks(site({ docTypes: new Set(["SOV"]) }), NOW);
    expect(t?.title).toBe("Upload the BOM, RFDS");
    expect(t?.assigneeId).toBe("pc");
  });

  it("ages a task from when the site entered the step", () => {
    const [t] = siteTasks(site({ step: EricssonStep.CROSS_VERIFICATION, stepChangedAt: daysAgo(5), openDiscrepancies: 2 }), NOW);
    expect(t?.urgency).toBe("OVERDUE");
    expect(t?.ageDays).toBe(5);
    expect(t?.assigneeId).toBe("apm");
  });

  it("chasing the RFX ages from when it was requested", () => {
    const [t] = siteTasks(site({ step: EricssonStep.SOV_RFX, stepChangedAt: daysAgo(10), rfxRequestedAt: daysAgo(1) }), NOW);
    expect(t?.title).toBe("Chase the RFX number");
    expect(t?.urgency).toBe("TODAY");
  });

  it("execution asks for today's log until one exists for today", () => {
    const s = site({ step: EricssonStep.EXECUTION, lastLogDate: daysAgo(1), dailyLogCount: 2 });
    expect(siteTasks(s, NOW).map((t) => t.title)).toEqual(["Add today's daily log", "Mark the SOW complete when work is done"]);
    expect(siteTasks({ ...s, lastLogDate: NOW }, NOW).map((t) => t.title)).toEqual(["Mark the SOW complete when work is done"]);
  });

  it("SOW completion is only overdue past the 4-day baseline", () => {
    const at = (n: number) => siteTasks(site({ step: EricssonStep.EXECUTION, stepChangedAt: daysAgo(n), lastLogDate: NOW, dailyLogCount: 1 }), NOW)[0];
    expect(at(3)?.urgency).toBe("UPCOMING");
    expect(at(3)?.detail).toBe("Step 5 · day 4 of 4");
    expect(at(4)?.urgency).toBe("OVERDUE");
  });

  it("CRs in PM review go to the PM, rejected ones back to whoever raised them", () => {
    const tasks = siteTasks(site({
      step: EricssonStep.CLOSED,
      changeRequests: [
        { id: "c1", number: 7, title: "Extra day", status: "PM_REVIEW", raisedById: "dl", updatedAt: daysAgo(0) },
        { id: "c2", number: 8, title: "Drilling", status: "REJECTED", raisedById: "dl", updatedAt: daysAgo(0) },
        { id: "c3", number: 9, title: "Done", status: "APPROVED", raisedById: "dl", updatedAt: daysAgo(0) },
      ],
    }), NOW);
    expect(tasks.map((t) => [t.title, t.assigneeId])).toEqual([
      ["Review CR-0007 and send it to Ericsson", "pm"],
      ["Revise or withdraw CR-0008", "dl"],
    ]);
  });

  it("closed sites with no open CRs have no tasks", () => {
    expect(siteTasks(site({ step: EricssonStep.CLOSED }), NOW)).toEqual([]);
  });
});

describe("tasksFor", () => {
  const sites = [
    site({ id: "a", step: EricssonStep.CROSS_VERIFICATION, stepChangedAt: daysAgo(6), openDiscrepancies: 1 }),
    site({ id: "b", docTypes: new Set(["SOV", "BOM", "RFDS"]) }),
  ];

  it("shows people only their own tasks", () => {
    expect(tasksFor({ id: "apm", role: Role.ASSOCIATE_PM }, sites, NOW).map((t) => t.siteId)).toEqual(["a"]);
    expect(tasksFor({ id: "pc", role: Role.COORDINATOR }, sites, NOW).map((t) => t.siteId)).toEqual(["b"]);
  });

  it("shows leadership every overdue task as an escalation", () => {
    const t = tasksFor({ id: "boss", role: Role.OPS_LEADER }, sites, NOW);
    expect(t.map((x) => [x.siteId, x.escalation])).toEqual([["a", true]]);
  });

  it("sorts overdue first", () => {
    const t = tasksFor({ id: "apm", role: Role.ASSOCIATE_PM }, [
      site({ id: "new", step: EricssonStep.SOV_RFX }),
      site({ id: "old", step: EricssonStep.SOV_RFX, stepChangedAt: daysAgo(9) }),
    ], NOW);
    expect(t.map((x) => x.siteId)).toEqual(["old", "new"]);
  });
});

describe("slot roles match the RACI", () => {
  it("each step's task slot can perform that step's action", () => {
    const pairs: [keyof typeof SLOT_ROLE, EricssonAction][] = [
      ["coordinator", EricssonAction.SUBMIT_FOR_VERIFICATION],
      ["apm", EricssonAction.ACCEPT_SOV],
      ["apm", EricssonAction.RECORD_RFX],
      ["apm", EricssonAction.START_EXECUTION],
      ["deliveryLead", EricssonAction.COMPLETE_SOW],
      ["deliveryLead", EricssonAction.SUBMIT_AE202],
      ["deliveryLead", EricssonAction.STAMP_AE202],
      ["apm", EricssonAction.UPLOAD_INVOICE],
    ];
    for (const [slot, action] of pairs) expect(canPerformEricssonAction(SLOT_ROLE[slot], action), `${slot} → ${action}`).toBe(true);
  });
});
