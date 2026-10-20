import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { findDuplicates } from "#lib/imports/duplicates";
import { normalizeHevyRows } from "#lib/imports/hevy/normalize";
import { parseHevyCsv } from "#lib/imports/hevy/parse";
import { buildHevyPlan, initialChoices, type HevyChoice } from "#lib/imports/hevy/plan";
import { db } from "#lib/storage/db";
import { listExercises } from "#lib/storage/exercises";
import { commitHevyImport, listSessionIdentitiesAround } from "#lib/storage/hevyImport";
import { getSettings, saveSettings } from "#lib/storage/settings";

const parsed = parseHevyCsv(readFileSync("tests/fixtures/hevy/sample.csv", "utf8"));
if (!parsed.ok) throw new Error("fixture must parse");
const normalized = normalizeHevyRows(parsed.rows, { timeZone: "UTC", importedAt: new Date("2026-10-20T10:00:00Z") });

beforeEach(async () => {
  // The catalog is seeded once per database, so only custom exercises are removed.
  await Promise.all([db.sessions.clear(), db.exercises.filter((e) => e.isCustom).delete(), db.settings.clear()]);
});

/** Run the review state the way the page does: initial choices, then `decide` for every undecided title. */
async function plan(decide: (title: string) => HevyChoice, remembered: Record<string, string> = {}, include: Record<string, boolean> = {}) {
  const catalog = await listExercises();
  const initial = initialChoices(normalized.exercises, catalog, remembered);
  const choices: Record<string, HevyChoice | undefined> = { ...initial.choices };
  for (const e of normalized.exercises) choices[e.title] ??= decide(e.title);
  const first = normalized.drafts[0].startedAt;
  const last = normalized.drafts[normalized.drafts.length - 1].startedAt;
  const duplicates = findDuplicates(normalized.drafts, await listSessionIdentitiesAround(first, last));
  return buildHevyPlan({ drafts: normalized.drafts, exercises: normalized.exercises, choices, catalog, duplicates, include, createdIds: new Map() });
}

describe("Hevy import review", () => {
  it("pre-selects exact matches and needs a decision for the rest", async () => {
    const catalog = await listExercises();
    const initial = initialChoices(normalized.exercises, catalog);
    expect(initial.choices["Bench Press (Barbell)"]).toEqual({ kind: "exercise", exerciseId: "barbell_bench_press" });
    expect(Object.keys(initial.choices).length).toBeLessThan(normalized.exercises.length);
    const p = await plan(() => undefined as never);
    expect(p.undecided.length).toBeGreaterThan(0);
  });

  it("remembered mappings win and a missing exercise is ignored", async () => {
    const catalog = await listExercises();
    const titles = normalized.exercises.slice(0, 2).map((e) => e.title);
    const initial = initialChoices(normalized.exercises, catalog, { [titles[0]]: "dumbbell_curl", [titles[1]]: "gone" });
    expect(initial.choices[titles[0]]).toEqual({ kind: "exercise", exerciseId: "dumbbell_curl" });
    expect(initial.sources[titles[0]]).toBe("remembered");
    expect(initial.sources[titles[1]]).not.toBe("remembered");
  });

  it("creating custom exercises resolves everything; mapped sessions use catalog names", async () => {
    const p = await plan(() => ({ kind: "create" }));
    expect(p.undecided).toEqual([]);
    expect(p.sessions).toHaveLength(normalized.drafts.length);
    expect(p.newExercises.length).toBeGreaterThan(0);
    const bench = p.sessions.flatMap((s) => s.exercises).find((e) => e.exerciseId === "barbell_bench_press");
    expect(bench?.exerciseNameSnapshot).toBe("Barbell Bench Press");
    expect(p.newExercises.every((x) => x.isCustom && x.name !== "")).toBe(true);
    expect(p.mappings["Bench Press (Barbell)"]).toBe("barbell_bench_press");
  });

  it("skipping removes those sets and drops emptied workouts", async () => {
    const all = await plan(() => ({ kind: "skip" }));
    expect(all.counts.skippedSets).toBeGreaterThan(0);
    expect(all.sessions.length).toBeLessThanOrEqual(normalized.drafts.length);
    expect(all.newExercises).toEqual([]);
  });

  it("writes nothing until committed; commit is atomic and a re-import adds 0 workouts", async () => {
    const p = await plan(() => ({ kind: "create" }));
    expect(await db.sessions.count()).toBe(0);
    expect(await commitHevyImport(p)).toBe(normalized.drafts.length);
    expect(await db.sessions.count()).toBe(normalized.drafts.length);
    const stored = (await db.exercises.toArray()).filter((e) => e.isCustom);
    expect(stored).toHaveLength(p.newExercises.length);
    const map = (await getSettings()).hevyExerciseMap ?? {};
    expect(map).toEqual(p.mappings);

    const again = await plan(() => ({ kind: "create" }), map);
    expect(again.counts.workouts).toBe(0);
    expect(again.sessions).toEqual([]);
    expect(again.undecided).toEqual([]);

    const forced = await plan(() => ({ kind: "create" }), map, Object.fromEntries(normalized.drafts.map((d) => [d.id, true])));
    expect(forced.sessions).toHaveLength(normalized.drafts.length);
    expect(forced.newExercises).toEqual([]);
  });

  it("a failing write leaves exercises, sessions and settings untouched", async () => {
    const p = await plan(() => ({ kind: "create" }));
    await saveSettings({ hevyExerciseMap: { keep: "x" } });
    await db.sessions.add({ ...p.sessions[0], id: p.sessions[0].id }); // duplicate id aborts the batch
    const before = await db.sessions.count();
    await expect(commitHevyImport(p)).rejects.toBeDefined();
    expect(await db.sessions.count()).toBe(before);
    expect(await db.exercises.filter((e) => e.isCustom).count()).toBe(0);
    expect((await getSettings()).hevyExerciseMap).toEqual({ keep: "x" });
  });

  it("flags possible duplicates within 10 minutes and keeps them selected", async () => {
    const d = normalized.drafts[0];
    await db.sessions.add({ ...d, id: "other", name: "Something else", startedAt: new Date(Date.parse(d.startedAt) + 5 * 60_000).toISOString() });
    const first = d.startedAt;
    const found = findDuplicates(normalized.drafts, await listSessionIdentitiesAround(first, first));
    expect(found[0].status).toBe("possible");
    const p = await plan(() => ({ kind: "create" }));
    expect(p.sessions).toHaveLength(normalized.drafts.length);
  });
});
