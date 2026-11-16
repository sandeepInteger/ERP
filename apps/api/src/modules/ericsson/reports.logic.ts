// Revenue and cost report for Ericsson sites. Pure: the route loads rows, this does the math.
//
// Definitions (agree these with Finance before relying on the numbers):
// - Contract value = accepted SOV value + approved change requests.
// - Billing status:
//     NOT_STARTED  work not started (before step 5)
//     UNBILLED     work started, invoice not yet uploaded to SRM ("work done, not invoiced")
//     BILLED       invoice uploaded to SRM, Ericsson approval pending
//     APPROVED     Ericsson approved the invoice
// - Cost = every cost line in the daily tracker. Margin = (contract value − cost) / contract value.
// - Period figures: invoices uploaded and costs incurred between `from` and `to` (inclusive).

export type BillingStatus = "NOT_STARTED" | "UNBILLED" | "BILLED" | "APPROVED";

export interface ReportSiteInput {
  id: string;
  siteCode: string;
  venueName: string;
  step: string;
  sovValue: number;
  approvedCrTotal: number;
  executionStartedAt: Date | null;
  invoiceUploadedAt: Date | null;
  invoiceApprovedAt: Date | null;
  costs: { workDate: Date; category: string; amount: number }[];
}

export interface ReportSiteRow {
  id: string;
  siteCode: string;
  venueName: string;
  step: string;
  billing: BillingStatus;
  sovValue: number;
  approvedCrs: number;
  contractValue: number;
  labor: number;
  material: number;
  otherCost: number;
  cost: number;
  margin: number;
  marginPct: number | null;
  costInPeriod: number;
  billedInPeriod: number;
}

export interface Report {
  from: string;
  to: string;
  totals: {
    contractValue: number;
    notStarted: number;
    unbilled: number;
    billed: number;
    approved: number;
    cost: number;
    margin: number;
    marginPct: number | null;
    billedInPeriod: number;
    costInPeriod: number;
  };
  sites: ReportSiteRow[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function billingStatus(s: Pick<ReportSiteInput, "executionStartedAt" | "invoiceUploadedAt" | "invoiceApprovedAt">): BillingStatus {
  if (s.invoiceApprovedAt) return "APPROVED";
  if (s.invoiceUploadedAt) return "BILLED";
  if (s.executionStartedAt) return "UNBILLED";
  return "NOT_STARTED";
}

/** Contract value (SOV + approved CRs) of sites whose work has started but whose invoice is not in SRM yet.
 *  The dashboard and the revenue report both use this, so the "Unbilled" figure is the same everywhere. */
export function unbilledValue(
  sites: Pick<ReportSiteInput, "sovValue" | "approvedCrTotal" | "executionStartedAt" | "invoiceUploadedAt" | "invoiceApprovedAt">[],
): number {
  return round2(sites.reduce((sum, s) => (billingStatus(s) === "UNBILLED" ? sum + s.sovValue + s.approvedCrTotal : sum), 0));
}

/** YYYY-MM-DD bounds; `to` is inclusive of the whole day. */
function inRange(d: Date, from: string, to: string): boolean {
  const iso = d.toISOString().slice(0, 10);
  return iso >= from && iso <= to;
}

export function buildReport(sites: ReportSiteInput[], from: string, to: string): Report {
  const rows: ReportSiteRow[] = sites.map((s) => {
    const contractValue = round2(s.sovValue + s.approvedCrTotal);
    let labor = 0, material = 0, otherCost = 0, costInPeriod = 0;
    for (const c of s.costs) {
      if (c.category === "LABOR") labor += c.amount;
      else if (c.category === "MATERIAL") material += c.amount;
      else otherCost += c.amount;
      if (inRange(c.workDate, from, to)) costInPeriod += c.amount;
    }
    const cost = round2(labor + material + otherCost);
    const margin = round2(contractValue - cost);
    const billing = billingStatus(s);
    return {
      id: s.id, siteCode: s.siteCode, venueName: s.venueName, step: s.step, billing,
      sovValue: s.sovValue, approvedCrs: s.approvedCrTotal, contractValue,
      labor: round2(labor), material: round2(material), otherCost: round2(otherCost), cost, margin,
      marginPct: contractValue > 0 ? Math.round((margin / contractValue) * 1000) / 10 : null,
      costInPeriod: round2(costInPeriod),
      billedInPeriod: s.invoiceUploadedAt && inRange(s.invoiceUploadedAt, from, to) ? contractValue : 0,
    };
  });

  const sum = (f: (r: ReportSiteRow) => number) => round2(rows.reduce((a, r) => a + f(r), 0));
  const byStatus = (st: BillingStatus) => sum((r) => (r.billing === st ? r.contractValue : 0));
  const contractValue = sum((r) => r.contractValue);
  const cost = sum((r) => r.cost);
  const margin = round2(contractValue - cost);

  return {
    from, to,
    totals: {
      contractValue,
      notStarted: byStatus("NOT_STARTED"),
      unbilled: unbilledValue(sites),
      billed: byStatus("BILLED"),
      approved: byStatus("APPROVED"),
      cost,
      margin,
      marginPct: contractValue > 0 ? Math.round((margin / contractValue) * 1000) / 10 : null,
      billedInPeriod: sum((r) => r.billedInPeriod),
      costInPeriod: sum((r) => r.costInPeriod),
    },
    sites: rows.sort((a, b) => b.contractValue - a.contractValue),
  };
}

/** The SOP's bimonthly reporting periods: the 1st–15th, and the 16th–end of month. */
export function bimonthlyPeriod(date: Date): { from: string; to: string } {
  const y = date.getUTCFullYear(), m = date.getUTCMonth(), d = date.getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return d <= 15
    ? { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-15` }
    : { from: `${y}-${pad(m + 1)}-16`, to: `${y}-${pad(m + 1)}-${pad(last)}` };
}
