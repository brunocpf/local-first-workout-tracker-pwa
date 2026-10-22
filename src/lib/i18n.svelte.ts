import { en, ptBR, type MessageKey, type PluralKey } from "#lib/messages";
import { settings, updateSettings } from "#lib/settings.svelte";
import type { LocaleSetting } from "#lib/types";

export type Locale = "en" | "pt-BR";
type Params = Record<string, string | number>;

const catalogs: Record<Locale, Record<MessageKey, string>> = { en, "pt-BR": ptBR };

/** Map a BCP 47 tag (e.g. from navigator.language) to a supported locale; Portuguese -> pt-BR. */
export function resolveLocale(setting: LocaleSetting | undefined, preferred: readonly string[]): Locale {
  if (setting && setting !== "system") return setting;
  return preferred.some((l) => l.toLowerCase().startsWith("pt")) ? "pt-BR" : "en";
}

const browserLanguages = () => (typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]));

const locale = $derived(resolveLocale(settings.locale, browserLanguages()));

export const i18n = {
  get locale(): Locale {
    return locale;
  },
};

const fill = (text: string, params?: Params) => (params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : text);

/** Translate a message key in the active locale, filling `{name}` placeholders. Reactive when called from a component. */
export const t = (key: MessageKey, params?: Params): string => fill(catalogs[locale][key], params);

/**
 * Plural message: picks `<key>.one` or `<key>.other` by the locale's plural rules (pt-BR counts 0 as "one").
 * `{n}` is filled with the count. Both forms must exist in every catalog.
 */
export const tn = (key: PluralKey, n: number, params?: Params): string =>
  fill(catalogs[locale][`${key}.${new Intl.PluralRules(locale).select(n) === "one" ? "one" : "other"}` as MessageKey], { n, ...params });

/** BCP 47 tag for `Intl` / `toLocale*String`, following the app language instead of the browser's. */
export const intlLocale = (): string => locale;

export const setLocale = (next: LocaleSetting) => updateSettings({ locale: next });
