import { describe, expect, it } from "vitest";
import { adjustRestTimer, pauseRestTimer, remainingSeconds, resumeRestTimer, startRestTimer } from "#lib/restTimer";

const t0 = Date.parse("2026-01-01T10:00:00.000Z");

describe("rest timer", () => {
  it("is timestamp based and never negative", () => {
    const t = startRestTimer(90, t0);
    expect(t.endsAt).toBe("2026-01-01T10:01:30.000Z");
    expect(remainingSeconds(t, t0)).toBe(90);
    expect(remainingSeconds(t, t0 + 500)).toBe(90); // ceil
    expect(remainingSeconds(t, t0 + 89_500)).toBe(1);
    expect(remainingSeconds(t, t0 + 200_000)).toBe(0);
  });
  it("pause freezes remaining time, resume restarts from it", () => {
    const paused = pauseRestTimer(startRestTimer(60, t0), t0 + 20_000);
    expect(paused.pausedRemainingMs).toBe(40_000);
    expect(remainingSeconds(paused, t0 + 999_999)).toBe(40);
    const resumed = resumeRestTimer(paused, t0 + 100_000);
    expect(resumed.pausedRemainingMs).toBeUndefined();
    expect(resumed.endsAt).toBe(new Date(t0 + 140_000).toISOString());
    expect(remainingSeconds(resumed, t0 + 110_000)).toBe(30);
  });
  it("pause and resume are idempotent", () => {
    const paused = pauseRestTimer(startRestTimer(60, t0), t0 + 1000);
    expect(pauseRestTimer(paused, t0 + 5000)).toBe(paused);
    const running = startRestTimer(60, t0);
    expect(resumeRestTimer(running)).toBe(running);
  });
  it("survives a JSON round trip (persisted on the session)", () => {
    const paused = pauseRestTimer(startRestTimer(60, t0), t0 + 1000);
    expect(JSON.parse(JSON.stringify(paused))).toEqual(paused);
  });
  it("adjusts running and paused timers", () => {
    expect(remainingSeconds(adjustRestTimer(startRestTimer(60, t0), 15, t0), t0)).toBe(75);
    expect(remainingSeconds(adjustRestTimer(startRestTimer(60, t0), -100, t0), t0)).toBe(0);
    const paused = pauseRestTimer(startRestTimer(60, t0), t0 + 10_000);
    expect(remainingSeconds(adjustRestTimer(paused, 15), 0)).toBe(65);
  });
});
