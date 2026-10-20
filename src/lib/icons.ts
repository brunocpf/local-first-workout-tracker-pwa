// Curated inline-SVG icon set: shapes as data, rendered as real elements by `Icon.svelte` (no `{@html}`).
// Geometry from Lucide, except the dumbbell, drawn for this project (https://lucide.dev, ISC licence; see docs/attribution.md). 24×24 viewBox, 2px round strokes.

export type IconShape =
  | { tag: "path"; d: string }
  | { tag: "circle"; cx: number; cy: number; r: number }
  | { tag: "rect"; x: number; y: number; width: number; height: number; rx?: number }
  | { tag: "line"; x1: number; y1: number; x2: number; y2: number }
  | { tag: "polyline" | "polygon"; points: string };

const p = (d: string): IconShape => ({ tag: "path", d });
const c = (cx: number, cy: number, r = 1): IconShape => ({ tag: "circle", cx, cy, r });
const l = (x1: number, y1: number, x2: number, y2: number): IconShape => ({ tag: "line", x1, y1, x2, y2 });
const r = (x: number, y: number, width: number, height: number, rx?: number): IconShape => ({
  tag: "rect",
  x,
  y,
  width,
  height,
  rx,
});
const pl = (points: string): IconShape => ({ tag: "polyline", points });
const pg = (points: string): IconShape => ({ tag: "polygon", points });

const tray = "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4";

export const icons = {
  plus: [p("M5 12h14"), p("M12 5v14")],
  minus: [p("M5 12h14")],
  check: [p("M20 6 9 17l-5-5")],
  x: [p("M18 6 6 18"), p("m6 6 12 12")],
  trash: [p("M3 6h18"), p("M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"), p("M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2")],
  undo: [p("M9 14 4 9l5-5"), p("M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11")],
  timer: [l(10, 2, 14, 2), l(12, 14, 15, 11), c(12, 14, 8)],
  play: [pg("6 3 20 12 6 21 6 3")],
  pause: [r(14, 4, 4, 16, 1), r(6, 4, 4, 16, 1)],
  "skip-forward": [pg("5 4 15 12 5 20 5 4"), l(19, 5, 19, 19)],
  "chevron-left": [p("m15 18-6-6 6-6")],
  "chevron-right": [p("m9 18 6-6-6-6")],
  "chevron-down": [p("m6 9 6 6 6-6")],
  "chevron-up": [p("m18 15-6-6-6 6")],
  "more-vertical": [c(12, 12), c(12, 5), c(12, 19)],
  search: [c(11, 11, 8), p("m21 21-4.3-4.3")],
  settings: [
    p(
      "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
    ),
    c(12, 12, 3),
  ],
  home: [p("m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"), pl("9 22 9 12 15 12 15 22")],
  list: [l(8, 6, 21, 6), l(8, 12, 21, 12), l(8, 18, 21, 18), l(3, 6, 3.01, 6), l(3, 12, 3.01, 12), l(3, 18, 3.01, 18)],
  history: [p("M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"), p("M3 3v5h5"), p("M12 7v5l4 2")],
  dumbbell: [l(7, 12, 17, 12), r(4, 6, 3, 12, 1), r(17, 6, 3, 12, 1), l(2, 9, 2, 15), l(22, 9, 22, 15)],
  chart: [l(12, 20, 12, 10), l(18, 20, 18, 4), l(6, 20, 6, 16)],
  calendar: [r(3, 4, 18, 18, 2), l(16, 2, 16, 6), l(8, 2, 8, 6), l(3, 10, 21, 10)],
  edit: [
    p(
      "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
    ),
    p("m15 5 4 4"),
  ],
  copy: [r(8, 8, 14, 14, 2), p("M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2")],
  import: [p(tray), pl("7 10 12 15 17 10"), l(12, 15, 12, 3)],
  export: [p(tray), pl("17 8 12 3 7 8"), l(12, 3, 12, 15)],
  share: [c(18, 5, 3), c(6, 12, 3), c(18, 19, 3), l(8.59, 13.51, 15.42, 17.49), l(15.41, 6.51, 8.59, 10.49)],
  "alert-triangle": [p("m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"), p("M12 9v4"), p("M12 17h.01")],
  info: [c(12, 12, 10), p("M12 16v-4"), p("M12 8h.01")],
  grip: [c(9, 12), c(9, 5), c(9, 19), c(15, 12), c(15, 5), c(15, 19)],
  star: [pg("12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2")],
  link: [
    p("M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"),
    p("M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"),
  ],
  "wifi-off": [
    l(2, 2, 22, 22),
    p("M8.5 16.5a5 5 0 0 1 7 0"),
    p("M2 8.82a15 15 0 0 1 4.17-2.65"),
    p("M10.66 5c4.01-.36 8.14.9 11.34 3.76"),
    p("M16.85 11.25a10 10 0 0 1 2.22 1.68"),
    p("M5 13a10 10 0 0 1 5.24-2.76"),
    l(12, 20, 12.01, 20),
  ],
} satisfies Record<string, IconShape[]>;

export type IconName = keyof typeof icons;
export const iconNames = Object.keys(icons) as IconName[];
