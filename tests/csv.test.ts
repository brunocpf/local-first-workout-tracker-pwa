import { describe, expect, it } from "vitest";
import { CsvError, parseCsv, parseCsvRecords } from "#lib/imports/csv";

describe("parseCsv", () => {
  it("parses plain rows and empty fields", () => {
    expect(parseCsv("a,b,c\n1,,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });
  it("handles CRLF, CR and a missing final newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(parseCsv("a\r1")).toEqual([["a"], ["1"]]);
  });
  it("strips a UTF-8 BOM", () => {
    expect(parseCsv("﻿title,x\n1,2")[0]).toEqual(["title", "x"]);
  });
  it("handles quotes, escaped quotes, embedded commas and newlines", () => {
    const rows = parseCsv('"a, b","say ""hi""","line1\nline2"\n"",x,"\r\n"');
    expect(rows[0]).toEqual(["a, b", 'say "hi"', "line1\nline2"]);
    expect(rows[1]).toEqual(["", "x", "\r\n"]);
  });
  it("skips blank lines but keeps a row of one empty quoted field", () => {
    expect(parseCsv("a\n\n\nb\n")).toEqual([["a"], ["b"]]);
    expect(parseCsv('a\n""\n')).toEqual([["a"], [""]]);
  });
  it("reports record start lines across embedded newlines", () => {
    const r = parseCsvRecords('a,b\n"x\ny",1\nz,2');
    expect(r.map((x) => x.line)).toEqual([1, 2, 4]);
  });
  it("throws on an unterminated quote", () => {
    expect(() => parseCsv('a\n"oops')).toThrow(CsvError);
  });
});
