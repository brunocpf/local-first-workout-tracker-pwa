import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "#lib/storage/db";
import { finishSession, listCompletedSessions, listCompletedSessionsBetween, startSession } from "#lib/storage/sessions";

const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, i));

async function makeCompleted(n: number) {
  for (let i = 0; i < n; i++) {
    const s = await startSession({ name: `S${i}` }, at(i));
    await finishSession(s.id, at(i + 1));
  }
}

beforeEach(async () => {
  await db.sessions.clear();
});

describe("listCompletedSessions", () => {
  it("returns newest first and excludes the active session", async () => {
    await makeCompleted(3);
    await startSession({ name: "active" }, at(100));
    expect((await listCompletedSessions()).map((s) => s.name)).toEqual(["S2", "S1", "S0"]);
  });
  it("loads only 20 by default", async () => {
    await makeCompleted(25);
    expect(await listCompletedSessions()).toHaveLength(20);
  });
  it("paginates with `before` without gaps or repeats", async () => {
    await makeCompleted(7);
    const p1 = await listCompletedSessions({ limit: 3 });
    const p2 = await listCompletedSessions({ limit: 3, before: p1.at(-1)!.startedAt });
    const p3 = await listCompletedSessions({ limit: 3, before: p2.at(-1)!.startedAt });
    expect([...p1, ...p2, ...p3].map((s) => s.name)).toEqual(["S6", "S5", "S4", "S3", "S2", "S1", "S0"]);
    expect(p3).toHaveLength(1);
  });
  it("is empty with no completed sessions", async () => {
    expect(await listCompletedSessions()).toEqual([]);
  });
});

describe("listCompletedSessionsBetween", () => {
  it("returns completed sessions in [from, to) oldest first, excluding active ones", async () => {
    await makeCompleted(5);
    await startSession({ name: "active" }, at(3));
    const names = (await listCompletedSessionsBetween(at(1).toISOString(), at(4).toISOString())).map((s) => s.name);
    expect(names).toEqual(["S1", "S2", "S3"]);
  });
});
