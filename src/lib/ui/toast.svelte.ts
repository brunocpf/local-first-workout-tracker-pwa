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

// While a modal dialog is open everything outside it is inert: a toast there could be neither used nor announced.
// So new toasts wait (their timers not started) and visible ones pause until the last modal closes.
let suspended = 0;
const waiting: { toast: Toast; timer: Timer }[] = [];

function show(item: Toast, t: Timer) {
  toasts.push(item);
  timers.set(item.id, t);
  start(item.id, t);
  while (toasts.length > MAX_TOASTS) dismissToast(toasts[0].id);
}

/** Show a toast. Returns its id (for dismissToast). */
export function toast(message: string, { action, durationMs }: ToastOptions = {}): number {
  const id = nextId++;
  const t: Timer = { remaining: durationMs ?? (action ? ACTION_DURATION_MS : DEFAULT_DURATION_MS), startedAt: 0, pauses: 0 };
  if (suspended > 0) waiting.push({ toast: { id, message, action }, timer: t });
  else show({ id, message, action }, t);
  return id;
}

/** A modal dialog opened (called by Dialog). Calls nest. */
export function suspendToasts() {
  if (suspended++ > 0) return;
  for (const { id } of toasts) pauseToast(id);
}

/** A modal dialog closed: resume visible toasts, then show the ones that waited. */
export function resumeToasts() {
  if (suspended === 0 || --suspended > 0) return;
  for (const { id } of toasts) resumeToast(id);
  for (const { toast: item, timer } of waiting.splice(0)) show(item, timer);
}

export function dismissToast(id: number) {
  const w = waiting.findIndex((x) => x.toast.id === id);
  if (w !== -1) waiting.splice(w, 1);
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
  waiting.length = 0;
  suspended = 0;
}
