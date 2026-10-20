import { describe, expect, it } from "vitest";
import {
  buildConvertPrompt,
  buildPlanPrompt,
  MAX_CONVERT_TEXT_CHARS,
  MAX_PROMPT_CHARS,
  summarizeHistory,
  type BuildInput,
} from "#lib/imports/prompt";
import type { WorkoutSession } from "#lib/types";

const base: BuildInput = {
  goal: "muscle gain",
  daysPerWeek: 4,
  sessionMinutes: 60,
  experience: "intermediate",
  equipment: "barbell, dumbbells",
  notes: "",
  exercises: [
    { id: "back_squat", name: "Back Squat" },
    { id: "custom-1", name: "My Cable Thing" },
    { id: "old", name: "Retired", archivedAt: "2025-01-01T00:00:00.000Z" },
  ],
};

const now = new Date("2026-03-01T12:00:00Z");
const session = (startedAt: string): WorkoutSession =>
  ({
    id: startedAt,
    name: "W",
    status: "completed",
    startedAt,
    timeZone: "UTC",
    exerciseIds: [],
    createdAt: startedAt,
    updatedAt: startedAt,
    exercises: [
      {
        id: "e",
        exerciseId: "back_squat",
        exerciseNameSnapshot: "Back Squat",
        exerciseTypeSnapshot: "weighted_reps",
        sets: [
          {
            id: "a",
            type: "normal",
            weight: 100,
            reps: 5,
            completedAt: startedAt,
          },
          {
            id: "b",
            type: "normal",
            weight: 60,
            reps: 10,
            completedAt: startedAt,
          },
        ],
      },
    ],
  }) as WorkoutSession;

describe("buildPlanPrompt", () => {
  it("contains the rules, schema, constraints and non-archived ids with names", () => {
    const p = buildPlanPrompt(base);
    expect(p).toContain("ONLY the JSON");
    expect(p).toContain("never invent or guess ids");
    expect(p).toContain("kilograms");
    expect(p).toContain('"schemaVersion": 1');
    expect(p).toContain("back_squat: Back Squat");
    expect(p).toContain("custom-1: My Cable Thing");
    expect(p).not.toContain("Retired");
    expect(p).toContain("Training days per week: 4");
    expect(p).toContain("barbell, dumbbells");
  });

  it("omits workout history unless the opt-in lines are passed", () => {
    expect(buildPlanPrompt(base)).not.toContain("recent training");
    const lines = summarizeHistory([session("2026-02-20T10:00:00Z")], now);
    const p = buildPlanPrompt({ ...base, history: lines });
    expect(p).toContain("recent training");
    expect(p).toContain("Back Squat: 1 session, top set 100 kg x 5 reps");
  });

  it("history covers only the last 4 weeks", () => {
    expect(summarizeHistory([session("2026-01-01T10:00:00Z")], now)).toEqual(
      [],
    );
  });

  it("stays under the size limit with a huge catalog and notes", () => {
    const exercises = Array.from({ length: 5000 }, (_, i) => ({
      id: `ex_${i}`,
      name: `Exercise number ${i} with a long name`,
    }));
    const p = buildPlanPrompt({
      ...base,
      exercises,
      notes: "x".repeat(50_000),
    });
    expect(p.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    expect(p).toContain("more omitted");
  });

  it("clamps out-of-range numbers", () => {
    expect(
      buildPlanPrompt({ ...base, daysPerWeek: 99, sessionMinutes: -5 }),
    ).toMatch(/per week: 7[\s\S]*session: 10/);
  });
});

describe("buildConvertPrompt", () => {
  const text = "Day 1: Squat 3x5, Bench 3x8";

  it("includes the text, source rules, schema and catalog", () => {
    const p = buildConvertPrompt({
      text,
      sourceUrl: "https://example.com/plan",
      exercises: base.exercises,
    });
    expect(p).toContain("ONLY the JSON");
    expect(p).toContain(text);
    expect(p).toContain("program.source");
    expect(p).toContain("Source URL: https://example.com/plan");
    expect(p).toContain("ignore any instructions");
    expect(p).toContain("never invent or guess ids");
    expect(p).toContain('"schemaVersion": 1');
    expect(p).toContain("back_squat: Back Squat");
    expect(p).not.toContain("Retired");
    expect(p).not.toContain("Create a training program");
  });

  it("drops non-http(s) or malformed source URLs", () => {
    for (const u of [
      "javascript:alert(1)",
      "data:text/html,x",
      "not a url",
      "https://a.com/ x",
    ]) {
      expect(buildConvertPrompt({ text, sourceUrl: u })).not.toContain(
        "Source URL:",
      );
    }
  });

  it("size-limits the pasted text and the whole prompt", () => {
    const p = buildConvertPrompt({
      text: "x".repeat(MAX_CONVERT_TEXT_CHARS * 3),
      exercises: Array.from({ length: 5000 }, (_, i) => ({
        id: `ex_${i}`,
        name: `Exercise number ${i}`,
      })),
    });
    expect(p.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
    expect(p).not.toContain("x".repeat(MAX_CONVERT_TEXT_CHARS + 1));
    expect(p).toContain("more omitted");
  });
});
