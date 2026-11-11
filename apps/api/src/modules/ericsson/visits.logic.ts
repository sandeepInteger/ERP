import { FE_CHECKIN_FAR_METRES, FE_LOCATION_INTERVAL_SECONDS, FE_VISIT_AUTO_CLOSE_HOURS } from "@erp/types";

// Field engineer site visits (check-in / check-out) and their location trail. Pure, unit-tested.

export interface LatLng { lat: number; lng: number }

const EARTH_M = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceMetres(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance from the site at check-in, rounded to the metre; null when the site has no map position. */
export function checkInDistance(site: { latitude: number | null; longitude: number | null }, at: LatLng): number | null {
  if (site.latitude == null || site.longitude == null) return null;
  return Math.round(distanceMetres({ lat: site.latitude, lng: site.longitude }, at));
}

export function isFar(distanceM: number | null): boolean {
  return distanceM != null && distanceM > FE_CHECKIN_FAR_METRES;
}

/** How often the phone sends its location. FE_LOCATION_INTERVAL_SECONDS env overrides (min 30 s, for testing). */
export function locationIntervalSeconds(env: string | undefined): number {
  const n = Number(env);
  return Number.isFinite(n) && n >= 30 ? Math.round(n) : FE_LOCATION_INTERVAL_SECONDS;
}

export interface PointIn extends LatLng { accuracy?: number | undefined; recordedAt: Date }

/**
 * Which uploaded points belong to the visit. A point must be taken during the visit (from a minute
 * before check-in to two minutes after check-out, or now if still open; phones' clocks drift a little).
 * Points can arrive late (phone was offline), so a closed visit still accepts points from inside its window.
 * Duplicates (same recordedAt) are dropped; the database also ignores ones it already has.
 */
export function acceptPoints(visit: { checkInAt: Date; checkOutAt: Date | null }, points: PointIn[], now: Date): PointIn[] {
  const from = visit.checkInAt.getTime() - 60_000;
  const to = (visit.checkOutAt ?? now).getTime() + 120_000;
  const seen = new Set<number>();
  return points
    .filter((p) => {
      const t = p.recordedAt.getTime();
      if (!Number.isFinite(t) || t < from || t > to || seen.has(t)) return false;
      seen.add(t);
      return true;
    })
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
}

/** A visit left open longer than this is closed by the scheduled job (the FE forgot to check out). */
export function shouldAutoClose(visit: { checkInAt: Date; checkOutAt: Date | null }, now: Date): boolean {
  return visit.checkOutAt === null && now.getTime() - visit.checkInAt.getTime() > FE_VISIT_AUTO_CLOSE_HOURS * 3_600_000;
}

/** Minutes on site (to now while still open). */
export function visitMinutes(visit: { checkInAt: Date; checkOutAt: Date | null }, now: Date): number {
  return Math.max(0, Math.round(((visit.checkOutAt ?? now).getTime() - visit.checkInAt.getTime()) / 60_000));
}
