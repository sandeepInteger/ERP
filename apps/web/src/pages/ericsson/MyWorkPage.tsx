import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, Inbox, ListChecks } from "lucide-react";

import { LEADERSHIP_ROLES, ROLE_LABELS, Role, type Role as RoleT } from "@erp/types";
import { Page, PageHeader } from "../../components/PageHeader.js";
import { SummaryStatCard } from "../../components/SummaryStatCard.js";
import { Badge, type BadgeTone } from "../../components/ui/badge.js";
import { Button } from "../../components/ui/button.js";
import { Card } from "../../components/ui/card.js";
import { Field, FormError } from "../../components/ui/field.js";
import { SelectField } from "../../components/ui/input.js";
import { useApi } from "../../hooks/useApi.js";
import { useMe } from "../../context/MeContext.js";
import type { UserOption } from "../../lib/ericsson.js";

interface Task {
  key: string; siteId: string; siteCode: string; venueName: string; title: string; detail: string;
  tab: string; ageDays: number; urgency: "OVERDUE" | "TODAY" | "UPCOMING"; escalation: boolean;
}
interface MyWork { userId: string; tasks: Task[]; unassigned: { id: string; siteCode: string }[] }

const URGENCY: Record<Task["urgency"], { label: string; tone: BadgeTone }> = {
  OVERDUE: { label: "Overdue", tone: "error" },
  TODAY: { label: "Today", tone: "warning" },
  UPCOMING: { label: "New", tone: "info" },
};

export default function MyWorkPage() {
  const me = useMe();
  const canSwitch = LEADERSHIP_ROLES.has(me.role) || me.role === Role.PROJECT_MANAGER;
  const [userId, setUserId] = useState(me.id);
  const { data: users } = useApi<UserOption[]>(canSwitch ? "/users" : null);
  const { data, error, loading } = useApi<MyWork>(`/ericsson/my-work${userId !== me.id ? `?userId=${userId}` : ""}`);

  const tasks = data?.tasks ?? [];
  const own = tasks.filter((t) => !t.escalation);
  const escalations = tasks.filter((t) => t.escalation);
  const viewing = users?.find((u) => u.id === userId);

  return (
    <Page>
      <PageHeader
        kicker="Ericsson IBS"
        title="My work"
        description="Your next tasks on the sites you're assigned to, worked out from each site's step and the RACI."
        actions={canSwitch && users && (
          <Field label="Showing work for" className="w-64">
            <SelectField value={userId} onChange={(e) => setUserId(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === me.id ? "Me" : `${u.firstName} ${u.lastName}`} · {ROLE_LABELS[u.role as RoleT] ?? u.role}
                </option>
              ))}
            </SelectField>
          </Field>
        )}
      />
      <FormError message={error} />

      <section className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4">
        <SummaryStatCard icon={ListChecks} label="Open tasks" value={data ? own.length : "–"} />
        <SummaryStatCard icon={AlertTriangle} label="Overdue" value={data ? own.filter((t) => t.urgency === "OVERDUE").length : "–"} caption="3+ days old" />
        <SummaryStatCard icon={CalendarClock} label="Today" value={data ? own.filter((t) => t.urgency === "TODAY").length : "–"} />
        {LEADERSHIP_ROLES.has(viewing?.role ?? me.role) && (
          <SummaryStatCard icon={Inbox} label="Escalations" value={data ? escalations.length : "–"} caption="Overdue on any site" />
        )}
      </section>

      {data && data.unassigned.length > 0 && LEADERSHIP_ROLES.has(me.role) && (
        <p className="rounded-lg bg-[var(--color-warning-bg)] px-4 py-3 text-sm text-[var(--color-warning-fg)]">
          Nobody gets tasks on {data.unassigned.map((s) => s.siteCode).join(", ")}: a PM, Associate PM or Delivery lead is not assigned.
        </p>
      )}

      <TaskList title={viewing && viewing.id !== me.id ? `${viewing.firstName}'s tasks` : "Your tasks"} tasks={own} loading={loading && !data} empty="Nothing waiting on you." />
      {escalations.length > 0 && <TaskList title="Escalations: overdue on other people's sites" tasks={escalations} empty="" />}
    </Page>
  );
}

function TaskList({ title, tasks, loading, empty }: { title: string; tasks: Task[]; loading?: boolean; empty: string }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[15px] font-bold">{title}</h2>
      <Card className="overflow-hidden">
        {loading && <p className="p-6 text-center text-sm text-surface-500">Loading…</p>}
        {!loading && tasks.length === 0 && <p className="p-6 text-center text-sm text-surface-500">{empty}</p>}
        <ul className="divide-y divide-surface-100">
          {tasks.map((t) => (
            <li key={t.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
              <Badge tone={URGENCY[t.urgency].tone} className="w-24 justify-center">{URGENCY[t.urgency].label}{t.ageDays > 0 ? ` · ${t.ageDays} d` : ""}</Badge>
              <div className="min-w-0 flex-[1_1_320px]">
                <div className="font-semibold">{t.title}</div>
                <div className="text-[13px] text-surface-500">
                  <Link to={`/ericsson/sites/${t.siteId}`} className="font-semibold text-brand-600 hover:underline">{t.siteCode}</Link> · {t.venueName} · {t.detail}
                </div>
              </div>
              <Button asChild size="sm">
                <Link to={`/ericsson/sites/${t.siteId}${t.tab === "overview" ? "" : `?tab=${t.tab}`}`}>Open</Link>
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
