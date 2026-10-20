import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { AppDB } from "#lib/storage/db";

it("persists and reads a session", async () => {
  const db = new AppDB("test");
  const now = new Date().toISOString();
  await db.sessions.add({ id: "1", name: "t", status: "active", startedAt: now, exercises: [], createdAt: now, updatedAt: now });
  expect((await db.sessions.get("1"))?.status).toBe("active");
});
