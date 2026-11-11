import { useRef, useState } from "react";
import { Paperclip, Plus, Receipt } from "lucide-react";

import {
  EXPENSE_STATUS_LABELS, ExpenseStatus, FE_EXPENSE_TYPES, FE_EXPENSE_TYPE_LABELS, PAYMENT_METHOD_LABELS, PaymentMethod,
} from "@erp/types";
import { AsyncButton } from "../../components/ui/async-button.js";
import { Badge, type BadgeTone } from "../../components/ui/badge.js";
import { Button } from "../../components/ui/button.js";
import { Card } from "../../components/ui/card.js";
import { Field, FormError } from "../../components/ui/field.js";
import { Input, SelectField, Textarea } from "../../components/ui/input.js";
import { useApi } from "../../hooks/useApi.js";
import { useToast } from "../../context/ToastContext.js";
import { api, errMsg } from "../../lib/api.js";
import { viewFile } from "../../lib/download.js";
import { date, money, todayIso } from "../../lib/format.js";
import { cn } from "../../lib/utils.js";
import type { FieldSite } from "./FieldTodayPage.js";

export interface Claim {
  id: string; workDate: string; claimType: string; description: string; amount: string; paymentMethod: PaymentMethod;
  status: ExpenseStatus; rejectionReason: string | null; decidedAt: string | null; reimbursedAt: string | null; createdAt: string;
  hasReceipt: boolean; site: { id: string; siteCode: string; venueName: string };
  createdBy: { firstName: string; lastName: string }; approver: { firstName: string; lastName: string } | null;
}

export const CLAIM_TONE: Record<ExpenseStatus, BadgeTone> = { SUBMITTED: "warning", APPROVED: "success", REJECTED: "error" };

const EMPTY = { siteId: "", expenseType: "", workDate: todayIso(), amount: "", paymentMethod: PaymentMethod.CORPORATE_CARD as PaymentMethod, note: "" };

