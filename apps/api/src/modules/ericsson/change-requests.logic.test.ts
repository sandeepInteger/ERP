import { describe, expect, it } from "vitest";

import { ChangeRequestStatus as S, ChangeRequestType as T, Role } from "@erp/types";
import { crNumberLabel, crTotal, crTransitionError } from "./change-requests.logic.js";

describe("crTotal", () => {
  it("adds the 3% pass-through to sub-vendor quotes", () => {
    expect(crTotal({ type: T.SUB_VENDOR, amount: 0, vendorQuote: 6000 })).toEqual({
      amount: 0, vendorQuote: 6000, passThroughPct: 3, passThrough: 180, total: 6180,
    });
  });

  it("ignores a vendor quote on other CR types", () => {
    expect(crTotal({ type: T.EXTRA_VISIT, amount: 2950, vendorQuote: 500 })).toEqual({
      amount: 2950, vendorQuote: 0, passThroughPct: 0, passThrough: 0, total: 2950,
    });
  });

  it("rounds the pass-through to cents", () => {
    const r = crTotal({ type: T.SUB_VENDOR, amount: 100, vendorQuote: 936 });
    expect(r.passThrough).toBe(28.08);
    expect(r.total).toBe(1064.08);
  });
});

describe("crTransitionError", () => {
  const pm = { role: Role.PROJECT_MANAGER, isRaiser: false };
  const dl = { role: Role.DELIVERY_LEAD, isRaiser: false };

  it("follows the allowed moves", () => {
    expect(crTransitionError(S.PM_REVIEW, S.SUBMITTED, pm)).toBeNull();
    expect(crTransitionError(S.PM_REVIEW, S.APPROVED, pm)).toContain("cannot move");
    expect(crTransitionError(S.APPROVED, S.WITHDRAWN, pm)).toContain("cannot move");
  });

  it("only the PM sends CRs to Ericsson and records the decision", () => {
    expect(crTransitionError(S.PM_REVIEW, S.SUBMITTED, dl)).toContain("Only the PM");
    expect(crTransitionError(S.SUBMITTED, S.APPROVED, dl)).toContain("Only the PM");
  });

  it("the raiser can withdraw their own CR", () => {
    expect(crTransitionError(S.PM_REVIEW, S.WITHDRAWN, dl)).not.toBeNull();
    expect(crTransitionError(S.PM_REVIEW, S.WITHDRAWN, { ...dl, isRaiser: true })).toBeNull();
  });

  it("a rejected CR can be revised and resubmitted", () => {
    expect(crTransitionError(S.REJECTED, S.PM_REVIEW, dl)).toBeNull();
  });
});

describe("crNumberLabel", () => {
  it("pads to four digits", () => {
    expect(crNumberLabel(7)).toBe("CR-0007");
    expect(crNumberLabel(12345)).toBe("CR-12345");
  });
});
