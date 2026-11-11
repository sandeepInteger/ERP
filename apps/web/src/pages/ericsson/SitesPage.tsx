import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ERICSSON_EDIT_ROLES, ERICSSON_SCOPE_LABELS, ERICSSON_STEPS, ERICSSON_STEP_ORDER, EricssonScope, EricssonStep } from "@erp/types";
import { Page, PageHeader } from "../../components/PageHeader.js";
import { StepBadge } from "../../components/ericsson/StepBadge.js";
import { Badge } from "../../components/ui/badge.js";
import { Button } from "../../components/ui/button.js";
import { Card } from "../../components/ui/card.js";
import { Field, FormError } from "../../components/ui/field.js";
import { Input, SelectField } from "../../components/ui/input.js";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableScroll } from "../../components/ui/table.js";
import { useApi } from "../../hooks/useApi.js";
import { useMe } from "../../context/MeContext.js";
import { money, date } from "../../lib/format.js";
import { errMsg } from "../../lib/api.js";
import { downloadFile } from "../../lib/download.js";
import { useToast } from "../../context/ToastContext.js";
import { AsyncButton } from "../../components/ui/async-button.js";
import { Download } from "lucide-react";
import type { SiteRow } from "../../lib/ericsson.js";

export default function SitesPage() {
  const me = useMe();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");

  const step = params.get("step") ?? "";
  const scope = params.get("scope") ?? "";
  const mine = params.get("mine") === "1";
  const closed = params.get("closed") === "1";

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (step) q.set("step", step);
    if (scope) q.set("scope", scope);
    if (mine) q.set("mine", "true");
    if (closed) q.set("includeClosed", "true");
    return q.toString();
  }, [step, scope, mine, closed]);

  const { data, error, loading } = useApi<SiteRow[]>(`/ericsson/sites?${query}`);

  async function exportXlsx() {
    try {
      await downloadFile(`/ericsson/sites/export?${query}`, "ericsson-sites.xlsx");
    } catch (e) {
      toast(errMsg(e), "error");
      throw e;
    }
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }

  const term = search.trim().toLowerCase();
  const rows = (data ?? []).filter((s) =>
    !term || [s.siteCode, s.venueName, s.rfxNumber ?? ""].some((v) => v.toLowerCase().includes(term)),
  );

  return (
    <Page>
      <PageHeader
        kicker="Ericsson IBS"
        title="Site tracker"
        description="Every assigned site, its current SOP step and who owns it."
        actions={
          <>
            <AsyncButton variant="outline" onClick={() => exportXlsx()}><Download size={15} /> Export to Excel</AsyncButton>
            {ERICSSON_EDIT_ROLES.has(me.role) && <Button asChild><Link to="/ericsson/sites/new">+ New site assignment</Link></Button>}
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Search" className="min-w-56 flex-1">
          <Input type="search" placeholder="Site ID, venue or RFX…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <Field label="Step" className="w-56">
          <SelectField value={step} onChange={(e) => setParam("step", e.target.value)}>
            <option value="">All open steps</option>
            {ERICSSON_STEP_ORDER.map((s) => (
              <option key={s} value={s}>{ERICSSON_STEPS[s].sop ? `${ERICSSON_STEPS[s].sop} · ` : ""}{ERICSSON_STEPS[s].label}</option>
            ))}
          </SelectField>
        </Field>
        <Field label="Scope" className="w-44">
          <SelectField value={scope} onChange={(e) => setParam("scope", e.target.value)}>
            <option value="">All scopes</option>
            {Object.values(EricssonScope).map((s) => <option key={s} value={s}>{ERICSSON_SCOPE_LABELS[s]}</option>)}
          </SelectField>
        </Field>
        <Button variant={mine ? "default" : "secondary"} onClick={() => setParam("mine", mine ? "" : "1")}>Assigned to me</Button>
        {!step && (
          <Button variant={closed ? "default" : "secondary"} onClick={() => setParam("closed", closed ? "" : "1")}>Include closed</Button>
        )}
      </div>

      <FormError message={error} />

      <Card className="overflow-hidden">
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Venue</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>In step</TableHead>
                <TableHead>RFX</TableHead>
                <TableHead>Open items</TableHead>
                <TableHead className="text-right">SOV value</TableHead>
                <TableHead>PM</TableHead>
                <TableHead>Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && !data && <TableEmpty colSpan={10}>Loading…</TableEmpty>}
              {data && rows.length === 0 && <TableEmpty colSpan={10}>No sites match these filters.</TableEmpty>}
              {rows.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer hover:bg-surface-50"
                  onClick={() => navigate(`/ericsson/sites/${s.id}`)}
                >
                  <TableCell className="whitespace-nowrap">
                    <Link to={`/ericsson/sites/${s.id}`} className="font-semibold text-brand-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {s.siteCode}
                    </Link>
                  </TableCell>
                  <TableCell>{s.venueName}</TableCell>
                  <TableCell className="whitespace-nowrap">{ERICSSON_SCOPE_LABELS[s.scope as EricssonScope] ?? s.scope}</TableCell>
                  <TableCell><StepBadge step={s.step} /></TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className={s.daysInStep >= 3 && s.step !== EricssonStep.CLOSED ? "font-semibold text-[var(--color-warning-fg)]" : ""}>{s.daysInStep} d</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{s.rfxNumber ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {s.openDiscrepancies > 0 && <Badge tone="error">{s.openDiscrepancies} discrepancy</Badge>}
                      {s.openChangeRequests > 0 && <Badge tone="warning">{s.openChangeRequests} CR</Badge>}
                      {!s.openDiscrepancies && !s.openChangeRequests && <span className="text-surface-400">—</span>}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{money(s.sovValue)}</TableCell>
                  <TableCell className="whitespace-nowrap">{s.pmName ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{date(s.targetDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
        {data && (
          <div className="border-t border-surface-100 px-4 py-3 text-xs text-surface-500">
            Showing {rows.length} of {data.length} sites
          </div>
        )}
      </Card>
    </Page>
  );
}
