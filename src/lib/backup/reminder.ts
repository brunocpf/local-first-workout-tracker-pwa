import { countCompletedSince } from "#lib/storage/sessions";
import type { UserSettings } from "#lib/types";

const DAY_MS = 86_400_000;

export type ReminderInput = {
  lastBackupAt?: string;
  /** Completed workouts started after `lastBackupAt` (all of them when never backed up). */
  completedSince: number;
  now: Date;
  /** 0 disables the age rule. */
  days: number;
  /** 0 disables the workout-count rule. */
  sessions: number;
};

/** Pure policy: remind when there is something unsaved and (never backed up, too old, or too many workouts since). */
export function shouldRemindBackup({ lastBackupAt, completedSince, now, days, sessions }: ReminderInput): boolean {
  if (completedSince < 1) return false;
  const last = lastBackupAt ? Date.parse(lastBackupAt) : NaN;
  if (Number.isNaN(last)) return true;
  if (days > 0 && now.getTime() - last > days * DAY_MS) return true;
  return sessions > 0 && completedSince >= sessions;
}

/** Reads the count from the index and applies the policy with the user's thresholds. */
export async function backupReminderDue(s: Pick<UserSettings, "lastBackupAt" | "backupReminderDays" | "backupReminderSessions">, now = new Date()) {
  if (s.backupReminderDays === 0 && s.backupReminderSessions === 0) return false;
  return shouldRemindBackup({
    lastBackupAt: s.lastBackupAt,
    completedSince: await countCompletedSince(s.lastBackupAt),
    now,
    days: s.backupReminderDays ?? 14,
    sessions: s.backupReminderSessions ?? 10,
  });
}
