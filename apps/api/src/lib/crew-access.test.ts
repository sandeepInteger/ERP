import { describe, expect, it } from "vitest";

import { crewMayCall } from "./crew-access.js";

describe("crewMayCall", () => {
  it("allows the field screens' calls", () => {
    expect(crewMayCall("GET", "/api/field/sites")).toBe(true);
    expect(crewMayCall("GET", "/api/field/my-work")).toBe(true);
    expect(crewMayCall("post", "/api/field/work-items/:id/updates")).toBe(true);
    expect(crewMayCall("POST", "/api/ericsson/sites/:id/change-requests")).toBe(true);
  });

  it("field engineers submit and see their own expense claims, but don't approve them", () => {
    expect(crewMayCall("POST", "/api/field/expenses")).toBe(true);
    expect(crewMayCall("GET", "/api/field/expenses")).toBe(true);
    expect(crewMayCall("GET", "/api/expense-approvals")).toBe(false);
    expect(crewMayCall("POST", "/api/expense-approvals/:id/decide")).toBe(false);
    expect(crewMayCall("GET", "/api/ericsson/expenses")).toBe(false);
  });

  it("crew update their own work, not the site's headcount log or assignments", () => {
    expect(crewMayCall("POST", "/api/ericsson/sites/:id/daily-logs")).toBe(false);
    expect(crewMayCall("POST", "/api/ericsson/sites/:id/work-items")).toBe(false);
    expect(crewMayCall("PATCH", "/api/ericsson/work-items/:id")).toBe(false);
  });

  it("denies everything else by default", () => {
    expect(crewMayCall("GET", "/api/ericsson/sites")).toBe(false);
    expect(crewMayCall("GET", "/api/ericsson/sites/:id")).toBe(false);
    expect(crewMayCall("GET", "/api/ericsson/reports/revenue-cost")).toBe(false);
    expect(crewMayCall("GET", "/api/users")).toBe(false);
    expect(crewMayCall("POST", "/api/ericsson/sites/:id/actions")).toBe(false);
    expect(crewMayCall("GET", "/api/ericsson/documents/:docId/download")).toBe(false);
    expect(crewMayCall("GET", undefined)).toBe(false);
  });

  it("FEs check in and out and send their own location, but never see others' locations", () => {
    expect(crewMayCall("GET", "/api/field/visits/current")).toBe(true);
    expect(crewMayCall("POST", "/api/field/sites/:id/check-in")).toBe(true);
    expect(crewMayCall("POST", "/api/field/visits/:id/points")).toBe(true);
    expect(crewMayCall("POST", "/api/field/visits/:id/check-out")).toBe(true);
    expect(crewMayCall("GET", "/api/ericsson/sites/:id/visits")).toBe(false);
    expect(crewMayCall("GET", "/api/ericsson/visits/:id/points")).toBe(false);
    expect(crewMayCall("POST", "/api/ericsson/visits/:id/check-out")).toBe(false);
  });

  it("matches the method too", () => {
    expect(crewMayCall("DELETE", "/api/notifications/read-all")).toBe(false);
  });
});
