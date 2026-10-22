/**
 * Keeps the screen on while a workout is active (PRD §2.2). Feature-detected and error-tolerant: browsers
 * without the Screen Wake Lock API, or a request the browser refuses, are skipped silently. The browser drops
 * the lock whenever the page is hidden, so it is requested again on `visibilitychange → visible` while still wanted.
 */
export class WakeLock {
  #wanted = false;
  #sentinel: WakeLockSentinel | undefined;
  #requesting = false;

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this.#wanted) void this.acquire();
      });
    }
  }

  get supported() {
    return typeof navigator !== "undefined" && "wakeLock" in navigator;
  }

  /** Asks the browser to keep the screen on. Idempotent; a refused or unsupported request is ignored. */
  async acquire(): Promise<void> {
    this.#wanted = true;
    if (!this.supported || this.#sentinel || this.#requesting) return;
    this.#requesting = true;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      if (!this.#wanted) {
        // Released while the request was in flight: don't keep a lock nobody wants.
        await sentinel.release();
        return;
      }
      this.#sentinel = sentinel;
      sentinel.addEventListener("release", () => {
        if (this.#sentinel === sentinel) this.#sentinel = undefined;
      });
    } catch {
      // Refused (e.g. the page is hidden), or the API is broken: the screen simply may sleep, which is not an error.
    } finally {
      this.#requesting = false;
    }
  }

  /** Lets the screen sleep again and stops re-acquiring on return to the foreground. */
  async release(): Promise<void> {
    this.#wanted = false;
    const sentinel = this.#sentinel;
    this.#sentinel = undefined;
    try {
      await sentinel?.release();
    } catch {
      // Already released by the browser.
    }
  }
}

export const wakeLock = new WakeLock();
