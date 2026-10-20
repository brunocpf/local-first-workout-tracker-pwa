import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { AppDB } from "#lib/storage/db";
import type { WorkoutSession } from "#lib/types";

/**
 * Upgrade-test pattern (see docs/data-model.md "Migrations"):
 * 1. Keep a FROZEN copy of each shipped version's `stores()` schema here (never import it from db.ts).
 * 2. Open a plain Dexie at that version under a unique name and write representative rows.
 * 3. Close, then open `AppDB` with the same name; Dexie runs the upgrades.
 * 4. Assert nothing was lost and the new shape/indexes work.
 * When adding version n+1, add a `V<n>_STORES` + fixture and a test like the one below.
 */
const V1_STORES = {
  exercises: "id, name, *aliases, isCustom, archivedAt",
  programs: "id, name",
  routines: "id, programId, folderId",
  sessions: "id, status, startedAt, routineId, [status+startedAt], *exerciseIds",
  settings: "key",
};

const V1_SESSION: WorkoutSession = {
  id: "s1",
  name: "Push",
  status: "completed",
  startedAt: "2026-01-01T10:00:00.000Z",
  endedAt: "2026-01-01T11:00:00.000Z",
  timeZone: "Europe/Lisbon",
  exercises: [
    {
      id: "se1",
      exerciseId: "bench",
      exerciseNameSnapshot: "Bench Press",
      exerciseTypeSnapshot: "weighted_reps",
      sets: [{ id: "a", type: "normal", weight: 100, reps: 5, completedAt: "2026-01-01T10:10:00.000Z" }],
    },
  ],
  exerciseIds: ["bench"],
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-01T11:00:00.000Z",
};

const opened: Dexie[] = [];
const uniqueName = () => `test-${crypto.randomUUID()}`;
afterEach(async () => {
  for (const d of opened.splice(0)) {
    d.close();
    await Dexie.delete(d.name);
  }
});

describe("migrations", () => {
  it("current AppDB opens a database written at v1 without losing data", async () => {
    const name = uniqueName();
    const old = new Dexie(name);
    old.version(1).stores(V1_STORES);
    await old.table("sessions").put(V1_SESSION);
    await old.table("settings").put({ key: "settings", weightUnit: "lb" });
    old.close();

    const current = new AppDB(name);
    opened.push(current);
    expect(await current.sessions.get("s1")).toEqual(V1_SESSION);
    expect((await current.settings.get("settings"))?.weightUnit).toBe("lb");
    expect((await current.sessions.where("exerciseIds").equals("bench").toArray()).map((s) => s.id)).toEqual(["s1"]);
  });

  it("each AppDB test gets a clean database", async () => {
    const current = new AppDB(uniqueName());
    opened.push(current);
    expect(await current.sessions.count()).toBe(0);
  });
});
