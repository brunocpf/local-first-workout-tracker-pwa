import { common } from "#lib/messages.common";
import { history } from "#lib/messages.history";
import { home } from "#lib/messages.home";
import { vocab } from "#lib/messages.vocab";
import { workout } from "#lib/messages.workout";
import { shell } from "#lib/messages.shell";


export const en = { ...shell.en, ...common.en, ...home.en, ...workout.en, ...vocab.en, ...history.en } as const;
export type MessageKey = keyof typeof en;
/** Base of every `<base>.one` / `<base>.other` pair, for `tn()`. */
export type PluralKey = { [K in MessageKey]: K extends `${infer P}.one` ? P : never }[MessageKey];

export const ptBR: Record<MessageKey, string> = { ...shell.ptBR, ...common.ptBR, ...home.ptBR, ...workout.ptBR, ...vocab.ptBR, ...history.ptBR };

