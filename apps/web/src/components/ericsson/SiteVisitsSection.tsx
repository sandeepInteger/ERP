import { useState } from "react";
import { MapPin, Route } from "lucide-react";

import { FE_CHECKIN_FAR_METRES } from "@erp/types";
import { AsyncButton } from "../ui/async-button.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Card, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { FormError } from "../ui/field.js";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow, TableScroll } from "../ui/table.js";
import { useApi } from "../../hooks/useApi.js";
import { api, errMsg } from "../../lib/api.js";
import { dateTime } from "../../lib/format.js";

interface Pos { lat: number; lng: number; accuracy: number | null }
interface Point extends Pos { recordedAt: string }
interface VisitRow {
  id: string;
  user: { id: string; name: string | null };
  checkInAt: string; checkIn: Pos; distanceM: number | null; far: boolean;
  checkOutAt: string | null; checkOut: Pos | null; checkOutBy: "FE" | "MANAGER" | "AUTO" | null;
  minutes: number; source: "app" | "browser"; pointCount: number; lastPoint: Point | null;
}

const mapUrl = (p: { lat: number; lng: number }) => `https://www.google.com/maps?q=${p.lat},${p.lng}`;
/** Google Maps directions through the trail (Maps takes up to ~10 stops, so long trails are sampled). */
function routeUrl(points: Point[]): string {
  const step = Math.max(1, Math.ceil(points.length / 10));
  const pick = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  return `https://www.google.com/maps/dir/${pick.map((p) => `${p.lat},${p.lng}`).join("/")}`;
}
const metres = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
const duration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);
const OUT_BY = { FE: "", MANAGER: "closed by a manager", AUTO: "closed automatically" } as const;

function Trail({ visitId }: { visitId: string }) {
  const { data, error } = useApi<Point[]>(`/ericsson/visits/${visitId}/points`);
  if (error) return <FormError message={error} />;
  if (!data) return <p className="text-[13px] text-surface-500">Loading the trail…</p>;
  return (
    <div className="flex flex-col gap-2">
      {data.length > 1 && (
        <a href={routeUrl(data)} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 text-[13px] font-semibold text-brand-600 hover:underline">
          <Route size={15} aria-hidden="true" /> Open the route in Google Maps
        </a>
      )}
      <ol className="flex flex-col gap-1 text-[13px]">
        {data.map((p) => (
          <li key={p.recordedAt} className="flex flex-wrap items-center gap-x-3">
            <span className="tabular-nums">{dateTime(p.recordedAt)}</span>
            <a href={mapUrl(p)} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center text-brand-600 hover:underline">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</a>
            {p.accuracy != null && <span className="text-surface-500">±{Math.round(p.accuracy)} m</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Site "Check-ins" tab (PM, delivery lead, leadership): who is on site now and each FE's visits with their location trail. */
export function SiteVisitsSection({ siteId, hasMapPosition }: { siteId: string; hasMapPosition: boolean }) {
  const { data, error, reload } = useApi<VisitRow[]>(`/ericsson/sites/${siteId}/visits`);
  const [open, setOpen] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const rows = data ?? [];
  const onSite = rows.filter((r) => !r.checkOutAt);

  async function closeVisit(id: string) {
    setActionError(null);
    try {
      await api.post(`/ericsson/visits/${id}/check-out`);
      await reload();
    } catch (e) {
      setActionError(errMsg(e));
      throw e;
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>On site now</CardTitle>
          <CardDescription>
            Field engineers check in and out from their phone. While checked in, their location is shared every few minutes.
            {!hasMapPosition && " Add the site's map position (Overview → Edit) to see how far from the site each check-in was."}
          </CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-3 px-5 pb-5">
          {data && onSite.length === 0 && <p className="text-sm text-surface-500">Nobody is checked in.</p>}
          {onSite.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-surface-200 p-3">
              <div className="min-w-0">
                <div className="font-semibold">{r.user.name}</div>
                <div className="text-[13px] text-surface-500">
                  Since {dateTime(r.checkInAt)} · {duration(r.minutes)}
                  {r.lastPoint && <> · last location {dateTime(r.lastPoint.recordedAt)}</>}
                  {r.source === "browser" && " · browser (shares only while the page is open)"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.lastPoint && (
                  <Button asChild size="sm" variant="secondary">
                    <a href={mapUrl(r.lastPoint)} target="_blank" rel="noreferrer"><MapPin size={14} aria-hidden="true" /> Last location</a>
                  </Button>
                )}
                <AsyncButton size="sm" variant="secondary" onClick={() => closeVisit(r.id)}>Check them out</AsyncButton>
              </div>
            </div>
          ))}
          <FormError message={actionError} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Visits</CardTitle>
          <CardDescription>Check-ins further than {metres(FE_CHECKIN_FAR_METRES)} from the site are flagged.</CardDescription>
        </CardHeader>
        <FormError message={error} />
        <TableScroll>
          <Table stack>
            <TableHeader>
              <TableRow>
                <TableHead>Field engineer</TableHead><TableHead>Checked in</TableHead><TableHead>Checked out</TableHead>
                <TableHead>Time on site</TableHead><TableHead>From site</TableHead><TableHead>Locations</TableHead>
                <TableHead><span className="sr-only">Trail</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data && !error && <TableEmpty colSpan={7}>Loading…</TableEmpty>}
              {data && rows.length === 0 && <TableEmpty colSpan={7}>No check-ins yet.</TableEmpty>}
              {rows.flatMap((r) => [
                <TableRow key={r.id}>
                  <TableCell className="font-semibold">{r.user.name}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <a href={mapUrl(r.checkIn)} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{dateTime(r.checkInAt)}</a>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.checkOutAt
                      ? <>{r.checkOut ? <a href={mapUrl(r.checkOut)} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{dateTime(r.checkOutAt)}</a> : dateTime(r.checkOutAt)}
                        {r.checkOutBy && OUT_BY[r.checkOutBy] && <div className="text-xs text-surface-500">{OUT_BY[r.checkOutBy]}</div>}</>
                      : <Badge tone="success">On site</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{duration(r.minutes)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.distanceM == null ? "—" : r.far ? <Badge tone="warning">{metres(r.distanceM)} away</Badge> : metres(r.distanceM)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.pointCount}
                    <div className="text-xs text-surface-500">{r.source === "app" ? "Android app" : "browser"}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.pointCount > 0 && (
                      <Button size="sm" variant="secondary" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                        {open === r.id ? "Hide trail" : "Show trail"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>,
                ...(open === r.id
                  ? [<TableRow key={`${r.id}-trail`}><TableCell colSpan={7} className="bg-surface-50"><Trail visitId={r.id} /></TableCell></TableRow>]
                  : []),
              ])}
            </TableBody>
          </Table>
        </TableScroll>
      </Card>
    </div>
  );
}
