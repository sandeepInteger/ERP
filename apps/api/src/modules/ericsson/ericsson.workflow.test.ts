import { describe, expect, it } from "vitest";

import { EricssonAction, EricssonStep, MaterialStatus, Role, VssOutcome } from "@erp/types";
import { NEXT_STEP, availableActions, gateFailures, type SiteSnapshot } from "./ericsson.workflow.js";

function site(over: Partial<SiteSnapshot> = {}): SiteSnapshot {
  return {
    step: EricssonStep.DOCS_RECEIVED,
    docTypes: new Set(),
    openDiscrepancies: 0,
    sovAcceptedAt: null,
    rfxAcceptedAt: null,
    materialStatuses: [],
    dailyLogCount: 0,
    workUpdateCount: 0,
    openWorkItems: 0,
    vssOutcome: null,
    ae202SubmittedAt: null,
    ae202StampedAt: null,
    invoiceUploadedAt: null,
    invoiceApprovedAt: null,
    openChangeRequests: 0,
    ...over,
  };
}

const now = new Date();

describe("gateFailures", () => {
  it("rejects an action from another step", () => {
    const f = gateFailures(EricssonAction.ACCEPT_SOV, site());
    expect(f).toHaveLength(1);
    expect(f[0]).toContain("belongs to");
  });

  it("step 1 needs SOV, BOM and RFDS", () => {
    expect(gateFailures(EricssonAction.SUBMIT_FOR_VERIFICATION, site({ docTypes: new Set(["SOV", "BOM"]) })))
      .toEqual(["Upload the RFDS."]);
    expect(gateFailures(EricssonAction.SUBMIT_FOR_VERIFICATION, site({ docTypes: new Set(["SOV", "BOM", "RFDS"]) })))
      .toEqual([]);
  });

  it("step 2 blocks SOV acceptance while discrepancies are open", () => {
    const s = site({ step: EricssonStep.CROSS_VERIFICATION, openDiscrepancies: 2 });
    expect(gateFailures(EricssonAction.ACCEPT_SOV, s)).toEqual(["2 discrepancies are still open."]);
    expect(gateFailures(EricssonAction.ACCEPT_SOV, { ...s, openDiscrepancies: 0 })).toEqual([]);
  });

  it("step 4 needs every material line covered", () => {
    const s = site({
      step: EricssonStep.MATERIALS,
      rfxAcceptedAt: now,
      materialStatuses: [MaterialStatus.RECEIVED, MaterialStatus.BACK_ORDERED, MaterialStatus.CLIENT_SUPPLIED],
    });
    expect(gateFailures(EricssonAction.START_EXECUTION, s)).toEqual(["1 material line is not received yet."]);
    expect(gateFailures(EricssonAction.START_EXECUTION, { ...s, materialStatuses: [MaterialStatus.IN_STOCK] })).toEqual([]);
  });

  it("step 5 needs a daily log or crew update before SOW completion", () => {
    const s = site({ step: EricssonStep.EXECUTION });
    expect(gateFailures(EricssonAction.COMPLETE_SOW, s)).toEqual(["Add at least one daily log or crew work update."]);
    expect(gateFailures(EricssonAction.COMPLETE_SOW, { ...s, dailyLogCount: 1 })).toEqual([]);
    expect(gateFailures(EricssonAction.COMPLETE_SOW, { ...s, workUpdateCount: 3 })).toEqual([]);
  });

  it("step 5 needs every crew work item done", () => {
    const s = site({ step: EricssonStep.EXECUTION, workUpdateCount: 2, openWorkItems: 2 });
    expect(gateFailures(EricssonAction.COMPLETE_SOW, s)).toEqual(["2 crew work items aren't done yet."]);
  });

  it("step 7 needs a passing VSS and the AE202 file before submission", () => {
    const s = site({ step: EricssonStep.VSS_AE202, vssOutcome: VssOutcome.FAILED });
    expect(gateFailures(EricssonAction.SUBMIT_AE202, s)).toEqual([
      "Record a passing VSS first.",
      "Upload the AE202 installation proof.",
    ]);
    expect(gateFailures(EricssonAction.SUBMIT_AE202, {
      ...s, vssOutcome: VssOutcome.PASSED_WITH_PUNCH_LIST, docTypes: new Set(["AE202"]),
    })).toEqual([]);
  });

  it("step 9 blocks invoicing and closing while CRs are open", () => {
    const s = site({ step: EricssonStep.INVOICING, openChangeRequests: 1 });
    expect(gateFailures(EricssonAction.UPLOAD_INVOICE, s)).toEqual(["1 change request is still open."]);
    expect(gateFailures(EricssonAction.CLOSE_SITE, s)).toEqual([
      "Record Ericsson's invoice approval first.",
      "1 change request is still open.",
    ]);
    expect(gateFailures(EricssonAction.CLOSE_SITE, { ...s, openChangeRequests: 0, invoiceApprovedAt: now })).toEqual([]);
  });
});

describe("NEXT_STEP", () => {
  it("only gate actions move the site", () => {
    expect(NEXT_STEP[EricssonAction.REQUEST_RFX]).toBeUndefined();
    expect(NEXT_STEP[EricssonAction.RECORD_RFX]).toBe(EricssonStep.MATERIALS);
    expect(NEXT_STEP[EricssonAction.CLOSE_SITE]).toBe(EricssonStep.CLOSED);
  });
});

describe("availableActions", () => {
  it("lists the step's actions with RACI permission", () => {
    const s = site({ step: EricssonStep.INVOICING });
    const byAction = Object.fromEntries(availableActions(Role.ASSOCIATE_PM, s).map((a) => [a.action, a]));
    expect(Object.keys(byAction).sort()).toEqual(["APPROVE_INVOICE", "CLOSE_SITE", "UPLOAD_INVOICE"]);
    expect(byAction["UPLOAD_INVOICE"]?.allowed).toBe(true);
    expect(byAction["CLOSE_SITE"]?.allowed).toBe(false); // PM only
  });

  it("leadership can always act", () => {
    const s = site({ step: EricssonStep.INVOICING });
    expect(availableActions(Role.OPS_LEADER, s).every((a) => a.allowed)).toBe(true);
    expect(availableActions(Role.FINANCE, s).some((a) => a.allowed)).toBe(false);
  });
});
