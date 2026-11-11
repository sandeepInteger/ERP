import { useMemo, useState } from "react";
import { Clock, Package, Plane, Users, Wallet } from "lucide-react";

import { EXPENSE_CATEGORY_LABELS, ExpenseCategory } from "@erp/types";
import { Page, PageHeader } from "../../components/PageHeader.js";
import { SummaryStatCard } from "../../components/SummaryStatCard.js";
import { ExpenseForm, ExpensesTable, canRecordCosts, canSeeCosts, type ExpenseList } from "../../components/ericsson/ExpensesPanel.js";
import { Field, FormError } from "../../components/ui/field.js";
import { Input, SelectField } from "../../components/ui/input.js";
import { useApi } from "../../hooks/useApi.js";
import { useMe } from "../../context/MeContext.js";
import { money } from "../../lib/format.js";
import type { SiteRow } from "../../lib/ericsson.js";

export default function ExpensesPage() {
  const me = useMe();
  const [category, setCategory] = useState("");
  const [siteId, setSiteId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (category) q.set("category", category);
    if (siteId) q.set("siteId", siteId);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return q.toString();
  }, [category, siteId, from, to]);

  const allowed = canSeeCosts(me.role);
  const { data, error, reload } = useApi<ExpenseList>(allowed ? `/ericsson/expenses?${query}` : null);
  const { data: sites } = useApi<SiteRow[]>("/ericsson/sites?includeClosed=true");

  if (!allowed) return <Page><PageHeader title="Daily tracker & expenses" description="Your role can't see costs." /></Page>;

  const t = data?.totals;
  return (
    <Page>
      <PageHeader
        kicker="Ericsson IBS · daily tracker"
        title="Daily tracker & expenses"
        description="Approved costs per site: labor, material, travel and vendor lines, plus field engineers' expenses once their manager approves them."
      />

      <section className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4">
        <SummaryStatCard icon={Wallet} label="Total" value={t ? money(t.total) : "–"} caption="For these filters" />
        <SummaryStatCard icon={Users} label="Labor" value={t ? money(t.byCategory.LABOR) : "–"} caption={t ? `${t.laborHours} hrs · ${t.borrowedHours} borrowed` : undefined} />
        <SummaryStatCard icon={Package} label="Material" value={t ? money(t.byCategory.MATERIAL) : "–"} />
        <SummaryStatCard icon={Plane} label="Travel & vendor" value={t ? money(t.byCategory.TRAVEL + t.byCategory.VENDOR + t.byCategory.OTHER) : "–"} />
        <SummaryStatCard icon={Clock} label="Owed to engineers" value={t ? money(t.owedToEngineers) : "–"} caption="Approved personal-card claims not yet reimbursed" />
      </section>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Site" className="w-64">
          <SelectField value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">All sites</option>
            {sites?.map((s) => <option key={s.id} value={s.id}>{s.siteCode} · {s.venueName}</option>)}
          </SelectField>
        </Field>
        <Field label="Type" className="w-44">
          <SelectField value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All types</option>
            {Object.values(ExpenseCategory).map((c) => <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>)}
          </SelectField>
        </Field>
        <Field label="From" className="w-44"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To" className="w-44"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>

      <FormError message={error} />
      <ExpensesTable data={data} showSite onChanged={reload} />
      {canRecordCosts(me.role) && sites && <ExpenseForm sites={sites.filter((s) => s.step !== "CLOSED")} onAdded={reload} />}
    </Page>
  );
}
