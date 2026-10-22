import { en, ptBR, type MessageKey } from "#lib/messages";
import { settings, updateSettings } from "#lib/settings.svelte";
import type { LocaleSetting } from "#lib/types";

export type Locale = "en" | "pt-BR";

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

/** Translate a message key in the active locale. Reactive when called from a component. */
export const t = (key: MessageKey): string => catalogs[locale][key];

export const setLocale = (next: LocaleSetting) => updateSettings({ locale: next });
