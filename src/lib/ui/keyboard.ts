// Keeps the focused field above the virtual keyboard (docs/design.md §5.5). Chromium resizes the layout
// viewport for the keyboard (`interactive-widget=resizes-content`); iOS Safari doesn't, it only shrinks the
// visual viewport, so a field low on the page ends up under the keyboard.

const MARGIN_PX = 8;

/** True when `rect`'s bottom edge is below the visible part of the visual viewport. */
export function isCovered(rect: Pick<DOMRect, "bottom">, viewport: Pick<VisualViewport, "offsetTop" | "height">): boolean {
  return rect.bottom > viewport.offsetTop + viewport.height - MARGIN_PX;
}

/**
 * Attachment for a container of fields: while a field inside it is focused, `visualViewport` resize/scroll
 * scrolls `node` (the whole row) into view when the keyboard covers it. Never scrolls when already visible.
 */
export function keepAboveKeyboard(node: HTMLElement) {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (!vv) return;
  const check = () => {
    // The browser scrolls the field itself; the row may still be partly under the keyboard.
    if (node.contains(document.activeElement) && isCovered(node.getBoundingClientRect(), vv)) {
      node.scrollIntoView({ block: "center" });
    }
  };
  const start = () => {
    vv.addEventListener("resize", check);
    vv.addEventListener("scroll", check);
    check();
  };
  const stop = (e: FocusEvent) => {
    if (e.relatedTarget instanceof Node && node.contains(e.relatedTarget)) return;
    vv.removeEventListener("resize", check);
    vv.removeEventListener("scroll", check);
  };
  node.addEventListener("focusin", start);
  node.addEventListener("focusout", stop);
  return () => {
    node.removeEventListener("focusin", start);
    node.removeEventListener("focusout", stop);
    vv.removeEventListener("resize", check);
    vv.removeEventListener("scroll", check);
  };
}
