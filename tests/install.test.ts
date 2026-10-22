import { describe, expect, it } from "vitest";
import { detectPlatform, isDismissed, isStandalone, rememberDismissed } from "#lib/pwa/install";

const mm = (matches: boolean) => () => ({ matches });

describe("isStandalone", () => {
  it("detects display-mode standalone", () => {
    expect(isStandalone({ matchMedia: mm(true) })).toBe(true);
    expect(isStandalone({ matchMedia: mm(false) })).toBe(false);
  });
  it("detects iOS navigator.standalone", () => {
    expect(isStandalone({ navigator: { standalone: true }, matchMedia: mm(false) })).toBe(true);
  });
  it("tolerates missing or throwing matchMedia", () => {
    expect(isStandalone({})).toBe(false);
    expect(
      isStandalone({
        matchMedia: () => {
          throw new Error("x");
        },
      }),
    ).toBe(false);
  });
});

describe("detectPlatform", () => {
  it("classifies iOS, iPadOS, Android and desktop", () => {
    expect(detectPlatform({ navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" } })).toBe("ios");
    expect(detectPlatform({ navigator: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", maxTouchPoints: 5 } })).toBe("ios");
    expect(detectPlatform({ navigator: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", maxTouchPoints: 0 } })).toBe("desktop");
    expect(detectPlatform({ navigator: { userAgent: "Mozilla/5.0 (Linux; Android 14)" } })).toBe("android");
    expect(detectPlatform({})).toBe("desktop");
  });
});

describe("dismissal", () => {
  it("round-trips and survives broken storage", () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(isDismissed(store)).toBe(false);
    rememberDismissed(store);
    expect(isDismissed(store)).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {
        throw new Error("x");
      },
    };
    expect(isDismissed(broken)).toBe(false);
    expect(() => rememberDismissed(broken)).not.toThrow();
  });
});
