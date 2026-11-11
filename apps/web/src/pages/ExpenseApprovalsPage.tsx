import { useState } from "react";
import { Paperclip } from "lucide-react";

import { FE_EXPENSE_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@erp/types";
import { Page, PageHeader } from "../components/PageHeader.js";
import { AsyncButton } from "../components/ui/async-button.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Card } from "../components/ui/card.js";
import { FormError } from "../components/ui/field.js";
import { Input } from "../components/ui/input.js";
import { useApi } from "../hooks/useApi.js";
import { useToast } from "../context/ToastContext.js";
import { api, errMsg } from "../lib/api.js";
import { viewFile } from "../lib/download.js";
import { date, dateTime, fullName, money } from "../lib/format.js";
import type { Claim } from "./field/FieldExpensesPage.js";

/** Managers approve or reject their field engineers' expense claims. */
export default function ExpenseApprovalsPage() {
  const toast = useToast();
  const { data, error, reload } = useApi<Claim[]>("/expense-approvals");
  const total = (data ?? []).reduce((n, c) => n + Number(c.amount), 0);

  return (
    <Page>
      <PageHeader
        kicker="Approvals"
        title="Expense approvals"
        description="Field engineers' expenses waiting for you. Check the bill, then approve or reject. Only approved expenses reach Finance and count as costs."
      />
      <FormError message={error} />
      {data && (
        <p className="text-sm text-surface-600">{data.length} waiting · {money(total, true)}</p>
      )}
      {data?.length === 0 && <Card className="p-8 text-center text-sm text-surface-500">Nothing waiting for your approval.</Card>}
      <div className="flex flex-col gap-3">
        {data?.map((c) => <ApprovalCard key={c.id} claim={c} onDone={async (msg) => { toast(msg); await reload(); }} />)}
      </div>
    </Page>
  );
}

function ApprovalCard({ claim: c, onDone }: { claim: Claim; onDone: (msg: string) => Promise<void> }) {
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "APPROVE" | "REJECT") {
    if (decision === "REJECT" && !reason.trim()) { setError("Say why, so the engineer can fix it."); throw new Error("validation"); }
    setError(null);
    try {
      await api.post(`/expense-approvals/${c.id}/decide`, { decision, ...(decision === "REJECT" ? { reason: reason.trim() } : {}) });
      await onDone(decision === "APPROVE" ? `Approved ${money(c.amount, true)}` : "Rejected");
    } catch (e) { setError(errMsg(e)); throw e; }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-bold">{FE_EXPENSE_TYPE_LABELS[c.claimType] ?? c.claimType} · {money(c.amount, true)}</div>
          <div className="text-[13px] text-surface-500">
            {fullName(c.createdBy)} · {c.site.siteCode} {c.site.venueName} · spent {date(c.workDate)} · submitted {dateTime(c.createdAt)}
          </div>
          {c.description.includes(": ") && <p className="mt-1 text-sm">{c.description.split(": ").slice(1).join(": ")}</p>}
        </div>
        <Badge tone={c.paymentMethod === "PERSONAL_CARD" ? "accent" : "info"}>{PAYMENT_METHOD_LABELS[c.paymentMethod]}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => void viewFile(`/expenses/${c.id}/receipt`).catch(() => toast("Couldn't open the receipt", "error"))}>
          <Paperclip size={14} aria-hidden="true" /> View bill
        </Button>
        {!rejecting && (
          <>
            <AsyncButton size="sm" variant="success" onClick={() => decide("APPROVE")}>Approve</AsyncButton>
            <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>Reject…</Button>
          </>
        )}
      </div>
      {rejecting && (
        <div className="flex flex-wrap items-center gap-2">
          <Input className="min-w-64 flex-1" placeholder="Why? e.g. itemised bill missing" value={reason} onChange={(e) => setReason(e.target.value)} />
          <AsyncButton size="sm" variant="destructive" onClick={() => decide("REJECT")}>Reject</AsyncButton>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
        </div>
      )}
      <FormError message={error} />
    </Card>
  );
}
