import { describe, expect, it } from "vitest";
import { findDuplicates, type WorkoutIdentity } from "#lib/imports/duplicates";

const w = (startedAt: string, name = "Pull"): WorkoutIdentity => ({ startedAt, name });

// Same shape as the Hevy sample: one workout per distinct (title, start) pair.
const file: WorkoutIdentity[] = [
  w("2026-10-13T21:50:00.000Z", "Pull"),
  w("2026-10-14T21:50:00.000Z", "Push"),
  w("2026-10-15T08:05:00.000Z", "Legs"),
];

describe("findDuplicates", () => {
  it("flags every workout of a re-imported file as a stored duplicate", () => {
    // Stored sessions created from the same file, as after a first import.
    const stored = file.map((x) => ({ ...x }));
    const result = findDuplicates(file, stored);
    expect(result).toHaveLength(file.length);
    result.forEach((r, i) => expect(r).toEqual({ status: "duplicate", source: "stored", index: i }));
  });

  it("treats everything as new when nothing is stored", () => {
    expect(findDuplicates(file, [])).toEqual([{ status: "new" }, { status: "new" }, { status: "new" }]);
  });

  it("matches names regardless of case, punctuation and spacing", () => {
    const result = findDuplicates([w("2026-10-13T21:50:00.000Z", "PULL-day")], [w("2026-10-13T21:50:00.000Z", "pull  day")]);
    expect(result).toEqual([{ status: "duplicate", source: "stored", index: 0 }]);
  });

  it("compares start instants by minute, ignoring seconds", () => {
    const result = findDuplicates([w("2026-10-13T21:50:45.000Z")], [w("2026-10-13T21:50:10.000Z")]);
    expect(result).toEqual([{ status: "duplicate", source: "stored", index: 0 }]);
  });

  it("keeps the first of two identical workouts in the same file", () => {
    const result = findDuplicates([file[0], file[0], file[1]], []);
    expect(result).toEqual([{ status: "new" }, { status: "duplicate", source: "file", index: 0 }, { status: "new" }]);
  });

  it("prefers a stored duplicate over a duplicate earlier in the file", () => {
    const result = findDuplicates([file[0], file[0]], [file[0]]);
    expect(result[1]).toEqual({ status: "duplicate", source: "stored", index: 0 });
  });

  it("reports a stored session within ±10 minutes with a different name as possible", () => {
    const result = findDuplicates([w("2026-10-13T21:50:00.000Z", "Push")], [w("2026-10-13T21:45:00.000Z", "Pull")]);
    expect(result).toEqual([{ status: "possible", index: 0 }]);
  });

  it("reports the same name at a different instant within ±10 minutes as possible (wrong zone)", () => {
    const near = findDuplicates([w("2026-10-13T21:58:00.000Z")], [w("2026-10-13T21:50:00.000Z")]);
    expect(near).toEqual([{ status: "possible", index: 0 }]);
  });

  it("does not flag the same name two hours apart", () => {
    const result = findDuplicates([w("2026-10-13T23:50:00.000Z")], [w("2026-10-13T21:50:00.000Z")]);
    expect(result).toEqual([{ status: "new" }]);
  });

  it("uses the ±10 minute boundary inclusively", () => {
    const at = findDuplicates([w("2026-10-13T22:00:00.000Z", "Push")], [w("2026-10-13T21:50:00.000Z")]);
    const past = findDuplicates([w("2026-10-13T22:01:00.000Z", "Push")], [w("2026-10-13T21:50:00.000Z")]);
    expect(at).toEqual([{ status: "possible", index: 0 }]);
    expect(past).toEqual([{ status: "new" }]);
  });

  it("points a possible duplicate at the nearest stored session", () => {
    const stored = [w("2026-10-13T21:40:00.000Z", "A"), w("2026-10-13T21:53:00.000Z", "B")];
    expect(findDuplicates([w("2026-10-13T21:50:00.000Z", "C")], stored)).toEqual([{ status: "possible", index: 1 }]);
  });

  it("does not compare possible duplicates within the same file", () => {
    const result = findDuplicates([w("2026-10-13T21:50:00.000Z", "Pull"), w("2026-10-13T21:52:00.000Z", "Push")], []);
    expect(result).toEqual([{ status: "new" }, { status: "new" }]);
  });

  it("treats an unparseable start as new instead of throwing", () => {
    expect(findDuplicates([w("not a date")], [w("2026-10-13T21:50:00.000Z")])).toEqual([{ status: "new" }]);
    expect(findDuplicates([w("2026-10-13T21:50:00.000Z")], [w("not a date")])).toEqual([{ status: "new" }]);
  });

  it("does not modify its inputs", () => {
    const drafts = [...file];
    const existing = file.map((x) => ({ ...x }));
    const before = JSON.stringify([drafts, existing]);
    findDuplicates(drafts, existing);
    expect(JSON.stringify([drafts, existing])).toBe(before);
  });
});
