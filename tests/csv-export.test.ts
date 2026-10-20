import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, csvBlob, csvCell, csvFileName, sessionsToCsv } from "#lib/exports/csv";
import { parseCsvRecords } from "#lib/imports/csv";
import type { WorkoutSession } from "#lib/types";

const session = (over: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: "s1",
  name: 'Push, "heavy"',
  status: "completed",
  startedAt: "2026-03-01T23:30:00.000Z",
  endedAt: "2026-03-02T00:30:00.000Z",
  timeZone: "Asia/Tokyo",
  routineNameSnapshot: "Push A",
  exerciseIds: ["e1"],
  createdAt: "",
  updatedAt: "",
  exercises: [
    {
      id: "x1",
      exerciseId: "e1",
      exerciseNameSnapshot: "Bench Press",
      exerciseTypeSnapshot: "weighted_reps",
      sets: [
        { id: "a", type: "normal", weight: 82.5, reps: 5, rpe: 8, completedAt: "2026-03-02T00:00:00.000Z", notes: "line1\nline2" },
        { id: "b", type: "warmup", weight: 40, reps: 10 },
      ],
    },
  ],
  ...over,
});

describe("csvCell", () => {
  it("quotes per RFC 4180", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(undefined)).toBe("");
  });
  it("neutralizes formulas in text but not numbers", () => {
    for (const t of ["=1+1", "+1", "-1", "@SUM(A1)"]) expect(csvCell(t)).toBe(`'${t}`);
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(false)).toBe("false");
  });
});

describe("sessionsToCsv", () => {
  it("writes a header and one row per set, round-tripping through the parser", () => {
    const rows = parseCsvRecords(sessionsToCsv([session()])).map((r) => r.fields);
    expect(rows[0]).toEqual([...CSV_COLUMNS]);
    expect(rows).toHaveLength(3);
    const col = (r: string[], c: (typeof CSV_COLUMNS)[number]) => r[CSV_COLUMNS.indexOf(c)];
    expect(col(rows[1], "session_name")).toBe('Push, "heavy"');
    expect(col(rows[1], "local_date")).toBe("2026-03-02");
    expect(col(rows[1], "weight_kg")).toBe("82.5");
    expect(col(rows[1], "completed")).toBe("true");
    expect(col(rows[1], "notes")).toBe("line1\nline2");
    expect(col(rows[2], "set_order")).toBe("2");
    expect(col(rows[2], "completed")).toBe("false");
    expect(col(rows[2], "rpe")).toBe("");
  });
  it("has only a header when there is no history", () => {
    expect(sessionsToCsv([])).toBe(CSV_COLUMNS.join(",") + "\r\n");
  });
});

describe("blob and name", () => {
  it("starts with a BOM", async () => {
    expect([...new Uint8Array(await csvBlob("a").arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });
  it("names the file by local date", () => {
    expect(csvFileName(new Date(2026, 0, 5))).toBe("workout-history-2026-01-05.csv");
  });
});
