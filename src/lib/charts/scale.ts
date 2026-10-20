/** Pure scale helpers for the SVG charts. No DOM, no dependencies. */

const DAY_MS = 86_400_000;

/** Maps a value in `domain` linearly onto `range`. A zero-width domain maps to the range midpoint. */
export function linearScale(domain: readonly [number, number], range: readonly [number, number]): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d0 === d1) return () => (r0 + r1) / 2;
  const k = (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

/** Epoch ms (UTC midnight) for a local calendar day "YYYY-MM-DD". Day arithmetic stays DST-free. */
export function dateToMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function msToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Maps "YYYY-MM-DD" days in `domain` linearly onto `range`. */
export function timeScale(domain: readonly [string, string], range: readonly [number, number]): (date: string) => number {
  const scale = linearScale([dateToMs(domain[0]), dateToMs(domain[1])], range);
  return (date) => scale(dateToMs(date));
}

function niceStep(rawStep: number): number {
  const exp = Math.floor(Math.log10(rawStep));
  const base = 10 ** exp;
  const f = rawStep / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * base;
}

/**
 * "Nice" tick values covering [min, max] with roughly `count` ticks. The first tick is <= min and
 * the last is >= max, so they also define the padded domain. min === max yields a small symmetric span.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min > max) [min, max] = [max, min];
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1;
    min -= pad;
    max += pad;
  }
  const step = niceStep((max - min) / Math.max(1, count - 1));
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  const n = Math.round((end - start) / step);
  for (let i = 0; i <= n; i++) ticks.push(Number((start + i * step).toPrecision(12)));
  return ticks;
}

/** Evenly spaced whole-day ticks between two days (inclusive). A single day yields one tick. */
export function timeTicks(from: string, to: string, count = 4): string[] {
  const a = dateToMs(from);
  const b = dateToMs(to);
  const days = Math.round((b - a) / DAY_MS);
  if (days <= 0 || count < 2) return [from];
  const n = Math.min(count, days + 1);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(msToDate(a + Math.round((days * i) / (n - 1)) * DAY_MS));
  return out;
}
