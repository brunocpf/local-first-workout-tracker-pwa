import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_IMPORT_BYTES, parseProgramImport, unresolvedExercises } from "#lib/imports/parseProgram";

const validText = readFileSync("tests/fixtures/program-valid.json", "utf8");
const fullText = readFileSync("tests/fixtures/program-full.json", "utf8");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const valid = (mutate?: (j: any) => void) => {
  const j = JSON.parse(validText);
  mutate?.(j);
  return parseProgramImport(JSON.stringify(j));
};
const errorsOf = (r: ReturnType<typeof parseProgramImport>) => (r.ok ? [] : r.errors);
const warningsOf = (r: ReturnType<typeof parseProgramImport>) => r.warnings ?? [];

describe("parseProgramImport", () => {
  it("accepts a valid program with no warnings", () => {
    expect(parseProgramImport(validText)).toMatchObject({ ok: true, warnings: [] });
  });

  it("accepts the full example (warm-ups, supersets, duration/distance, custom exercises, source)", () => {
    const r = parseProgramImport(fullText);
    expect(r).toMatchObject({ ok: true, warnings: [] });
  });

  it("the example in docs/import-schema.md parses cleanly", () => {
    const doc = readFileSync("docs/import-schema.md", "utf8");
    const block = /## Complete example\s+```json\n([\s\S]*?)```/.exec(doc)?.[1];
    expect(block).toBeDefined();
    expect(parseProgramImport(block!)).toMatchObject({ ok: true, warnings: [] });
  });

  it("accepts a program without optional fields and without a schedule", () => {
    const r = parseProgramImport(
      JSON.stringify({
        schemaVersion: 1,
        program: { name: "Minimal", routines: [{ id: "a", name: "A", exercises: [{ exercise: { name: "Push-up" }, sets: 1 }] }] },
      }),
    );
    expect(r).toMatchObject({ ok: true, warnings: [] });
  });

  describe("input", () => {
    it("rejects malformed JSON", () => expect(parseProgramImport("{nope")).toEqual({ ok: false, errors: ["Malformed JSON"] }));

    it("rejects unsupported versions", () => {
      expect(parseProgramImport(JSON.stringify({ schemaVersion: 2 }))).toMatchObject({ ok: false });
      expect(errorsOf(parseProgramImport(JSON.stringify({ schemaVersion: 2 })))[0]).toContain("Unsupported schemaVersion");
      expect(parseProgramImport("null")).toMatchObject({ ok: false });
    });

    it("rejects too-large input measured in bytes, not UTF-16 units", () => {
      const pad = (s: string, n: number) => JSON.stringify({ schemaVersion: 1, pad: s.repeat(n) });
      // ~700k UTF-16 units but ~2.1M bytes.
      const multibyte = pad("€", 700_000);
      expect(multibyte.length).toBeLessThan(MAX_IMPORT_BYTES);
      expect(errorsOf(parseProgramImport(multibyte))[0]).toContain("too large");
      // Plain ASCII over the limit.
      expect(errorsOf(parseProgramImport(pad("a", MAX_IMPORT_BYTES)))[0]).toContain("too large");
    });

    it("accepts input just under the byte limit", () => {
      const text = JSON.stringify({ schemaVersion: 1, pad: "a".repeat(MAX_IMPORT_BYTES - 100) });
      expect(errorsOf(parseProgramImport(text))[0]).not.toContain("too large");
    });
  });

  describe("errors", () => {
    it("reports missing required fields", () => {
      const r = parseProgramImport(JSON.stringify({ schemaVersion: 1, program: { routines: [{ id: "a", name: "A", exercises: [{ sets: 3 }] }] } }));
      expect(r.ok).toBe(false);
      const e = errorsOf(r).join("\n");
      expect(e).toContain("program.name");
      expect(e).toContain("program.routines[0].exercises[0].exercise");
    });

    it("rejects inverted rep ranges and unknown schedule routines", () => {
      const r = valid((j) => {
        j.program.routines[0].exercises[0].repRange = [10, 6];
        j.program.schedule.days[0].routine = "ghost";
      });
      expect(r.ok).toBe(false);
      expect(errorsOf(r).length).toBeGreaterThanOrEqual(2);
      expect(errorsOf(r).join("\n")).toContain("program.schedule.days[0].routine");
    });

    it.each([0, -1, 1.5, 51])("rejects set count %s", (sets) => {
      expect(valid((j) => (j.program.routines[0].exercises[0].sets = sets)).ok).toBe(false);
    });

    it("rejects duplicate routine ids", () => {
      const r = valid((j) => (j.program.routines[1].id = "upper_a"));
      expect(errorsOf(r).join("\n")).toContain("Duplicate routine ids");
    });

    it("rejects unbounded strings", () => {
      expect(valid((j) => (j.program.source = { name: "x".repeat(201) })).ok).toBe(false);
      expect(valid((j) => (j.program.source = { attribution: "x".repeat(501) })).ok).toBe(false);
      expect(valid((j) => (j.program.schedule.days[0].routine = "x".repeat(61))).ok).toBe(false);
    });

    it("rejects negative or out-of-range targets", () => {
      for (const patch of [{ targetWeight: -1 }, { rpe: 11 }, { rir: -1 }, { restSeconds: -5 }, { targetDurationSeconds: 0 }, { targetDistanceMeters: -3 }])
        expect(valid((j) => Object.assign(j.program.routines[0].exercises[0], patch)).ok).toBe(false);
    });

    it("rejects an unknown setType", () => {
      expect(valid((j) => (j.program.routines[0].exercises[0].setType = "amrap")).ok).toBe(false);
    });
  });

  describe("source.url", () => {
    const withUrl = (url: string) => valid((j) => (j.program.source = { url }));
    it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "file:///etc/passwd", "not a url"])("rejects %s", (url) => {
      expect(withUrl(url).ok).toBe(false);
    });
    it.each(["https://example.com/plan", "http://example.com"])("accepts %s", (url) => {
      expect(withUrl(url).ok).toBe(true);
    });
  });

  describe("exercise reference", () => {
    it("rejects the old bare-string form", () => {
      expect(valid((j) => (j.program.routines[0].exercises[0].exercise = "barbell_bench_press")).ok).toBe(false);
    });
    it("requires id or name", () => {
      expect(valid((j) => (j.program.routines[0].exercises[0].exercise = { equipment: "barbell" })).ok).toBe(false);
    });
    it("accepts a free-text name and flags it as unresolved", () => {
      const r = valid((j) => (j.program.routines[0].exercises[0].exercise = { name: "Landmine press", equipment: "landmine" }));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(unresolvedExercises(r.data)).toEqual([
          { path: "program.routines[0].exercises[0].exercise", ref: { name: "Landmine press", equipment: "landmine" } },
        ]);
      }
    });
    it("does not flag exercises that carry a catalog id", () => {
      const r = parseProgramImport(validText);
      if (r.ok) expect(unresolvedExercises(r.data)).toEqual([]);
    });
    it("rejects an invalid exerciseType", () => {
      expect(valid((j) => (j.program.routines[0].exercises[0].exercise = { name: "X", exerciseType: "cardio" })).ok).toBe(false);
    });
  });

  describe("sets vs setList", () => {
    const setList = [{ setType: "warmup", targetWeight: 20 }, { repRange: [5, 5], targetWeight: 60 }];
    it("accepts setList alone", () => {
      const r = valid((j) => {
        const e = j.program.routines[0].exercises[0];
        delete e.sets;
        delete e.repRange;
        e.setList = setList;
      });
      expect(r).toMatchObject({ ok: true, warnings: [] });
    });
    it("rejects sets and setList together", () => {
      const r = valid((j) => (j.program.routines[0].exercises[0].setList = setList));
      expect(errorsOf(r).join("\n")).toContain('exactly one of "sets" or "setList"');
    });
    it("rejects neither", () => {
      expect(valid((j) => delete j.program.routines[0].exercises[0].sets).ok).toBe(false);
    });
    it("rejects shorthand prescription fields beside setList", () => {
      const r = valid((j) => {
        const e = j.program.routines[0].exercises[0];
        delete e.sets;
        e.setList = setList; // repRange is still on the exercise
      });
      expect(errorsOf(r).join("\n")).toContain('"repRange" is not allowed with "setList"');
    });
    it("rejects an empty setList", () => {
      const r = valid((j) => {
        const e = j.program.routines[0].exercises[0];
        delete e.sets;
        delete e.repRange;
        e.setList = [];
      });
      expect(r.ok).toBe(false);
    });
  });

  describe("warnings", () => {
    it("reports unsupported fields with their path and still succeeds", () => {
      const r = valid((j) => {
        j.program.routines[0].exercises[0].tempo = "3-1-1";
        j.program.mood = "good";
        j.program.routines[0].exercises[0].exercise.brand = "x";
        j.topLevel = 1;
      });
      expect(r.ok).toBe(true);
      expect(r.warnings).toEqual(
        expect.arrayContaining([
          "program.routines[0].exercises[0].tempo: unsupported field, ignored",
          "program.mood: unsupported field, ignored",
          "program.routines[0].exercises[0].exercise.brand: unsupported field, ignored",
          "topLevel: unsupported field, ignored",
        ]),
      );
      // Unknown keys are not carried into the data.
      if (r.ok) expect(r.data.program.routines[0].exercises[0]).not.toHaveProperty("tempo");
    });

    it("still reports unsupported fields when the file also has errors", () => {
      const r = valid((j) => {
        j.program.routines[0].exercises[0].tempo = "3-1-1";
        j.program.routines[0].exercises[0].sets = 0;
      });
      expect(r.ok).toBe(false);
      expect(warningsOf(r)).toContain("program.routines[0].exercises[0].tempo: unsupported field, ignored");
    });

    it("warns when daysPerWeek does not match the schedule", () => {
      const r = valid((j) => (j.program.daysPerWeek = 4));
      expect(r.ok).toBe(true);
      expect(warningsOf(r).join("\n")).toContain("program.daysPerWeek");
    });

    it("warns when a weekday is scheduled twice", () => {
      const r = valid((j) => (j.program.schedule.days[1].day = "monday"));
      expect(r.ok).toBe(true);
      expect(warningsOf(r).join("\n")).toContain("monday is scheduled more than once");
    });

    it("warns about very high working-set counts but ignores warm-ups", () => {
      const high = valid((j) => (j.program.routines[0].exercises[0].sets = 31));
      expect(high.ok).toBe(true);
      expect(warningsOf(high).join("\n")).toContain("unusually high");
      const warmups = valid((j) => (j.program.routines[0].exercises[0].setType = "warmup") && (j.program.routines[0].exercises[0].sets = 40));
      expect(warningsOf(warmups)).toEqual([]);
    });

    it("warns when superset members are not adjacent", () => {
      const ex = (id: string, g?: string) => ({ exercise: { id }, sets: 3, ...(g ? { supersetGroup: g } : {}) });
      const make = (exercises: unknown[]) => valid((j) => (j.program.routines[0].exercises = exercises));
      const apart = make([ex("a", "A"), ex("b"), ex("c", "A")]);
      expect(apart.ok).toBe(true);
      expect(warningsOf(apart).join("\n")).toContain('program.routines[0].exercises[2].supersetGroup: "A" members are not adjacent');
      expect(warningsOf(make([ex("a", "A"), ex("b", "A"), ex("c", "B"), ex("d", "B")]))).toEqual([]);
    });

    it("caps the number of messages", () => {
      const r = valid((j) => {
        for (let i = 0; i < 200; i++) j.program[`extra${i}`] = i;
      });
      expect(r.warnings!.length).toBe(51);
      expect(r.warnings!.at(-1)).toBe("…and 150 more");
    });
  });
});
