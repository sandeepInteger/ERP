import { describe, expect, it } from "vitest";

import { Role, WorkItemStatus as S } from "@erp/types";
import { itemPatch, updateError } from "./work-items.logic.js";

const item = { assigneeId: "crew1", status: S.TODO };

describe("updateError", () => {
  it("lets the assigned crew member update their own work", () => {
    expect(updateError(item, { id: "crew1", role: Role.FIELD_CREW }, S.IN_PROGRESS)).toBeNull();
    expect(updateError(item, { id: "crew1", role: Role.FIELD_CREW }, S.BLOCKED)).toBeNull();
  });

  it("stops other crew members", () => {
    expect(updateError(item, { id: "crew2", role: Role.FIELD_CREW }, S.DONE)).toContain("assigned to you");
  });

  it("lets site managers update anyone's work, and only they cancel", () => {
    expect(updateError(item, { id: "dl", role: Role.DELIVERY_LEAD }, S.DONE)).toBeNull();
    expect(updateError(item, { id: "crew1", role: Role.FIELD_CREW }, S.CANCELLED)).toContain("Only the PM");
    expect(updateError(item, { id: "pm", role: Role.PROJECT_MANAGER }, S.CANCELLED)).toBeNull();
  });

  it("refuses updates to cancelled work and to read-only roles", () => {
    expect(updateError({ ...item, status: S.CANCELLED }, { id: "crew1", role: Role.FIELD_CREW }, S.DONE)).toContain("cancelled");
    expect(updateError(item, { id: "f", role: Role.FINANCE }, S.DONE)).toContain("assigned to you");
  });
});

describe("itemPatch", () => {
  const now = new Date("2026-11-11T10:00:00Z");
  it("stamps completion on DONE and clears it on reopen", () => {
    expect(itemPatch(S.IN_PROGRESS, S.DONE, now)).toEqual({ status: S.DONE, completedAt: now });
    expect(itemPatch(S.DONE, S.IN_PROGRESS, now)).toEqual({ status: S.IN_PROGRESS, completedAt: null });
    expect(itemPatch(S.TODO, S.IN_PROGRESS, now)).toEqual({ status: S.IN_PROGRESS });
  });
});
