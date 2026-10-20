import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OBJECT_URL_REVOKE_DELAY_MS, readTextFile, saveFile, type SaveEnv } from "#lib/files";

const blob = new Blob(["{}"], { type: "application/json" });
const touch = (coarse: boolean) => ({ matchMedia: (q: string) => ({ matches: coarse && q === "(pointer: coarse)" }) });

function shareNav(share: ReturnType<typeof vi.fn>, canShare = () => true) {
  return { share, canShare: vi.fn(canShare) } as unknown as Partial<Navigator>;
}

let click: ReturnType<typeof vi.spyOn>;
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  createObjectURL = vi.fn(() => "blob:mock-url");
  revokeObjectURL = vi.fn();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

describe("saveFile", () => {
  it("shares the file on a touch device when canShare({files}) is true", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const nav = shareNav(share);
    const env: SaveEnv = { ...touch(true), navigator: nav };

    await expect(saveFile(blob, "backup.json", env)).resolves.toBe("shared");

    expect(share).toHaveBeenCalledTimes(1);
    const payload = share.mock.calls[0][0] as { files: File[] };
    expect(payload.files[0]).toBeInstanceOf(File);
    expect(payload.files[0].name).toBe("backup.json");
    expect(click).not.toHaveBeenCalled();
  });

  it("downloads on a desktop (fine pointer) even when sharing is available", async () => {
    const share = vi.fn();
    const env: SaveEnv = { ...touch(false), navigator: shareNav(share) };

    await expect(saveFile(blob, "backup.json", env)).resolves.toBe("downloaded");

    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("downloads when the Web Share API is missing (desktop Firefox)", async () => {
    const env: SaveEnv = { ...touch(true), navigator: {} };

    await expect(saveFile(blob, "backup.json", env)).resolves.toBe("downloaded");

    expect(click).toHaveBeenCalledTimes(1);
  });

  it("downloads when canShare rejects the files payload", async () => {
    const share = vi.fn();
    const env: SaveEnv = { ...touch(true), navigator: shareNav(share, () => false) };

    await expect(saveFile(blob, "backup.json", env)).resolves.toBe("downloaded");

    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("downloads when canShare throws", async () => {
    const share = vi.fn();
    const env: SaveEnv = {
      ...touch(true),
      navigator: shareNav(share, () => {
        throw new TypeError("unsupported");
      }),
    };

    await expect(saveFile(blob, "backup.json", env)).resolves.toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("returns 'cancelled' when the user dismisses the share sheet (AbortError)", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("dismissed", "AbortError"));
    const env: SaveEnv = { ...touch(true), navigator: shareNav(share) };

    await expect(saveFile(blob, "backup.json", env)).resolves.toBe("cancelled");
    expect(click).not.toHaveBeenCalled();
  });

  it("falls back to a download when share fails for another reason", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("no target", "NotAllowedError"));
    const env: SaveEnv = { ...touch(true), navigator: shareNav(share) };

    await expect(saveFile(blob, "backup.json", env)).resolves.toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("download path: anchor gets the object URL and file name, and the URL is revoked later", async () => {
    const clicked: HTMLAnchorElement[] = [];
    click.mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
    const env: SaveEnv = { ...touch(false) };

    await saveFile(blob, "backup.json", env);

    const [anchor] = clicked;
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor.href).toBe("blob:mock-url");
    expect(anchor.download).toBe("backup.json");
    expect(anchor.isConnected).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(OBJECT_URL_REVOKE_DELAY_MS);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});

describe("readTextFile", () => {
  it("returns the text when the file is within the limit", async () => {
    const file = new File(['{"a":1}'], "in.json", { type: "application/json" });
    await expect(readTextFile(file, 100)).resolves.toEqual({ ok: true, text: '{"a":1}' });
  });

  it("accepts a file exactly at the limit", async () => {
    const file = new File(["12345"], "in.json");
    await expect(readTextFile(file, 5)).resolves.toEqual({ ok: true, text: "12345" });
  });

  it("rejects an oversized file before reading it", async () => {
    const file = new File(["x".repeat(11)], "big.json");
    const text = vi.spyOn(file, "text");

    await expect(readTextFile(file, 10)).resolves.toEqual({ ok: false, reason: "too-large", size: 11, maxBytes: 10 });
    expect(text).not.toHaveBeenCalled();
  });
});
