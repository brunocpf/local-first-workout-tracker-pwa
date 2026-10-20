import { describe, expect, it } from "vitest";
import { groupForPicker, recentExerciseIds } from "#lib/catalog/search";

const session = (...ids: string[]) => ({ exercises: ids.map((exerciseId) => ({ exerciseId })) });
const ex = (id: string, favorite = false) => ({ id, name: id, aliases: [], favorite });

describe("recentExerciseIds", () => {
  it("collects distinct ids from the newest 5 sessions, newest first", () => {
    const sessions = [session("a", "b"), session("b", "c"), session("d"), session("e"), session("f"), session("old")];
    expect(recentExerciseIds(sessions)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });
  it("ignores sessions beyond the limit", () => {
    const sessions = [session("a"), session("b"), session("c"), session("d"), session("e"), session("old")];
    expect(recentExerciseIds(sessions)).not.toContain("old");
  });
  it("is empty without sessions", () => {
    expect(recentExerciseIds([])).toEqual([]);
  });
});

describe("groupForPicker", () => {
  it("orders favorites, then recent, then the rest, without duplicates", () => {
    const g = groupForPicker([ex("a"), ex("b", true), ex("c"), ex("d", true), ex("e")], ["c", "d", "zzz"]);
    expect(g.favorites.map((e) => e.id)).toEqual(["b", "d"]);
    expect(g.recent.map((e) => e.id)).toEqual(["c"]);
    expect(g.all.map((e) => e.id)).toEqual(["a", "e"]);
  });
});
