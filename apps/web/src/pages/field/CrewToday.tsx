import { Link } from "react-router-dom";
import { FileWarning } from "lucide-react";

import { WORK_STATUS_LABELS, WorkItemStatus } from "@erp/types";
import { Badge } from "../../components/ui/badge.js";
import { Button } from "../../components/ui/button.js";
import { Card } from "../../components/ui/card.js";
import { FormError } from "../../components/ui/field.js";
import { useApi } from "../../hooks/useApi.js";
import { useMe } from "../../context/MeContext.js";
import { date, todayIso } from "../../lib/format.js";
import { workTone } from "../../lib/ericsson.js";
import { cn } from "../../lib/utils.js";

interface MyWorkItem {
  id: string; title: string; description: string | null; status: WorkItemStatus; dueDate: string | null;
  site: { id: string; siteCode: string; venueName: string; address: string | null };
  hoursToday: number; updatedToday: boolean;
  lastUpdate: { status: WorkItemStatus; note: string | null; hours: string; createdAt: string } | null;
}

/** A field crew member's start screen: their own assigned work, grouped by site. */
export function CrewToday() {
  const me = useMe();
  const { data, error } = useApi<MyWorkItem[]>("/field/my-work");
  const items = data ?? [];
  const open = items.filter((i) => i.status !== WorkItemStatus.DONE);
  const hoursToday = items.reduce((n, i) => n + i.hoursToday, 0);
  const today = todayIso();

  const bySite = new Map<string, { site: MyWorkItem["site"]; items: MyWorkItem[] }>();
  for (const i of items) {
    const g = bySite.get(i.site.id) ?? { site: i.site, items: [] };
    g.items.push(i);
    bySite.set(i.site.id, g);
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-5">
      <header className="rounded-xl bg-brand-600 px-5 py-5 text-white">
        <div className="text-[13px] opacity-90">{new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })} · Ericsson IBS</div>
        <h1 className="mt-1 text-2xl font-bold">Hello, {me.firstName}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white/20 px-3 py-1">{open.length} open {open.length === 1 ? "task" : "tasks"}</span>
          <span className="rounded-full bg-white/20 px-3 py-1">{hoursToday} hrs logged today</span>
        </div>
      </header>

      <FormError message={error} />
      {data && items.length === 0 && (
        <Card className="p-5 text-sm text-surface-500">No work assigned to you right now. Your PM or delivery lead assigns it on the site.</Card>
      )}

      {[...bySite.values()].map(({ site, items: list }) => (
        <section key={site.id} className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold">{site.venueName}</h2>
              <div className="truncate text-[13px] text-surface-500">{site.siteCode}{site.address ? ` · ${site.address}` : ""}</div>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link to={`/field/sites/${site.id}/cr`}><FileWarning size={15} aria-hidden="true" />Raise CR</Link>
            </Button>
          </div>
          {list.map((i) => {
            const overdue = i.dueDate && i.status !== WorkItemStatus.DONE && i.dueDate.slice(0, 10) < today;
            return (
              <Card key={i.id} className={cn("flex flex-col gap-2 p-4", i.status === WorkItemStatus.DONE && "opacity-70")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 font-semibold">{i.title}</div>
                  <Badge tone={workTone(i.status)}>{WORK_STATUS_LABELS[i.status]}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-3 text-[13px] text-surface-500">
                  {i.dueDate && <span className={cn(overdue && "font-semibold text-[var(--color-error-fg)]")}>Due {date(i.dueDate)}{overdue ? " · overdue" : ""}</span>}
                  {i.updatedToday ? <span>Updated today · {i.hoursToday} hrs</span> : <span>Not updated today</span>}
                </div>
                {i.lastUpdate?.note && <p className="line-clamp-2 text-[13px]">{i.lastUpdate.note}</p>}
                {i.status !== WorkItemStatus.DONE && (
                  <Button asChild size="lg" className="mt-1 w-full"><Link to={`/field/work/${i.id}`}>Update</Link></Button>
                )}
              </Card>
            );
          })}
        </section>
      ))}
    </div>
  );
}
