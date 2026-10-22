import { describe, expect, it } from "vitest";
import { en, ptBR } from "#lib/messages";
import { resolveLocale } from "#lib/i18n.svelte";

describe("i18n", () => {
  it("pt-BR has exactly the same keys as en, none empty", () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
    for (const v of Object.values(ptBR)) expect(v.trim()).not.toBe("");
  });

  it("resolves the locale from the setting or the browser languages", () => {
    expect(resolveLocale("en", ["pt-BR"])).toBe("en");
    expect(resolveLocale("pt-BR", ["en-US"])).toBe("pt-BR");
    expect(resolveLocale("system", ["pt-PT", "en"])).toBe("pt-BR");
    expect(resolveLocale("system", ["fr", "en"])).toBe("en");
    expect(resolveLocale("system", [])).toBe("en");
  });
});
