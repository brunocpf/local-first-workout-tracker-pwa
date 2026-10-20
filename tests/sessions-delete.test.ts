import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "#lib/storage/db";
import { deleteCompletedSession, finishSession, getSession, startSession } from "#lib/storage/sessions";

const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, i));

beforeEach(async () => {
  await db.sessions.clear();
  await db.routines.clear();
});

describe("getSession", () => {
  it("returns the session or undefined", async () => {
    const s = await startSession({ name: "A" }, at(0));
    expect((await getSession(s.id))?.name).toBe("A");
    expect(await getSession("nope")).toBeUndefined();
  });
});

describe("deleteCompletedSession", () => {
  it("deletes only the given completed session, leaving others and routines alone", async () => {
    const a = await startSession({ name: "A" }, at(0));
    await finishSession(a.id, at(1));
    const b = await startSession({ name: "B" }, at(2));
    await finishSession(b.id, at(3));
    await db.routines.put({ id: "r1", name: "R", exercises: [], createdAt: "x", updatedAt: "x" });

    await deleteCompletedSession(a.id);

    expect(await getSession(a.id)).toBeUndefined();
    expect((await getSession(b.id))?.name).toBe("B");
    expect(await db.routines.count()).toBe(1);
  });

  it("refuses active sessions", async () => {
    const s = await startSession({ name: "A" }, at(0));
    await expect(deleteCompletedSession(s.id)).rejects.toThrow(/not completed/);
    expect(await getSession(s.id)).toBeDefined();
  });

  it("is a no-op for unknown ids", async () => {
    await expect(deleteCompletedSession("nope")).resolves.toBeUndefined();
  });
});
