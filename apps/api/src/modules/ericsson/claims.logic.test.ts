import { describe, expect, it } from "vitest";

import { ExpenseCategory, ExpenseStatus as S, Role } from "@erp/types";
import { canViewClaim, categoryFor, decideError, resolveApprover } from "./claims.logic.js";

describe("resolveApprover", () => {
  it("prefers the FE's own manager", () => {
    expect(resolveApprover({ id: "fe", managerId: "mgr" }, { deliveryLeadId: "dl", pmId: "pm" })).toBe("mgr");
  });
  it("falls back to the site's delivery lead, then PM", () => {
    expect(resolveApprover({ id: "fe", managerId: null }, { deliveryLeadId: "dl", pmId: "pm" })).toBe("dl");
    expect(resolveApprover({ id: "fe", managerId: null }, { deliveryLeadId: null, pmId: "pm" })).toBe("pm");
  });
  it("never picks the submitter", () => {
    expect(resolveApprover({ id: "dl", managerId: "dl" }, { deliveryLeadId: "dl", pmId: "pm" })).toBe("pm");
    expect(resolveApprover({ id: "x", managerId: null }, { deliveryLeadId: null, pmId: null })).toBeNull();
  });
});

describe("decideError", () => {
  const claim = { createdById: "fe", approverId: "mgr", status: S.SUBMITTED };
  it("lets the assigned approver decide", () => {
    expect(decideError(claim, { id: "mgr", role: Role.DELIVERY_LEAD })).toBeNull();
  });
  it("lets admins and the ops leader decide any claim", () => {
    expect(decideError(claim, { id: "boss", role: Role.OPS_LEADER })).toBeNull();
  });
  it("stops everyone else, self-approval and re-deciding", () => {
    expect(decideError(claim, { id: "pm", role: Role.PROJECT_MANAGER })).toContain("manager");
    expect(decideError(claim, { id: "fin", role: Role.FINANCE })).toContain("manager");
    expect(decideError({ ...claim, createdById: "mgr" }, { id: "mgr", role: Role.DELIVERY_LEAD })).toContain("own");
    expect(decideError({ ...claim, status: S.APPROVED }, { id: "mgr", role: Role.DELIVERY_LEAD })).toContain("already");
  });
});

describe("canViewClaim", () => {
  const pending = { createdById: "fe", approverId: "mgr", status: S.SUBMITTED };
  it("hides pending claims from Finance", () => {
    expect(canViewClaim(pending, { id: "fin", role: Role.FINANCE })).toBe(false);
    expect(canViewClaim({ ...pending, status: S.APPROVED }, { id: "fin", role: Role.FINANCE })).toBe(true);
    expect(canViewClaim({ ...pending, status: S.REJECTED }, { id: "fin", role: Role.FINANCE })).toBe(false);
  });
  it("shows the submitter and the approver their claim", () => {
    expect(canViewClaim(pending, { id: "fe", role: Role.FIELD_CREW })).toBe(true);
    expect(canViewClaim(pending, { id: "mgr", role: Role.DELIVERY_LEAD })).toBe(true);
  });
  it("hides it from other field engineers", () => {
    expect(canViewClaim({ ...pending, status: S.APPROVED }, { id: "fe2", role: Role.FIELD_CREW })).toBe(false);
  });
});

describe("categoryFor", () => {
  it("maps claim types to report categories", () => {
    expect(categoryFor("TRAVEL_TOLL")).toBe(ExpenseCategory.TRAVEL);
    expect(categoryFor("CABLE")).toBe(ExpenseCategory.MATERIAL);
    expect(categoryFor("GIFT_CARD")).toBe(ExpenseCategory.OTHER);
    expect(categoryFor("UNKNOWN")).toBe(ExpenseCategory.OTHER);
  });
});
