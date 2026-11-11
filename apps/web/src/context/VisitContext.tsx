import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, errMsg } from "../lib/api.js";
import { currentPosition, flush, isAndroidApp, startTracking, stopTracking } from "../lib/tracker.js";

// A field engineer's site visit (check in / check out). Mounted for FEs only (AppShell). While a visit
// is open it keeps location sharing running — also after the app was closed or the phone restarted.

export interface Visit {
  id: string;
  site: { id: string; siteCode: string; venueName: string };
  checkInAt: string;
  distanceM: number | null;
  far: boolean;
  checkOutAt: string | null;
  minutes: number;
  source: "app" | "browser";
  pointCount: number;
  lastPoint: { recordedAt: string } | null;
}

interface Current { intervalSeconds: number; consentAt: string | null; visit: Visit | null }

interface VisitState extends Partial<Current> {
  loaded: boolean;
  /** Takes a location reading and checks in. `consent` must be true the first time. */
  checkIn: (siteId: string, consent: boolean) => Promise<Visit>;
  checkOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const VisitContext = createContext<VisitState | null>(null);

export function VisitProvider({ children }: { children: ReactNode }) {
  const [cur, setCur] = useState<Current | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await api.get<Current>("/field/visits/current");
    setCur(data);
    if (data.visit) await startTracking(data.visit.id, data.intervalSeconds).catch(() => undefined);
    else await stopTracking().catch(() => undefined);
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
    // Back from the background (or the network came back): upload what the phone buffered.
    const wake = () => { if (document.visibilityState === "visible") void flush(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [refresh]);

  const checkIn = useCallback(async (siteId: string, consent: boolean) => {
    const pos = await currentPosition();
    let data: { visit: Visit; intervalSeconds: number };
    try {
      ({ data } = await api.post<{ visit: Visit; intervalSeconds: number }>(`/field/sites/${siteId}/check-in`, {
        ...pos, consent, source: isAndroidApp() ? "app" : "browser",
      }));
    } catch (e) {
      throw new Error(errMsg(e));
    }
    setCur((c) => ({ intervalSeconds: data.intervalSeconds, consentAt: c?.consentAt ?? new Date().toISOString(), visit: data.visit }));
    try {
      await startTracking(data.visit.id, data.intervalSeconds);
    } catch (e) {
      throw new Error(`You're checked in, but location sharing couldn't start: ${errMsg(e)} Allow location and notifications for Integer ERP, then reopen the app.`);
    }
    return data.visit;
  }, []);

  const checkOut = useCallback(async () => {
    const visit = cur?.visit;
    if (!visit) return;
    // A final reading if we can get one quickly; checking out never waits on GPS for long.
    const pos = await currentPosition(10_000).catch(() => null);
    try {
      await flush();
      await api.post(`/field/visits/${visit.id}/check-out`, pos ?? {});
    } catch (e) {
      throw new Error(errMsg(e));
    }
    await stopTracking().catch(() => undefined);
    setCur((c) => (c ? { ...c, visit: null } : c));
  }, [cur?.visit]);

  const value = useMemo<VisitState>(() => ({ loaded: cur !== null, ...(cur ?? {}), checkIn, checkOut, refresh }), [cur, checkIn, checkOut, refresh]);
  return <VisitContext.Provider value={value}>{children}</VisitContext.Provider>;
}

/** The FE's visit state. Null outside VisitProvider (staff). */
export function useVisit(): VisitState | null {
  return useContext(VisitContext);
}
