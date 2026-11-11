import { useEffect, useState } from "react";

import { ADMIN_ROLES, ALL_ROLES, ROLE_LABELS, type Role } from "@erp/types";
import { Page, PageHeader } from "../../components/PageHeader.js";
import { AsyncButton } from "../../components/ui/async-button.js";
import { Badge } from "../../components/ui/badge.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card.js";
import { Checkbox } from "../../components/ui/checkbox.js";
import { Field, FormError } from "../../components/ui/field.js";
import { Input, SelectField } from "../../components/ui/input.js";
import { Tabs } from "../../components/ui/tabs.js";
import { useApi } from "../../hooks/useApi.js";
import { useMe } from "../../context/MeContext.js";
import { useToast } from "../../context/ToastContext.js";
import { api, errMsg } from "../../lib/api.js";
import type { UserOption } from "../../lib/ericsson.js";

interface List { id: string; key: string; name: string; frequency: string; description: string; trigger: string; userIds: string[]; emails: string[] }
interface Rule { level: number; afterDays: number; roles: Role[] }
interface Settings { emailEnabled: boolean; lists: List[]; rules: Rule[] }

export default function NotificationsSettingsPage() {
  const me = useMe();
  const toast = useToast();
  const isAdmin = ADMIN_ROLES.has(me.role);
  const [tab, setTab] = useState<"lists" | "escalation">("lists");
  const { data, error, reload } = useApi<Settings>("/settings/notifications?client=ERICSSON");
  const { data: users } = useApi<UserOption[]>("/users");

  async function runJobs() {
    try {
      const { data: s } = await api.post<{ escalations: number; standup: boolean; report: boolean }>("/admin/jobs/run");
      toast(`Jobs ran: ${s.escalations} escalation checks${s.standup ? ", stand-up digest" : ""}${s.report ? ", report reminder" : ""}`);
    } catch (e) { toast(errMsg(e), "error"); throw e; }
  }

  return (
    <Page>
      <PageHeader
        kicker="Admin · Ericsson IBS · SOP Appendix C"
        title="Notifications & escalation"
        description="Who is told about what. Notifications appear under the bell and are emailed when email is set up."
        actions={isAdmin && <AsyncButton variant="outline" onClick={() => runJobs()}>Run scheduled jobs now</AsyncButton>}
      />
      <FormError message={error} />
      {data && !data.emailEnabled && (
        <p className="rounded-lg bg-[var(--color-warning-bg)] px-4 py-3 text-sm text-[var(--color-warning-fg)]">
          Email is not set up on this server (SMTP_HOST), so notifications appear in the app only. Email-only recipients get nothing until it is.
        </p>
      )}

      <Tabs value={tab} onChange={setTab} tabs={[{ value: "lists", label: "Distribution lists" }, { value: "escalation", label: "Escalation" }]} />

      {tab === "lists" && data && users && (
        <div className="flex flex-col gap-4">
          {data.lists.map((l) => <ListCard key={l.id} list={l} users={users} editable={isAdmin} onSaved={reload} />)}
        </div>
      )}
      {tab === "escalation" && data && <EscalationCard rules={data.rules} editable={isAdmin} onSaved={reload} />}
    </Page>
  );
}

function ListCard({ list, users, editable, onSaved }: { list: List; users: UserOption[]; editable: boolean; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [ids, setIds] = useState<string[]>(list.userIds);
  const [emails, setEmails] = useState(list.emails.join(", "));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setIds(list.userIds); setEmails(list.emails.join(", ")); }, [list]);
  const dirty = ids.slice().sort().join() !== list.userIds.slice().sort().join() || emails.trim() !== list.emails.join(", ");

  async function save() {
    const parsed = emails.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
    setError(null);
    try {
      await api.put(`/settings/distribution-lists/${list.id}`, { userIds: ids, emails: parsed });
      toast(`${list.name} saved`);
      await onSaved();
    } catch (e) { setError(errMsg(e)); throw e; }
  }

  const named = users.filter((u) => list.userIds.includes(u.id)).map((u) => `${u.firstName} ${u.lastName}`);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{list.name}</CardTitle>
          <Badge tone="outline">{list.frequency}</Badge>
        </div>
        <CardDescription>Sent: {list.trigger}{list.description ? ` · ${list.description}` : ""}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {editable ? (
          <>
            <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
              {users.map((u) => (
                <Checkbox
                  key={u.id}
                  label={<span>{u.firstName} {u.lastName} <span className="text-surface-500">· {ROLE_LABELS[u.role as Role] ?? u.role}</span></span>}
                  checked={ids.includes(u.id)}
                  onChange={(e) => setIds((cur) => (e.target.checked ? [...cur, u.id] : cur.filter((x) => x !== u.id)))}
                />
              ))}
            </div>
            <Field label="Email-only recipients" hint="People without an ERP login, separated by commas">
              <Input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="name@integertel.com" />
            </Field>
            <FormError message={error} />
            <div><AsyncButton size="sm" disabled={!dirty} onClick={() => save()}>Save</AsyncButton></div>
          </>
        ) : (
          <p className="text-sm">{[...named, ...list.emails].join(", ") || <span className="text-[var(--color-warning-fg)]">No recipients</span>}</p>
        )}
      </CardContent>
    </Card>
  );
}

function EscalationCard({ rules, editable, onSaved }: { rules: Rule[]; editable: boolean; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const [rows, setRows] = useState<Rule[]>(rules);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setRows(rules), [rules]);

  async function save() {
    setError(null);
    try {
      await api.put("/settings/escalation-rules?client=ERICSSON", { rules: rows });
      toast("Escalation saved");
      await onSaved();
    } catch (e) { setError(errMsg(e)); throw e; }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Escalation ladder</CardTitle>
        <CardDescription>
          When a task (from My work) stays overdue this many days, these roles are notified once per level. Delivery roles mean that
          site's own person; leadership and Finance mean everyone with that role. Level 1 also notifies whoever the task is assigned to.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rows.map((r, i) => (
          <div key={r.level} className="grid items-end gap-3 sm:grid-cols-[6rem_9rem_1fr]">
            <div className="pb-2 font-bold">Level {r.level}</div>
            <Field label="After (days overdue)">
              <Input
                inputMode="numeric"
                disabled={!editable}
                value={String(r.afterDays)}
                onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, afterDays: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))}
              />
            </Field>
            <Field label="Notify">
              <SelectField
                disabled={!editable}
                value={r.roles[0] ?? ""}
                onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, roles: [e.target.value as Role] } : x)))}
              >
                {ALL_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
              </SelectField>
            </Field>
          </div>
        ))}
        <p className="text-xs text-[var(--color-warning-fg)]">
          The SOP lists the Sales leader as both level 2 and level 3. This default is PM → Operations leader → Sales leader; confirm with the business.
        </p>
        <FormError message={error} />
        {editable && <div><AsyncButton size="sm" onClick={() => save()}>Save escalation</AsyncButton></div>}
      </CardContent>
    </Card>
  );
}
