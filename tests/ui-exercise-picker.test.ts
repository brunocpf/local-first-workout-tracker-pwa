import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import ExercisePicker from "#lib/components/ExercisePicker.svelte";
import type { Exercise } from "#lib/types";

const ex = (id: string, name: string, extra: Partial<Exercise> = {}): Exercise => ({
  id,
  name,
  aliases: [],
  primaryMuscles: ["chest"],
  secondaryMuscles: [],
  equipment: ["barbell"],
  exerciseType: "weighted_reps",
  isCustom: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

const catalog = [
  ex("squat", "Squat", { primaryMuscles: ["quads"] }),
  ex("bench", "Bench Press"),
  ex("row", "Barbell Row", { primaryMuscles: ["lats"], favorite: true }),
  ex("curl", "Curl", { equipment: ["dumbbell"], primaryMuscles: ["biceps"] }),
];

const createCustomExercise = vi.fn(async (input: { name: string }) =>
  ex("new-1", input.name, { isCustom: true, primaryMuscles: [], equipment: [] }),
);
vi.mock("#lib/storage/exercises", () => ({
  listExercises: vi.fn(async () => catalog),
  createCustomExercise: (input: { name: string }) => createCustomExercise(input),
}));

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

const rowButtons = () => screen.getAllByRole("list", { name: "Exercises" })[0].querySelectorAll<HTMLButtonElement>("button");

describe("ExercisePicker", () => {
  let onpick: Mock<(exercises: Exercise[]) => void>;
  let oncancel: Mock<() => void>;
  beforeEach(() => {
    onpick = vi.fn();
    oncancel = vi.fn();
  });

  it("lists favorites first, then A–Z, when the query is empty", async () => {
    render(ExercisePicker, { open: true, onpick });
    await screen.findByText("Bench Press");
    const titles = [...rowButtons()].map((b) => b.querySelector(".title")?.textContent);
    expect(titles).toEqual(["Barbell Row", "Bench Press", "Curl", "Squat"]);
  });

  it("filters by search and shows an empty state", async () => {
    render(ExercisePicker, { open: true, onpick });
    const input = await screen.findByRole("searchbox", { name: "Search exercises" });
    await fireEvent.input(input, { target: { value: "bench" } });
    expect(rowButtons()).toHaveLength(1);
    await fireEvent.input(input, { target: { value: "zzz" } });
    expect(screen.getByText("No exercise matches “zzz”")).toBeTruthy();
  });

  it("hides excluded ids", async () => {
    render(ExercisePicker, { open: true, excludeIds: ["squat"], onpick });
    await screen.findByText("Curl");
    expect(screen.queryByText("Squat")).toBeNull();
  });

  it("single mode picks on tap and has no footer", async () => {
    render(ExercisePicker, { open: true, onpick, oncancel });
    await fireEvent.click(await screen.findByText("Curl"));
    expect(onpick).toHaveBeenCalledTimes(1);
    expect(onpick.mock.calls[0][0].map((e: Exercise) => e.id)).toEqual(["curl"]);
    expect(screen.queryByRole("button", { name: /Add|Select exercises/ })).toBeNull();
    expect(oncancel).not.toHaveBeenCalled();
  });

  it("multiple mode toggles selection and adds N in selection order", async () => {
    render(ExercisePicker, { open: true, multiple: true, onpick });
    const add = await screen.findByRole("button", { name: "Select exercises" });
    expect((add as HTMLButtonElement).disabled).toBe(true);

    await fireEvent.click(screen.getByText("Squat"));
    await fireEvent.click(screen.getByText("Curl"));
    const squat = screen.getByText("Squat").closest("button")!;
    expect(squat.getAttribute("aria-pressed")).toBe("true");
    expect(squat.querySelector("svg")).toBeTruthy(); // check mark: not color alone

    await fireEvent.click(screen.getByText("Curl")); // deselect
    await fireEvent.click(screen.getByText("Bench Press"));
    await fireEvent.click(screen.getByRole("button", { name: "Add 2 exercises" }));
    expect(onpick.mock.calls[0][0].map((e: Exercise) => e.id)).toEqual(["squat", "bench"]);
  });

  it("calls oncancel when closed without picking", async () => {
    render(ExercisePicker, { open: true, onpick, oncancel });
    await screen.findByText("Curl");
    await fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(oncancel).toHaveBeenCalledTimes(1));
    expect(onpick).not.toHaveBeenCalled();
  });

  it("creates a custom exercise from the query and returns it as the pick", async () => {
    render(ExercisePicker, { open: true, onpick });
    await screen.findByText("Bench Press");
    await fireEvent.input(screen.getByRole("searchbox", { name: "Search exercises" }), { target: { value: "Zercher squat" } });
    await fireEvent.click(await screen.findByRole("button", { name: "Create “Zercher squat”" }));
    await fireEvent.click(await screen.findByRole("button", { name: "Create and add" }));
    await waitFor(() => expect(onpick).toHaveBeenCalledTimes(1));
    expect(createCustomExercise).toHaveBeenCalledWith(expect.objectContaining({ name: "Zercher squat" }));
    expect(onpick.mock.calls[0][0][0].name).toBe("Zercher squat");
  });

  it("hides the create row when allowCreate is false", async () => {
    render(ExercisePicker, { open: true, onpick, allowCreate: false });
    await screen.findByText("Bench Press");
    expect(screen.queryByRole("button", { name: /^Create/ })).toBeNull();
  });
});
