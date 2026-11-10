import { useState } from "react";

import { CR_STATUS_LABELS, CR_TYPE_LABELS, ChangeRequestType, SUB_VENDOR_PASS_THROUGH_PCT } from "@erp/types";
import { AsyncButton } from "../ui/async-button.js";
import { Badge } from "../ui/badge.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Field, FieldGrid, FormError } from "../ui/field.js";
import { Input, SelectField, Textarea } from "../ui/input.js";
import { api, errMsg } from "../../lib/api.js";
import { date, fullName, money } from "../../lib/format.js";
import { crLabel, crTone, type ChangeRequest } from "../../lib/ericsson.js";
import { CrActions } from "./CrActions.js";

const EMPTY = { type: ChangeRequestType.EXTRA_VISIT as ChangeRequestType, title: "", reason: "", extraDays: "", amount: "", vendorQuote: "" };

/** SOP steps 6 and 8, for one site: raise CRs and move them through approval. */
export function ChangeRequestsSection({
  siteId, crs, canEdit, closed, onChanged,
}: { siteId: string; crs: ChangeRequest[]; canEdit: boolean; closed: boolean; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const isVendor = form.type === ChangeRequestType.SUB_VENDOR;
  const quote = Number(form.vendorQuote || 0);
  const preview = Number(form.amount || 0) + (isVendor ? quote * (1 + SUB_VENDOR_PASS_THROUGH_PCT / 100) : 0);

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
      await onChanged();
    } catch (e) { setError(errMsg(e)); throw e; }
  }

  const num = (s: string) => s.replace(/[^\d.]/g, "");

  return (
    <div className="flex flex-col gap-5">
      {crs.length === 0 && <p className="text-sm text-surface-500">No change requests on this site.</p>}
      {crs.map((cr) => (
        <Card key={cr.id}>
          <CardContent className="flex flex-col gap-3 pt-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-surface-500">{crLabel(cr.number)} · {CR_TYPE_LABELS[cr.type as ChangeRequestType]}</div>
                <div className="text-base font-bold">{cr.title}</div>
                <div className="text-xs text-surface-500">Raised by {fullName(cr.raisedBy)} on {date(cr.createdAt)}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-base font-bold tabular-nums">{money(cr.total, true)}</span>
                <Badge tone={crTone(cr.status)}>{CR_STATUS_LABELS[cr.status]}</Badge>
              </div>
            </div>
            <p className="whitespace-pre-line text-sm">{cr.reason}</p>
            {Number(cr.vendorQuote) > 0 && (
              <p className="text-xs text-surface-500">
                Vendor quote {money(cr.vendorQuote, true)} + {Number(cr.passThroughPct)}% pass-through
                {Number(cr.amount) > 0 && ` + ${money(cr.amount, true)} Integer labor`}
              </p>
            )}
            {cr.decisionNote && <p className="text-xs text-surface-500">Decision note: {cr.decisionNote}</p>}
            <CrActions cr={cr} onChanged={onChanged} />
          </CardContent>
        </Card>
      ))}

      {canEdit && !closed && (
        <Card>
          <CardHeader>
            <CardTitle>Raise a change request</CardTitle>
            <CardDescription>For work beyond the SOV: extra visits or days, scope changes, sub-vendor work or extra materials.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FieldGrid>
              <Field label="Type">
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
            <Field label="Reason"><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="What happened and why it's outside the SOV" /></Field>
            <div className="text-sm">Total requested: <strong className="tabular-nums">{money(preview, true)}</strong></div>
            <FormError message={error} />
            <div><AsyncButton onClick={() => raise()}>Send to PM for review</AsyncButton></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
