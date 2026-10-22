import { describe, expect, it } from "vitest";
import { SEED_EXERCISES } from "#lib/catalog/seed";
import { SEED_PT_BR } from "#lib/catalog/seed.pt-BR";
import { exerciseLabel, localizeExercise } from "#lib/catalog/localize";
import { normalizeName, searchExercises } from "#lib/catalog/search";
import { createSessionExercise, replaceExercise } from "#lib/logger/workout";
import { SEED_EXERCISES_BY_ID } from "#lib/catalog/seed";
import type { Exercise, WorkoutSession } from "#lib/types";

const asExercise = (s: (typeof SEED_EXERCISES)[number]): Exercise => ({ ...s, createdAt: "", updatedAt: "" }) as Exercise;

describe("pt-BR catalog", () => {
  it("covers every seed exercise and nothing else", () => {
    expect(Object.keys(SEED_PT_BR).sort()).toEqual(SEED_EXERCISES.map((s) => s.id).sort());
  });

  it("has complete text with the same number of cues", () => {
    for (const s of SEED_EXERCISES) {
      const pt = SEED_PT_BR[s.id];
      expect(pt.name.trim(), s.id).not.toBe("");
      expect(pt.instructions.trim(), s.id).not.toBe("");
      expect(pt.formCues.length, s.id).toBe(s.formCues?.length);
    }
  });

  it("has unique names and aliases across the catalog (importer/search stay unambiguous)", () => {
    const seen = new Map<string, string>();
    for (const [id, pt] of Object.entries(SEED_PT_BR)) {
      for (const label of [pt.name, ...pt.aliases]) {
        const key = normalizeName(label);
        const owner = seen.get(key);
        if (owner && owner !== id) throw new Error(`"${label}" is used by ${owner} and ${id}`);
        seen.set(key, id);
      }
    }
  });

  it("localizes built-ins, keeps English searchable and leaves custom/edited ones alone", () => {
    const squat = asExercise(SEED_EXERCISES.find((s) => s.id === "back_squat")!);
    const pt = localizeExercise(squat, "pt-BR");
    expect(pt.name).toBe("Agachamento livre");
    expect(pt.aliases).toContain("Back Squat");
    expect(pt.instructions).toBe(SEED_PT_BR.back_squat.instructions);
    expect(searchExercises("back squat", [pt])[0]?.id).toBe("back_squat");
    expect(searchExercises("agachamento", [pt])[0]?.id).toBe("back_squat");

    expect(localizeExercise(squat, "en")).toBe(squat);
    const custom = { ...squat, id: "my_squat", isCustom: true as const };
    expect(localizeExercise(custom, "pt-BR")).toBe(custom);
    const renamed = { ...squat, name: "My Squat" };
    expect(localizeExercise(renamed, "pt-BR").name).toBe("My Squat");
  });

  it("labels snapshots without rewriting them", () => {
    expect(exerciseLabel("back_squat", "Back Squat", "pt-BR")).toBe("Agachamento livre");
    expect(exerciseLabel("back_squat", "Back Squat", "en")).toBe("Back Squat");
    expect(exerciseLabel("back_squat", "My own name", "pt-BR")).toBe("My own name");
    expect(exerciseLabel("custom_1", "Back Squat", "pt-BR")).toBe("Back Squat");
  });

  it("never stores a localized name in a session snapshot", () => {
    const squat = asExercise(SEED_EXERCISES.find((s) => s.id === "back_squat")!);
    const shown = localizeExercise(squat, "pt-BR");
    expect(shown.name).toBe("Agachamento livre");
    const se = createSessionExercise(shown);
    expect(se.exerciseNameSnapshot).toBe(SEED_EXERCISES_BY_ID.get("back_squat")!.name);

    const press = localizeExercise(asExercise(SEED_EXERCISES.find((s) => s.id === "overhead_press")!), "pt-BR");
    const session = { exercises: [{ ...se, sets: [{ id: "s1", type: "normal" as const }] }] } as unknown as WorkoutSession;
    replaceExercise(session, se.id, press);
    expect(session.exercises[0].exerciseNameSnapshot).toBe("Overhead Press");

    const custom = createSessionExercise({ id: "mine", name: "Meu exercício", exerciseType: "weighted_reps" });
    expect(custom.exerciseNameSnapshot).toBe("Meu exercício");
  });
});
