import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SEED_EXERCISES, SEED_EXERCISES_BY_ID } from "#lib/catalog/seed";
import { EQUIPMENT, MOVEMENT_PATTERNS, MUSCLES } from "#lib/catalog/vocab";

const EXERCISE_TYPES = ["weighted_reps", "bodyweight_reps", "weighted_bodyweight", "assisted_bodyweight", "duration", "distance"];
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Catalog ids referenced by fixtures and docs/import-schema.md. */
function referencedIds(): string[] {
  const files = ["tests/fixtures/program-valid.json", "tests/fixtures/program-full.json", "docs/import-schema.md"];
  const ids = new Set<string>();
  for (const f of files) {
    for (const m of readFileSync(f, "utf8").matchAll(/"exercise"\s*:\s*\{\s*"id"\s*:\s*"([^"]+)"/g)) ids.add(m[1]);
  }
  return [...ids].filter((id) => id !== "catalog_id"); // schema placeholder
}

describe("seed exercise catalog", () => {
  it("has roughly 100 entries", () => {
    expect(SEED_EXERCISES.length).toBeGreaterThanOrEqual(95);
    expect(SEED_EXERCISES.length).toBeLessThanOrEqual(120);
  });

  it("has unique snake_case ids", () => {
    const ids = SEED_EXERCISES.map((x) => x.id);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has required fields with vocabulary values", () => {
    for (const x of SEED_EXERCISES) {
      expect(x.name.trim(), x.id).not.toBe("");
      expect(x.aliases.length, x.id).toBeGreaterThanOrEqual(1);
      expect(x.aliases.length, x.id).toBeLessThanOrEqual(4);
      expect(x.primaryMuscles.length, x.id).toBeGreaterThanOrEqual(1);
      for (const m of [...x.primaryMuscles, ...x.secondaryMuscles]) expect(MUSCLES, x.id).toContain(m);
      expect(x.equipment.length, x.id).toBeGreaterThanOrEqual(1);
      for (const q of x.equipment) expect(EQUIPMENT, x.id).toContain(q);
      expect(MOVEMENT_PATTERNS, x.id).toContain(x.movementPattern);
      expect(EXERCISE_TYPES, x.id).toContain(x.exerciseType);
      expect(x.isCustom, x.id).toBe(false);
    }
  });

  it("gives every built-in 2–4 instruction sentences and 3–5 form cues", () => {
    for (const x of SEED_EXERCISES) {
      const sentences = (x.instructions ?? "").split(/(?<=[.!?])\s+/).filter((s) => s.trim() !== "");
      expect(sentences.length, `${x.id} instructions`).toBeGreaterThanOrEqual(2);
      expect(sentences.length, `${x.id} instructions`).toBeLessThanOrEqual(4);
      expect(x.formCues?.length ?? 0, `${x.id} formCues`).toBeGreaterThanOrEqual(3);
      expect(x.formCues?.length ?? 0, `${x.id} formCues`).toBeLessThanOrEqual(5);
      for (const cue of x.formCues ?? []) expect(cue.trim(), `${x.id} cue`).not.toBe("");
      expect(new Set(x.formCues).size, `${x.id} duplicate cues`).toBe(x.formCues?.length);
    }
  });

  it("keeps guide text free of medical claims", () => {
    const banned = /\b(cure|cures|heal|heals|treat|treats|therap\w*|diagnos\w*|prevent\w*|injur\w*|rehab\w*|medical)\b/i;
    for (const x of SEED_EXERCISES) {
      const text = [x.instructions ?? "", ...(x.formCues ?? [])].join(" ");
      expect(banned.test(text), x.id).toBe(false);
    }
  });

  it("does not list a muscle as both primary and secondary", () => {
    for (const x of SEED_EXERCISES) {
      expect(x.primaryMuscles.filter((m) => x.secondaryMuscles.includes(m)), x.id).toEqual([]);
    }
  });

  it("has no name or alias that collides with another exercise", () => {
    const owner = new Map<string, string>();
    for (const x of SEED_EXERCISES) {
      for (const label of new Set([x.name, ...x.aliases].map(norm))) {
        expect(owner.get(label) ?? x.id, `"${label}"`).toBe(x.id);
        owner.set(label, x.id);
      }
    }
  });

  it("covers the required categories", () => {
    const has = (pred: (x: (typeof SEED_EXERCISES)[number]) => boolean) => SEED_EXERCISES.some(pred);
    for (const eq of ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell"] as const) {
      expect(has((x) => x.equipment.includes(eq)), eq).toBe(true);
    }
    for (const p of MOVEMENT_PATTERNS) expect(has((x) => x.movementPattern === p), p).toBe(true);
    for (const t of EXERCISE_TYPES) expect(has((x) => x.exerciseType === t), t).toBe(true);
    expect(has((x) => x.isUnilateral === true)).toBe(true);
  });

  it("resolves every id used by fixtures and the import docs", () => {
    const ids = referencedIds();
    expect(ids).toEqual(
      expect.arrayContaining(["back_squat", "barbell_bench_press", "lat_pulldown", "overhead_press", "romanian_deadlift"]),
    );
    for (const id of ids) expect(SEED_EXERCISES_BY_ID.has(id), id).toBe(true);
  });

  it("matches the free-text names used in the import docs", () => {
    const labels = new Set(SEED_EXERCISES.flatMap((x) => [x.name, ...x.aliases]).map(norm));
    for (const n of ["Plank", "Farmer's carry"]) expect(labels.has(norm(n)), n).toBe(true);
  });
});
