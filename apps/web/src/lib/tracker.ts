import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

import { api } from "./api.js";

// Location sharing while a field engineer is checked in to a site.
//
// - In the Integer ERP Android app (apps/mobile), the native SiteTracker plugin runs a foreground
//   service that takes one reading every `intervalSeconds`, even with the screen locked, and buffers the
//   readings on the phone. We drain that buffer whenever the app is awake and upload it.
// - In a normal browser we can only read location while the page is open, so we take a reading on a timer.
//
// Every reading goes through a small offline queue (localStorage), so readings taken without signal are
// uploaded later; the API accepts late readings that fall inside the visit.

export interface Reading { visitId: string; lat: number; lng: number; accuracy?: number | undefined; recordedAt: string }

interface SiteTrackerPlugin {
  /** One accurate reading (asks for location permission the first time). */
  getCurrentPosition(options: { timeoutMs: number }): Promise<{ lat: number; lng: number; accuracy?: number }>;
  start(options: { visitId: string; intervalSeconds: number; title: string; text: string }): Promise<void>;
  stop(): Promise<void>;
  /** Readings buffered by the native service since the last drain (removed from the phone's buffer). */
  drain(): Promise<{ points: Reading[] }>;
  status(): Promise<{ running: boolean; visitId: string | null }>;
  addListener(event: "location", fn: (r: Reading) => void): Promise<PluginListenerHandle>;
}

const SiteTracker = registerPlugin<SiteTrackerPlugin>("SiteTracker");

/** True inside the Android app (background tracking available). */
export function isAndroidApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("SiteTracker");
}

// ─── Offline queue ──────────────────────────────────────────────────────────

const QUEUE_KEY = "erp-location-queue";
const MAX_QUEUE = 2_000;

function readQueue(): Reading[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(v) ? (v as Reading[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(q: Reading[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)));
  } catch {
    /* storage full or blocked: readings stay in memory only for this flush */
  }
}

function enqueue(points: Reading[]) {
  if (points.length) writeQueue([...readQueue(), ...points]);
}

let flushing: Promise<void> | null = null;

/** Uploads queued readings, grouped by visit. Keeps them on network / server errors; drops ones the API rejects.
 *  One upload at a time; calls made meanwhile share it. */
export function flush(): Promise<void> {
  if (flushing) return flushing;
  // .finally runs after the assignment even when the upload finishes synchronously (empty queue).
  flushing = upload().finally(() => { flushing = null; });
  return flushing;
}

async function upload(): Promise<void> {
  if (isAndroidApp()) enqueue((await SiteTracker.drain()).points);
  const byVisit = new Map<string, Reading[]>();
  for (const r of readQueue()) byVisit.set(r.visitId, [...(byVisit.get(r.visitId) ?? []), r]);
  for (const [visitId, list] of byVisit) {
    for (let i = 0; i < list.length; i += 200) {
      const batch = list.slice(i, i + 200);
      try {
        await api.post(`/field/visits/${visitId}/points`, {
          points: batch.map((r) => ({ lat: r.lat, lng: r.lng, ...(r.accuracy != null ? { accuracy: r.accuracy } : {}), recordedAt: r.recordedAt })),
        });
      } catch (e) {
        const status = (e as { response?: { status?: number } }).response?.status;
        if (status === undefined || status >= 500 || status === 401 || status === 408 || status === 429) return; // try again later
      }
      const sent = new Set(batch.map((r) => `${r.visitId}|${r.recordedAt}`));
      writeQueue(readQueue().filter((r) => !sent.has(`${r.visitId}|${r.recordedAt}`)));
    }
  }
}

// ─── One reading (check in / check out) ─────────────────────────────────────

export interface Position { lat: number; lng: number; accuracy?: number | undefined }

/** A fresh, accurate reading. Rejects with a readable message when location is off or not allowed. */
export function currentPosition(timeoutMs = 20_000): Promise<Position> {
  if (isAndroidApp()) {
    return SiteTracker.getCurrentPosition({ timeoutMs }).then(
      (p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy }),
      (e: unknown) => { throw new Error(e instanceof Error ? e.message : "Couldn't get your location"); },
    );
  }
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This device can't share its location"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (err) => reject(new Error(
        err.code === err.PERMISSION_DENIED
          ? "Location is blocked for Integer ERP. Allow location in your phone's settings, then try again."
          : err.code === err.TIMEOUT
            ? "Couldn't get your location in time. Move to open sky or near a window and try again."
            : "Couldn't get your location. Check that location (GPS) is turned on.",
      )),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

// ─── Tracking while checked in ──────────────────────────────────────────────

let browserTimer: number | null = null;
let listener: PluginListenerHandle | null = null;
let trackingVisit: string | null = null;

/** Starts (or keeps) sharing location for this visit. Safe to call repeatedly. */
export async function startTracking(visitId: string, intervalSeconds: number): Promise<void> {
  if (isAndroidApp()) {
    const s = await SiteTracker.status();
    if (!s.running || s.visitId !== visitId) {
      await SiteTracker.start({
        visitId,
        intervalSeconds,
        title: "Checked in · Integer ERP",
        text: `Sharing your location every ${intervalSeconds >= 120 ? `${Math.round(intervalSeconds / 60)} minutes` : `${intervalSeconds} seconds`} until you check out.`,
      });
    }
    listener ??= await SiteTracker.addListener("location", () => void flush());
    trackingVisit = visitId;
    return;
  }
  if (trackingVisit === visitId && browserTimer !== null) return;
  stopBrowserTimer();
  trackingVisit = visitId;
  browserTimer = window.setInterval(() => {
    currentPosition(60_000)
      .then((p) => { enqueue([{ visitId, ...p, recordedAt: new Date().toISOString() }]); return flush(); })
      .catch(() => { /* no fix this time; the next tick tries again */ });
  }, intervalSeconds * 1000);
}

function stopBrowserTimer() {
  if (browserTimer !== null) window.clearInterval(browserTimer);
  browserTimer = null;
}

/** Stops sharing location and uploads anything still buffered. */
export async function stopTracking(): Promise<void> {
  stopBrowserTimer();
  trackingVisit = null;
  if (isAndroidApp()) {
    await SiteTracker.stop();
    await listener?.remove();
    listener = null;
  }
  await flush();
}
