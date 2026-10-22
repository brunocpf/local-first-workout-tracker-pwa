import { expect, test } from "vitest";
import type { LoggedSet } from "#lib/types";
import { bestSet } from "./bestSet";

const set = (o: Partial<LoggedSet>): LoggedSet => ({ id: "s", type: "normal", completedAt: "2026-01-01T00:00:00.000Z", ...o });

test("picks highest estimated 1RM among counted sets, ignoring warmups and incomplete", () => {
  const a = set({ id: "a", weight: 100, reps: 5 });
  const b = set({ id: "b", weight: 80, reps: 10 });
  const warm = set({ id: "w", type: "warmup", weight: 200, reps: 1 });
  const open = set({ id: "o", weight: 300, reps: 1, completedAt: undefined });
  expect(bestSet([warm, open, b, a])?.id).toBe("a");
});

test("duration and none", () => {
  expect(bestSet([set({ id: "x", durationSeconds: 30 }), set({ id: "y", durationSeconds: 60 })], "duration")?.id).toBe("y");
  expect(bestSet([])).toBeUndefined();
});
