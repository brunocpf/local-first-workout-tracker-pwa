import { fireEvent, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { describe, expect, it, vi } from "vitest";
import Banner from "#lib/components/ui/Banner.svelte";
import ListRow from "#lib/components/ui/ListRow.svelte";

const text = createRawSnippet(() => ({ render: () => "<span>Hello</span>" }));

describe("ListRow", () => {
  it("renders an anchor with href", () => {
    const { container } = render(ListRow, { title: "A", href: "/x" });
    expect(container.querySelector("a[href='/x']")).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });
  it("renders a button with onclick and fires it", async () => {
    const onclick = vi.fn();
    const { getByRole } = render(ListRow, { title: "B", onclick });
    await fireEvent.click(getByRole("button"));
    expect(onclick).toHaveBeenCalledOnce();
  });
  it("renders a static row otherwise", () => {
    const { container } = render(ListRow, { title: "C" });
    expect(container.querySelector("a, button")).toBeNull();
    expect(container.querySelector("div.row")).not.toBeNull();
  });
});

describe("Banner", () => {
  it("dismisses and calls ondismiss", async () => {
    const ondismiss = vi.fn();
    const { getByRole, queryByRole } = render(Banner, { variant: "info", children: text, dismissible: true, ondismiss });
    await fireEvent.click(getByRole("button", { name: "Dismiss" }));
    expect(ondismiss).toHaveBeenCalledOnce();
    expect(queryByRole("status")).toBeNull();
  });
  it("uses status by default and alert only for urgent danger", () => {
    expect(render(Banner, { variant: "danger", children: text }).queryByRole("alert")).toBeNull();
    expect(render(Banner, { variant: "danger", urgent: true, children: text }).queryByRole("alert")).not.toBeNull();
  });
});
