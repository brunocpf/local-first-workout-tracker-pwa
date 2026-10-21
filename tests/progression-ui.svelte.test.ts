import { fireEvent, render } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExerciseCard from "#lib/components/workout/ExerciseCard.svelte";
import { createSessionExercise } from "#lib/logger/workout";
import { settings } from "#lib/settings.svelte";
import type { LoggedSet } from "#lib/types";

const done = (i: number, weight: number, reps: number): LoggedSet => ({ id: `p${i}`, type: "normal", weight, reps, completedAt: "2026-01-01T00:00:00.000Z" });

function mount(previousSets: LoggedSet[], withRange = true) {
  const exercise = createSessionExercise(
    { id: "b", name: "Bench", exerciseType: "weighted_reps" },
    { prescribedSets: [{ id: "p", type: "normal", ...(withRange ? { repRange: [8, 12] as [number, number] } : {}) }] },
  );
  return render(ExerciseCard, {
    exercise, index: 0, count: 1, onremove: vi.fn(), onmove: vi.fn(), onnotes: vi.fn(), defaultRestSeconds: 90, onrest: vi.fn(),
    unit: "kg", previousSets, onaddset: vi.fn(), onsetchange: vi.fn(), ontoggleset: vi.fn(), onduplicateset: vi.fn(), ondeleteset: vi.fn(),
  });
}

describe("progression suggestion chip", () => {
  beforeEach(() => {
    settings.progressionEnabled = true;
    settings.weightUnit = "kg";
  });

  it("is hidden when disabled", () => {
    settings.progressionEnabled = false;
    expect(mount([done(1, 60, 12)]).queryByRole("group", { name: "Progression suggestion" })).toBeNull();
  });

  it("is hidden without history or a rep range", () => {
    expect(mount([]).queryByRole("group", { name: "Progression suggestion" })).toBeNull();
    expect(mount([done(1, 60, 12)], false).queryByRole("group", { name: "Progression suggestion" })).toBeNull();
  });

  it("shows the reason and Apply updates the prefill", async () => {
    const { getByRole, getByText, getByLabelText } = mount([done(1, 60, 12)]);
    expect(getByText(/add 2.5 kg/)).toBeTruthy();
    expect((getByLabelText("Set 1 weight, kg") as HTMLInputElement).placeholder).toBe("60");
    await fireEvent.click(getByRole("button", { name: "Apply" }));
    expect((getByLabelText("Set 1 weight, kg") as HTMLInputElement).placeholder).toBe("62.5");
    expect((getByLabelText("Set 1 reps") as HTMLInputElement).placeholder).toBe("8");
  });
});
