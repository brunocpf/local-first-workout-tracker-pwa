import { render, screen } from "@testing-library/svelte";
import { beforeAll, describe, expect, it } from "vitest";
import PlateCalculatorSheet from "#lib/components/tools/PlateCalculatorSheet.svelte";
import { DEFAULT_BAR_KG, DEFAULT_PLATE_INVENTORY } from "#lib/tools/plates";
import { lbToKg } from "#lib/units";

// jsdom has no <dialog> modal API; stand in for the parts the components use.
beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

const props = { open: true, barKg: DEFAULT_BAR_KG, inventory: DEFAULT_PLATE_INVENTORY };

describe("PlateCalculatorSheet", () => {
  it("shows the plates per side for the target weight in kg", async () => {
    render(PlateCalculatorSheet, { ...props, unit: "kg", targetKg: 100 });
    // (100 - 20) / 2 = 40 per side = 2 × 20 (fewest plates)
    expect((await screen.findByTestId("plate-summary")).textContent).toContain("2 × 20");
    expect(screen.getByText(/Exactly 100 kg/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /Each side: 2 × 20/ })).toBeTruthy();
  });

  it("uses the display unit's plate system and bar", async () => {
    // 225 lb on a 45 lb bar: 90 per side = 2 × 45
    render(PlateCalculatorSheet, { ...props, unit: "lb", targetKg: lbToKg(225), barKg: lbToKg(45) });
    expect((await screen.findByTestId("plate-summary")).textContent).toContain("2 × 45");
    expect(screen.getByText(/Bar: 45 lb/)).toBeTruthy();
  });

  it("explains when the target is below the bar and asks for a weight when empty", async () => {
    const below = render(PlateCalculatorSheet, { ...props, unit: "kg", targetKg: 10 });
    expect(await screen.findByText(/Below the bar/)).toBeTruthy();
    below.unmount();
    render(PlateCalculatorSheet, { ...props, unit: "kg" });
    expect(await screen.findByText("Enter a weight to see the plates.")).toBeTruthy();
  });
});
