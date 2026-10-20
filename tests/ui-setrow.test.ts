import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import SetRow from "#lib/components/workout/SetRow.svelte";
import WorkoutPage from "../src/routes/workout/+page.svelte";
import { active } from "#lib/logger/activeSession.svelte";
import { createSessionExercise } from "#lib/logger/workout";
import { settings } from "#lib/settings.svelte";
import { db } from "#lib/storage/db";
import { finishSession, getActiveSession, saveSession, startSession } from "#lib/storage/sessions";
import { isCovered, keepAboveKeyboard } from "#lib/ui/keyboard";
import { toasts } from "#lib/ui/toast.svelte";
import { lbToKg } from "#lib/units";
import type { LoggedSet } from "#lib/types";

vi.mock("$app/navigation", () => ({ goto: vi.fn(async () => {}) }));
vi.mock("$app/paths", () => ({ resolve: (p: string) => p }));
vi.mock("#lib/pwa/update.svelte", () => ({ setCanUpdate: () => {} }));

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

const input = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

async function type(el: HTMLInputElement, value: string) {
  await fireEvent.focus(el);
  await fireEvent.input(el, { target: { value } });
  await fireEvent.change(el);
  await fireEvent.blur(el);
}

describe("SetRow", () => {
  const base = { label: "2", name: "Set 2", unit: "kg" as const, onweight: vi.fn(), onreps: vi.fn(), ontoggle: vi.fn(), onmenu: vi.fn() };
  const set: LoggedSet = { id: "s", type: "normal" };
  beforeEach(() => vi.clearAllMocks());

  it("shows previous values and the prefill as placeholders, in the display unit", () => {
    render(SetRow, { ...base, unit: "lb", set, previous: { weight: lbToKg(135), reps: 8 }, prefill: { weight: lbToKg(135), reps: 8 } });
    expect(document.querySelector(".previous")!.textContent).toBe("Previous: 135\u202f×\u202f8");
    expect(input("Set 2 weight, lb").placeholder).toBe("135");
    expect(input("Set 2 weight, lb").value).toBe("");
    expect(input("Set 2 reps").placeholder).toBe("8");
  });

  it("badges a completed PR set with icon and text, and not an uncompleted or non-PR one", async () => {
    const done: LoggedSet = { ...set, weight: 100, reps: 5, completedAt: "2026-02-01T10:00:00.000Z" };
    const { rerender } = render(SetRow, { ...base, set: done, pr: true });
    expect(document.querySelector(".pr")!.textContent).toContain("PR");
    expect(screen.getByText("– new personal record")).toBeTruthy();
    expect(document.querySelector(".pr svg")).not.toBeNull();
    await rerender({ ...base, set: { ...done, completedAt: undefined }, pr: true });
    expect(document.querySelector(".pr")).toBeNull();
    await rerender({ ...base, set: done, pr: false });
    expect(document.querySelector(".pr")).toBeNull();
  });

  it("shows an en dash when there is no previous set", () => {
    render(SetRow, { ...base, set });
    expect(document.querySelector(".previous")!.textContent).toBe("Previous: –");
  });

  it("editing a value never completes the set", async () => {
    render(SetRow, { ...base, set });
    await type(input("Set 2 weight, kg"), "82,5");
    await type(input("Set 2 reps"), "8");
    expect(base.onweight).toHaveBeenCalledExactlyOnceWith(82.5);
    expect(base.onreps).toHaveBeenCalledExactlyOnceWith(8);
    expect(base.ontoggle).not.toHaveBeenCalled();
  });

  it("round-trips 135 lb: stores kg at full precision and shows 135 again", async () => {
    const { rerender } = render(SetRow, { ...base, unit: "lb", set });
    await type(input("Set 2 weight, lb"), "135");
    const kg = base.onweight.mock.calls[0][0] as number;
    expect(kg).toBe(lbToKg(135));
    await rerender({ ...base, unit: "lb", set: { ...set, weight: kg } });
    expect(input("Set 2 weight, lb").value).toBe("135");
    await rerender({ ...base, unit: "kg", set: { ...set, weight: kg } });
    expect(input("Set 2 weight, kg").value).toBe("61.23");
  });

  it("focusing and leaving a field without typing writes nothing back", async () => {
    render(SetRow, { ...base, unit: "lb", set: { ...set, weight: 100 } });
    const el = input("Set 2 weight, lb");
    await fireEvent.focus(el);
    await fireEvent.blur(el);
    expect(base.onweight).not.toHaveBeenCalled();
  });

  it("the complete button toggles with aria-pressed and a changed name", async () => {
    const { rerender } = render(SetRow, { ...base, set });
    const open = screen.getByRole("button", { name: "Complete set 2" });
    expect(open.getAttribute("aria-pressed")).toBe("false");
    await fireEvent.click(open);
    expect(base.ontoggle).toHaveBeenCalledOnce();
    await rerender({ ...base, set: { ...set, completedAt: "2026-01-01T00:00:00.000Z" } });
    const done = screen.getByRole("button", { name: "Set 2 completed, undo" });
    expect(done.getAttribute("aria-pressed")).toBe("true");
    expect(done.querySelector("svg")).toBeTruthy(); // check mark: a shape change, not only color
  });

  it("labels warm-ups and opens the row menu from the label", async () => {
    render(SetRow, { ...base, label: "W", name: "Warm-up 1", set: { ...set, type: "warmup" } });
    const label = screen.getByRole("button", { name: "Warm-up 1 options" });
    expect(label.textContent?.trim()).toBe("W");
    await fireEvent.click(label);
    expect(base.onmenu).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Complete warm-up 1" })).toBeTruthy();
  });

  it("reverts an invalid entry and announces it instead of showing an error", async () => {
    render(SetRow, { ...base, set: { ...set, weight: 80 } });
    const el = input("Set 2 weight, kg");
    await type(el, "abc");
    expect(base.onweight).not.toHaveBeenCalled();
    expect(el.value).toBe("80");
    expect(el.getAttribute("aria-invalid")).toBeNull();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Set 2 weight not changed – enter a number"));
  });

  it("announces the actual reason for a rejected entry", async () => {
    render(SetRow, { ...base, set: { ...set, reps: 5 } });
    await type(input("Set 2 reps"), "-3");
    expect(base.onreps).not.toHaveBeenCalled();
    expect(input("Set 2 reps").value).toBe("5");
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Set 2 reps not changed – enter 0 or more"));
  });

  it("shows exactly what was typed with 2 decimals (82.53 kg, 135.25 lb)", async () => {
    const { rerender } = render(SetRow, { ...base, set });
    await type(input("Set 2 weight, kg"), "82.53");
    expect(base.onweight).toHaveBeenLastCalledWith(82.53);
    await rerender({ ...base, set: { ...set, weight: 82.53 } });
    expect(input("Set 2 weight, kg").value).toBe("82.53");
    await rerender({ ...base, unit: "lb", set });
    await type(input("Set 2 weight, lb"), "135.25");
    const kg = base.onweight.mock.lastCall![0] as number;
    await rerender({ ...base, unit: "lb", set: { ...set, weight: kg } });
    expect(input("Set 2 weight, lb").value).toBe("135.25");
  });

  it("Enter moves from weight to reps, then closes the keyboard", async () => {
    render(SetRow, { ...base, set });
    const weight = input("Set 2 weight, kg");
    const reps = input("Set 2 reps");
    expect(weight.getAttribute("enterkeyhint")).toBe("next");
    expect(reps.getAttribute("enterkeyhint")).toBe("done");
    weight.focus();
    await fireEvent.keyDown(weight, { key: "Enter" });
    expect(document.activeElement).toBe(reps);
    await fireEvent.keyDown(reps, { key: "Enter" });
    expect(document.activeElement).not.toBe(reps);
  });
});

