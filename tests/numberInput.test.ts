import { describe, expect, it } from "vitest";
import { formatNumber, parseNumberInput } from "#lib/numberInput";

const ok = (value: number | null) => ({ ok: true, value });
const bad = { ok: false };

describe("parseNumberInput", () => {
  it.each([
    ["82.5", 82.5],
    ["82,5", 82.5],
    ["  82,5  ", 82.5],
    ["80", 80],
    ["0", 0],
    [".5", 0.5],
    [",5", 0.5],
    ["82.", 82],
    ["-5", -5],
    ["007", 7],
  ])("accepts %j", (raw, n) => expect(parseNumberInput(raw)).toEqual(ok(n)));

  it.each(["", "   "])("treats %j as empty", (raw) => expect(parseNumberInput(raw)).toEqual(ok(null)));

  it.each(["abc", "1e3", "1,000.5", "1.2.3", "1,2,3", "8 2", "--1", "+5", "Infinity", "NaN", "0x10", ".", ",", "-", "82kg"])(
    "rejects %j",
    (raw) => expect(parseNumberInput(raw)).toEqual(bad),
  );

  it("integer mode rejects separators", () => {
    expect(parseNumberInput("12", "integer")).toEqual(ok(12));
    expect(parseNumberInput("12.5", "integer")).toEqual(bad);
    expect(parseNumberInput("12,5", "integer")).toEqual(bad);
  });
});

describe("formatNumber", () => {
  it("formats without grouping, max 2 decimals", () => {
    expect(formatNumber(1234.567, "en-US")).toBe("1234.57");
    expect(formatNumber(82.5, "de-DE")).toBe("82,5");
    expect(formatNumber(80, "en-US")).toBe("80");
  });
  it("returns empty for null", () => expect(formatNumber(null)).toBe(""));
});
