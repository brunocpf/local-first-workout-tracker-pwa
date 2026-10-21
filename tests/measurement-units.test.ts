import { describe, expect, it } from "vitest";
import { displayMeasurement, MEASUREMENT_LABELS, measurementUnit, toStoredMeasurement } from "#lib/measurements";
import { MEASUREMENT_KINDS, type LengthUnit, type WeightUnit } from "#lib/types";
import { displayLength, toCm } from "#lib/units";

const units = (weightUnit: WeightUnit, lengthUnit: LengthUnit) => ({ weightUnit, lengthUnit });

describe("length units", () => {
  it("converts inches to cm", () => {
    expect(toCm(10, "in")).toBeCloseTo(25.4, 10);
    expect(toCm(10, "cm")).toBe(10);
    expect(displayLength(25.4, "in")).toBe(10);
  });
  it("any value typed with up to 2 decimals shows again exactly, in cm and in", () => {
    for (const unit of ["cm", "in"] as const) {
      for (let cents = 1; cents <= 50000; cents += 7) {
        const typed = cents / 100;
        expect(displayLength(toCm(typed, unit), unit)).toBe(typed);
      }
    }
  });
});

describe("measurement units", () => {
  it("bodyweight follows the weight unit, body fat is %, the rest follow the length unit", () => {
    expect(measurementUnit("bodyweight", units("lb", "in"))).toBe("lb");
    expect(measurementUnit("body_fat", units("lb", "in"))).toBe("%");
    expect(measurementUnit("waist", units("lb", "in"))).toBe("in");
    expect(measurementUnit("waist", { weightUnit: "kg" })).toBe("cm");
  });
  it("round-trips every kind in lb and in", () => {
    const u = units("lb", "in");
    for (const kind of MEASUREMENT_KINDS) {
      for (const typed of [0.5, 12.25, 33.7, 180.4, 221.5]) {
        expect(displayMeasurement(kind, toStoredMeasurement(kind, typed, u), u)).toBe(typed);
      }
    }
  });
  it("stores kg and cm", () => {
    expect(toStoredMeasurement("bodyweight", 220, units("lb", "in"))).toBeCloseTo(99.79, 2);
    expect(toStoredMeasurement("bodyweight", 80, units("kg", "cm"))).toBe(80);
    expect(toStoredMeasurement("body_fat", 18.5, units("lb", "in"))).toBe(18.5);
    expect(toStoredMeasurement("chest", 40, units("kg", "in"))).toBeCloseTo(101.6, 10);
  });
  it("has a label for every kind", () => {
    for (const kind of MEASUREMENT_KINDS) expect(MEASUREMENT_LABELS[kind]).toBeTruthy();
  });
});
