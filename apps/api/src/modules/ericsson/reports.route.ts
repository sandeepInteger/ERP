import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { ERICSSON_FINANCE_VIEW_ROLES, ERICSSON_SCOPE_LABELS, ERICSSON_STEPS, type EricssonScope, type EricssonStep } from "@erp/types";
import { forbidden, httpError } from "../../lib/http.js";
import { MONEY_FMT, buildWorkbook, sendXlsx, type SheetSpec } from "../../lib/spreadsheet.js";
import { ListSitesQuerySchema } from "./sites.schema.js";
import { listSites } from "./sites.service.js";
import { bimonthlyPeriod, buildReport, type ReportSiteRow } from "./reports.logic.js";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ReportQuerySchema = z.object({
  from: DATE.optional(),
  to: DATE.optional(),
  format: z.enum(["json", "xlsx"]).default("json"),
});

const BILLING_LABEL = { NOT_STARTED: "Not started", UNBILLED: "Unbilled", BILLED: "Billed (awaiting approval)", APPROVED: "Approved" } as const;

export async function ericssonReportsRoute(app: FastifyInstance) {
  const guard = { preHandler: app.authenticate };

  // Revenue & cost (SOP Appendix C: bimonthly revenue / cost report; MBR / QBR for the PM).
  app.get("/api/ericsson/reports/revenue-cost", guard, async (req, reply) => {
    if (!ERICSSON_FINANCE_VIEW_ROLES.has(req.user.role)) throw forbidden("Your role cannot see financial reports");
    const q = ReportQuerySchema.parse(req.query);
    const period = q.from && q.to ? { from: q.from, to: q.to } : bimonthlyPeriod(new Date());
    if (period.from > period.to) throw httpError(400, "'from' must be on or before 'to'");

    const sites = await app.db.ericssonSite.findMany({
      select: {
        id: true, siteCode: true, venueName: true, step: true, sovValue: true,
        executionStartedAt: true, invoiceUploadedAt: true, invoiceApprovedAt: true,
        changeRequests: { where: { status: "APPROVED" }, select: { total: true } },
        expenses: { where: { status: "APPROVED" }, select: { workDate: true, category: true, amount: true } },
      },
    });
    const report = buildReport(sites.map((s) => ({
      id: s.id, siteCode: s.siteCode, venueName: s.venueName, step: s.step,
      sovValue: Number(s.sovValue ?? 0),
      approvedCrTotal: s.changeRequests.reduce((a, c) => a + Number(c.total), 0),
      executionStartedAt: s.executionStartedAt, invoiceUploadedAt: s.invoiceUploadedAt, invoiceApprovedAt: s.invoiceApprovedAt,
      costs: s.expenses.map((e) => ({ workDate: e.workDate, category: e.category, amount: Number(e.amount) })),
    })), period.from, period.to);

    if (q.format === "json") return report;

    const spec: SheetSpec<ReportSiteRow> = {
      name: "Revenue & cost",
      intro: [
        "Ericsson IBS · revenue & cost",
        `Period ${report.from} to ${report.to} · generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
        `Contract value $${report.totals.contractValue.toLocaleString("en-US")} · cost $${report.totals.cost.toLocaleString("en-US")} · margin ${report.totals.marginPct ?? "–"}%`,
      ],
      rows: report.sites,
      columns: [
        { header: "Site", value: (r) => r.siteCode },
        { header: "Venue", width: 30, value: (r) => r.venueName },
        { header: "Step", width: 22, value: (r) => ERICSSON_STEPS[r.step as EricssonStep]?.label ?? r.step },
        { header: "Billing", width: 24, value: (r) => BILLING_LABEL[r.billing] },
        { header: "SOV", numFmt: MONEY_FMT, value: (r) => r.sovValue },
        { header: "Approved CRs", numFmt: MONEY_FMT, value: (r) => r.approvedCrs },
        { header: "Contract value", width: 16, numFmt: MONEY_FMT, value: (r) => r.contractValue },
        { header: "Labor", numFmt: MONEY_FMT, value: (r) => r.labor },
        { header: "Material", numFmt: MONEY_FMT, value: (r) => r.material },
        { header: "Travel / vendor / other", width: 22, numFmt: MONEY_FMT, value: (r) => r.otherCost },
        { header: "Total cost", numFmt: MONEY_FMT, value: (r) => r.cost },
        { header: "Margin", numFmt: MONEY_FMT, value: (r) => r.margin },
        { header: "Margin %", numFmt: '0.0"%"', value: (r) => r.marginPct },
        { header: "Cost in period", width: 16, numFmt: MONEY_FMT, value: (r) => r.costInPeriod },
        { header: "Billed in period", width: 16, numFmt: MONEY_FMT, value: (r) => r.billedInPeriod },
      ],
    };
    return sendXlsx(reply, `ericsson-revenue-cost_${report.from}_${report.to}.xlsx`, await buildWorkbook([spec]));
  });

  // Site tracker export, with the same filters as the list.
  app.get("/api/ericsson/sites/export", guard, async (req, reply) => {
    const rows = await listSites(app, ListSitesQuerySchema.parse(req.query), req.user.sub, req.user.role);
    type Row = (typeof rows)[number];
    const showMoney = ERICSSON_FINANCE_VIEW_ROLES.has(req.user.role);
    const columns: SheetSpec<Row>["columns"] = [
      { header: "Site", value: (r) => r.siteCode },
      { header: "Venue", width: 30, value: (r) => r.venueName },
      { header: "Scope", width: 16, value: (r) => ERICSSON_SCOPE_LABELS[r.scope as EricssonScope] ?? r.scope },
      { header: "Step", width: 26, value: (r) => ERICSSON_STEPS[r.step as EricssonStep]?.label ?? r.step },
      { header: "Days in step", value: (r) => r.daysInStep },
      { header: "RFX", value: (r) => r.rfxNumber },
      { header: "Open discrepancies", width: 18, value: (r) => r.openDiscrepancies },
      { header: "Open CRs", value: (r) => r.openChangeRequests },
      ...(showMoney ? [{ header: "SOV value", numFmt: MONEY_FMT, value: (r: Row) => (r.sovValue === null ? null : Number(r.sovValue)) }] : []),
      { header: "PM", width: 22, value: (r) => r.pmName },
      { header: "Delivery lead", width: 22, value: (r) => r.deliveryLeadName },
      { header: "Target", value: (r) => r.targetDate },
    ];
    const data = await buildWorkbook([{ name: "Sites", columns, rows, intro: [`Ericsson IBS · site tracker · ${new Date().toISOString().slice(0, 10)}`] }]);
    return sendXlsx(reply, `ericsson-sites_${new Date().toISOString().slice(0, 10)}.xlsx`, data);
  });
}
