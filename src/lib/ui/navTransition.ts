// Page-navigation view transitions (docs/design.md §3.5). A progressive enhancement: without
// `document.startViewTransition` (iOS/macOS Safari < 18, Firefox < 144) or with reduced motion, navigation is
// exactly what it was, with no snapshot and no delay. While a transition runs the browser hit-tests only the
// document root, so a tap is lost: transitions are short (≤ 200 ms), a tap skips the rest of one so the next
// tap lands, and the logger (/workout), where sets are tapped in quick succession, never transitions.

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

const isLogger = (path: string) => path === "/workout" || path.startsWith("/workout/");

/** True when a transition should run for this navigation in this browser (`relative` as in startNavTransition). */
export function shouldTransition(
  nav: Pick<Navigation, "from" | "to">,
  doc: Document,
  win: Window,
  relative: (pathname: string) => string = (p) => p,
): boolean {
  if (typeof doc.startViewTransition !== "function") return false;
  if (win.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (!nav.from || !nav.to) return false;
  if (isLogger(relative(nav.from.url.pathname)) || isLogger(relative(nav.to.url.pathname))) return false;
  // Same page with other params or a hash: nothing moves as a whole.
  return nav.from.route.id !== nav.to.route.id;
}

/**
 * For SvelteKit's `onNavigate`: starts a view transition that captures the old page, lets the router swap in the
 * new one, and animates between them. The direction is exposed as `data-nav` on <html> for the CSS.
 * `relative` maps a URL pathname to a base-relative path.
 */
export function startNavTransition(nav: Navigation, relative: (pathname: string) => string): Promise<void> | void {
  if (!shouldTransition(nav, document, window, relative)) return;
  const root = document.documentElement;
  root.dataset.nav = navDirection(relative(nav.from!.url.pathname), relative(nav.to!.url.pathname));
  const id = ++current;
  return new Promise((resolve) => {
    const transition = document.startViewTransition(async () => {
      resolve();
      await nav.complete;
    });
    // A skipped transition rejects `ready`; an interrupted navigation rejects `nav.complete`, which rejects
    // `updateCallbackDone` and `finished` too. None of that is an error here: the router has already moved on.
    transition.ready.catch(ignore);
    transition.updateCallbackDone.catch(ignore);
    // The tap that lands on the snapshot is lost, but it ends the transition so the next one isn't.
    const skip = () => transition.skipTransition();
    document.addEventListener("pointerdown", skip, { capture: true });
    transition.finished
      .catch(ignore)
      .finally(() => {
        document.removeEventListener("pointerdown", skip, { capture: true });
        // A newer navigation may have started (and set its own direction) before this one finished.
        if (id === current) delete root.dataset.nav;
      });
  });
}

const ignore = () => {};

let current = 0;
