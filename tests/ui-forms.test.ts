import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import Button from "#lib/components/ui/Button.svelte";
import IconButton from "#lib/components/ui/IconButton.svelte";
import NumberField from "#lib/components/ui/NumberField.svelte";
import SegmentedControl from "#lib/components/ui/SegmentedControl.svelte";
import Select from "#lib/components/ui/Select.svelte";
import Switch from "#lib/components/ui/Switch.svelte";
import TextField from "#lib/components/ui/TextField.svelte";
import { createRawSnippet } from "svelte";

const text = (s: string) => createRawSnippet(() => ({ render: () => `<span>${s}</span>` }));

describe("labels", () => {
  it("TextField label names the input and wires hint and error", () => {
    render(TextField, { label: "Name", value: "", hint: "A hint", error: "Bad" });
    const input = screen.getByLabelText("Name");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const ids = input.getAttribute("aria-describedby")!.split(" ");
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual(["A hint", "Bad"]);
  });

  it("Select and NumberField are labelled", () => {
    render(Select, { label: "Rest", value: "a", options: [{ value: "a", label: "A" }] });
    render(NumberField, { label: "Weight", value: 1, suffix: "kg" });
    expect(screen.getByLabelText("Rest").tagName).toBe("SELECT");
    const weight = screen.getByLabelText("Weight") as HTMLInputElement;
    expect(weight.inputMode).toBe("decimal");
    expect(document.getElementById(weight.getAttribute("aria-describedby")!)?.textContent).toBe("kg");
  });

  it("hidden NumberField label is still the accessible name", () => {
    render(NumberField, { label: "Reps", labelVisible: false, value: null, mode: "integer" });
    expect((screen.getByLabelText("Reps") as HTMLInputElement).inputMode).toBe("numeric");
  });
});

describe("NumberField", () => {
  it("emits the parsed number on change and keeps the raw string until then", async () => {
    const onchange = vi.fn();
    render(NumberField, { label: "Weight", value: null, onchange });
    const input = screen.getByLabelText("Weight") as HTMLInputElement;
    await fireEvent.focus(input);
    await fireEvent.input(input, { target: { value: "82," } });
    expect(input.value).toBe("82,");
    expect(onchange).not.toHaveBeenCalled();
    await fireEvent.input(input, { target: { value: "82,5" } });
    await fireEvent.change(input);
    expect(onchange).toHaveBeenCalledExactlyOnceWith(82.5);
  });

  it("shows an error for garbage and does not change the value", async () => {
    const onchange = vi.fn();
    render(NumberField, { label: "Weight", value: 50, onchange });
    const input = screen.getByLabelText("Weight") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "abc" } });
    await fireEvent.change(input);
    expect(onchange).not.toHaveBeenCalled();
    expect(input.value).toBe("abc");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Enter a number")).toBeTruthy();
  });

  it("enforces min and max", async () => {
    render(NumberField, { label: "Rest", value: 10, max: 100 });
    const input = screen.getByLabelText("Rest") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "101" } });
    await fireEvent.change(input);
    expect(screen.getByText("Enter 100 or less")).toBeTruthy();
  });

  it("emits null when cleared", async () => {
    const onchange = vi.fn();
    render(NumberField, { label: "Weight", value: 5, onchange });
    const input = screen.getByLabelText("Weight");
    await fireEvent.input(input, { target: { value: "" } });
    await fireEvent.change(input);
    expect(onchange).toHaveBeenCalledWith(null);
  });
});

describe("Switch", () => {
  it("toggles and exposes role=switch", async () => {
    render(Switch, { label: "Awake", checked: false, description: "Desc" });
    const sw = screen.getByRole("switch", { name: "Awake" }) as HTMLInputElement;
    expect(sw.checked).toBe(false);
    await fireEvent.click(sw);
    expect(sw.checked).toBe(true);
    expect(document.getElementById(sw.getAttribute("aria-describedby")!)?.textContent).toBe("Desc");
  });
});

describe("SegmentedControl", () => {
  it("is a radio group that selects on click", async () => {
    render(SegmentedControl, { legend: "Units", value: "kg", options: [{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }] });
    expect(screen.getByRole("group", { name: "Units" })).toBeTruthy();
    const lb = screen.getByRole("radio", { name: "lb" }) as HTMLInputElement;
    await fireEvent.click(lb);
    expect(lb.checked).toBe(true);
    expect((screen.getByRole("radio", { name: "kg" }) as HTMLInputElement).checked).toBe(false);
  });
});

describe("Button", () => {
  it("renders a link when href is given and a button otherwise", () => {
    render(Button, { href: "/x", children: text("Go") });
    expect(screen.getByRole("link", { name: "Go" }).getAttribute("href")).toBe("/x");
    render(Button, { children: text("Do") });
    expect(screen.getByRole("button", { name: "Do" }).getAttribute("type")).toBe("button");
  });

  it("ignores clicks while loading", async () => {
    const onclick = vi.fn();
    render(Button, { loading: true, onclick, children: text("Save") });
    const b = screen.getByRole("button", { name: "Save" });
    expect(b.getAttribute("aria-busy")).toBe("true");
    await fireEvent.click(b);
    expect(onclick).not.toHaveBeenCalled();
  });

  it("IconButton uses its label as the accessible name", () => {
    render(IconButton, { icon: "trash", label: "Delete set" });
    expect(screen.getByRole("button", { name: "Delete set" })).toBeTruthy();
  });
});
