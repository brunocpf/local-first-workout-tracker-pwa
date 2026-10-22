import { afterEach, describe, expect, it, vi } from "vitest";
import { navDirection, shouldTransition, startNavTransition } from "#lib/ui/navTransition";

describe("navDirection", () => {
  it("slides forward into a nested page and back to its parent", () => {
    expect(navDirection("/history", "/history/abc")).toBe("forward");
    expect(navDirection("/history/abc", "/history/abc/edit")).toBe("forward");
    expect(navDirection("/history/abc", "/history")).toBe("back");
    expect(navDirection("/exercises/x/edit", "/exercises")).toBe("back");
  });

  it("fades between tabs, siblings and unrelated pages", () => {
    expect(navDirection("/", "/history")).toBe("fade");
    expect(navDirection("/history", "/")).toBe("fade");
    expect(navDirection("/history", "/routines")).toBe("fade");
    expect(navDirection("/history/a", "/history/b")).toBe("fade");
    expect(navDirection("/routines/r1", "/workout")).toBe("fade");
  });

  it("doesn't treat a shared name prefix as nesting", () => {
    expect(navDirection("/routines", "/routines-old")).toBe("fade");
  });
});

describe("shouldTransition", () => {
  const nav = (from: string | null, to: string | null) => ({
    from: from === null ? null : { url: new URL(`https://x.test${from}`), route: { id: from } },
    to: to === null ? null : { url: new URL(`https://x.test${to}`), route: { id: to } },
  });
  const win = (reduce: boolean) => ({ matchMedia: vi.fn(() => ({ matches: reduce })) }) as unknown as Window;
  const supported = { startViewTransition: () => {} } as unknown as Document;
  const unsupported = {} as Document;

  it("runs only with API support, without reduced motion, between different routes", () => {
    expect(shouldTransition(nav("/", "/history"), supported, win(false))).toBe(true);
    expect(shouldTransition(nav("/", "/history"), unsupported, win(false))).toBe(false);
    expect(shouldTransition(nav("/", "/history"), supported, win(true))).toBe(false);
    expect(shouldTransition(nav("/history", "/history"), supported, win(false))).toBe(false);
    expect(shouldTransition(nav(null, "/history"), supported, win(false))).toBe(false);
  });

  it("never runs into or out of the logger", () => {
    expect(shouldTransition(nav("/", "/workout"), supported, win(false))).toBe(false);
    expect(shouldTransition(nav("/workout", "/history"), supported, win(false))).toBe(false);
    const based = (p: string) => p.replace(/^\/app/, "") || "/";
    expect(shouldTransition(nav("/app/workout", "/app/history"), supported, win(false), based)).toBe(false);
  });
});

describe("startNavTransition", () => {
  const target = (path: string) => ({ url: new URL(`https://x.test${path}`), route: { id: path } });
  const settle = () => new Promise((r) => setTimeout(r, 0));

  afterEach(() => {
    vi.unstubAllGlobals();
    // @ts-expect-error -- jsdom has no View Transitions; the tests add a fake
    delete document.startViewTransition;
  });

  /** A fake whose promises all reject, like a transition that was skipped while its navigation was interrupted. */
  function fakeSkippedTransition() {
    const skipTransition = vi.fn();
    document.startViewTransition = ((update: () => Promise<void>) => {
      const done = Promise.resolve().then(update);
      const aborted = Promise.reject(new DOMException("Transition was skipped", "AbortError"));
      return { ready: aborted, updateCallbackDone: done, finished: done, skipTransition, types: new Set() };
    }) as unknown as typeof document.startViewTransition;
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    return skipTransition;
  }

  it("lets the router update and swallows the rejections of a skipped or interrupted transition", async () => {
    fakeSkippedTransition();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const complete = Promise.reject(new Error("navigation aborted"));
      complete.catch(() => {}); // SvelteKit handles its own rejection; only ours matter here
      const ready = startNavTransition({ from: target("/history"), to: target("/history/a"), complete }, (p) => p);
      await expect(ready).resolves.toBeUndefined();
      await settle();
      await settle();
      expect(unhandled).not.toHaveBeenCalled();
      expect(document.documentElement.dataset.nav).toBeUndefined();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("a tap skips the running transition", async () => {
    const skip = fakeSkippedTransition();
    let finish!: () => void;
    const complete = new Promise<void>((r) => (finish = r));
    await startNavTransition({ from: target("/history"), to: target("/history/a"), complete }, (p) => p);
    document.dispatchEvent(new Event("pointerdown"));
    expect(skip).toHaveBeenCalledOnce();
    finish();
    await settle();
    document.dispatchEvent(new Event("pointerdown"));
    expect(skip).toHaveBeenCalledOnce(); // the listener is gone once the transition is over
  });
});
