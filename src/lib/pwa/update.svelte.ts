import { updated } from "$app/state";

// The active-session store (`#lib/logger/activeSession.svelte`) sets this to false while a workout is
// in progress, so the "Update available" banner never invites a reload mid-workout.
let canUpdate = $state(true);

export function setCanUpdate(value: boolean) {
  canUpdate = value;
}

export const update = {
  get available() {
    return updated.current && canUpdate;
  },
};

/** Activate the waiting service worker (if any) and reload onto the new version. */
export async function applyUpdate() {
  const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (!reg) return location.reload();
  navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
  await reg.update().catch(() => {});
  const worker = reg.waiting ?? reg.installing;
  if (!worker) return location.reload();
  if (worker.state === "installed") return worker.postMessage({ type: "SKIP_WAITING" });
  worker.addEventListener("statechange", () => {
    if (worker.state === "installed") worker.postMessage({ type: "SKIP_WAITING" });
    else if (worker.state === "redundant") location.reload();
  });
}
