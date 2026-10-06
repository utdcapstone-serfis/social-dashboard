/**
 * Time-zone helpers for the daily refresh. Dependency-free (no DOM, no imports)
 * so both the browser bundle and the Node server can use it.
 *
 * The refresh fires at 00:00 America/Chicago. That is 06:00 UTC during CST
 * (winter) but 05:00 UTC during CDT (summer); resolving it through Intl keeps
 * it correct across daylight-saving changes.
 */
export const DASHBOARD_TZ = "America/Chicago";

interface ZonedParts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
}

function zonedParts(date: Date, tz: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(date);
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute"), ss: get("second") };
}

/** Offset (ms) of `tz` from UTC at the given instant: local wall-clock minus UTC. */
function zoneOffsetMs(date: Date, tz: string): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** YYYY-MM-DD of the calendar day containing `date` in `tz`. */
export function zonedDateKey(date: Date, tz: string = DASHBOARD_TZ): string {
  const p = zonedParts(date, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** The UTC instant at which `dateKey` (YYYY-MM-DD) begins in `tz`. */
export function zonedMidnight(dateKey: string, tz: string = DASHBOARD_TZ): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  let instant = guess - zoneOffsetMs(new Date(guess), tz);
  // Second pass: the offset at the corrected instant can differ across a DST change.
  instant = guess - zoneOffsetMs(new Date(instant), tz);
  return new Date(instant);
}

/** Add whole calendar days to a YYYY-MM-DD key. */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The next 00:00 in `tz` strictly after `from`. */
export function nextMidnight(from: Date = new Date(), tz: string = DASHBOARD_TZ): Date {
  return zonedMidnight(addDays(zonedDateKey(from, tz), 1), tz);
}

/** True when `syncedAt` falls on an earlier `tz` calendar day than `now`. */
export function isStale(syncedAt: string, now: Date = new Date(), tz: string = DASHBOARD_TZ): boolean {
  return zonedDateKey(new Date(syncedAt), tz) !== zonedDateKey(now, tz);
}
