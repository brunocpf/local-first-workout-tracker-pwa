import { fireEvent, render } from "@testing-library/svelte";
import { beforeAll, describe, expect, it, vi } from "vitest";
import LineChart from "#lib/components/charts/LineChart.svelte";

const points = [
  { date: "2026-07-06", value: 100 },
  { date: "2026-10-12", value: 112.5 },
];

describe("LineChart", () => {
  beforeAll(() => {
    // jsdom has no ResizeObserver, which Svelte uses for clientWidth bindings.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it("summarises the series and exposes a data table", () => {
    const { getByRole, getAllByRole } = render(LineChart, {
      points,
      label: "Estimated 1RM for Bench Press",
      unit: "kg",
    });
    expect(getByRole("img").getAttribute("aria-label")).toBe(
      "Estimated 1RM for Bench Press rose from 100 to 112.5 kg between Jul 6, 2026 and Oct 12, 2026 (2 data points)",
    );
    expect(getAllByRole("row")).toHaveLength(3);
  });

  it("shows the empty state without points", () => {
    const { getByText, queryByRole } = render(LineChart, {
      points: [],
      label: "x",
    });
    expect(getByText("No data yet")).toBeTruthy();
    expect(queryByRole("img")).toBeNull();
  });

  it("draws no line for a single point", () => {
    const { container } = render(LineChart, {
      points: [points[0]],
      label: "x",
      unit: "kg",
    });
    expect(container.querySelector("path.line")).toBeNull();
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("reveals a point's value on click and moves with arrow keys", async () => {
    const { container, getAllByRole } = render(LineChart, {
      points,
      label: "x",
      unit: "kg",
    });
    const buttons = getAllByRole("button");
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1]);
    await fireEvent.click(buttons[0]);
    expect(container.querySelector(".readout")!.textContent).toBe(
      "Jul 6, 2026: 100 kg",
    );
    await fireEvent.keyDown(buttons[0], { key: "ArrowRight" });
    expect(container.querySelector(".readout")!.textContent).toBe(
      "Oct 12, 2026: 112.5 kg",
    );
  });
});
