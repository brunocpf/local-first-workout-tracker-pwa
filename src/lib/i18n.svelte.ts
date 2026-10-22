import { en, ptBR, type MessageKey } from "#lib/messages";
import { getSettings, saveSettings } from "#lib/storage/settings";
import type { LocaleSetting } from "#lib/types";

export type Locale = "en" | "pt-BR";

const catalogs: Record<Locale, Record<MessageKey, string>> = { en, "pt-BR": ptBR };

/** Map a BCP 47 tag (e.g. from navigator.language) to a supported locale; Portuguese -> pt-BR. */
export function resolveLocale(setting: LocaleSetting, preferred: readonly string[]): Locale {
  if (setting !== "system") return setting;
  return preferred.some((l) => l.toLowerCase().startsWith("pt")) ? "pt-BR" : "en";
}

const browserLanguages = () => (typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]));

let setting = $state<LocaleSetting>("system");
const locale = $derived(resolveLocale(setting, browserLanguages()));

export const i18n = {
  get locale(): Locale {
    return locale;
  },
  get setting(): LocaleSetting {
    return setting;
  },
};

/** Translate a message key in the active locale. Reactive when called from a component. */
export const t = (key: MessageKey): string => catalogs[locale][key];

/** Load the stored language preference. Falls back to the browser language if storage fails. */
export async function initLocale() {
  try {
    setting = (await getSettings()).locale;
  } catch {
    // Keep "system".
  }
}

export async function setLocale(next: LocaleSetting) {
  setting = next;
  await saveSettings({ locale: next });
}