/** Field engineer: add expenses against a site with the bill attached, and follow their approval. */
export default function FieldExpensesPage() {
  const toast = useToast();
  const { data: claims, reload } = useApi<Claim[]>("/field/expenses");
  const { data: sites } = useApi<FieldSite[]>("/field/sites?all=true");
  const fileRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = (claims ?? []).filter((c) => c.status === ExpenseStatus.SUBMITTED);
  const pendingTotal = pending.reduce((n, c) => n + Number(c.amount), 0);

  async function submit() {
    if (!form.siteId) { setError("Choose the site."); throw new Error("validation"); }
    if (!form.expenseType) { setError("Choose the expense type."); throw new Error("validation"); }
    if (!(Number(form.amount) > 0)) { setError("Enter the amount."); throw new Error("validation"); }
    if (!receipt) { setError("Attach the bill or receipt: it's needed as proof."); throw new Error("validation"); }
    setError(null);
    const fd = new FormData();
    // Fields first, file last (the server reads them in order).
    fd.append("siteId", form.siteId);
    fd.append("expenseType", form.expenseType);
    fd.append("workDate", form.workDate);
    fd.append("amount", form.amount);
    fd.append("paymentMethod", form.paymentMethod);
    if (form.note.trim()) fd.append("note", form.note.trim());
    fd.append("receipt", receipt);
    try {
      await api.post("/field/expenses", fd);
      toast("Expense sent to your manager for approval");
      setForm({ ...EMPTY, siteId: form.siteId, paymentMethod: form.paymentMethod });
      setReceipt(null);
      if (fileRef.current) fileRef.current.value = "";
      setAdding(false);
      await reload();
    } catch (e) { setError(errMsg(e)); throw e; }
  }

  async function withdraw(c: Claim) {
    if (!window.confirm(`Withdraw this ${money(c.amount, true)} claim?`)) return;
    try {
      await api.delete(`/field/expenses/${c.id}`);
      await reload();
    } catch (e) { toast(errMsg(e), "error"); }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">My expenses</h1>
          <p className="text-[13px] text-surface-500">{pending.length} waiting for approval · {money(pendingTotal, true)}</p>
        </div>
        {!adding && <Button size="lg" onClick={() => setAdding(true)}><Plus size={18} aria-hidden="true" /> Add expense</Button>}
      </header>

      {adding && (
        <Card className="flex flex-col gap-4 p-4">
          <h2 className="text-base font-bold">New expense</h2>
          <Field label="Site">
            <SelectField className="h-11 text-base" value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
              <option value="">Choose a site…</option>
              {sites?.map((s) => <option key={s.id} value={s.id}>{s.siteCode} · {s.venueName}</option>)}
            </SelectField>
          </Field>
          <Field label="Expense type">
            <SelectField className="h-11 text-base" value={form.expenseType} onChange={(e) => setForm({ ...form, expenseType: e.target.value })}>
              <option value="">Choose a type…</option>
              {FE_EXPENSE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </SelectField>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><Input type="date" className="h-11 text-base" value={form.workDate} max={todayIso()} onChange={(e) => setForm({ ...form, workDate: e.target.value })} /></Field>
            <Field label="Amount (USD)"><Input inputMode="decimal" className="h-11 text-base" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-[13px] font-semibold text-surface-700">Paid with</legend>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(PaymentMethod).map((m) => (
                <button key={m} type="button" aria-pressed={form.paymentMethod === m} onClick={() => setForm({ ...form, paymentMethod: m })}
                  className={cn("min-h-12 cursor-pointer rounded-lg border px-2 text-sm font-semibold",
                    form.paymentMethod === m ? "border-brand-600 bg-brand-600 text-white" : "border-surface-300 bg-surface-0 text-surface-800 hover:bg-surface-100")}>
                  {PAYMENT_METHOD_LABELS[m]}
                </button>
              ))}
            </div>
          </fieldset>
          <Field label="Note (optional)"><Textarea className="min-h-16 text-base" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. I-95 tolls to site" /></Field>
          <Field label="Bill / receipt" hint="Required. Take a photo or attach a PDF.">
            <Input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="h-auto py-2"
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
          </Field>
          <FormError message={error} />
          <div className="flex flex-col gap-2">
            <AsyncButton size="lg" className="w-full" onClick={() => submit()}>Send for approval</AsyncButton>
            <Button variant="ghost" onClick={() => { setAdding(false); setError(null); }}>Cancel</Button>
          </div>
        </Card>
      )}

      {claims && claims.length === 0 && !adding && (
        <Card className="flex flex-col items-center gap-2 p-8 text-center text-sm text-surface-500">
          <Receipt size={28} aria-hidden="true" /> No expenses yet. Add one any time, with the bill attached.
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {claims?.map((c) => (
          <Card key={c.id} className="flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold">{FE_EXPENSE_TYPE_LABELS[c.claimType] ?? c.claimType}</div>
                <div className="text-[13px] text-surface-500">{c.site.siteCode} · {date(c.workDate)} · {PAYMENT_METHOD_LABELS[c.paymentMethod]}</div>
              </div>
              <div className="text-right">
                <div className="font-bold tabular-nums">{money(c.amount, true)}</div>
                <Badge tone={CLAIM_TONE[c.status]}>{EXPENSE_STATUS_LABELS[c.status]}</Badge>
              </div>
            </div>
            {c.description.includes(": ") && <p className="text-[13px]">{c.description.split(": ").slice(1).join(": ")}</p>}
            {c.status === ExpenseStatus.REJECTED && c.rejectionReason && (
              <p className="rounded-md bg-[var(--color-error-bg)] px-3 py-2 text-[13px] text-[var(--color-error-fg)]">Rejected: {c.rejectionReason}</p>
            )}
            {c.status === ExpenseStatus.SUBMITTED && c.approver && <p className="text-xs text-surface-500">With {c.approver.firstName} {c.approver.lastName} for approval</p>}
            {c.status === ExpenseStatus.APPROVED && c.paymentMethod === PaymentMethod.PERSONAL_CARD && (
              <p className="text-xs text-surface-500">{c.reimbursedAt ? `Reimbursed ${date(c.reimbursedAt)}` : "Approved · waiting for reimbursement from Finance"}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {c.hasReceipt && <Button size="sm" variant="secondary" onClick={() => void viewFile(`/expenses/${c.id}/receipt`).catch(() => toast("Couldn't open the receipt", "error"))}><Paperclip size={14} aria-hidden="true" /> Receipt</Button>}
              {c.status !== ExpenseStatus.APPROVED && <Button size="sm" variant="ghost" onClick={() => void withdraw(c)}>Withdraw</Button>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
