import { useState } from "react";

import { CR_TYPE_LABELS, ChangeRequestType, SUB_VENDOR_PASS_THROUGH_PCT } from "@erp/types";
import { AsyncButton } from "../ui/async-button.js";
import { Field, FieldGrid, FormError } from "../ui/field.js";
import { Input, SelectField, Textarea } from "../ui/input.js";
import { api, errMsg } from "../../lib/api.js";
import { money } from "../../lib/format.js";

const EMPTY = { type: ChangeRequestType.EXTRA_VISIT as ChangeRequestType, title: "", reason: "", extraDays: "", amount: "", vendorQuote: "" };

const HINTS: Record<ChangeRequestType, string> = {
  [ChangeRequestType.EXTRA_VISIT]: "Work exceeds the SOV estimate",
  [ChangeRequestType.SCOPE_DEVIATION]: "Actual scope differs from the SOV",
  [ChangeRequestType.SUB_VENDOR]: "Requested by the Ericsson PM",
  [ChangeRequestType.EXTRA_MATERIAL]: "Not in the BOM",
};

/** Raise a change request (SOP steps 6 and 8). Used on the site page and the phone field view. */
export function RaiseCrForm({ siteId, onRaised, compact }: { siteId: string; onRaised: () => Promise<void>; compact?: boolean }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const isVendor = form.type === ChangeRequestType.SUB_VENDOR;
  const quote = Number(form.vendorQuote || 0);
  const preview = Number(form.amount || 0) + (isVendor ? quote * (1 + SUB_VENDOR_PASS_THROUGH_PCT / 100) : 0);
  const num = (s: string) => s.replace(/[^\d.]/g, "");

  async function raise() {
    if (!form.title.trim() || !form.reason.trim()) { setError("Title and reason are required."); throw new Error("validation"); }
    setError(null);
    try {
      await api.post(`/ericsson/sites/${siteId}/change-requests`, {
        type: form.type,
        title: form.title.trim(),
        reason: form.reason.trim(),
        amount: Number(form.amount || 0),
        vendorQuote: isVendor ? quote : 0,
        ...(form.extraDays ? { extraDays: Number(form.extraDays) } : {}),
      });
      setForm(EMPTY);
      await onRaised();
    } catch (e) { setError(errMsg(e)); throw e; }
  }

  return (
    <div className="flex flex-col gap-4">
      <FieldGrid className={compact ? "sm:grid-cols-1" : undefined}>
        <Field label="Type" hint={HINTS[form.type]}>
          <SelectField value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ChangeRequestType })}>
            {Object.values(ChangeRequestType).map((t) => <option key={t} value={t}>{CR_TYPE_LABELS[t]}</option>)}
          </SelectField>
        </Field>
        <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Extra day: ceiling access blocked" /></Field>
        <Field label="Extra days"><Input inputMode="decimal" value={form.extraDays} onChange={(e) => setForm({ ...form, extraDays: num(e.target.value) })} /></Field>
        <Field label={isVendor ? "Integer labor (USD, optional)" : "Estimate (USD)"}>
          <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: num(e.target.value) })} />
        </Field>
        {isVendor && (
          <Field label="Sub-vendor quote (USD)" hint={`${SUB_VENDOR_PASS_THROUGH_PCT}% pass-through is added automatically (SOP 6.3)`}>
            <Input inputMode="decimal" value={form.vendorQuote} onChange={(e) => setForm({ ...form, vendorQuote: num(e.target.value) })} />
          </Field>
        )}
      </FieldGrid>
      <Field label="What happened"><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="What happened and why it's outside the SOV" /></Field>
      <div className="text-sm">Total requested: <strong className="tabular-nums">{money(preview, true)}</strong></div>
      <FormError message={error} />
      <div><AsyncButton size={compact ? "lg" : "default"} className={compact ? "w-full" : undefined} onClick={() => raise()}>Send to PM for review</AsyncButton></div>
    </div>
  );
}
