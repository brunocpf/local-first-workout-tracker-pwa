import type { WorkoutSession } from "#lib/types";

/** The device's current IANA zone, e.g. "Europe/Lisbon". Store it on new sessions. */
export const currentTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      // Unknown zone (e.g. from an import): fall back to UTC rather than throwing.
      f = formatterFor("UTC");
    }
    formatters.set(timeZone, f);
  }
  return f;
}

/** Calendar day ("YYYY-MM-DD") the session started on, in the zone it was performed in. */
export function localDate(s: Pick<WorkoutSession, "startedAt" | "timeZone">): string {
  const p = Object.fromEntries(formatterFor(s.timeZone).formatToParts(new Date(s.startedAt)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** First day ("YYYY-MM-DD") of the week containing the session's local date. 0 = Sunday ... 6 = Saturday. */
export function localWeekStart(s: Pick<WorkoutSession, "startedAt" | "timeZone">, weekStartsOn: 0 | 1 | 6): string {
  const [y, m, d] = localDate(s).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const back = (day.getUTCDay() - weekStartsOn + 7) % 7;
  day.setUTCDate(day.getUTCDate() - back);
  return day.toISOString().slice(0, 10);
}

/** Elapsed time since `startedAt` as `m:ss` or `h:mm:ss` (display only; never stored). */
export function formatElapsed(startedAt: string, now = Date.now()): string {
  const total = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Default name for a blank workout, by local time of day. */
export function defaultWorkoutName(now = new Date(), label: (part: DayPart) => string = (part) => `${part[0].toUpperCase()}${part.slice(1)} workout`): string {
  const h = now.getHours();
  return label(h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night");
}

export type DayPart = "night" | "morning" | "afternoon" | "evening";

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      f = partsFormatter("UTC");
    }
    partsFormatters.set(timeZone, f);
  }
  return f;
}

/** Wall-clock fields of an instant in `timeZone`, as the UTC ms of the same fields (so the difference is the zone offset). */
function wallClockMs(ms: number, timeZone: string): number {
  const p = Object.fromEntries(partsFormatter(timeZone).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Whether `Intl` knows the IANA zone. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * An instant as `YYYY-MM-DDTHH:mm` wall-clock time in `timeZone` (the value format of `<input type="datetime-local">`).
 * `undefined` for an unknown zone, so callers never silently treat it as UTC.
 */
export function utcToZonedLocal(iso: string, timeZone: string): string | undefined {
  if (!isValidTimeZone(timeZone)) return undefined;
  const d = new Date(wallClockMs(Date.parse(iso), timeZone));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/**
 * Inverse of `utcToZonedLocal`: the ISO instant for a `YYYY-MM-DDTHH:mm` wall-clock time in `timeZone`.
 * An ambiguous time (clocks go back) resolves to the earlier instant; a non-existent one (clocks go forward)
 * is shifted forward by the gap. Returns `undefined` for malformed input or an unknown zone.
 */
export function zonedLocalToUtc(local: string, timeZone: string): string | undefined {
  if (!isValidTimeZone(timeZone)) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return undefined;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (Number.isNaN(wall)) return undefined;
  const DAY = 86_400_000;
  const offsetAt = (ms: number) => wallClockMs(ms, timeZone) - ms;
  const before = offsetAt(wall - DAY);
  const after = offsetAt(wall + DAY);
  const candidates = [...new Set([before, after])].map((o) => wall - o).filter((t) => wallClockMs(t, timeZone) === wall);
  const instant = candidates.length > 0 ? Math.min(...candidates) : wall - before;
  return new Date(instant).toISOString();
}
