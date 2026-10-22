# 0007 – Hand-rolled SVG charts

**Status:** accepted · 2026-10-20

**Context:** The Progress tab needs one line chart per exercise (PRD §14.1: lightweight, only when needed), later possibly a few more series (volume, body weight). The app is an offline PWA where bundle size and precache size matter, and the chart must be accessible and follow the design tokens in light, dark and forced-colors modes.

**Decision:** No charting library. `src/lib/charts/scale.ts` holds pure scale/tick helpers (tested in `tests/chart-scale.test.ts`) and `src/lib/components/charts/LineChart.svelte` renders inline SVG.
- Width/height are measured and used as the `viewBox`, so text stays at token sizes (no scaling blur) at 320 px and wider.
- The SVG is `role="img"` with a generated summary `aria-label`; a visually hidden `<table>` carries every value. Interaction uses real `<button>`s overlaid on the points (≥ 44 px targets, roving tabindex, arrow/Home/End keys) because focusable children of `role="img"` are not exposed.
- Colors are tokens only; forced colors switch to system colors; the draw-in animation is disabled under `prefers-reduced-motion`.
- X is a day scale on local `YYYY-MM-DD` dates (DST-free); Y uses "nice" ticks.

**Consequences:** About a hundred lines of scale code and one component to maintain, no dependency. Revisit (adopt a library or a canvas renderer) if we need pan/zoom, many thousands of points per chart, multiple overlaid series with legends, or chart types beyond line/bar. Until then, extend the component rather than adding a dependency.
