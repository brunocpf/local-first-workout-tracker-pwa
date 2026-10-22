import { describe, expect, it } from "vitest";
import { SEED_EXERCISES } from "#lib/catalog/seed";
import { matchExerciseRef, matchProgram, type MatchableExercise } from "#lib/imports/matchExercises";
import { parseProgramImport } from "#lib/imports/parseProgram";

const catalog: MatchableExercise[] = [...SEED_EXERCISES];

describe("matchExerciseRef (seed catalog)", () => {
  it("matches an exact id", () => {
    expect(matchExerciseRef({ id: "back_squat" }, catalog)).toEqual({ status: "matched", exerciseId: "back_squat", via: "id" });
  });
  it("matches via alias and normalized name", () => {
    expect(matchExerciseRef({ name: "RDL" }, catalog)).toEqual({ status: "matched", exerciseId: "romanian_deadlift", via: "alias" });
    expect(matchExerciseRef({ name: "back  SQUAT" }, catalog)).toEqual({ status: "matched", exerciseId: "back_squat", via: "name" });
  });
  it("suggests, never matches, a near miss", () => {
    const r = matchExerciseRef({ name: "Barbell bench" }, catalog);
    expect(r.status).toBe("suggested");
    if (r.status === "suggested") {
      expect(r.candidates.length).toBeLessThanOrEqual(3);
      expect(r.candidates.map((c) => c.exerciseId)).toContain("barbell_bench_press");
    }
  });
  it("does not match an unknown exercise", () => {
    const r = matchExerciseRef({ name: "Zercher Squat" }, catalog);
    expect(r.status).not.toBe("matched");
    expect(matchExerciseRef({ name: "Quantum Flux Widget" }, catalog)).toEqual({ status: "unresolved" });
  });
  it("falls through from an unknown id to the name", () => {
    expect(matchExerciseRef({ id: "nope", name: "RDL" }, catalog)).toMatchObject({ status: "matched", via: "alias" });
    expect(matchExerciseRef({ id: "nope" }, catalog)).toEqual({ status: "unresolved" });
  });
  it("ignores archived exercises", () => {
    const c = catalog.map((x) => (x.id === "back_squat" ? { ...x, archivedAt: "2026-01-01T00:00:00.000Z" } : x));
    expect(matchExerciseRef({ id: "back_squat", name: "Back Squat" }, c).status).not.toBe("matched");
  });
  it("treats an ambiguous alias as a suggestion", () => {
    const c: MatchableExercise[] = [
      { id: "a", name: "Alpha", aliases: ["Shared"], equipment: [] },
      { id: "b", name: "Beta", aliases: ["shared"], equipment: [] },
    ];
    const r = matchExerciseRef({ name: "SHARED" }, c);
    expect(r.status).toBe("suggested");
    if (r.status === "suggested") expect(r.candidates.map((x) => x.exerciseId).sort()).toEqual(["a", "b"]);
  });
  it("boosts candidates with the hinted equipment", () => {
    const plain = matchExerciseRef({ name: "Bench press fly" }, catalog);
    const hinted = matchExerciseRef({ name: "Bench press fly", equipment: "dumbbell" }, catalog);
    const score = (r: ReturnType<typeof matchExerciseRef>, id: string) =>
      r.status === "suggested" ? r.candidates.find((c) => c.exerciseId === id)?.score : undefined;
    const id = "dumbbell_bench_press";
    expect(score(hinted, id)).toBeGreaterThan(score(plain, id) ?? 0);
  });
});

describe("matchProgram", () => {
  it("keys results by the unresolvedExercises path", () => {
    const p = parseProgramImport(
      JSON.stringify({
        schemaVersion: 1,
        program: {
          name: "P",
          routines: [{ id: "r", name: "R", exercises: [{ exercise: { id: "back_squat" }, sets: 3 }, { exercise: { name: "RDL" }, sets: 3 }] }],
        },
      }),
    );
    if (!p.ok) throw new Error("parse failed");
    const m = matchProgram(p.data, catalog);
    expect(m.get("program.routines[0].exercises[0].exercise")).toMatchObject({ status: "matched", via: "id" });
    expect(m.get("program.routines[0].exercises[1].exercise")).toMatchObject({ status: "matched", via: "alias" });
  });
});