describe("keepAboveKeyboard", () => {
  it("detects a row under the keyboard (visual viewport smaller than the layout viewport)", () => {
    expect(isCovered({ bottom: 500 }, { offsetTop: 0, height: 400 })).toBe(true);
    expect(isCovered({ bottom: 380 }, { offsetTop: 0, height: 400 })).toBe(false);
    expect(isCovered({ bottom: 500 }, { offsetTop: 200, height: 400 })).toBe(false);
  });

  it("scrolls the focused row into view on viewport resize, and only while focused inside it", () => {
    const vv = Object.assign(new EventTarget(), { offsetTop: 0, height: 400 });
    vi.stubGlobal("visualViewport", vv);
    const row = document.createElement("div");
    const field = document.createElement("input");
    row.append(field);
    document.body.append(row);
    row.getBoundingClientRect = () => ({ bottom: 600 }) as DOMRect;
    row.scrollIntoView = vi.fn();
    const detach = keepAboveKeyboard(row)!;
    vv.dispatchEvent(new Event("resize"));
    expect(row.scrollIntoView).not.toHaveBeenCalled();
    field.focus();
    vv.dispatchEvent(new Event("resize"));
    expect(row.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    field.blur();
    vi.mocked(row.scrollIntoView).mockClear();
    vv.dispatchEvent(new Event("resize"));
    expect(row.scrollIntoView).not.toHaveBeenCalled();
    detach();
    row.remove();
    vi.unstubAllGlobals();
  });
});

describe("workout page set logging", () => {
  const bench = { id: "bench", name: "Bench Press", exerciseType: "weighted_reps" as const };
  const squat = { id: "squat", name: "Back Squat", exerciseType: "weighted_reps" as const };

  beforeEach(async () => {
    await db.sessions.clear();
    settings.weightUnit = "kg";
    toasts.length = 0;
    // A finished session with bench 80 × 8 supplies previous values.
    const old = await startSession({ name: "Old" }, new Date("2026-01-01T10:00:00.000Z"));
    const se = createSessionExercise(bench);
    se.sets.push({ id: "old-1", type: "normal", weight: 80, reps: 8, completedAt: "2026-01-01T10:05:00.000Z" });
    await saveSession({ ...old, exercises: [se] });
    await finishSession(old.id);

    await active.start({ name: "Push" });
    await active.mutate(
      (s) => {
        for (const e of [bench, squat]) {
          const x = createSessionExercise(e);
          x.sets.push({ id: `${e.id}-1`, type: "normal" });
          s.exercises.push(x);
        }
      },
      { persist: "now" },
    );
  });
  afterEach(async () => {
    if (active.session) await active.discard();
  });

  const stored = async () => (await getActiveSession())!;
  const benchCard = () => within(screen.getByRole("heading", { name: "Bench Press" }).closest("article")!);

  it("completes a prefilled set in one tap and writes it immediately", async () => {
    render(WorkoutPage);
    await waitFor(() => expect(benchCard().getByLabelText<HTMLInputElement>("Set 1 weight, kg").placeholder).toBe("80"));
    expect(benchCard().getByLabelText<HTMLInputElement>("Set 1 reps").placeholder).toBe("8");
    await fireEvent.click(benchCard().getByRole("button", { name: "Complete set 1" }));
    // Visible right away, before the write settles.
    expect(benchCard().getByRole("button", { name: "Set 1 completed, undo" }).getAttribute("aria-pressed")).toBe("true");
    await active.flush();
    const set = (await stored()).exercises[0].sets[0];
    expect(set).toMatchObject({ weight: 80, reps: 8 });
    expect(set.completedAt).toEqual(expect.any(String));

    // Tapping again un-completes; the values stay.
    await fireEvent.click(benchCard().getByRole("button", { name: "Set 1 completed, undo" }));
    await active.flush();
    expect((await stored()).exercises[0].sets[0]).toEqual({ id: "bench-1", type: "normal", weight: 80, reps: 8 });
  });

  it("badges a PR set and toasts, and uncompleting removes the badge", async () => {
    render(WorkoutPage);
    await waitFor(() => expect(benchCard().getByLabelText<HTMLInputElement>("Set 1 weight, kg").placeholder).toBe("80"));
    await type(benchCard().getByLabelText<HTMLInputElement>("Set 1 weight, kg"), "100");
    await new Promise((r) => setTimeout(r, 50)); // earlier sessions load alongside the previous values
    await fireEvent.click(benchCard().getByRole("button", { name: "Complete set 1" }));
    await waitFor(() => expect(benchCard().getByText("– new personal record")).toBeTruthy());
    expect(toasts.map((t) => t.message)).toContain("New PR: Bench Press");

    await fireEvent.click(benchCard().getByRole("button", { name: "Set 1 completed, undo" }));
    await waitFor(() => expect(benchCard().queryByText("– new personal record")).toBeNull());
  });

  it("does not badge a set that only ties the previous best", async () => {
    render(WorkoutPage);
    await waitFor(() => expect(benchCard().getByLabelText<HTMLInputElement>("Set 1 weight, kg").placeholder).toBe("80"));
    await fireEvent.click(benchCard().getByRole("button", { name: "Complete set 1" }));
    await active.flush();
    expect(benchCard().queryByText("– new personal record")).toBeNull();
    expect(toasts.map((t) => t.message)).not.toContain("New PR: Bench Press");
  });

  it("typing does not complete, persists, and does not recreate other inputs", async () => {
    render(WorkoutPage);
    const squatWeight = screen.getAllByLabelText<HTMLInputElement>("Set 1 weight, kg")[1];
    const benchWeight = screen.getAllByLabelText<HTMLInputElement>("Set 1 weight, kg")[0];
    await type(benchWeight, "100");
    await active.flush();
    const set = (await stored()).exercises[0].sets[0];
    expect(set.weight).toBe(100);
    expect(set.completedAt).toBeUndefined();
    expect(screen.getAllByLabelText<HTMLInputElement>("Set 1 weight, kg")[0]).toBe(benchWeight);
    expect(screen.getAllByLabelText<HTMLInputElement>("Set 1 weight, kg")[1]).toBe(squatWeight);
  });

  it("135 lb survives a remount (reload) as 135 lb", async () => {
    settings.weightUnit = "lb";
    const first = render(WorkoutPage);
    await type(screen.getAllByLabelText<HTMLInputElement>("Set 1 weight, lb")[0], "135");
    await active.flush();
    expect((await stored()).exercises[0].sets[0].weight).toBe(lbToKg(135));
    first.unmount();
    render(WorkoutPage);
    expect(screen.getAllByLabelText<HTMLInputElement>("Set 1 weight, lb")[0].value).toBe("135");
  });

  it("adds a set copying the last, duplicates, toggles warm-up, deletes with undo", async () => {
    render(WorkoutPage);
    await type(screen.getAllByLabelText<HTMLInputElement>("Set 1 weight, kg")[0], "60");
    await fireEvent.click(benchCard().getByRole("button", { name: "Add set" }));
    expect(benchCard().getByLabelText<HTMLInputElement>("Set 2 weight, kg").value).toBe("60");

    await fireEvent.click(benchCard().getByRole("button", { name: "Set 1 options" }));
    await fireEvent.click(screen.getByRole("button", { name: "Toggle warm-up" }));
    expect(benchCard().getByRole("button", { name: "Warm-up 1 options" })).toBeTruthy();
    expect(benchCard().getByRole("button", { name: "Set 1 options" })).toBeTruthy(); // former set 2

    await fireEvent.click(benchCard().getByRole("button", { name: "Set 1 options" }));
    await fireEvent.click(screen.getByRole("button", { name: "Duplicate set" }));
    expect(benchCard().getByRole("button", { name: "Set 2 options" })).toBeTruthy();
    await active.flush();
    expect((await stored()).exercises[0].sets.map((s) => s.type)).toEqual(["warmup", "normal", "normal"]);

    await fireEvent.click(benchCard().getByRole("button", { name: "Warm-up 1 options" }));
    await fireEvent.click(screen.getByRole("button", { name: "Delete set" }));
    await active.flush();
    expect((await stored()).exercises[0].sets).toHaveLength(2);
    const toast = toasts.at(-1)!;
    expect(toast.message).toBe("Set deleted");
    toast.action!.run();
    await active.flush();
    const sets = (await stored()).exercises[0].sets;
    expect(sets.map((s) => s.type)).toEqual(["warmup", "normal", "normal"]);
    expect(sets[0]).toMatchObject({ id: "bench-1", weight: 60 });
  });
});

describe("SetRow routine target", () => {
  const base = { label: "1", name: "Set 1", unit: "kg" as const, onweight: vi.fn(), onreps: vi.fn(), ontoggle: vi.fn(), onmenu: vi.fn() };
  const set: LoggedSet = { id: "s", type: "normal" };

  it("shows rep range and weight compactly in the display unit", () => {
    render(SetRow, { ...base, unit: "lb", set, prescribed: { repRange: [6, 10], targetWeight: lbToKg(135) } });
    expect(document.querySelector(".target")!.textContent).toBe("Target: 6–10 @ 135 lb");
  });

  it("shows reps only, a single rep count, or weight only", () => {
    const { unmount } = render(SetRow, { ...base, set, prescribed: { repRange: [8, 8] } });
    expect(document.querySelector(".target")!.textContent).toBe("Target: 8 reps");
    unmount();
    render(SetRow, { ...base, set, prescribed: { targetWeight: 80 } });
    expect(document.querySelector(".target")!.textContent).toBe("Target: @ 80 kg");
  });

  it("shows nothing without a target", () => {
    render(SetRow, { ...base, set });
    expect(document.querySelector(".target")).toBeNull();
  });

  it("a routine set with no history is prefilled from the target by the card", async () => {
    const { prefillFor } = await import("#lib/logger/previousValues");
    expect(prefillFor(set, undefined, { repRange: [6, 10], targetWeight: 80 })).toEqual({ weight: 80, reps: 6 });
  });
});
