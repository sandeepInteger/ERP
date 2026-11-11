import { useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";

import {
  ERICSSON_EXPENSE_ROLES, ERICSSON_FINANCE_VIEW_ROLES, EXPENSE_CATEGORY_LABELS, ExpenseCategory, LEADERSHIP_ROLES, Role,
} from "@erp/types";
import { useApi } from "../../hooks/useApi.js";
import { Paperclip } from "lucide-react";
import { PAYMENT_METHOD_LABELS, PaymentMethod } from "@erp/types";
import { viewFile } from "../../lib/download.js";
import { AsyncButton } from "../ui/async-button.js";
import { Badge, type BadgeTone } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { Checkbox } from "../ui/checkbox.js";
import { Field, FormError } from "../ui/field.js";
import { Input, SelectField } from "../ui/input.js";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableScroll } from "../ui/table.js";
import { api, errMsg } from "../../lib/api.js";
import { date, money, todayIso } from "../../lib/format.js";
import type { Person } from "../../lib/ericsson.js";
import { useMe } from "../../context/MeContext.js";
import { useToast } from "../../context/ToastContext.js";

export interface Expense {
  id: string; workDate: string; category: ExpenseCategory; description: string; personName: string | null;
  assigned: boolean; hours: string | null; amount: string; createdById: string; createdBy: Person;
  site: { id: string; siteCode: string; venueName: string };
  // Set on field engineer claims (approved ones only reach this list).
  claimType: string | null; paymentMethod: PaymentMethod | null; hasReceipt: boolean; reimbursedAt: string | null;
  decidedBy: Person | null;
}
export interface ExpenseList {
  rows: Expense[];
  totals: { total: number; byCategory: Record<ExpenseCategory, number>; laborHours: number; borrowedHours: number; owedToEngineers: number };
}

/** The claim line under an FE expense: who paid, approval, receipt, reimbursement. */
function ClaimInfo({ e, onChanged }: { e: Expense; onChanged: () => Promise<void> }) {
  const me = useMe();
  const toast = useToast();
  if (!e.claimType) return null;
  const personal = e.paymentMethod === PaymentMethod.PERSONAL_CARD;
  const canReimburse = personal && !e.reimbursedAt && (me.role === Role.FINANCE || me.role === Role.ADMIN);

  async function reimburse() {
    try {
      await api.post(`/ericsson/expenses/${e.id}/reimbursed`);
      toast("Marked reimbursed");
      await onChanged();
    } catch (err) { toast(errMsg(err), "error"); throw err; }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-surface-500">
      <span>FE claim · {e.paymentMethod ? PAYMENT_METHOD_LABELS[e.paymentMethod] : ""}{e.decidedBy ? ` · approved by ${e.decidedBy.firstName} ${e.decidedBy.lastName}` : ""}</span>
      {personal && (e.reimbursedAt ? <Badge tone="success">Reimbursed</Badge> : <Badge tone="warning">To reimburse</Badge>)}
      {e.hasReceipt && (
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => void viewFile(`/expenses/${e.id}/receipt`).catch(() => toast("Couldn't open the receipt", "error"))}>
          <Paperclip size={13} aria-hidden="true" /> Receipt
        </Button>
      )}
      {canReimburse && <AsyncButton size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => reimburse()}>Mark reimbursed</AsyncButton>}
    </div>
  );
}

export const CATEGORY_TONE: Record<ExpenseCategory, BadgeTone> = {
  LABOR: "info", MATERIAL: "success", TRAVEL: "warning", VENDOR: "accent", OTHER: "neutral",
};

const EMPTY = { workDate: todayIso(), category: ExpenseCategory.LABOR as ExpenseCategory, description: "", personName: "", assigned: true, hours: "", amount: "" };

