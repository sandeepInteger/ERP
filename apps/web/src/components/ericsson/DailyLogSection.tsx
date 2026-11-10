import { useState } from "react";

import { AsyncButton } from "../ui/async-button.js";
import { Badge } from "../ui/badge.js";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { Checkbox } from "../ui/checkbox.js";
import { Field, FormError } from "../ui/field.js";
import { Input, Textarea } from "../ui/input.js";
import { api, errMsg } from "../../lib/api.js";
import { date, fullName, todayIso } from "../../lib/format.js";
import type { DailyLog } from "../../lib/ericsson.js";

/** SOP step 5: what got done each day, crew and hours, and anything that blocked work. */
export function DailyLogSection({
  siteId, logs, canEdit, onChanged,
}: { siteId: string; logs: DailyLog[]; canEdit: boolean; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState({ workDate: todayIso(), summary: "", crewCount: "4", hoursEach: "8", blocked: false, blockerNote: "" });
  const [error, setError] = useState<string | null>(null);
  const totalHours = logs.reduce((s, l) => s + l.crewCount * Number(l.hoursEach), 0);

  async function add() {
    if (!form.summary.trim()) { setError("Say what got done today."); throw new Error("validation"); }
    setError(null);
    try {
      await api.post(`/ericsson/sites/${siteId}/daily-logs`, {
        workDate: form.workDate,
        summary: form.summary.trim(),
        crewCount: Number(form.crewCount),
        hoursEach: Number(form.hoursEach),
        blocked: form.blocked,
        ...(form.blocked && form.blockerNote.trim() ? { blockerNote: form.blockerNote.trim() } : {}),
      });
      setForm({ ...form, summary: "", blocked: false, blockerNote: "" });
      await onChanged();
    } catch (e) { setError(errMsg(e)); throw e; }
  }

  return (
    <div className="flex flex-col gap-5">
      {canEdit && (
        <Card>
          <CardHeader><CardTitle>Add today's log</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Date"><Input type="date" value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} /></Field>
              <Field label="Crew on site"><Input inputMode="numeric" value={form.crewCount} onChange={(e) => setForm({ ...form, crewCount: e.target.value.replace(/[^\d]/g, "") })} /></Field>
              <Field label="Hours each"><Input inputMode="decimal" value={form.hoursEach} onChange={(e) => setForm({ ...form, hoursEach: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
            </div>
            <Field label="What got done"><Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
            <Checkbox label="Something blocked work today" checked={form.blocked} onChange={(e) => setForm({ ...form, blocked: e.target.checked })} />
            {form.blocked && (
              <Field label="What blocked it" hint="If this pushes work past the SOV estimate, raise a change request.">
                <Input value={form.blockerNote} onChange={(e) => setForm({ ...form, blockerNote: e.target.value })} />
              </Field>
            )}
            <FormError message={error} />
            <div><AsyncButton onClick={() => add()}>Submit log</AsyncButton></div>
          </CardContent>
        </Card>
      )}

      <div className="text-sm text-surface-500">{logs.length} {logs.length === 1 ? "log" : "logs"} · {totalHours} labor hours in total</div>
      {logs.map((l) => (
        <Card key={l.id}>
          <CardContent className="flex flex-col gap-1.5 pt-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{date(l.workDate)}</span>
              <span className="text-xs text-surface-500">{fullName(l.author)} · crew of {l.crewCount} · {l.crewCount * Number(l.hoursEach)} labor hrs</span>
              {l.blocked && <Badge tone="warning">Blocked</Badge>}
            </div>
            <p className="whitespace-pre-line text-sm">{l.summary}</p>
            {l.blocked && l.blockerNote && <p className="text-[13px] text-[var(--color-warning-fg)]">{l.blockerNote}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
