import { describe, expect, it, vi } from "vitest";
import { navDirection, shouldTransition } from "#lib/ui/navTransition";

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
