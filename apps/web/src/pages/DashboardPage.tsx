import { Link } from "react-router-dom";
import { AlertTriangle, FileWarning, RadioTower, Receipt, Timer, Wallet } from "lucide-react";

import { ERICSSON_FINANCE_VIEW_ROLES, ERICSSON_STEPS, ERICSSON_STEP_ORDER, EricssonStep } from "@erp/types";
import { Page, PageHeader } from "../components/PageHeader.js";
import { SummaryStatCard } from "../components/SummaryStatCard.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { FormError } from "../components/ui/field.js";
import { Progress } from "../components/ui/progress.js";
import { useApi } from "../hooks/useApi.js";
import { useMe } from "../context/MeContext.js";
import { money } from "../lib/format.js";
import type { Summary } from "../lib/ericsson.js";

const KIND_TONE: Record<string, "error" | "warning" | "info"> = { DISCREPANCY: "error", RFX: "warning", MATERIAL: "warning", CR: "info" };
const KIND_LABEL: Record<string, string> = { DISCREPANCY: "Verify", RFX: "RFX", MATERIAL: "Material", CR: "CR" };

export default function DashboardPage() {
  const me = useMe();
  const { data: s, error } = useApi<Summary>("/ericsson/summary");

  const steps = ERICSSON_STEP_ORDER.filter((st) => st !== EricssonStep.CLOSED);
  const max = s ? Math.max(1, ...steps.map((st) => s.counts[st])) : 1;

  return (
    <Page>
      <PageHeader
        kicker="Ericsson IBS"
        title={`Welcome, ${me.firstName}`}
        description="Where every Ericsson site stands, and what needs attention."
        actions={<Button asChild><Link to="/ericsson/sites/new">+ New site assignment</Link></Button>}
      />
      <FormError message={error} />

      <section aria-label="Key figures" className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <SummaryStatCard icon={RadioTower} label="Active sites" value={s?.activeSites ?? "–"} caption="Not yet closed" to="/ericsson/sites" />
        <SummaryStatCard icon={Timer} label="Awaiting RFX" value={s?.awaitingRfx ?? "–"} caption="Step 3" to="/ericsson/sites?step=SOV_RFX" />
        <SummaryStatCard icon={FileWarning} label="Open CRs" value={s?.openChangeRequests ?? "–"} caption={s?.pendingCrValue != null ? `${money(s.pendingCrValue)} pending` : "Awaiting a decision"} to="/ericsson/change-requests" />
        <SummaryStatCard icon={Receipt} label="Ready to invoice" value={s?.readyToInvoice ?? "–"} caption="Step 9" to="/ericsson/sites?step=INVOICING" />
        {ERICSSON_FINANCE_VIEW_ROLES.has(me.role) && (
          <SummaryStatCard icon={Wallet} label="Unbilled" value={s?.unbilledValue != null ? money(s.unbilledValue) : "–"} caption="Work started, not invoiced (incl. approved CRs)" to="/ericsson/reports" />
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sites by workflow step</CardTitle>
            <CardDescription>Ericsson SOP steps 1–9</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pointer-coarse:gap-0">
            {steps.map((st) => (
              <Link
                key={st}
                to={`/ericsson/sites?step=${st}`}
                className="grid grid-cols-[minmax(0,11rem)_1fr_2rem] items-center gap-3 rounded-md px-1 py-0.5 text-sm hover:bg-surface-50 pointer-coarse:min-h-11"
              >
                <span className="truncate">{ERICSSON_STEPS[st].sop} · {ERICSSON_STEPS[st].short}</span>
                <Progress value={s ? (s.counts[st] / max) * 100 : 0} label={ERICSSON_STEPS[st].label} />
                <span className="text-right font-semibold">{s?.counts[st] ?? "–"}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Needs attention</CardTitle>
              {s && s.attention.length > 0 && <Badge tone="error">{s.attention.length}</Badge>}
            </div>
            <CardDescription>Stalled for 3+ days, or blocked by materials</CardDescription>
          </CardHeader>
          <CardContent>
            {s && s.attention.length === 0 && (
              <p className="py-6 text-center text-sm text-surface-500">Nothing is stalled.</p>
            )}
            <ul className="flex flex-col">
              {s?.attention.map((a, i) => (
                <li key={`${a.siteId}-${a.kind}-${i}`} className="flex items-start gap-3 border-b border-surface-100 py-3 last:border-0">
                  <Badge tone={KIND_TONE[a.kind] ?? "neutral"}>{KIND_LABEL[a.kind] ?? a.kind}</Badge>
                  <div className="min-w-0 flex-1">
                    <Link to={`/ericsson/sites/${a.siteId}`} className="font-semibold text-brand-600 hover:underline">
                      {a.siteCode} · {a.title}
                    </Link>
                    <div className="text-xs text-surface-500">{a.detail}</div>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-surface-500">
                    <AlertTriangle size={12} aria-hidden="true" /> {a.days} d
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
