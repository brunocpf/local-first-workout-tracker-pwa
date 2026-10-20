import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractJsonCandidates, isJson } from "#lib/imports/extract";

const validText = readFileSync("tests/fixtures/program-valid.json", "utf8");

describe("extractJsonCandidates", () => {
  it("returns plain JSON as the single candidate, unchanged", () => {
    expect(extractJsonCandidates(validText)).toEqual([validText.trim()]);
  });

  it("ignores surrounding whitespace when the text starts with {", () => {
    expect(extractJsonCandidates(`\n  ${validText}  \n`)).toEqual([validText.trim()]);
  });

  it("extracts a ```json fenced block", () => {
    const reply = `Here is your plan:\n\n\`\`\`json\n{"schemaVersion": 1}\n\`\`\`\n\nEnjoy!`;
    expect(extractJsonCandidates(reply)).toEqual([`{"schemaVersion": 1}`]);
  });

  it("extracts an untagged ``` fenced block", () => {
    expect(extractJsonCandidates("```\n{\"a\": 1}\n```")).toEqual([`{"a": 1}`]);
  });

  it("returns every fenced block in order", () => {
    const reply = "```json\n{\"n\": 1}\n```\nand\n```json\n{\"n\": 2}\n```";
    expect(extractJsonCandidates(reply)).toEqual([`{"n": 1}`, `{"n": 2}`]);
  });

  it("accepts CRLF line endings", () => {
    expect(extractJsonCandidates("```json\r\n{\"a\": 1}\r\n```")).toEqual([`{"a": 1}`]);
  });

  it("skips fenced blocks in other languages", () => {
    expect(extractJsonCandidates("```ts\nconst x = {};\n```")).toEqual([]);
  });

  it("skips empty fenced blocks", () => {
    expect(extractJsonCandidates("```json\n\n```")).toEqual([]);
  });

  it("never guesses at JSON inside prose", () => {
    expect(extractJsonCandidates('Sure! The plan is {"schemaVersion": 1} as you asked.')).toEqual([]);
  });

  it("returns nothing for text with no JSON shape", () => {
    expect(extractJsonCandidates("   ")).toEqual([]);
    expect(extractJsonCandidates("hello")).toEqual([]);
  });

  it("does not treat an inline ``` run as a fence", () => {
    expect(extractJsonCandidates('use ```json {"a":1}``` please')).toEqual([]);
  });
});

describe("isJson", () => {
  it("is true only for text that parses as JSON", () => {
    expect(isJson(validText)).toBe(true);
    expect(isJson("```json\n{}\n```")).toBe(false);
    expect(isJson("{ nope")).toBe(false);
  });
});
