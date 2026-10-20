import { describe, expect, it } from "vitest";
import { suggestSubstitutes } from "#lib/catalog/substitutes";
import type { Exercise } from "#lib/types";

const ex = (id: string, o: Partial<Exercise> = {}): Exercise => ({
  id,
  name: id,
  aliases: [],
  primaryMuscles: ["chest"],
  secondaryMuscles: [],
  equipment: ["barbell"],
  movementPattern: "horizontal_push",
  exerciseType: "weighted_reps",
  isCustom: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...o,
});
const ids = (list: Exercise[]) => list.map((e) => e.id);

describe("suggestSubstitutes", () => {
  const bench = ex("bench");

  it("puts same pattern + muscle before same muscle only, and drops other muscles", () => {
    const catalog = [
      bench,
      ex("fly", { movementPattern: "isolation" }),
      ex("dumbbell-press", { equipment: ["dumbbell"] }),
      ex("row", { primaryMuscles: ["upper_back"] }),
      ex("squat-pattern-only", { primaryMuscles: ["quads"] }),
    ];
    expect(ids(suggestSubstitutes(bench, catalog))).toEqual(["dumbbell-press", "fly"]);
  });

  it("never suggests the exercise itself, archived exercises or excluded ids", () => {
    const catalog = [bench, ex("a", { archivedAt: "2026-01-02T00:00:00.000Z" }), ex("b"), ex("c")];
    expect(ids(suggestSubstitutes(bench, catalog, { excludeIds: ["c"] }))).toEqual(["b"]);
  });

  it("treats a missing movement pattern as no pattern match", () => {
    const plain = ex("plain", { movementPattern: undefined });
    const catalog = [plain, ex("other", { movementPattern: undefined }), ex("pressy")];
    expect(ids(suggestSubstitutes(plain, catalog))).toEqual(["other", "pressy"]);
  });

  it("matches on any shared primary muscle", () => {
    const row = ex("row", { primaryMuscles: ["upper_back", "lats"], movementPattern: "horizontal_pull" });
    const catalog = [row, ex("pulldown", { primaryMuscles: ["lats"], movementPattern: "vertical_pull" })];
    expect(ids(suggestSubstitutes(row, catalog))).toEqual(["pulldown"]);
  });

  it("orders within a tier by exercise type, then favorites, then name", () => {
    const catalog = [
      bench,
      ex("z-push-up", { exerciseType: "bodyweight_reps" }),
      ex("b-press"),
      ex("a-press"),
      ex("c-press", { favorite: true }),
    ];
    expect(ids(suggestSubstitutes(bench, catalog))).toEqual(["c-press", "a-press", "b-press", "z-push-up"]);
  });

  it("limits the result (default 8)", () => {
    const catalog = [bench, ...Array.from({ length: 12 }, (_, i) => ex(`e${String(i).padStart(2, "0")}`))];
    expect(suggestSubstitutes(bench, catalog)).toHaveLength(8);
    expect(suggestSubstitutes(bench, catalog, { limit: 3 })).toHaveLength(3);
  });

  it("returns nothing when no exercise is similar", () => {
    expect(suggestSubstitutes(bench, [bench, ex("squat", { primaryMuscles: ["quads"] })])).toEqual([]);
  });
});
