import { describe, expect, it } from "vitest";
import { normalizeName, searchExercises, type SearchableExercise } from "#lib/catalog/search";

const ex = (name: string, aliases: string[] = [], archivedAt?: string): SearchableExercise => ({
  name,
  aliases,
  ...(archivedAt ? { archivedAt } : {}),
});

const catalog: SearchableExercise[] = [
  ex("Pec Deck", ["Machine Fly"]),
  ex("Romanian Deadlift", ["RDL", "Stiff-Leg Deadlift"]),
  ex("Bench Press", ["Flat Bench"]),
  ex("Incline Bench Press"),
  ex("Pull-Up", ["Pullup"]),
  ex("Push & Pull Circuit"),
  ex("Old Leg Press", [], "2026-01-01T00:00:00.000Z"),
];

const names = (results: SearchableExercise[]) => results.map((r) => r.name);

describe("normalizeName", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalizeName("Pèc Dèck")).toBe("pec deck");
    expect(normalizeName("Crème Brûlée")).toBe("creme brulee");
  });
  it("turns & into and", () => {
    expect(normalizeName("Push & Pull")).toBe("push and pull");
    expect(normalizeName("Push&Pull")).toBe("push and pull");
  });
  it("turns punctuation and hyphens into spaces, collapses and trims whitespace", () => {
    expect(normalizeName("  Pull-Up  ")).toBe("pull up");
    expect(normalizeName("Farmer's  Walk.")).toBe("farmer s walk");
    expect(normalizeName("\tDB  Row ")).toBe("db row");
  });
});

describe("searchExercises matching", () => {
  it("is case- and diacritic-insensitive", () => {
    expect(names(searchExercises("Pec Dèck", catalog))).toEqual(["Pec Deck"]);
  });
  it("finds exercises by alias", () => {
    expect(names(searchExercises("rdl", catalog))).toEqual(["Romanian Deadlift"]);
    expect(names(searchExercises("stiff leg", catalog))).toEqual(["Romanian Deadlift"]);
  });
  it("requires every query token to start a word", () => {
    expect(names(searchExercises("inc bench", catalog))).toEqual(["Incline Bench Press"]);
    expect(names(searchExercises("bench inc", catalog))).toEqual(["Incline Bench Press"]);
  });
  it("falls back to substring matches", () => {
    expect(names(searchExercises("ench", catalog))).toEqual(["Bench Press", "Incline Bench Press"]);
  });
  it("returns nothing when no field matches", () => {
    expect(searchExercises("zzz", catalog)).toEqual([]);
  });
  it("matches a punctuation-free query against punctuated names", () => {
    expect(names(searchExercises("pull up", catalog))).toEqual(["Pull-Up"]);
    expect(names(searchExercises("push and pull", catalog))).toEqual(["Push & Pull Circuit"]);
  });
});

describe("searchExercises ranking", () => {
  it("ranks exact name/alias > name prefix > word prefix > substring", () => {
    const set = [
      ex("Incline Bench Press"), // word prefix for "bench press"
      ex("Bench Press Machine"), // name prefix
      ex("Bench Press"), // exact
      ex("Rebench Pressing"), // substring only: "bench press" inside "rebench pressing"
      ex("Machine", ["Bench Press"]), // exact alias
    ];
    expect(names(searchExercises("bench press", set))).toEqual([
      "Bench Press",
      "Machine",
      "Bench Press Machine",
      "Incline Bench Press",
      "Rebench Pressing",
    ]);
  });
  it("breaks ties by name", () => {
    expect(names(searchExercises("press", catalog))).toEqual(["Bench Press", "Incline Bench Press"]);
    expect(names(searchExercises("pull", catalog))).toEqual(["Pull-Up", "Push & Pull Circuit"]);
  });
  it("empty query returns all non-archived exercises sorted by name", () => {
    expect(names(searchExercises("", catalog))).toEqual([
      "Bench Press",
      "Incline Bench Press",
      "Pec Deck",
      "Pull-Up",
      "Push & Pull Circuit",
      "Romanian Deadlift",
    ]);
    expect(names(searchExercises("   ", catalog))).toHaveLength(6);
  });
});

describe("searchExercises options", () => {
  it("excludes archived exercises by default", () => {
    expect(names(searchExercises("old leg", catalog))).toEqual([]);
  });
  it("includes archived exercises when asked", () => {
    expect(names(searchExercises("old leg", catalog, { includeArchived: true }))).toEqual(["Old Leg Press"]);
  });
  it("limits the number of results after ranking", () => {
    expect(names(searchExercises("bench", catalog, { limit: 1 }))).toEqual(["Bench Press"]);
    expect(names(searchExercises("", catalog, { limit: 2 }))).toEqual(["Bench Press", "Incline Bench Press"]);
  });
  it("returns the original objects", () => {
    const [hit] = searchExercises("rdl", catalog);
    expect(hit).toBe(catalog[1]);
  });
});

describe("searchExercises performance", () => {
  it("searches 1,000 synthetic exercises in under 100 ms", () => {
    const big = Array.from({ length: 1000 }, (_, i) =>
      ex(`Exercise ${i} Variant ${i % 37} Press`, [`Alias ${i}`, `Machine ${i % 11}`]),
    );
    const started = performance.now();
    const results = searchExercises("variant 12 press", big);
    const elapsed = performance.now() - started;
    expect(results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });
});

describe("searchExercises filters", () => {
  const full = (name: string, o: Partial<SearchableExercise> = {}): SearchableExercise => ({
    name,
    aliases: [],
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: [],
    exerciseType: "weighted_reps",
    ...o,
  });
  const items = [
    full("Bench Press", { primaryMuscles: ["chest"], secondaryMuscles: ["triceps"], equipment: ["barbell"], favorite: true }),
    full("Dumbbell Bench Press", { primaryMuscles: ["chest"], equipment: ["dumbbell"] }),
    full("Push-Up", { primaryMuscles: ["chest"], equipment: ["bodyweight"], exerciseType: "bodyweight_reps" }),
    full("Triceps Pushdown", { primaryMuscles: ["triceps"], equipment: ["cable"] }),
  ];

  it("filters by muscle (primary or secondary), equipment, type and favorites", () => {
    expect(names(searchExercises("", items, { filters: { muscle: "triceps" } }))).toEqual(["Bench Press", "Triceps Pushdown"]);
    expect(names(searchExercises("", items, { filters: { equipment: "dumbbell" } }))).toEqual(["Dumbbell Bench Press"]);
    expect(names(searchExercises("", items, { filters: { exerciseType: "bodyweight_reps" } }))).toEqual(["Push-Up"]);
    expect(names(searchExercises("", items, { filters: { favoritesOnly: true } }))).toEqual(["Bench Press"]);
  });
  it("combines filters with each other and with the query", () => {
    expect(names(searchExercises("bench", items, { filters: { equipment: "barbell" } }))).toEqual(["Bench Press"]);
    expect(names(searchExercises("push", items, { filters: { muscle: "chest" } }))).toEqual(["Push-Up"]);
    expect(searchExercises("bench", items, { filters: { muscle: "chest", equipment: "cable" } })).toEqual([]);
  });
  it("treats empty filter values as no filter", () => {
    expect(searchExercises("", items, { filters: { muscle: "", favoritesOnly: false } })).toHaveLength(4);
  });
});
