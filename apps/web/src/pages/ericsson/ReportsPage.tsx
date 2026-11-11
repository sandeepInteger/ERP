import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileCheck2, Hourglass, Landmark, TrendingUp, Wallet } from "lucide-react";

import { ERICSSON_FINANCE_VIEW_ROLES, type EricssonStep } from "@erp/types";
import { Page, PageHeader } from "../../components/PageHeader.js";
import { SummaryStatCard } from "../../components/SummaryStatCard.js";
import { StepBadge } from "../../components/ericsson/StepBadge.js";
import { AsyncButton } from "../../components/ui/async-button.js";
import { Badge, type BadgeTone } from "../../components/ui/badge.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.js";
import { Field, FormError } from "../../components/ui/field.js";
import { Input, SelectField } from "../../components/ui/input.js";
import { Progress } from "../../components/ui/progress.js";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableScroll } from "../../components/ui/table.js";
import { useApi } from "../../hooks/useApi.js";
import { useMe } from "../../context/MeContext.js";
import { useToast } from "../../context/ToastContext.js";
import { errMsg } from "../../lib/api.js";
import { downloadFile } from "../../lib/download.js";
import { money } from "../../lib/format.js";

type Billing = "NOT_STARTED" | "UNBILLED" | "BILLED" | "APPROVED";
interface SiteRow {
  id: string; siteCode: string; venueName: string; step: EricssonStep; billing: Billing;
  sovValue: number; approvedCrs: number; contractValue: number; labor: number; material: number; otherCost: number;
  cost: number; margin: number; marginPct: number | null; costInPeriod: number; billedInPeriod: number;
}
interface Report {
  from: string; to: string;
  totals: {
    contractValue: number; notStarted: number; unbilled: number; billed: number; approved: number;
    cost: number; margin: number; marginPct: number | null; billedInPeriod: number; costInPeriod: number;
  };
  sites: SiteRow[];
}

const BILLING: Record<Billing, { label: string; tone: BadgeTone }> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  UNBILLED: { label: "Unbilled", tone: "warning" },
  BILLED: { label: "Billed", tone: "info" },
  APPROVED: { label: "Approved", tone: "success" },
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Reporting periods from the SOP: bimonthly (1st–15th, 16th–end) and the monthly MBR. */
function periods(today = new Date()) {
  const y = today.getUTCFullYear(), m = today.getUTCMonth(), d = today.getUTCDate();
  const end = (yy: number, mm: number) => new Date(Date.UTC(yy, mm + 1, 0));
  const first = (yy: number, mm: number, dd = 1) => new Date(Date.UTC(yy, mm, dd));
  const currentHalf = d <= 15 ? [first(y, m), first(y, m, 15)] : [first(y, m, 16), end(y, m)];
  const previousHalf = d <= 15 ? [first(y, m - 1, 16), end(y, m - 1)] : [first(y, m), first(y, m, 15)];
  return [
    { key: "half", label: "This bimonthly period", from: iso(currentHalf[0]!), to: iso(currentHalf[1]!) },
    { key: "prevHalf", label: "Previous bimonthly period", from: iso(previousHalf[0]!), to: iso(previousHalf[1]!) },
    { key: "month", label: "This month (MBR)", from: iso(first(y, m)), to: iso(end(y, m)) },
    { key: "prevMonth", label: "Last month (MBR)", from: iso(first(y, m - 1)), to: iso(end(y, m - 1)) },
    { key: "quarter", label: "This quarter (QBR)", from: iso(first(y, m - (m % 3))), to: iso(end(y, m - (m % 3) + 2)) },
  ];
}

