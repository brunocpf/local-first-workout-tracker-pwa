import { intlLocale, t, tn } from "#lib/i18n.svelte";
import type { ProgressionWhy } from "#lib/progress/progression";
import type { PrEvent } from "#lib/progress/metrics";
import { formatNumber } from "#lib/numberInput";
import { displayWeight } from "#lib/units";
import type { WeightUnit } from "#lib/types";

/** An ISO instant formatted in the app language, in the zone it happened in (UTC if the zone is unknown). */
export function formatZoned(iso: string, timeZone: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Date(iso).toLocaleString(intlLocale(), { ...opts, timeZone });
  } catch {
    return new Date(iso).toLocaleString(intlLocale(), { ...opts, timeZone: "UTC" });
  }
}

/** A plain "YYYY-MM-DD" date, formatted as UTC so the device zone can never move it. */
export function formatPlainDate(date: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(intlLocale(), { ...opts, timeZone: "UTC" });
}

/** `45 min`, `1 h 05 min`. */
export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

export const formatLocaleNumber = (n: number, opts?: Intl.NumberFormatOptions) => n.toLocaleString(intlLocale(), opts);

/** Localized twin of `describePr`: `Max weight 100 kg`, `5-rep max 90 kg`, ... */
export function prLabel(pr: PrEvent, unit: WeightUnit): string {
  const value = `${formatNumber(displayWeight(pr.value, unit))} ${unit}`;
  switch (pr.kind) {
    case "maxWeight":
      return t("pr.maxWeight", { value });
    case "repMax":
      return t("pr.repMax", { reps: pr.reps ?? 0, value });
    case "e1rm":
      return t("pr.e1rm", { value });
    case "sessionVolume":
      return t("pr.sessionVolume", { value });
  }
}

/** The progression suggestion's explanation in the app language. */
export function progressionReason(why: ProgressionWhy, unit: WeightUnit): string {
  const w = (kg: number) => `${formatNumber(displayWeight(kg, unit))} ${unit}`;
  switch (why.kind) {
    case "increase":
      return tn("prog.increase", why.sets, { high: why.high, low: why.low, weight: w(why.weightKg), increment: w(why.incrementKg), next: w(why.weightKg + why.incrementKg) });
    case "stay":
      return t("prog.stay", { high: why.high, lowest: why.lowest, weight: w(why.weightKg), reps: why.reps });
    case "mixed":
      return t("prog.mixed", { weight: w(why.weightKg), reps: why.reps });
  }
}
