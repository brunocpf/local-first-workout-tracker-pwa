import type { EffortInput, LoggedSet, PrescribedSet } from "#lib/types";

/** Selectable RPE values, 6–10 in 0.5 steps (PRD §8.3). Imported values outside this list are still shown. */
export const RPE_VALUES: readonly number[] = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
/** Selectable RIR values, 0–5. */
export const RIR_VALUES: readonly number[] = [0, 1, 2, 3, 4, 5];

export const effortLabel = (mode: Exclude<EffortInput, "off">) => (mode === "rpe" ? "RPE" : "RIR");

/** The set's value for the active mode (`undefined` when off or unset). */
export function effortOf(set: Pick<LoggedSet, "rpe" | "rir">, mode: EffortInput): number | undefined {
  return mode === "rpe" ? set.rpe : mode === "rir" ? set.rir : undefined;
}

/** The prescription's target for the active mode. */
export function effortTarget(prescribed: Pick<PrescribedSet, "targetRpe" | "targetRir"> | undefined, mode: EffortInput): number | undefined {
  return mode === "rpe" ? prescribed?.targetRpe : mode === "rir" ? prescribed?.targetRir : undefined;
}

/** Selectable values for `mode`, plus `current` when it is a stored value outside the standard list. */
export function effortOptions(mode: Exclude<EffortInput, "off">, current?: number): number[] {
  const base = mode === "rpe" ? RPE_VALUES : RIR_VALUES;
  return current === undefined || base.includes(current) ? [...base] : [...base, current].sort((a, b) => a - b);
}

/** `RPE 8.5` / `RIR 2`, or `undefined` when the mode is off or the set has no value. */
export function formatEffort(set: Pick<LoggedSet, "rpe" | "rir">, mode: EffortInput): string | undefined {
  const v = effortOf(set, mode);
  return v === undefined || mode === "off" ? undefined : `${effortLabel(mode)} ${v}`;
}
