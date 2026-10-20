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
export function defaultWorkoutName(now = new Date()): string {
  const h = now.getHours();
  const part = h < 5 ? "Night" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : h < 21 ? "Evening" : "Night";
  return `${part} workout`;
}
