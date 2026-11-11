import { Link } from "react-router-dom";
import { Camera, FileWarning, NotebookPen } from "lucide-react";

import { ERICSSON_STEPS, EricssonStep, Role } from "@erp/types";
import { Badge } from "../../components/ui/badge.js";
import { Button } from "../../components/ui/button.js";
import { Card } from "../../components/ui/card.js";
import { FormError } from "../../components/ui/field.js";
import { useApi } from "../../hooks/useApi.js";
import { useMe } from "../../context/MeContext.js";
import { CrewToday } from "./CrewToday.js";

export interface FieldSite {
  id: string; siteCode: string; venueName: string; address: string | null; step: EricssonStep; daysInStep: number;
  pmName: string | null; deliveryLeadName: string | null; openChangeRequests: number; loggedToday: boolean;
}
interface Task { key: string; siteId: string; title: string; urgency: "OVERDUE" | "TODAY" | "UPCOMING" }

/** Phone-first start screen. Field crew get their own work list; staff get today's sites. */
export default function FieldTodayPage() {
  const me = useMe();
  return me.role === Role.FIELD_CREW ? <CrewToday /> : <StaffToday />;
}

/** Staff (delivery lead, PM): today's sites, whether the daily log is in, quick actions. */
function StaffToday() {
  const me = useMe();
  const { data: sites, error } = useApi<FieldSite[]>("/field/sites");
  const { data: work } = useApi<{ tasks: Task[] }>("/ericsson/my-work");

  const today = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
  const onSite = sites ?? [];
  const logsDue = onSite.filter((s) => !s.loggedToday).length;
  const otherTasks = (work?.tasks ?? []).filter((t) => t.title !== "Add today's daily log");

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-5">
      <header className="rounded-xl bg-brand-600 px-5 py-5 text-white">
        <div className="text-[13px] opacity-90">{today} · Ericsson IBS</div>
        <h1 className="mt-1 text-2xl font-bold">Hello, {me.firstName}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white/20 px-3 py-1">{onSite.length} {onSite.length === 1 ? "site" : "sites"} on site</span>
          <span className="rounded-full bg-white/20 px-3 py-1">{logsDue} {logsDue === 1 ? "log" : "logs"} due</span>
        </div>
      </header>

      <FormError message={error} />

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-bold">Today's sites</h2>
        {sites && onSite.length === 0 && (
          <Card className="p-5 text-sm text-surface-500">
            No site of yours is in execution or VSS right now.
          </Card>
        )}
        {onSite.map((s) => (
          <Card key={s.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-base font-bold">{s.venueName}</div>
                <div className="text-[13px] text-surface-500">{s.siteCode} · {ERICSSON_STEPS[s.step].short}{s.step === EricssonStep.EXECUTION ? ` · day ${s.daysInStep + 1}` : ""}</div>
                {s.address && <div className="truncate text-[13px] text-surface-500">{s.address}</div>}
              </div>
              {s.loggedToday ? <Badge tone="success">Log in</Badge> : <Badge tone="warning">Log due</Badge>}
            </div>
            {s.openChangeRequests > 0 && <div className="text-[13px] text-[var(--color-warning-fg)]">{s.openChangeRequests} open change {s.openChangeRequests === 1 ? "request" : "requests"}</div>}
            <div className="grid grid-cols-3 gap-2">
              <Button asChild size="lg" className="h-14 flex-col gap-1 px-2 text-xs">
                <Link to={`/field/sites/${s.id}/log`}><NotebookPen size={18} aria-hidden="true" />Daily log</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 flex-col gap-1 px-2 text-xs">
                <Link to={`/field/sites/${s.id}/log#photos`}><Camera size={18} aria-hidden="true" />Photos</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 flex-col gap-1 px-2 text-xs">
                <Link to={`/field/sites/${s.id}/cr`}><FileWarning size={18} aria-hidden="true" />Raise CR</Link>
              </Button>
            </div>
          </Card>
        ))}
      </section>

      {otherTasks.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-bold">Also on your list</h2>
          <Card className="divide-y divide-surface-100">
            {otherTasks.slice(0, 6).map((t) => (
              <Link key={t.key} to={`/ericsson/sites/${t.siteId}`} className="flex min-h-12 items-center gap-3 px-4 py-3 text-sm hover:bg-surface-50">
                <Badge tone={t.urgency === "OVERDUE" ? "error" : t.urgency === "TODAY" ? "warning" : "info"}>{t.urgency === "OVERDUE" ? "Overdue" : t.urgency === "TODAY" ? "Today" : "New"}</Badge>
                <span className="min-w-0 flex-1">{t.title}</span>
              </Link>
            ))}
          </Card>
          <Link to="/my-work" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-600">All my work →</Link>
        </section>
      )}
    </div>
  );
}
