import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ConfirmDialog from "#lib/components/ui/ConfirmDialog.svelte";
import Toaster from "#lib/components/ui/Toaster.svelte";
import { confirm, confirmQueue, settleConfirm } from "#lib/ui/confirm.svelte";
import {
  clearToasts,
  dismissToast,
  pauseToast,
  resumeToast,
  runToastAction,
  toast,
  toasts,
} from "#lib/ui/toast.svelte";

// jsdom has no <dialog> modal API; stand in for the parts the components use.
beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

describe("confirm()", () => {
  afterEach(() => {
    while (confirmQueue.length) settleConfirm(false);
  });

  it("resolves true when confirmed and false when cancelled", async () => {
    const yes = confirm({ title: "Discard?", body: "x", confirmLabel: "Discard workout" });
    settleConfirm(true);
    await expect(yes).resolves.toBe(true);

    const no = confirm({ title: "Discard?", body: "x", confirmLabel: "Discard workout" });
    settleConfirm(false);
    await expect(no).resolves.toBe(false);
  });

  it("queues requests and settles them in order", async () => {
    const a = confirm({ title: "A", body: "", confirmLabel: "Do A" });
    const b = confirm({ title: "B", body: "", confirmLabel: "Do B" });
    expect(confirmQueue.map((r) => r.title)).toEqual(["A", "B"]);
    settleConfirm(false);
    expect(confirmQueue.map((r) => r.title)).toEqual(["B"]);
    settleConfirm(true);
    await expect(a).resolves.toBe(false);
    await expect(b).resolves.toBe(true);
  });

  it("host: confirm button resolves true, Cancel resolves false, danger focuses Cancel first", async () => {
    render(ConfirmDialog);

    const p1 = confirm({ title: "Delete session?", body: "12 sets", confirmLabel: "Delete session", danger: true });
    await tick();
    const dialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe("Delete session?");
    expect(document.activeElement?.textContent?.trim()).toBe("Cancel");
    await fireEvent.click(screen.getByRole("button", { name: "Delete session", hidden: true }));
    await expect(p1).resolves.toBe(true);

    const p2 = confirm({ title: "Save?", body: "", confirmLabel: "Save changes" });
    await tick();
    await tick();
    expect(document.activeElement?.textContent?.trim()).toBe("Save changes");
    await fireEvent.click(screen.getByRole("button", { name: "Cancel", hidden: true }));
    await expect(p2).resolves.toBe(false);
  });

  it("host: Esc (cancel event) resolves false", async () => {
    render(ConfirmDialog);
    const p = confirm({ title: "Discard?", body: "", confirmLabel: "Discard workout", danger: true });
    await tick();
    const dialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    await expect(p).resolves.toBe(false);
  });
});

describe("toast()", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    clearToasts();
    vi.useRealTimers();
  });

  it("auto-dismisses after 4 s, or 6 s with an action, or a custom duration", () => {
    toast("Plain");
    toast("With undo", { action: { label: "Undo", run: () => {} } });
    toast("Custom", { durationMs: 1000 });
    expect(toasts.map((t) => t.message)).toEqual(["Plain", "With undo", "Custom"]);

    vi.advanceTimersByTime(999);
    expect(toasts).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(toasts.map((t) => t.message)).toEqual(["Plain", "With undo"]);
    vi.advanceTimersByTime(3000);
    expect(toasts.map((t) => t.message)).toEqual(["With undo"]);
    vi.advanceTimersByTime(2000);
    expect(toasts).toHaveLength(0);
  });

  it("runs the action exactly once and dismisses the toast", () => {
    const run = vi.fn();
    const id = toast("Set deleted", { action: { label: "Undo", run } });
    runToastAction(id);
    runToastAction(id);
    expect(run).toHaveBeenCalledTimes(1);
    expect(toasts).toHaveLength(0);
  });

  it("never runs the action after the toast timed out or was dismissed", () => {
    const run = vi.fn();
    const a = toast("A", { action: { label: "Undo", run } });
    vi.advanceTimersByTime(6000);
    runToastAction(a);
    const b = toast("B", { action: { label: "Undo", run } });
    dismissToast(b);
    runToastAction(b);
    expect(run).not.toHaveBeenCalled();
  });

  it("pauses while held and resumes with the remaining time", () => {
    const id = toast("Paused", { durationMs: 4000 });
    vi.advanceTimersByTime(1000);
    pauseToast(id);
    vi.advanceTimersByTime(60_000);
    expect(toasts).toHaveLength(1);
    resumeToast(id);
    vi.advanceTimersByTime(2999);
    expect(toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(toasts).toHaveLength(0);
  });

  it("keeps at most 3, dropping the oldest", () => {
    for (const m of ["1", "2", "3", "4"]) toast(m);
    expect(toasts.map((t) => t.message)).toEqual(["2", "3", "4"]);
  });

  it("Toaster: renders into a polite live region; Undo button fires once; hover pauses", async () => {
    render(Toaster);
    const run = vi.fn();
    toast("Set deleted", { action: { label: "Undo", run } });
    await tick();

    const region = screen.getByRole("region", { name: "Notifications" });
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toContain("Set deleted");

    const group = screen.getByRole("group");
    await fireEvent.pointerEnter(group);
    vi.advanceTimersByTime(10_000);
    expect(toasts).toHaveLength(1);
    await fireEvent.pointerLeave(group);

    const undo = screen.getByRole("button", { name: "Undo" });
    await fireEvent.click(undo);
    await fireEvent.click(undo);
    expect(run).toHaveBeenCalledTimes(1);
    expect(toasts).toHaveLength(0);
  });
});
