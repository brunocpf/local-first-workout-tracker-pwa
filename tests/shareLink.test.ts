import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MAX_IMPORT_BYTES, parseProgramImport } from "#lib/imports/parseProgram";
import {
  MAX_FRAGMENT_CHARS,
  SHARE_URL_WARN_LENGTH,
  ShareLinkError,
  buildShareData,
  buildShareUrl,
  decodePayload,
  encodePayload,
  isShareHash,
  parseShareHash,
  payloadFromHash,
} from "#lib/imports/shareLink";
import type { Exercise, Program, Routine } from "#lib/types";

const ts = "2026-01-01T00:00:00.000Z";
const exercises = new Map<string, Pick<Exercise, "name" | "isCustom" | "exerciseType" | "equipment">>([
  ["bench", { name: "Bench Press", isCustom: false, exerciseType: "weighted_reps", equipment: ["barbell"] }],
  ["row", { name: "Barbell Row", isCustom: false, exerciseType: "weighted_reps", equipment: ["barbell"] }],
  ["thing", { name: "Landmine press", isCustom: true, exerciseType: "weighted_reps", equipment: ["landmine"] }],
  ["pullup", { name: "Assisted pull-up", isCustom: true, exerciseType: "assisted_bodyweight", equipment: [] }],
]);
const routine = (id: string, name: string, order: number, exs: Routine["exercises"]): Routine => ({
  id, name, programId: "p", programOrder: order, exercises: exs, createdAt: ts, updatedAt: ts,
});
const routines = [
  routine("ra", "Upper", 0, [
    {
      id: "e1", exerciseId: "bench", restSeconds: 120, notes: "Pause", supersetGroupId: "s",
      prescribedSets: [
        { id: "s1", type: "warmup", repRange: [8, 10], targetWeight: 40 },
        { id: "s2", type: "normal", repRange: [5, 8], targetRpe: 8, targetRir: 2 },
      ],
    },
    { id: "e2", exerciseId: "row", supersetGroupId: "s", prescribedSets: [{ id: "s3", type: "normal", targetDurationSeconds: 45 }] },
    { id: "e3", exerciseId: "thing", prescribedSets: [{ id: "s4", type: "normal", targetDistance: 30 }] },
    { id: "e4", exerciseId: "pullup", prescribedSets: [{ id: "s5", type: "normal" }] },
    { id: "e5", exerciseId: "bench", prescribedSets: [] },
  ]),
  routine("rb", "Empty", 1, []),
  routine("rc", "Lower", 2, [{ id: "e6", exerciseId: "ghost", prescribedSets: [{ id: "s6", type: "normal" }] }]),
];
const program: Program = {
  id: "p", name: "Split", description: "Two days", daysPerWeek: 2, schemaVersion: 1, createdAt: ts, updatedAt: ts,
  schedule: { type: "weekly", days: [{ day: "monday", routineId: "ra" }, { day: "tuesday", routineId: "rb" }, { day: "friday", routineId: "rc" }] },
};

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

describe("buildShareData", () => {
  const data = buildShareData(routines, exercises, program);

  it("produces a document the importer accepts, unchanged", () => {
    const r = parseProgramImport(JSON.stringify(data));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings).toEqual([]);
      expect(r.data).toEqual(data);
    }
  });

  it("maps routines, sets, supersets and drops what cannot be prescribed", () => {
    const p = data.program;
    expect(p.name).toBe("Split");
    expect(p.routines.map((r) => r.name)).toEqual(["Upper", "Lower"]);
    const upper = p.routines[0].exercises;
    expect(upper).toHaveLength(4); // the exercise without sets is dropped
    expect(upper[0]).toMatchObject({ exercise: { id: "bench", name: "Bench Press" }, restSeconds: 120, notes: "Pause", supersetGroup: "G1" });
    expect(upper[0].setList).toEqual([
      { setType: "warmup", repRange: [8, 10], targetWeight: 40 },
      { setType: "normal", repRange: [5, 8], rpe: 8, rir: 2 },
    ]);
    expect(upper[1].supersetGroup).toBe("G1");
    expect(upper[1]).toMatchObject({ sets: 1, setType: "normal", targetDurationSeconds: 45 });
    expect(upper[1].setList).toBeUndefined();
    expect(upper[2]).toMatchObject({ exercise: { name: "Landmine press", equipment: "landmine", exerciseType: "weighted_reps" } });
    expect(upper[2].exercise.id).toBeUndefined();
    expect(upper[2]).toMatchObject({ sets: 1, targetDistanceMeters: 30 });
    expect(upper[3].exercise).toEqual({ name: "Assisted pull-up" }); // type not expressible in schema v1
    expect(p.routines[1].exercises[0].exercise).toEqual({ id: "ghost" });
  });

  it("collapses identical sets into the shorthand", () => {
    const set = (id: string) => ({ id, type: "normal" as const, repRange: [6, 10] as [number, number], targetWeight: 80 });
    const r = routine("rx", "X", 0, [{ id: "ex", exerciseId: "bench", prescribedSets: [set("a"), set("b"), set("c")] }]);
    const [e] = buildShareData([r], exercises).program.routines[0].exercises;
    expect(e).toMatchObject({ sets: 3, setType: "normal", repRange: [6, 10], targetWeight: 80 });
    expect(e.setList).toBeUndefined();
  });

  it("remaps the schedule to file ids and omits days of dropped routines", () => {
    expect(data.program.schedule?.days).toEqual([
      { day: "monday", routine: "r1" },
      { day: "friday", routine: "r2" },
    ]);
  });

  it("shares standalone routines under the routine's name", () => {
    const d = buildShareData([routines[0]], exercises);
    expect(d.program.name).toBe("Upper");
    expect(d.program.schedule).toBeUndefined();
  });

  it("refuses when nothing is shareable", () => {
    expect(() => buildShareData([routines[1]], exercises)).toThrow(ShareLinkError);
  });
});

