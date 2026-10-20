import { render } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import Icon from "#lib/components/ui/Icon.svelte";
import { iconNames, icons } from "#lib/icons";

describe("Icon", () => {
  it("hides decorative icons from assistive tech", () => {
    const { container } = render(Icon, { name: "plus" });
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.hasAttribute("role")).toBe(false);
    expect(svg.hasAttribute("aria-label")).toBe(false);
    expect(svg.getAttribute("width")).toBe("1em");
  });

  it("announces labelled icons", () => {
    const { getByRole } = render(Icon, { name: "trash", label: "Delete set", size: 24 });
    const svg = getByRole("img", { name: "Delete set" });
    expect(svg.hasAttribute("aria-hidden")).toBe(false);
    expect(svg.getAttribute("width")).toBe("24px");
  });

  it("renders every shape as a real element", () => {
    for (const name of iconNames) {
      const { container, unmount } = render(Icon, { name });
      expect(container.querySelector("svg")!.children).toHaveLength(icons[name].length);
      unmount();
    }
  });
});
