import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SEED_EXERCISES } from "#lib/catalog/seed";
import { normalizeName } from "#lib/catalog/search";
import { AppDB } from "#lib/storage/db";
import {
  createCustomExercise,
  ensureCatalogSeeded,
  getExercise,
  getExercisesByIds,
  listExercises,
  setArchived,
  setFavorite,
} from "#lib/storage/exercises";

let n = 0;
let d: AppDB;
beforeEach(() => {
  d = new AppDB(`exercises-test-${Date.now()}-${n++}`);
});
afterEach(async () => {
  d.close();
  await d.delete();
});

describe("catalog seeding", () => {
  it("seeds all exercises and is idempotent", async () => {
    await ensureCatalogSeeded(d);
    const first = await d.exercises.toArray();
    expect(first).toHaveLength(SEED_EXERCISES.length);
    expect(first.every((e) => !e.isCustom)).toBe(true);
    // a fresh memo-less run (simulates next startup) via the same DB
    await (await import("#lib/storage/exercises")).ensureCatalogSeeded(d);
    expect(await d.exercises.toArray()).toEqual(first);
  });

  it("preserves favorite, archivedAt and user aliases across re-seeding", async () => {
    const id = SEED_EXERCISES[0].id;
    await ensureCatalogSeeded(d);
    await setFavorite(id, true, d);
    await setArchived(id, true, d);
    const row = (await d.exercises.get(id))!;
    // simulate a later app version: user alias present, stale seed fields, new startup (new AppDB instance)
    await d.exercises.put({
      ...row,
      aliases: [...row.aliases, "my alias"],
      name: "Old name",
    });
    const d2 = new AppDB(d.name);
    await ensureCatalogSeeded(d2);
    const after = (await d2.exercises.get(id))!;
    expect(after.name).toBe(SEED_EXERCISES[0].name);
    expect(after.favorite).toBe(true);
    expect(after.archivedAt).toBeTruthy();
    expect(after.aliases).toEqual(
      expect.arrayContaining([...SEED_EXERCISES[0].aliases, "my alias"]),
    );
    expect(new Set(after.aliases).size).toBe(after.aliases.length);
    d2.close();
  });

  it("never deletes rows (custom and unknown ones survive)", async () => {
    const c = await createCustomExercise(
      { name: "Zercher Hold", exerciseType: "duration" },
      d,
    );
    const d2 = new AppDB(d.name);
    await ensureCatalogSeeded(d2);
    expect(await d2.exercises.get(c.id)).toBeTruthy();
    d2.close();
  });
});

describe("queries and mutations", () => {
  it("lists, hides archived, gets by id(s)", async () => {
    const [a, b] = SEED_EXERCISES;
    expect((await listExercises({}, d)).length).toBe(SEED_EXERCISES.length);
    await setArchived(a.id, true, d);
    expect((await listExercises({}, d)).some((e) => e.id === a.id)).toBe(false);
    expect(
      (await listExercises({ includeArchived: true }, d)).some(
        (e) => e.id === a.id,
      ),
    ).toBe(true);
    await setArchived(a.id, false, d);
    expect((await getExercise(a.id, d))!.archivedAt).toBeUndefined();
    expect(
      (await getExercisesByIds([b.id, "nope", a.id], d)).map((e) => e.id),
    ).toEqual([b.id, a.id]);
  });

  it("creates a custom exercise with a UUID id as a plain object", async () => {
    const c = await createCustomExercise(
      {
        name: " Sled Push ",
        exerciseType: "distance",
        equipment: ["sled"],
        primaryMuscles: ["quads"],
        aliases: ["prowler"],
      },
      d,
    );
    expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(c).toMatchObject({
      name: "Sled Push",
      isCustom: true,
      aliases: ["prowler"],
    });
    expect(await getExercise(c.id, d)).toEqual(c);
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });

  it("rejects unknown ids", async () => {
    await expect(setFavorite("nope", true, d)).rejects.toThrow();
  });
});

describe("seed collisions", () => {
  it("no two seed exercises share a normalized name or alias", () => {
    const seen = new Map<string, string>();
    for (const x of SEED_EXERCISES) {
      for (const label of new Set([x.name, ...x.aliases].map(normalizeName))) {
        expect(seen.get(label), `${label} (${x.id})`).toBeUndefined();
        seen.set(label, x.id);
      }
    }
  });
});
