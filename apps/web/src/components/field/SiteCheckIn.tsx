import { useEffect, useState } from "react";
import { LogIn, LogOut, MapPin, ShieldCheck } from "lucide-react";

import { AsyncButton } from "../ui/async-button.js";
import { Button } from "../ui/button.js";
import { Card } from "../ui/card.js";
import { FormError } from "../ui/field.js";
import { useApi } from "../../hooks/useApi.js";
import { useVisit } from "../../context/VisitContext.js";
import { isAndroidApp } from "../../lib/tracker.js";
import { cn } from "../../lib/utils.js";

interface MySite { id: string; siteCode: string; venueName: string; address: string | null }

function sinceText(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  const h = Math.floor(mins / 60);
  return h ? `${h} h ${mins % 60} min` : `${mins} min`;
}

/** "10 minutes", "1 minute", "30 seconds". */
function every(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const m = Math.round(seconds / 60);
  return m === 1 ? "minute" : `${m} minutes`;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Top of the FE's phone screen: Check in at one of their sites, or — while checked in — Check out. */
export function SiteCheckIn() {
  const v = useVisit();
  const { data: sites } = useApi<MySite[]>("/field/sites?all=true");
  const [error, setError] = useState<string | null>(null);
  const [askConsentFor, setAskConsentFor] = useState<MySite | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  if (!v?.loaded) return null;
  const interval = every(v.intervalSeconds ?? 600);
  const app = isAndroidApp();

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }

  // Checked in: who / where / since when, and Check out.
  if (v.visit) {
    const visit = v.visit;
    return (
      <Card className="flex flex-col gap-3 border-[var(--color-success-fg)]/40 bg-[var(--color-success-bg)] p-4">
        <div className="flex items-start gap-3">
          <MapPin size={20} className="mt-0.5 shrink-0 text-[var(--color-success-fg)]" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[var(--color-success-fg)]">Checked in</div>
            <div className="truncate text-base font-bold text-surface-900">{visit.site.venueName}</div>
            <div className="text-[13px] text-surface-600">
              {visit.site.siteCode} · since {time(visit.checkInAt)} ({sinceText(visit.checkInAt, now)})
            </div>
          </div>
        </div>
        {visit.far && (
          <p className="rounded-md bg-[var(--color-warning-bg)] px-3 py-2 text-[13px] text-[var(--color-warning-fg)]">
            You checked in {visit.distanceM != null && visit.distanceM >= 1000 ? `${(visit.distanceM / 1000).toFixed(1)} km` : `${visit.distanceM} m`} from the site. Your PM can see this.
          </p>
        )}
        <p className="text-[13px] text-surface-600">
          {app
            ? `Your location is shared every ${interval} until you check out, even with the screen off.`
            : `Your location is shared every ${interval} while this page is open. Install the Integer ERP Android app to share it in the background.`}
        </p>
        <FormError message={error} />
        <AsyncButton size="lg" variant="destructive" className="w-full" onClick={() => run(() => v.checkOut())}>
          <LogOut size={18} aria-hidden="true" /> Check out
        </AsyncButton>
      </Card>
    );
  }

  // First check-in ever: explain what is shared and ask once.
  if (askConsentFor) {
    const site = askConsentFor;
    return (
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2 text-base font-bold"><ShieldCheck size={20} aria-hidden="true" /> Location sharing</div>
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-surface-700">
          <li>When you check in, your location is recorded, then every {interval} until you check out.</li>
          <li>Nothing is recorded when you're not checked in.</li>
          <li>Only your PM, delivery lead and operations leadership can see it.</li>
          <li>If you forget to check out, it stops automatically after 14 hours.</li>
        </ul>
        <FormError message={error} />
        <AsyncButton size="lg" className="w-full" onClick={() => run(async () => { await v.checkIn(site.id, true); setAskConsentFor(null); })}>
          I agree, check in at {site.siteCode}
        </AsyncButton>
        <Button variant="secondary" size="lg" className="w-full" onClick={() => { setAskConsentFor(null); setError(null); }}>Cancel</Button>
      </Card>
    );
  }

  const list = sites ?? [];
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <div className="text-base font-bold">Site check-in</div>
        <div className="text-[13px] text-surface-500">Check in when you arrive on site and check out when you leave.</div>
      </div>
      {sites && list.length === 0 && <p className="text-[13px] text-surface-500">You're not on any open site yet.</p>}
      {list.map((s) => (
        <div key={s.id} className={cn("flex items-center justify-between gap-3 border-t border-surface-100 pt-3")}>
          <div className="min-w-0">
            <div className="truncate font-semibold">{s.venueName}</div>
            <div className="truncate text-[13px] text-surface-500">{s.siteCode}{s.address ? ` · ${s.address}` : ""}</div>
          </div>
          <AsyncButton
            size="lg"
            className="shrink-0"
            onClick={() => (v.consentAt ? run(() => v.checkIn(s.id, false)) : Promise.resolve(setAskConsentFor(s)))}
          >
            <LogIn size={18} aria-hidden="true" /> Check in
          </AsyncButton>
        </div>
      ))}
      <FormError message={error} />
    </Card>
  );
}
