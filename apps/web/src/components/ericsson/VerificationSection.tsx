import { useState } from "react";

import { AsyncButton } from "../ui/async-button.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Field, FormError } from "../ui/field.js";
import { Input, Textarea } from "../ui/input.js";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableScroll } from "../ui/table.js";
import { api, errMsg } from "../../lib/api.js";
import { dateTime, fullName } from "../../lib/format.js";
import type { ClientQuery, Discrepancy } from "../../lib/ericsson.js";
import { cn } from "../../lib/utils.js";

const EMPTY = { item: "", sovValue: "", bomValue: "", rfdsValue: "", note: "" };

function DiscrepancyRow({ d, canEdit, onChanged }: { d: Discrepancy; canEdit: boolean; onChanged: () => Promise<void> }) {
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function resolve() {
    if (!resolution.trim()) { setError("Say how it was resolved."); throw new Error("validation"); }
    try {
      await api.post(`/ericsson/discrepancies/${d.id}/resolve`, { resolution });
      await onChanged();
    } catch (e) { setError(errMsg(e)); throw e; }
  }

  async function reopen() {
    await api.post(`/ericsson/discrepancies/${d.id}/reopen`);
    await onChanged();
  }

  return (
    <>
      <TableRow className={cn(!d.isResolved && "bg-[var(--color-error-bg)]/30")}>
        <TableCell className="font-semibold">{d.item}{d.note && <div className="text-xs font-normal text-surface-500">{d.note}</div>}</TableCell>
        <TableCell>{d.sovValue ?? "—"}</TableCell>
        <TableCell>{d.bomValue ?? "—"}</TableCell>
        <TableCell>{d.rfdsValue ?? "—"}</TableCell>
        <TableCell>
          {d.isResolved
            ? <><Badge tone="success">Resolved</Badge><div className="mt-1 text-xs text-surface-500">{d.resolution}</div></>
            : <Badge tone="error">Open</Badge>}
        </TableCell>
        <TableCell className="whitespace-nowrap text-right">
          {canEdit && !d.isResolved && !resolving && <Button size="sm" variant="secondary" onClick={() => setResolving(true)}>Resolve</Button>}
          {canEdit && d.isResolved && <Button size="sm" variant="ghost" onClick={() => void reopen()}>Reopen</Button>}
        </TableCell>
      </TableRow>
      {resolving && (
        <TableRow>
          <TableCell colSpan={6}>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Resolution" className="min-w-64 flex-1">
                <Input value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="e.g. Ericsson confirmed 8 RRUs; BOM reissued" />
              </Field>
              <AsyncButton variant="success" onClick={() => resolve()}>Mark resolved</AsyncButton>
              <Button variant="secondary" onClick={() => setResolving(false)}>Cancel</Button>
            </div>
            <FormError message={error} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/** SOP step 2: SOV / BOM / RFDS comparison and the question thread with the Ericsson PM. */
export function VerificationSection({
  siteId, discrepancies, queries, loops, canEdit, onChanged,
}: {
  siteId: string; discrepancies: Discrepancy[]; queries: ClientQuery[]; loops: number; canEdit: boolean; onChanged: () => Promise<void>;
}) {
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [direction, setDirection] = useState<"OUTBOUND" | "INBOUND">("OUTBOUND");
  const [msgError, setMsgError] = useState<string | null>(null);
  const open = discrepancies.filter((d) => !d.isResolved).length;

  async function addDiscrepancy() {
    if (!form.item.trim()) { setFormError("Name the item that doesn't match."); throw new Error("validation"); }
    setFormError(null);
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
    try {
      await api.post(`/ericsson/sites/${siteId}/discrepancies`, body);
      setForm(EMPTY);
      await onChanged();
    } catch (e) { setFormError(errMsg(e)); throw e; }
  }

  async function addMessage() {
    if (!message.trim()) { setMsgError("Write the message first."); throw new Error("validation"); }
    setMsgError(null);
    try {
      await api.post(`/ericsson/sites/${siteId}/client-queries`, { direction, body: message.trim() });
      setMessage("");
      await onChanged();
    } catch (e) { setMsgError(errMsg(e)); throw e; }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>SOV · BOM · RFDS comparison</CardTitle>
            <div className="flex gap-2">
              <Badge tone={open ? "error" : "success"}>{open} open</Badge>
              <Badge tone="outline">{loops} {loops === 1 ? "loop" : "loops"} with Ericsson PM</Badge>
            </div>
          </div>
          <CardDescription>Flag every line where the three documents disagree. The SOV can't be accepted while any are open.</CardDescription>
        </CardHeader>
        <TableScroll>
          <Table stack>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead><TableHead>SOV</TableHead><TableHead>BOM</TableHead><TableHead>RFDS</TableHead>
                <TableHead>Status</TableHead><TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {discrepancies.length === 0 && <TableEmpty colSpan={6}>No discrepancies flagged.</TableEmpty>}
              {discrepancies.map((d) => <DiscrepancyRow key={d.id} d={d} canEdit={canEdit} onChanged={onChanged} />)}
            </TableBody>
          </Table>
        </TableScroll>
        {canEdit && (
          <div className="flex flex-col gap-3 border-t border-surface-100 p-5">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
              <Field label="Item"><Input value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} placeholder="e.g. Remote radio units" /></Field>
              <Field label="SOV says"><Input value={form.sovValue} onChange={(e) => setForm({ ...form, sovValue: e.target.value })} /></Field>
              <Field label="BOM says"><Input value={form.bomValue} onChange={(e) => setForm({ ...form, bomValue: e.target.value })} /></Field>
              <Field label="RFDS says"><Input value={form.rfdsValue} onChange={(e) => setForm({ ...form, rfdsValue: e.target.value })} /></Field>
            </div>
            <Field label="Note (optional)"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            <FormError message={formError} />
            <div><AsyncButton variant="outline" onClick={() => addDiscrepancy()}>Flag discrepancy</AsyncButton></div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Questions to the Ericsson PM</CardTitle>
          <CardDescription>Log what was sent and what came back. Each message sent counts as a verification loop.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {queries.length === 0 && <p className="text-sm text-surface-500">No messages yet.</p>}
          {queries.map((q) => (
            <div key={q.id} className={cn("rounded-lg px-4 py-3", q.direction === "OUTBOUND" ? "bg-surface-100" : "bg-[var(--color-info-bg)]")}>
              <div className="text-xs text-surface-500">
                <span className="font-semibold text-surface-800">{q.direction === "OUTBOUND" ? `${fullName(q.author)} → Ericsson PM` : "Ericsson PM (logged by " + fullName(q.author) + ")"}</span> · {dateTime(q.createdAt)}
              </div>
              <div className="mt-1 whitespace-pre-line text-sm">{q.body}</div>
            </div>
          ))}
          {canEdit && (
            <div className="flex flex-col gap-2 border-t border-surface-100 pt-4">
              <div className="flex gap-2">
                <Button size="sm" variant={direction === "OUTBOUND" ? "default" : "secondary"} onClick={() => setDirection("OUTBOUND")}>Sent to Ericsson</Button>
                <Button size="sm" variant={direction === "INBOUND" ? "default" : "secondary"} onClick={() => setDirection("INBOUND")}>Reply received</Button>
              </div>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={direction === "OUTBOUND" ? "Questions sent to the Ericsson PM" : "What the Ericsson PM answered"} />
              <FormError message={msgError} />
              <div><AsyncButton variant="outline" onClick={() => addMessage()}>Log message</AsyncButton></div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
