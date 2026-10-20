import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProgramImport } from "../src/imports/parseProgram";

const valid = readFileSync("tests/fixtures/program-valid.json", "utf8");

describe("parseProgramImport", () => {
  it("accepts a valid program", () => expect(parseProgramImport(valid).ok).toBe(true));
  it("rejects malformed JSON", () => expect(parseProgramImport("{nope").ok).toBe(false));
  it("rejects unsupported versions", () => {
    const r = parseProgramImport(JSON.stringify({ schemaVersion: 2 }));
    expect(r).toMatchObject({ ok: false });
  });
  it("rejects inverted rep ranges and unknown schedule routines", () => {
    const j = JSON.parse(valid);
    j.program.routines[0].exercises[0].repRange = [10, 6];
    j.program.schedule.days[0].routine = "ghost";
    const r = parseProgramImport(JSON.stringify(j));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});
