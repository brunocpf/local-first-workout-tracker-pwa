// confirm() (design.md §6.10). One <ConfirmDialog> in +layout.svelte shows `confirmQueue[0]`; requests made while
// another is open wait their turn instead of replacing it.

export type ConfirmOptions = {
  title: string;
  body: string;
  /** A specific verb phrase ("Discard workout"), never "OK" or "Yes". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Danger styling; initial focus goes to Cancel. */
  danger?: boolean;
  /** Runs without closing the dialog (e.g. "Export a backup first"). */
  secondaryAction?: { label: string; run: () => void | Promise<void> };
};

export type ConfirmRequest = ConfirmOptions & { id: number; resolve: (confirmed: boolean) => void };

export const confirmQueue: ConfirmRequest[] = $state([]);
let nextId = 1;

/** Ask the user to confirm. Resolves true on confirm; false on Cancel, Esc or backdrop. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    confirmQueue.push({ ...options, id: nextId++, resolve });
  });
}

/** Settle the request shown now and move to the next one. Called by the host when its dialog has closed. */
export function settleConfirm(confirmed: boolean) {
  const request = confirmQueue.shift();
  request?.resolve(confirmed);
}
