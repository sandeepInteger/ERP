import { useState } from "react";

import { WORK_STATUS_LABELS, WorkItemStatus } from "@erp/types";
import { AsyncButton } from "../ui/async-button.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Field, FieldGrid, FormError } from "../ui/field.js";
import { Input, SelectField, Textarea } from "../ui/input.js";
import { api, errMsg } from "../../lib/api.js";
import { date, dateTime, fullName, todayIso } from "../../lib/format.js";
import { workTone, type Person, type WorkItem } from "../../lib/ericsson.js";
import { useToast } from "../../context/ToastContext.js";

/** Site "Crew work" tab: assign work to field crew members and follow their own updates. */
export function CrewWorkSection({
  siteId, items, crew, canEdit, closed, onChanged,
}: { siteId: string; items: WorkItem[]; crew: Person[]; canEdit: boolean; closed: boolean; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: "", assigneeId: "", dueDate: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const open = items.filter((i) => i.status !== WorkItemStatus.DONE).length;
  const hours = items.reduce((n, i) => n + i.updates.reduce((m, u) => m + Number(u.hours), 0), 0);
  const today = todayIso();

  async function add() {
    if (!form.title.trim() || !form.assigneeId) { setError("Give the work a title and pick who does it."); throw new Error("validation"); }
    setError(null);
    try {
      await api.post(`/ericsson/sites/${siteId}/work-items`, {
        title: form.title.trim(), assigneeId: form.assigneeId,
        ...(form.dueDate ? { dueDate: form.dueDate } : {}), ...(form.description.trim() ? { description: form.description.trim() } : {}),
      });
      toast("Work assigned");
      setForm({ title: "", assigneeId: form.assigneeId, dueDate: "", description: "" });
      await onChanged();
    } catch (e) { setError(errMsg(e)); throw e; }
  }

  async function reassign(item: WorkItem, assigneeId: string) {
    try {
      await api.patch(`/ericsson/work-items/${item.id}`, { assigneeId });
      await onChanged();
    } catch (e) { toast(errMsg(e), "error"); }
  }

  async function cancel(item: WorkItem) {
    if (!window.confirm(`Cancel "${item.title}"?`)) return;
    try {
      await api.post(`/field/work-items/${item.id}/updates`, { status: WorkItemStatus.CANCELLED, hours: 0, note: "Cancelled by the PM / delivery lead" });
      await onChanged();
    } catch (e) { toast(errMsg(e), "error"); }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge tone={open ? "warning" : "success"}>{open} open</Badge>
        <Badge tone="outline">{items.length - open} done</Badge>
        <Badge tone="outline">{hours} crew hours logged</Badge>
        <span className="text-surface-500">The SOW can't be marked complete until every item is done.</span>
      </div>

      {items.length === 0 && <p className="text-sm text-surface-500">No crew work assigned yet.</p>}
      {items.map((i) => {
        const overdue = i.dueDate && i.status !== WorkItemStatus.DONE && i.dueDate.slice(0, 10) < today;
        return (
          <Card key={i.id}>
            <CardContent className="flex flex-col gap-3 pt-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold">{i.title}</div>
                  <div className="text-[13px] text-surface-500">
                    {fullName(i.assignee)}
                    {i.dueDate && <> · <span className={overdue ? "font-semibold text-[var(--color-error-fg)]" : ""}>due {date(i.dueDate)}{overdue ? " (overdue)" : ""}</span></>}
                    {i.completedAt && <> · done {date(i.completedAt)}</>}
                  </div>
                  {i.description && <p className="mt-1 whitespace-pre-line text-sm">{i.description}</p>}
                </div>
                <Badge tone={workTone(i.status)}>{WORK_STATUS_LABELS[i.status]}</Badge>
              </div>
              {i.updates.length > 0 ? (
                <ul className="flex flex-col gap-1.5 border-l-2 border-surface-200 pl-3">
                  {i.updates.map((u) => (
                    <li key={u.id} className="text-[13px]">
                      <span className="text-surface-500">{dateTime(u.createdAt)} · {fullName(u.user)} · {Number(u.hours)} hrs · </span>
                      <span className="font-semibold">{WORK_STATUS_LABELS[u.status]}</span>
                      {u.photoCount > 0 && <span className="text-surface-500"> · {u.photoCount} {u.photoCount === 1 ? "photo" : "photos"}</span>}
                      {u.note && <div className="whitespace-pre-line">{u.note}</div>}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[13px] text-surface-500">No updates from {i.assignee.firstName} yet.</p>}
              {canEdit && i.status !== WorkItemStatus.DONE && (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Reassign to" className="w-56">
                    <SelectField className="h-8" value={i.assigneeId} onChange={(e) => void reassign(i, e.target.value)}>
                      {crew.map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
                    </SelectField>
                  </Field>
                  <Button size="sm" variant="secondary" onClick={() => void cancel(i)}>Cancel work</Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {canEdit && !closed && (
        <Card>
          <CardHeader>
            <CardTitle>Assign work</CardTitle>
            <CardDescription>
              {crew.length ? "Each field engineer sees their work on their phone and updates it themselves." : "Add field engineers to this site first (Overview → Field engineers)."}
            </CardDescription>
          </CardHeader>
          {crew.length > 0 && (
            <CardContent className="flex flex-col gap-3">
              <FieldGrid>
                <Field label="What needs doing"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Mount antennas, level 2" /></Field>
                <Field label="Who">
                  <SelectField value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
                    <option value="">Choose a field engineer…</option>
                    {crew.map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}
                  </SelectField>
                </Field>
                <Field label="Due (optional)"><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
              </FieldGrid>
              <Field label="Details (optional)"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              <FormError message={error} />
              <div><AsyncButton onClick={() => add()}>Assign work</AsyncButton></div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
