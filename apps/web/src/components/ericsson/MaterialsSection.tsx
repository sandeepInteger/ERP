import { useState } from "react";
import { Trash2 } from "lucide-react";

import { MATERIAL_STATUS_LABELS, MaterialStatus } from "@erp/types";
import { AsyncButton } from "../ui/async-button.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Field, FormError } from "../ui/field.js";
import { Input, SelectField } from "../ui/input.js";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableScroll } from "../ui/table.js";
import { api, errMsg } from "../../lib/api.js";
import { date } from "../../lib/format.js";
import { materialTone, type MaterialLine } from "../../lib/ericsson.js";
import { useToast } from "../../context/ToastContext.js";

const EMPTY = { item: "", bomQty: "", clientSuppliedQty: "", orderQty: "", orderRef: "", shipTo: "Site", eta: "", status: MaterialStatus.TO_ORDER as MaterialStatus };

/** SOP step 4: BOM lines, Ericsson-supplied quantities and Integer's orders. */
export function MaterialsSection({
  siteId, materials, canEdit, onChanged,
}: { siteId: string; materials: MaterialLine[]; canEdit: boolean; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!form.item.trim() || !form.bomQty) { setError("Item and BOM quantity are required."); throw new Error("validation"); }
    setError(null);
    const n = (s: string) => (s ? Number(s) : undefined);
    const body = Object.fromEntries(Object.entries({
      item: form.item.trim(), bomQty: Number(form.bomQty), clientSuppliedQty: n(form.clientSuppliedQty), orderQty: n(form.orderQty),
      orderRef: form.orderRef.trim() || undefined, shipTo: form.shipTo.trim() || undefined, eta: form.eta || undefined, status: form.status,
    }).filter(([, v]) => v !== undefined));
    try {
      await api.post(`/ericsson/sites/${siteId}/materials`, body);
      setForm(EMPTY);
      await onChanged();
    } catch (e) { setError(errMsg(e)); throw e; }
  }

  async function setStatus(m: MaterialLine, status: MaterialStatus) {
    try {
      await api.patch(`/ericsson/materials/${m.id}`, { status });
      await onChanged();
    } catch (e) { toast(errMsg(e), "error"); }
  }

  async function remove(m: MaterialLine) {
    if (!window.confirm(`Remove ${m.item}?`)) return;
    try {
      await api.delete(`/ericsson/materials/${m.id}`);
      await onChanged();
    } catch (e) { toast(errMsg(e), "error"); }
  }

  const qty = (s: string) => s.replace(/[^\d]/g, "");

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>BOM check & orders</CardTitle>
        <CardDescription>Work can start once every line is Ericsson-supplied, in stock or received.</CardDescription>
      </CardHeader>
      <TableScroll>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead><TableHead>BOM qty</TableHead><TableHead>Ericsson supplies</TableHead><TableHead>To order</TableHead>
              <TableHead>Order / PO</TableHead><TableHead>Ship to</TableHead><TableHead>ETA</TableHead><TableHead>Status</TableHead>
              <TableHead><span className="sr-only">Remove</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {materials.length === 0 && <TableEmpty colSpan={9}>No material lines yet. Add the BOM lines Integer has to cover.</TableEmpty>}
            {materials.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-semibold">{m.item}</TableCell>
                <TableCell>{m.bomQty}</TableCell>
                <TableCell>{m.clientSuppliedQty}</TableCell>
                <TableCell>{m.orderQty}</TableCell>
                <TableCell>{m.orderRef ?? "—"}</TableCell>
                <TableCell>{m.shipTo ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{date(m.eta)}</TableCell>
                <TableCell>
                  {canEdit ? (
                    <SelectField aria-label={`Status of ${m.item}`} className="h-8 w-40" value={m.status} onChange={(e) => void setStatus(m, e.target.value as MaterialStatus)}>
                      {Object.values(MaterialStatus).map((s) => <option key={s} value={s}>{MATERIAL_STATUS_LABELS[s]}</option>)}
                    </SelectField>
                  ) : <Badge tone={materialTone(m.status)}>{MATERIAL_STATUS_LABELS[m.status]}</Badge>}
                </TableCell>
                <TableCell>
                  {canEdit && <Button variant="ghost" size="icon" aria-label={`Remove ${m.item}`} onClick={() => void remove(m)}><Trash2 size={15} /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableScroll>
      {canEdit && (
        <div className="flex flex-col gap-3 border-t border-surface-100 p-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Item" className="sm:col-span-2"><Input value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} placeholder="e.g. BBU 6630" /></Field>
            <Field label="BOM qty"><Input inputMode="numeric" value={form.bomQty} onChange={(e) => setForm({ ...form, bomQty: qty(e.target.value) })} /></Field>
            <Field label="Status">
              <SelectField value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as MaterialStatus })}>
                {Object.values(MaterialStatus).map((s) => <option key={s} value={s}>{MATERIAL_STATUS_LABELS[s]}</option>)}
              </SelectField>
            </Field>
            <Field label="Ericsson supplies"><Input inputMode="numeric" value={form.clientSuppliedQty} onChange={(e) => setForm({ ...form, clientSuppliedQty: qty(e.target.value) })} /></Field>
            <Field label="To order"><Input inputMode="numeric" value={form.orderQty} onChange={(e) => setForm({ ...form, orderQty: qty(e.target.value) })} /></Field>
            <Field label="Order / PO"><Input value={form.orderRef} onChange={(e) => setForm({ ...form, orderRef: e.target.value })} /></Field>
            <Field label="ETA"><Input type="date" value={form.eta} onChange={(e) => setForm({ ...form, eta: e.target.value })} /></Field>
          </div>
          <FormError message={error} />
          <div><AsyncButton variant="outline" onClick={() => add()}>Add material line</AsyncButton></div>
        </div>
      )}
    </Card>
  );
}
