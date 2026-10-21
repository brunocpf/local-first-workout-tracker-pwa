import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { shouldRemindBackup } from "#lib/backup/reminder";
import { backupV3 } from "#lib/backup/format";
import { buildBackup } from "#lib/backup/export";
import { db, SETTINGS_KEY } from "#lib/storage/db";
import { countCompletedSince, finishSession, startSession } from "#lib/storage/sessions";
import { DEFAULT_SETTINGS, getSettings } from "#lib/storage/settings";

const now = new Date("2026-03-31T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const base = { now, days: 14, sessions: 10 };

describe("shouldRemindBackup", () => {
  it.each([
    ["no workouts, never backed up", { completedSince: 0 }, false],
    ["no new workouts, old backup", { completedSince: 0, lastBackupAt: daysAgo(100) }, false],
    ["never backed up, one workout", { completedSince: 1 }, true],
    ["recent backup, few workouts", { completedSince: 3, lastBackupAt: daysAgo(2) }, false],
    ["exactly 14 days old", { completedSince: 1, lastBackupAt: daysAgo(14) }, false],
    ["older than 14 days", { completedSince: 1, lastBackupAt: daysAgo(15) }, true],
    ["9 workouts since", { completedSince: 9, lastBackupAt: daysAgo(1) }, false],
    ["10 workouts since", { completedSince: 10, lastBackupAt: daysAgo(1) }, true],
    ["days off, old backup", { completedSince: 1, lastBackupAt: daysAgo(99), days: 0 }, false],
    ["days off, many workouts", { completedSince: 12, lastBackupAt: daysAgo(99), days: 0 }, true],
    ["sessions off, many workouts", { completedSince: 50, lastBackupAt: daysAgo(1), sessions: 0 }, false],
    ["sessions off, old backup", { completedSince: 1, lastBackupAt: daysAgo(30), sessions: 0 }, true],
    ["both off but never backed up", { completedSince: 5, days: 0, sessions: 0 }, true],
    ["unparseable lastBackupAt", { completedSince: 1, lastBackupAt: "nope" }, true],
  ])("%s", (_name, input, expected) => {
    expect(shouldRemindBackup({ ...base, ...input })).toBe(expected);
  });
});

describe("countCompletedSince", () => {
  beforeEach(async () => {
    await db.sessions.clear();
  });
  const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, i));

  it("counts completed sessions started after the timestamp, ignoring active ones", async () => {
    for (let i = 0; i < 4; i++) {
      const s = await startSession({ name: `S${i}` }, at(i * 10));
      await finishSession(s.id, at(i * 10 + 1));
    }
    await startSession({ name: "active" }, at(100));
    expect(await countCompletedSince()).toBe(4);
    expect(await countCompletedSince(at(10).toISOString())).toBe(2);
    expect(await countCompletedSince(at(30).toISOString())).toBe(0);
  });
});

describe("reminder settings", () => {
  beforeEach(async () => {
    await db.settings.clear();
  });

  it("defaults to 14 days and 10 workouts", async () => {
    expect(DEFAULT_SETTINGS.backupReminderDays).toBe(14);
    expect(DEFAULT_SETTINGS.backupReminderSessions).toBe(10);
    expect((await getSettings()).backupReminderSessions).toBe(10);
  });

  it("round-trips through the backup format", async () => {
    await db.settings.put({ ...DEFAULT_SETTINGS, key: SETTINGS_KEY, backupReminderDays: 0, backupReminderSessions: 25 } as never);
    const backup = await buildBackup({});
    const parsed = backupV3.parse(JSON.parse(JSON.stringify(backup)));
    expect(parsed.data.settings.backupReminderDays).toBe(0);
    expect(parsed.data.settings.backupReminderSessions).toBe(25);
  });
});
