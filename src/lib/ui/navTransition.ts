// Page-navigation view transitions (docs/design.md §3.5). A progressive enhancement: without
// `document.startViewTransition` (iOS/macOS Safari < 18, Firefox < 144) or with reduced motion, navigation is
// exactly what it was, with no snapshot and no delay. A running transition never blocks a tap for longer than
// its 200 ms (the browser ignores input on the snapshot overlay), and the DOM update itself is never delayed.

/** "forward" = drilling into a detail, "back" = returning to its parent, "fade" = between unrelated pages. */
export type NavDirection = "forward" | "back" | "fade";

/**
 * Direction from base-relative paths ("/", "/history", "/history/abc"): a page nested under the current one is
 * forward, its parent is back. Home is a tab like the others, not everybody's parent, so it always fades.
 */
export function navDirection(from: string, to: string): NavDirection {
  if (from !== "/" && to.startsWith(from + "/")) return "forward";
  if (to !== "/" && from.startsWith(to + "/")) return "back";
  return "fade";
}

type Navigation = {
  from: { url: URL; route: { id: string | null } } | null;
  to: { url: URL; route: { id: string | null } } | null;
  complete: Promise<void>;
};

/** True when a transition should run for this navigation in this browser. */
export function shouldTransition(nav: Pick<Navigation, "from" | "to">, doc: Document, win: Window): boolean {
  if (typeof doc.startViewTransition !== "function") return false;
  if (win.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (!nav.from || !nav.to) return false;
  // Same page with other params or a hash: nothing moves as a whole.
  return nav.from.route.id !== nav.to.route.id;
}

/**
 * For SvelteKit's `onNavigate`: starts a view transition that captures the old page, lets the router swap in the
 * new one, and animates between them. The direction is exposed as `data-nav` on <html> for the CSS.
 * `relative` maps a URL pathname to a base-relative path.
 */
export function startNavTransition(nav: Navigation, relative: (pathname: string) => string): Promise<void> | void {
  if (!shouldTransition(nav, document, window)) return;
  const root = document.documentElement;
  root.dataset.nav = navDirection(relative(nav.from!.url.pathname), relative(nav.to!.url.pathname));
  const id = ++current;
  return new Promise((resolve) => {
    const transition = document.startViewTransition(async () => {
      resolve();
      await nav.complete;
    });
    // A newer navigation may have started (and set its own direction) before this one finished.
    transition.finished.finally(() => {
      if (id === current) delete root.dataset.nav;
    });
  });
}

let current = 0;