/** Add-a-cost form. Pass `siteId` to fix the site, or `sites` to let the user pick one. */
export function ExpenseForm({
  siteId, sites, onAdded,
}: { siteId?: string; sites?: { id: string; siteCode: string; venueName: string }[]; onAdded: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [site, setSite] = useState(siteId ?? "");
  const [error, setError] = useState<string | null>(null);
  const labor = form.category === ExpenseCategory.LABOR;
  const num = (s: string) => s.replace(/[^\d.]/g, "");

  async function add() {
    if (!site) { setError("Choose the site."); throw new Error("validation"); }
    if (!form.description.trim() || !form.amount) { setError("Description and amount are required."); throw new Error("validation"); }
    if (labor && !form.hours) { setError("Labor needs the number of hours."); throw new Error("validation"); }
    setError(null);
    try {
      await api.post(`/ericsson/sites/${site}/expenses`, {
        workDate: form.workDate,
        category: form.category,
        description: form.description.trim(),
        assigned: form.assigned,
        amount: Number(form.amount),
        ...(form.personName.trim() ? { personName: form.personName.trim() } : {}),
        ...(form.hours ? { hours: Number(form.hours) } : {}),
      });
      toast("Cost recorded");
      setForm({ ...EMPTY, workDate: form.workDate, category: form.category });
      await onAdded();
    } catch (e) { setError(errMsg(e)); throw e; }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Record a cost</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {sites && (
            <Field label="Site" className="lg:col-span-2">
              <SelectField value={site} onChange={(e) => setSite(e.target.value)}>
                <option value="">Choose a site…</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.siteCode} · {s.venueName}</option>)}
              </SelectField>
            </Field>
          )}
          <Field label="Date"><Input type="date" value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} /></Field>
          <Field label="Type">
            <SelectField value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
              {Object.values(ExpenseCategory).map((c) => <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>)}
            </SelectField>
          </Field>
          <Field label="Description" className="lg:col-span-2">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={labor ? "e.g. Antenna mount L2–3" : "e.g. Fiber jumpers, mileage, lift rental"} />
          </Field>
          <Field label={labor ? "Person / crew" : "Paid to (optional)"}>
            <Input value={form.personName} onChange={(e) => setForm({ ...form, personName: e.target.value })} />
          </Field>
          {labor && <Field label="Hours"><Input inputMode="decimal" value={form.hours} onChange={(e) => setForm({ ...form, hours: num(e.target.value) })} /></Field>}
          <Field label="Amount (USD)"><Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: num(e.target.value) })} /></Field>
        </div>
        {labor && (
          <Checkbox
            label="From the site's assigned team (untick for a borrowed resource)"
            checked={form.assigned}
            onChange={(e) => setForm({ ...form, assigned: e.target.checked })}
          />
        )}
        <FormError message={error} />
        <div><AsyncButton onClick={() => add()}>Add cost</AsyncButton></div>
      </CardContent>
    </Card>
  );
}

/** Cost lines with totals. `showSite` adds the site column (for the cross-site tracker). */
export function ExpensesTable({ data, showSite, onChanged }: { data: ExpenseList | null; showSite?: boolean; onChanged: () => Promise<void> }) {
  const me = useMe();
  const toast = useToast();
  const cols = showSite ? 9 : 8;
  const canRemove = (e: Expense) =>
    e.createdById === me.id || me.role === Role.FINANCE || me.role === Role.PROJECT_MANAGER || LEADERSHIP_ROLES.has(me.role);

  async function remove(e: Expense) {
    if (!window.confirm(`Remove "${e.description}" (${money(e.amount, true)})?`)) return;
    try {
      await api.delete(`/ericsson/expenses/${e.id}`);
      await onChanged();
    } catch (err) { toast(errMsg(err), "error"); }
  }

  return (
    <Card className="overflow-hidden">
      <TableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              {showSite && <TableHead>Site</TableHead>}
              <TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead>Person</TableHead>
              <TableHead>Team</TableHead><TableHead className="text-right">Hours</TableHead><TableHead className="text-right">Amount</TableHead>
              <TableHead><span className="sr-only">Remove</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data && <TableEmpty colSpan={cols}>Loading…</TableEmpty>}
            {data?.rows.length === 0 && <TableEmpty colSpan={cols}>No costs recorded.</TableEmpty>}
            {data?.rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap">{date(e.workDate)}</TableCell>
                {showSite && (
                  <TableCell className="whitespace-nowrap">
                    <Link className="font-semibold text-brand-600 hover:underline" to={`/ericsson/sites/${e.site.id}?tab=costs`}>{e.site.siteCode}</Link>
                  </TableCell>
                )}
                <TableCell><Badge tone={CATEGORY_TONE[e.category]}>{EXPENSE_CATEGORY_LABELS[e.category]}</Badge></TableCell>
                <TableCell className="min-w-48">{e.description}<ClaimInfo e={e} onChanged={onChanged} /></TableCell>
                <TableCell className="whitespace-nowrap">{e.personName ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{e.category === ExpenseCategory.LABOR ? (e.assigned ? "Assigned" : <Badge tone="warning">Borrowed</Badge>) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{e.hours ? Number(e.hours) : "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{money(e.amount, true)}</TableCell>
                <TableCell>
                  {canRemove(e) && <Button variant="ghost" size="icon" aria-label={`Remove ${e.description}`} onClick={() => void remove(e)}><Trash2 size={15} /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableScroll>
      {data && data.rows.length > 0 && (
        <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-surface-100 px-4 py-3 text-sm">
          <span>{data.totals.laborHours} labor hrs{data.totals.borrowedHours ? ` (${data.totals.borrowedHours} borrowed)` : ""}</span>
          <span className="font-bold">Total {money(data.totals.total, true)}</span>
        </div>
      )}
    </Card>
  );
}

export const canRecordCosts = (role: string) => ERICSSON_EXPENSE_ROLES.has(role);
export const canSeeCosts = (role: string) => ERICSSON_EXPENSE_ROLES.has(role) || ERICSSON_FINANCE_VIEW_ROLES.has(role);

/** The "Costs" tab on a site. */
export function SiteCosts({ siteId, closed }: { siteId: string; closed: boolean }) {
  const me = useMe();
  const { data, reload } = useApi<ExpenseList>(`/ericsson/expenses?siteId=${siteId}`);
  return (
    <div className="flex flex-col gap-5">
      <ExpensesTable data={data} onChanged={reload} />
      {canRecordCosts(me.role) && !closed && <ExpenseForm siteId={siteId} onAdded={reload} />}
    </div>
  );
}
