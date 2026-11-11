import { describe, expect, it } from "vitest";

import { billingStatus, bimonthlyPeriod, buildReport, type ReportSiteInput } from "./reports.logic.js";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function site(over: Partial<ReportSiteInput>): ReportSiteInput {
  return {
    id: "s", siteCode: "S", venueName: "V", step: "EXECUTION", sovValue: 0, approvedCrTotal: 0,
    executionStartedAt: null, invoiceUploadedAt: null, invoiceApprovedAt: null, costs: [], ...over,
  };
}

describe("billingStatus", () => {
  it("follows execution → SRM upload → approval", () => {
    expect(billingStatus(site({}))).toBe("NOT_STARTED");
    expect(billingStatus(site({ executionStartedAt: d("2026-11-01") }))).toBe("UNBILLED");
    expect(billingStatus(site({ executionStartedAt: d("2026-11-01"), invoiceUploadedAt: d("2026-11-05") }))).toBe("BILLED");
    expect(billingStatus(site({ invoiceUploadedAt: d("2026-11-05"), invoiceApprovedAt: d("2026-11-09") }))).toBe("APPROVED");
  });
});

describe("buildReport", () => {
  const report = buildReport([
    site({
      id: "a", sovValue: 48900, approvedCrTotal: 2350, executionStartedAt: d("2026-10-10"), invoiceUploadedAt: d("2026-11-03"),
      costs: [
        { workDate: d("2026-10-27"), category: "LABOR", amount: 10240 },
        { workDate: d("2026-11-02"), category: "VENDOR", amount: 1000 },
        { workDate: d("2026-11-04"), category: "MATERIAL", amount: 1240 },
      ],
    }),
    site({ id: "b", sovValue: 12400 }),
    site({ id: "c", sovValue: 0 }),
  ], "2026-11-01", "2026-11-15");

  it("adds approved CRs to the SOV and subtracts every cost", () => {
    const a = report.sites.find((s) => s.id === "a")!;
    expect(a.contractValue).toBe(51250);
    expect(a.cost).toBe(12480);
    expect(a.margin).toBe(38770);
    expect(a.marginPct).toBe(75.6);
    expect([a.labor, a.material, a.otherCost]).toEqual([10240, 1240, 1000]);
  });

  it("only counts the period's costs and uploads as in-period", () => {
    const a = report.sites.find((s) => s.id === "a")!;
    expect(a.costInPeriod).toBe(2240);
    expect(a.billedInPeriod).toBe(51250);
    expect(report.totals.costInPeriod).toBe(2240);
  });

  it("splits contract value by billing status", () => {
    expect(report.totals).toMatchObject({ contractValue: 63650, billed: 51250, notStarted: 12400, unbilled: 0, approved: 0 });
  });

  it("has no margin % for a site with no value", () => {
    expect(report.sites.find((s) => s.id === "c")?.marginPct).toBeNull();
  });
});

describe("bimonthlyPeriod", () => {
  it("splits the month at the 15th", () => {
    expect(bimonthlyPeriod(d("2026-11-11"))).toEqual({ from: "2026-11-01", to: "2026-11-15" });
    expect(bimonthlyPeriod(d("2026-11-16"))).toEqual({ from: "2026-11-16", to: "2026-11-30" });
    expect(bimonthlyPeriod(d("2028-02-20"))).toEqual({ from: "2028-02-16", to: "2028-02-29" });
  });
});
