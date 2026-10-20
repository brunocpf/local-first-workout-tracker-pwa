// Toast queue (design.md §6.12). One <Toaster> in +layout.svelte renders `toasts`; any module can call toast().
// Timers live here, not in the component, so pause/resume and auto-dismiss are testable without a DOM.

export type ToastAction = { label: string; run: () => void };
export type ToastOptions = { action?: ToastAction; durationMs?: number };
export type Toast = { id: number; message: string; action?: ToastAction };

export const MAX_TOASTS = 3;
export const DEFAULT_DURATION_MS = 4000;
export const ACTION_DURATION_MS = 6000;

/** Visible toasts, oldest first (newest renders at the bottom). */
export const toasts: Toast[] = $state([]);

type Timer = { remaining: number; startedAt: number; handle?: ReturnType<typeof setTimeout>; pauses: number };
// Plain (non-reactive) bookkeeping: nothing renders from it.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const timers = new Map<number, Timer>();
let nextId = 1;

function start(id: number, t: Timer) {
  t.startedAt = Date.now();
  t.handle = setTimeout(() => dismissToast(id), t.remaining);
}

/** Show a toast. Returns its id (for dismissToast). */
export function toast(message: string, { action, durationMs }: ToastOptions = {}): number {
  const id = nextId++;
  toasts.push({ id, message, action });
  const t: Timer = { remaining: durationMs ?? (action ? ACTION_DURATION_MS : DEFAULT_DURATION_MS), startedAt: 0, pauses: 0 };
  timers.set(id, t);
  start(id, t);
  while (toasts.length > MAX_TOASTS) dismissToast(toasts[0].id);
  return id;
}

export function dismissToast(id: number) {
  const t = timers.get(id);
  if (t) clearTimeout(t.handle);
  timers.delete(id);
  const i = toasts.findIndex((x) => x.id === id);
  if (i !== -1) toasts.splice(i, 1);
}

/** Run the toast's action at most once, then dismiss it. A timed-out or already-used toast does nothing. */
export function runToastAction(id: number) {
  const action = toasts.find((x) => x.id === id)?.action;
  if (!action || !timers.has(id)) return;
  dismissToast(id);
  action.run();
}

/** Pause the auto-dismiss timer (hover or focus inside). Pauses nest: hover + focus need two resumes. */
export function pauseToast(id: number) {
  const t = timers.get(id);
  if (!t || t.pauses++ > 0) return;
  clearTimeout(t.handle);
  t.remaining = Math.max(0, t.remaining - (Date.now() - t.startedAt));
}

export function resumeToast(id: number) {
  const t = timers.get(id);
  if (!t || t.pauses === 0 || --t.pauses > 0) return;
  start(id, t);
}

/** Test helper: drop every toast and timer. */
export function clearToasts() {
  for (const t of timers.values()) clearTimeout(t.handle);
  timers.clear();
  toasts.length = 0;
}