describe("payload round trip", () => {
  it("encodes to URL-safe characters and decodes back", async () => {
    const text = JSON.stringify(buildShareData(routines, exercises, program)) + " ünïcödé 💪";
    const payload = await encodePayload(text);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodePayload(payload)).toBe(text);
  });

  it("round-trips a full fixture through the URL and the normal parser", async () => {
    const parsed = parseProgramImport(readFileSync("tests/fixtures/program-full.json", "utf8"));
    if (!parsed.ok) throw new Error("fixture");
    const { url, tooLong } = await buildShareUrl(parsed.data, "https://example.test/app/routines/import");
    expect(url.startsWith("https://example.test/app/routines/import#p=")).toBe(true);
    expect(tooLong).toBe(url.length > SHARE_URL_WARN_LENGTH);
    const result = await parseShareHash(new URL(url).hash);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.data).toEqual(parsed.data);
  });

  it("flags links longer than messaging apps handle", async () => {
    const base = buildShareData(routines, exercises, program);
    const big = structuredClone(base);
    const noise = (n: number) => Buffer.from(Array.from({ length: n }, () => Math.floor(Math.random() * 256))).toString("base64").slice(0, n);
    big.program.description = noise(2000);
    for (const e of big.program.routines[0].exercises) e.notes = noise(1000);
    expect((await buildShareUrl(big, "https://x.test/i")).tooLong).toBe(true);
    expect((await buildShareUrl({ ...base, program: { ...base.program, routines: [base.program.routines[0]] } }, "https://x.test/i")).tooLong).toBe(false);
  });
});

describe("hash parsing", () => {
  it("recognises share hashes", () => {
    expect(payloadFromHash("#p=abc_-9")).toBe("abc_-9");
    expect(payloadFromHash("#p=ab+c")).toBeUndefined();
    expect(payloadFromHash("#q=abc")).toBeUndefined();
    expect(payloadFromHash("")).toBeUndefined();
    expect(isShareHash("#p=")).toBe(true);
    expect(isShareHash("#other")).toBe(false);
  });
});

describe("corrupt input", () => {
  const damaged = (hash: string) => parseShareHash(hash).then((r) => (r.ok ? [] : r.errors));

  it("rejects an empty or non-matching fragment", async () => {
    expect(await damaged("#p=")).toEqual(["This link is damaged or incomplete."]);
    expect(await damaged("#p=%%%")).toEqual(["This link is damaged or incomplete."]);
  });

  it("rejects text that is not base64url", async () => {
    await expect(decodePayload("a")).rejects.toThrow(/damaged/);
  });

  it("rejects bytes that are not a deflate stream", async () => {
    expect(await damaged("#p=" + btoa("this is not compressed data!!").replace(/=+$/, ""))).toEqual([
      "This link is damaged or incomplete.",
    ]);
  });

  it("rejects a truncated payload", async () => {
    const payload = await encodePayload(JSON.stringify(buildShareData(routines, exercises, program)));
    expect(await damaged(`#p=${payload.slice(0, Math.floor(payload.length / 2))}`)).toEqual(["This link is damaged or incomplete."]);
  });

  it("rejects valid compressed data that is not JSON or not a plan", async () => {
    expect(await damaged("#p=" + (await encodePayload("not json")))).toEqual(["Malformed JSON"]);
    const wrong = await damaged("#p=" + (await encodePayload('{"schemaVersion": 1, "program": {}}')));
    expect(wrong[0]).toContain("program.");
    expect(await damaged("#p=" + (await encodePayload('{"schemaVersion": 2}')))).toEqual(["Unsupported schemaVersion: 2"]);
  });

  it("rejects invalid UTF-8 after inflating", async () => {
    const payload = b64url(deflateRawSync(new Uint8Array([0xff, 0xfe, 0xfd])));
    await expect(decodePayload(payload)).rejects.toThrow(/damaged/);
  });

  it("rejects an oversize fragment without decoding it", async () => {
    await expect(decodePayload("A".repeat(MAX_FRAGMENT_CHARS + 1))).rejects.toThrow(/too large/);
  });

  it("stops inflating a decompression bomb", async () => {
    const bytes = deflateRawSync(new Uint8Array(MAX_IMPORT_BYTES + 1_000_000));
    expect(bytes.byteLength).toBeLessThan(MAX_FRAGMENT_CHARS); // small on the wire, huge when inflated
    const payload = b64url(bytes);
    expect(await damaged(`#p=${payload}`)).toEqual(["This link's content is too large."]);
  });

  it("refuses to encode an oversize document", async () => {
    await expect(encodePayload("x".repeat(MAX_IMPORT_BYTES + 1))).rejects.toThrow(/too large/);
  });
});
