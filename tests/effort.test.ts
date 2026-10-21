import { describe, expect, it } from "vitest";
import { effortOf, effortOptions, effortTarget, formatEffort } from "#lib/logger/effort";

describe("effort helpers", () => {
  it("reads the value and target for the active mode only", () => {
    expect(effortOf({ rpe: 8, rir: 2 }, "rpe")).toBe(8);
    expect(effortOf({ rpe: 8, rir: 2 }, "rir")).toBe(2);
    expect(effortOf({ rpe: 8, rir: 2 }, "off")).toBeUndefined();
    expect(effortTarget({ targetRpe: 8, targetRir: 2 }, "rir")).toBe(2);
    expect(effortTarget(undefined, "rpe")).toBeUndefined();
  });

  it("builds RPE 6–10 and RIR 0–5, adding an out-of-list stored value in order", () => {
    expect(effortOptions("rpe")).toHaveLength(9);
    expect(effortOptions("rir")).toEqual([0, 1, 2, 3, 4, 5]);
    expect(effortOptions("rpe", 5)[0]).toBe(5);
    expect(effortOptions("rir", 7).at(-1)).toBe(7);
    expect(effortOptions("rpe", 8)).toHaveLength(9);
  });

  it("formats for history, hidden when off or unset", () => {
    expect(formatEffort({ rpe: 8.5 }, "rpe")).toBe("RPE 8.5");
    expect(formatEffort({ rir: 0 }, "rir")).toBe("RIR 0");
    expect(formatEffort({ rpe: 8 }, "rir")).toBeUndefined();
    expect(formatEffort({ rpe: 8 }, "off")).toBeUndefined();
  });
});
