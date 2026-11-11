import { describe, expect, it } from "vitest";

import { acceptPoints, checkInDistance, distanceMetres, isFar, locationIntervalSeconds, shouldAutoClose, visitMinutes } from "./visits.logic.js";

const T = (iso: string) => new Date(iso);

describe("distance", () => {
  it("measures metres between two points", () => {
    // ~111 m per 0.001° of latitude
    expect(Math.round(distanceMetres({ lat: 40.0, lng: -74.0 }, { lat: 40.001, lng: -74.0 }))).toBe(111);
    expect(distanceMetres({ lat: 12.97, lng: 77.59 }, { lat: 12.97, lng: 77.59 })).toBe(0);
  });

  it("is null when the site has no map position, and flags check-ins far from the site", () => {
    expect(checkInDistance({ latitude: null, longitude: null }, { lat: 1, lng: 1 })).toBeNull();
    expect(checkInDistance({ latitude: 40, longitude: -74 }, { lat: 40.001, lng: -74 })).toBe(111);
    expect(isFar(null)).toBe(false);
    expect(isFar(111)).toBe(false);
    expect(isFar(2_000)).toBe(true);
  });
});

describe("locationIntervalSeconds", () => {
  it("defaults to 10 minutes and accepts an override of at least 30 seconds", () => {
    expect(locationIntervalSeconds(undefined)).toBe(600);
    expect(locationIntervalSeconds("60")).toBe(60);
    expect(locationIntervalSeconds("5")).toBe(600);
    expect(locationIntervalSeconds("abc")).toBe(600);
  });
});

describe("acceptPoints", () => {
  const open = { checkInAt: T("2026-11-11T09:00:00Z"), checkOutAt: null };
  const now = T("2026-11-11T10:00:00Z");
  const p = (iso: string) => ({ lat: 1, lng: 2, recordedAt: T(iso) });

  it("keeps points taken during the visit, sorted, without duplicates", () => {
    const got = acceptPoints(open, [p("2026-11-11T09:20:00Z"), p("2026-11-11T09:10:00Z"), p("2026-11-11T09:10:00Z")], now);
    expect(got.map((x) => x.recordedAt.toISOString())).toEqual(["2026-11-11T09:10:00.000Z", "2026-11-11T09:20:00.000Z"]);
  });

  it("drops points from before check-in or from the future (allowing small clock drift)", () => {
    const got = acceptPoints(open, [p("2026-11-11T08:58:00Z"), p("2026-11-11T08:59:30Z"), p("2026-11-11T10:01:00Z"), p("2026-11-11T10:05:00Z")], now);
    expect(got.map((x) => x.recordedAt.toISOString())).toEqual(["2026-11-11T08:59:30.000Z", "2026-11-11T10:01:00.000Z"]);
  });

  it("still accepts late uploads from inside a closed visit, but nothing after check-out", () => {
    const closed = { checkInAt: T("2026-11-11T09:00:00Z"), checkOutAt: T("2026-11-11T09:30:00Z") };
    const got = acceptPoints(closed, [p("2026-11-11T09:25:00Z"), p("2026-11-11T09:45:00Z")], T("2026-11-11T11:00:00Z"));
    expect(got).toHaveLength(1);
  });
});

describe("auto close and duration", () => {
  it("closes visits left open more than 14 hours", () => {
    expect(shouldAutoClose({ checkInAt: T("2026-11-11T06:00:00Z"), checkOutAt: null }, T("2026-11-11T19:59:00Z"))).toBe(false);
    expect(shouldAutoClose({ checkInAt: T("2026-11-11T06:00:00Z"), checkOutAt: null }, T("2026-11-11T20:01:00Z"))).toBe(true);
    expect(shouldAutoClose({ checkInAt: T("2026-11-10T06:00:00Z"), checkOutAt: T("2026-11-10T08:00:00Z") }, T("2026-11-11T20:01:00Z"))).toBe(false);
  });

  it("counts minutes on site, to now while open", () => {
    expect(visitMinutes({ checkInAt: T("2026-11-11T09:00:00Z"), checkOutAt: T("2026-11-11T11:30:00Z") }, T("2026-11-11T12:00:00Z"))).toBe(150);
    expect(visitMinutes({ checkInAt: T("2026-11-11T09:00:00Z"), checkOutAt: null }, T("2026-11-11T09:45:00Z"))).toBe(45);
  });
});
