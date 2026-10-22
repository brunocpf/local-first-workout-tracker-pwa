import { describe, expect, it } from "vitest";
import { en, ptBR } from "#lib/messages";
import { resolveLocale } from "#lib/i18n.svelte";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("i18n", () => {
  it("pt-BR has exactly the same keys as en, none empty", () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
    for (const v of Object.values(ptBR)) expect(v.trim()).not.toBe("");
  });

  it("every message uses the same placeholders in both languages", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ptBR[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("plural messages come as .one/.other pairs", () => {
    const keys = Object.keys(en);
    for (const key of keys.filter((k) => k.endsWith(".one"))) expect(keys, key).toContain(`${key.slice(0, -4)}.other`);
    // "equipment.other" is the vocabulary entry for "other equipment", not a plural form.
    for (const key of keys.filter((k) => k.endsWith(".other") && k !== "equipment.other")) expect(keys, key).toContain(`${key.slice(0, -6)}.one`);
  });

  it("resolves the locale from the setting or the browser languages", () => {
    expect(resolveLocale("en", ["pt-BR"])).toBe("en");
    expect(resolveLocale("pt-BR", ["en-US"])).toBe("pt-BR");
    expect(resolveLocale("system", ["pt-PT", "en"])).toBe("pt-BR");
    expect(resolveLocale("system", ["fr", "en"])).toBe("en");
    expect(resolveLocale("system", [])).toBe("en");
    expect(resolveLocale(undefined, ["pt"])).toBe("pt-BR");
  });
});
