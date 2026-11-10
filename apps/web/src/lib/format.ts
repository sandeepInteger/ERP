const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/** Prisma Decimals arrive as strings; null/undefined shows a dash. */
export function money(v: string | number | null | undefined, cents = false): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? (cents ? usdCents : usd).format(n) : "—";
}

/**
 * ISO date or date-time → "10 Nov 2026". Calendar dates (YYYY-MM-DD, or a @db.Date column
 * serialized as midnight UTC) are shown in UTC so they never shift a day in the viewer's zone.
 */
export function date(v: string | null | undefined): string {
  if (!v) return "—";
  const calendarDay = v.length === 10 || v.endsWith("T00:00:00.000Z");
  const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" };
  if (calendarDay) opts.timeZone = "UTC";
  return d.toLocaleDateString("en-GB", opts);
}

export function dateTime(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Today as YYYY-MM-DD in the viewer's time zone (for date inputs). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fullName(p: { firstName: string; lastName: string } | null | undefined): string {
  return p ? `${p.firstName} ${p.lastName}` : "—";
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