export default function ReportsPage() {
  const me = useMe();
  const toast = useToast();
  const options = useMemo(() => periods(), []);
  const [key, setKey] = useState("half");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const chosen = key === "custom" ? custom : options.find((o) => o.key === key)!;
  const ready = Boolean(chosen.from && chosen.to);
  const qs = `from=${chosen.from}&to=${chosen.to}`;

  const allowed = ERICSSON_FINANCE_VIEW_ROLES.has(me.role);
  const { data, error } = useApi<Report>(allowed && ready ? `/ericsson/reports/revenue-cost?${qs}` : null);

  if (!allowed) return <Page><PageHeader title="Revenue & cost" description="Your role can't see financial reports." /></Page>;

  const t = data?.totals;
  const max = Math.max(1, ...(data?.sites ?? []).map((s) => Math.max(s.contractValue, s.cost)));

  async function exportXlsx() {
    try {
      await downloadFile(`/ericsson/reports/revenue-cost?${qs}&format=xlsx`, "ericsson-revenue-cost.xlsx");
    } catch (e) {
      toast(errMsg(e), "error");
      throw e;
    }
  }

  return (
    <Page>
      <PageHeader
        kicker="Ericsson IBS · finance"
        title="Revenue & cost"
        description="Contract value (SOV + approved CRs) against daily-tracker costs, with billed vs unbilled. Bimonthly for Finance, monthly for the MBR."
        actions={<AsyncButton variant="outline" disabled={!ready} onClick={() => exportXlsx()}><Download size={15} /> Export to Excel</AsyncButton>}
      />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Period" className="w-64">
          <SelectField value={key} onChange={(e) => setKey(e.target.value)}>
            {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            <option value="custom">Custom dates</option>
          </SelectField>
        </Field>
        {key === "custom" ? (
          <>
            <Field label="From" className="w-44"><Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></Field>
            <Field label="To" className="w-44"><Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></Field>
          </>
        ) : (
          <span className="pb-2 text-sm text-surface-500">{chosen.from} to {chosen.to}</span>
        )}
      </div>
      <FormError message={error} />

      <section className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4">
        <SummaryStatCard icon={Landmark} label="Contract value" value={t ? money(t.contractValue) : "–"} caption="All sites, SOV + approved CRs" />
        <SummaryStatCard icon={Hourglass} label="Unbilled" value={t ? money(t.unbilled) : "–"} caption="Work started, not invoiced" />
        <SummaryStatCard icon={FileCheck2} label="Billed in period" value={t ? money(t.billedInPeriod) : "–"} caption={t ? `${money(t.billed)} awaiting approval overall` : undefined} />
        <SummaryStatCard icon={Wallet} label="Cost in period" value={t ? money(t.costInPeriod) : "–"} caption={t ? `${money(t.cost)} all time` : undefined} />
        <SummaryStatCard icon={TrendingUp} label="Margin" value={t?.marginPct != null ? `${t.marginPct}%` : "–"} caption={t ? money(t.margin) : undefined} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Contract value vs cost by site</CardTitle>
          <CardDescription>Blue: contract value. Amber: cost to date.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {data?.sites.filter((s) => s.contractValue > 0 || s.cost > 0).map((s) => (
            <div key={s.id} className="grid grid-cols-[6.5rem_1fr_4rem] items-center gap-3 text-[13px]">
              <Link to={`/ericsson/sites/${s.id}?tab=costs`} className="font-semibold text-brand-600 hover:underline">{s.siteCode}</Link>
              <div className="flex flex-col gap-1">
                <Progress value={(s.contractValue / max) * 100} label={`${s.siteCode} contract value`} className="h-2" />
                <Progress value={(s.cost / max) * 100} tone="warning" label={`${s.siteCode} cost`} className="h-2" />
              </div>
              <span className="text-right font-semibold tabular-nums">{s.marginPct != null ? `${s.marginPct}%` : "–"}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead><TableHead>Step</TableHead><TableHead>Billing</TableHead>
                <TableHead className="text-right">Contract</TableHead><TableHead className="text-right">Labor</TableHead>
                <TableHead className="text-right">Material</TableHead><TableHead className="text-right">Travel / vendor</TableHead>
                <TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Cost in period</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data && <TableEmpty colSpan={10}>{ready ? "Loading…" : "Pick both dates."}</TableEmpty>}
              {data?.sites.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap">
                    <Link to={`/ericsson/sites/${s.id}`} className="font-semibold text-brand-600 hover:underline">{s.siteCode}</Link>
                    <div className="text-xs text-surface-500">{s.venueName}</div>
                  </TableCell>
                  <TableCell><StepBadge step={s.step} /></TableCell>
                  <TableCell><Badge tone={BILLING[s.billing].tone}>{BILLING[s.billing].label}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{money(s.contractValue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(s.labor)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(s.material)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(s.otherCost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(s.cost)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{s.marginPct != null ? `${s.marginPct}%` : "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(s.costInPeriod)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
      </Card>
      <p className="text-xs text-surface-500">
        Margin uses contract value, not cash received. Sites with no costs recorded show a 100% margin until the daily tracker is filled in.
      </p>
    </Page>
  );
}
