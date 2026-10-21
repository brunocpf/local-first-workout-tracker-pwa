# Design spec

The single source of truth for how the app looks and behaves. Every UI task follows it; changes to the look are made here first, then in code. Implementation: tokens and base styles in `src/app.css` (T1.02), components in `src/lib/components/ui/` (T1.03–T1.06), shell in `src/routes/+layout.svelte` (T1.07).

Related: [PRD §5, §8, §18, §21](PRD.md) · [browser limitations](browser-limitations.md) · [ADR 0003](decisions/0003-pwa-shell-and-updates.md) (CSP, updates) · [ADR 0005](decisions/0005-mvp-scope-and-platforms.md) (platforms).

Contents: [1 Browser support](#1-browser-support-policy) · [2 Visual direction](#2-visual-direction) · [3 Tokens](#3-tokens) · [4 Theme](#4-theme-mechanism) · [5 Layout](#5-layout) · [6 Components](#6-components) · [7 Screens](#7-screens) · [8 Content](#8-content-rules) · [9 Review checklist](#9-review-checklist)

---

## 1. Browser support policy

**Minimum versions:** iOS/iPadOS Safari **17.5** (installed or tab), macOS Safari 17.5, Chrome/Edge (desktop and Android) **123**, Firefox **121** (tab only). These are the lowest versions that support everything in the "free to use" rows below. Older browsers are not supported, and we don't test them.

| Tier | Rule | Examples used in this app |
|---|---|---|
| Baseline **Widely available** | Use freely, no fallback. | `<dialog>` + `showModal()`, `inert`, `:focus-visible`, `:has()`, CSS nesting, `:user-invalid`, size container queries, `dvh`/`svh`, `env(safe-area-inset-*)`, `color-mix()`, `clamp()`, `inputmode`, `enterkeyhint`, `Intl.NumberFormat` / `DateTimeFormat` / `RelativeTimeFormat` / `PluralRules` |
| Newly available, **supported by every minimum version** | Use freely, but only the ones listed here. Add to this list only after checking all minimum versions. | `light-dark()` (Safari 17.5, Chrome 123, Firefox 120; becomes Widely available Nov 2026) |
| Baseline **Newly available** | Only with feature detection and a working fallback. The feature must be an enhancement: the app still works without it. | Popover API (missing in Firefox 121–124; `popover="manual"` works from Safari 17, iOS 18.3 only fixed light dismiss, which toasts don't use) → toast region with `position: fixed`; `@starting-style` → no entry animation; `transition-behavior: allow-discrete` / `overlay` → `data-closing` exit fallback (§6.9); `text-wrap: balance/pretty` → normal wrapping; View Transitions (`document.startViewTransition`: Safari 18, Chrome 111, Firefox 144; missing in our Safari 17.5 minimum) → navigation without animation (§3.5) |
| **Limited availability** | Progressive enhancement only, never needed for a feature to work. | `<dialog closedby>` (not in Safari) → click-outside script (§6.9); `<input type="checkbox" switch>` (Safari only) → always `role="switch"` + own styles (§6.7); `interactive-widget` viewport key (Chromium only) → `visualViewport` rule (§5.5); `<meta name="text-scale">` (Chromium 146+); `accent-color`, `scrollbar-color`, `field-sizing: content`; `overscroll-behavior` on scroll containers that don't overflow |
| **Platform APIs** | Always feature-detect; their absence is not an error ([browser-limitations.md](browser-limitations.md)). | Screen Wake Lock, `navigator.vibrate`, Web Share with files, `navigator.storage.persist()` |

Not used: `Intl.DurationFormat` (missing in Chrome 123), the File System Access API, `beforeinstallprompt` as a required path, `:active-view-transition-type()` (the direction is a `data-nav` attribute instead, which works in every browser with View Transitions), polyfills (no new dependencies for UI).

Check new UI patterns against the modern-web-guidance skill (`npx -y modern-web-guidance@latest search "<pattern>"`) and against this table before adding them.

---

## 2. Visual direction

**Calm, compact, utilitarian, high contrast.** It is a tool you use between sets with tired hands and a raised heart rate. Numbers and the next action come first. Decoration does not.

- **One accent color (blue).** It marks the primary action on a screen, the current tab, links, focus and selection. Status colors (success, warning, danger, info) mean only status.
- **Dark and light are both first-class.** Neither is derived from the other: every color token is a hand-picked pair. Dark is a near-black neutral (no blue tint) so the screen is quiet in a dim gym. Light is a soft grey page with white cards.
- **Flat, layered by borders.** Surfaces get lighter (dark) or whiter (light) as they come forward, separated by 1 px borders. Shadows only on overlays (dialog, sheet, toast), and those overlays have a border as well, so forced colors still works.
- **Dense but tappable.** Compact type (16 px body, 14 px secondary). Every target is still at least 44 × 44 px.
- **Numbers are typography.** Tabular figures everywhere numbers line up (set rows, timers, stats). The rest-timer number is the largest text on the workout screen while logging.

Reference mood: the set grid of a mature gym logger (Hevy, Strong) for density; iOS Settings for grouped lists; system apps for restraint (system font, native controls where possible).

| Do | Don't |
|---|---|
| One primary button per screen or section | Two accent-filled buttons side by side |
| Status = icon + text (+ color) | A red border or a green row as the only signal |
| Borders to separate surfaces | Drop shadows on cards, gradients, glass/blur |
| Sentence case labels with verbs ("Start workout") | ALL CAPS, Title Case Buttons, exclamation marks |
| Leave empty space empty | Illustrations, mascots, confetti, streak guilt |
| Native `<select>`, native `<dialog>` | Custom dropdowns or focus traps that copy built-in behavior |
| Tokens (`var(--color-danger)`) | Raw colors (`#b91c1c`, `red`, `rgb(…)`) in components |

---

## 3. Tokens

All tokens are CSS custom properties on `:root` in `src/app.css`. Components use **only** tokens. Raw color values appear only in the token definitions below. Names are final: later tasks refer to them.

### 3.1 Color

Each value is `light-dark(<light>, <dark>)`. The pair follows the computed `color-scheme` (§4).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `#f4f4f5` | `#0b0b0f` | Page background, page header, tab bar (surface level 0) |
| `--color-surface-1` | `#ffffff` | `#17171c` | Cards, list groups, dialogs, sheets (level 1) |
| `--color-surface-2` | `#ececee` | `#222228` | Inputs, secondary buttons, hover on level 1 (level 2) |
| `--color-surface-3` | `#e0e0e4` | `#2e2e36` | Pressed state, toasts, progress-bar track (level 3) |
| `--color-text` | `#18181b` | `#f4f4f5` | Body text, input values, icons |
| `--color-text-muted` | `#52525b` | `#a1a1aa` | Secondary text, placeholders (incl. prefilled set values), previous values |
| `--color-text-disabled` | `#a1a1aa` | `#5c5c66` | Disabled labels (exempt from contrast minimums) |
| `--color-border` | `#e0e0e4` | `#2e2e36` | Decorative dividers and card outlines (no information) |
| `--color-border-strong` | `#7d7d87` | `#7d7d87` | Edges that identify a control: inputs, switch track, unselected segments (≥ 3:1) |
| `--color-accent` | `#1d4ed8` | `#60a5fa` | Primary button fill, active tab indicator, switch on, chart line, progress fill |
| `--color-accent-hover` | `#1e40af` | `#93c5fd` | Primary button hover |
| `--color-accent-active` | `#1e3a8a` | `#bfdbfe` | Primary button pressed |
| `--color-on-accent` | `#ffffff` | `#0b0b0f` | Text/icons on accent fill |
| `--color-accent-subtle` | `#dbeafe` | `#172554` | Selected row, selected segment, accent badge background |
| `--color-accent-text` | `#1e40af` | `#93c5fd` | Links, ghost-button text, active tab label, accent badge text |
| `--color-success` | `#15803d` | `#4ade80` | Success icons, completed-set check fill |
| `--color-success-subtle` | `#dcfce7` | `#052e16` | Completed set row, success banner/badge background |
| `--color-success-text` | `#166534` | `#86efac` | Success text |
| `--color-on-success` | `#ffffff` | `#0b0b0f` | Check mark on success fill |
| `--color-warning` | `#b45309` | `#fbbf24` | Warning icons and banner edge |
| `--color-warning-subtle` | `#fef3c7` | `#422006` | Warning banner/badge background |
| `--color-warning-text` | `#92400e` | `#fcd34d` | Warning text |
| `--color-danger` | `#b91c1c` | `#f87171` | Danger button fill, error icons, invalid input border |
| `--color-danger-hover` | `#991b1b` | `#fca5a5` | Danger button hover/pressed |
| `--color-on-danger` | `#ffffff` | `#0b0b0f` | Text on danger fill |
| `--color-danger-subtle` | `#fee2e2` | `#450a0a` | Error banner/badge background |
| `--color-danger-text` | `#991b1b` | `#fca5a5` | Error text, danger ghost-button text |
| `--color-info` | `#0369a1` | `#38bdf8` | Info icons and banner edge |
| `--color-info-subtle` | `#e0f2fe` | `#082f49` | Info banner/badge background |
| `--color-info-text` | `#075985` | `#7dd3fc` | Info text |
| `--color-focus` | `#2563eb` | `#93c5fd` | Focus ring |
| `--color-backdrop` | `rgb(24 24 27 / 0.4)` | `rgb(0 0 0 / 0.6)` | `dialog::backdrop` |
| `--color-shadow` | `rgb(0 0 0 / 0.16)` | `rgb(0 0 0 / 0.6)` | Used only inside `--shadow-overlay` |

Theme-color values (not CSS tokens; used in `<meta name="theme-color">`, §4): light `#f4f4f5`, dark `#0b0b0f` (= `--color-bg`).

**Contrast ratios** (WCAG 2.x relative luminance; computed for every pair the components use). Text ≥ 4.5:1. UI parts (control edges, icons, focus ring, state indicators) ≥ 3:1.

| Text pair (foreground on background) | Light | Dark | Min |
|---|---|---|---|
| `--color-text` on `--color-bg` | 16.12:1 | 17.87:1 | 4.5:1 |
| `--color-text` on `--color-surface-1` | 17.72:1 | 16.25:1 | 4.5:1 |
| `--color-text` on `--color-surface-2` | 15.02:1 | 14.39:1 | 4.5:1 |
| `--color-text` on `--color-surface-3` | 13.46:1 | 12.25:1 | 4.5:1 |
| `--color-text-muted` on `--color-bg` | 7.03:1 | 7.66:1 | 4.5:1 |
| `--color-text-muted` on `--color-surface-1` | 7.73:1 | 6.97:1 | 4.5:1 |
| `--color-text-muted` on `--color-surface-2` | 6.55:1 | 6.17:1 | 4.5:1 |
| `--color-text-muted` on `--color-surface-3` | 5.87:1 | 5.25:1 | 4.5:1 |
| `--color-text-muted` on `--color-success-subtle` | 7.04:1 | 5.82:1 | 4.5:1 |
| `--color-accent-text` on `--color-bg` | 7.94:1 | 10.89:1 | 4.5:1 |
| `--color-accent-text` on `--color-surface-1` | 8.72:1 | 9.90:1 | 4.5:1 |
| `--color-accent-text` on `--color-surface-2` | 7.39:1 | 8.77:1 | 4.5:1 |
| `--color-accent-text` on `--color-accent-subtle` | 7.15:1 | 8.15:1 | 4.5:1 |
| `--color-accent-text` on `--color-surface-3` (toast action, pressed ghost) | 6.63:1 | 7.46:1 | 4.5:1 |
| `--color-text-muted` on `--color-accent-subtle` (selected row subtitle) | 6.34:1 | 5.73:1 | 4.5:1 |
| `--color-on-accent` on `--color-accent` | 6.70:1 | 7.73:1 | 4.5:1 |
| `--color-on-accent` on `--color-accent-hover` | 8.72:1 | 10.89:1 | 4.5:1 |
| `--color-on-accent` on `--color-accent-active` | 10.36:1 | 13.83:1 | 4.5:1 |
| `--color-success-text` on `--color-bg` | 6.49:1 | 13.99:1 | 4.5:1 |
| `--color-success-text` on `--color-surface-1` | 7.13:1 | 12.72:1 | 4.5:1 |
| `--color-success-text` on `--color-success-subtle` | 6.49:1 | 10.62:1 | 4.5:1 |
| `--color-on-success` on `--color-success` | 5.02:1 | 11.27:1 | 4.5:1 |
| `--color-warning-text` on `--color-bg` | 6.45:1 | 13.62:1 | 4.5:1 |
| `--color-warning-text` on `--color-surface-1` | 7.09:1 | 12.39:1 | 4.5:1 |
| `--color-warning-text` on `--color-warning-subtle` | 6.37:1 | 10.11:1 | 4.5:1 |
| `--color-danger-text` on `--color-bg` | 7.56:1 | 10.35:1 | 4.5:1 |
| `--color-danger-text` on `--color-surface-1` | 8.31:1 | 9.41:1 | 4.5:1 |
| `--color-danger-text` on `--color-danger-subtle` | 6.80:1 | 8.51:1 | 4.5:1 |
| `--color-on-danger` on `--color-danger` | 6.47:1 | 7.10:1 | 4.5:1 |
| `--color-on-danger` on `--color-danger-hover` | 8.31:1 | 10.35:1 | 4.5:1 |
| `--color-info-text` on `--color-bg` | 6.88:1 | 11.78:1 | 4.5:1 |
| `--color-info-text` on `--color-surface-1` | 7.56:1 | 10.71:1 | 4.5:1 |
| `--color-info-text` on `--color-info-subtle` | 6.59:1 | 8.32:1 | 4.5:1 |
| `--color-text` on `--color-accent-subtle` | 14.52:1 | 13.37:1 | 4.5:1 |
| `--color-text` on `--color-success-subtle` | 16.13:1 | 13.56:1 | 4.5:1 |
| `--color-text` on `--color-warning-subtle` | 15.91:1 | 13.26:1 | 4.5:1 |
| `--color-text` on `--color-danger-subtle` | 14.50:1 | 14.69:1 | 4.5:1 |
| `--color-text` on `--color-info-subtle` | 15.44:1 | 12.63:1 | 4.5:1 |

| UI pair (foreground on background) | Light | Dark | Min |
|---|---|---|---|
| `--color-border-strong` on `--color-bg` | 3.71:1 | 4.82:1 | 3:1 |
| `--color-border-strong` on `--color-surface-1` | 4.07:1 | 4.38:1 | 3:1 |
| `--color-border-strong` on `--color-surface-2` | 3.45:1 | 3.88:1 | 3:1 |
| `--color-border-strong` on `--color-surface-3` (toast edge) | 3.09:1 | 3.30:1 | 3:1 |
| `--color-border-strong` on `--color-success-subtle` (inputs in a completed set row, success banner action) | 3.71:1 | 3.66:1 | 3:1 |
| `--color-border-strong` on `--color-accent-subtle` (selected row, accent badge) | 3.34:1 | 3.61:1 | 3:1 |
| `--color-border-strong` on `--color-warning-subtle` (warning banner action) | 3.66:1 | 3.58:1 | 3:1 |
| `--color-border-strong` on `--color-danger-subtle` (danger banner action) | 3.33:1 | 3.96:1 | 3:1 |
| `--color-border-strong` on `--color-info-subtle` (info banner action) | 3.55:1 | 3.41:1 | 3:1 |
| `--color-accent` on `--color-bg` | 6.10:1 | 7.73:1 | 3:1 |
| `--color-accent` on `--color-surface-1` | 6.70:1 | 7.03:1 | 3:1 |
| `--color-accent` on `--color-surface-2` | 5.68:1 | 6.22:1 | 3:1 |
| `--color-accent` on `--color-surface-3` (progress fill on track) | 5.09:1 | 5.29:1 | 3:1 |
| `--color-accent` on `--color-accent-subtle` (selected segment edge) | 5.49:1 | 5.78:1 | 3:1 |
| `--color-success` on `--color-bg` | 4.56:1 | 11.27:1 | 3:1 |
| `--color-success` on `--color-surface-1` | 5.02:1 | 10.25:1 | 3:1 |
| `--color-success` on `--color-success-subtle` | 4.57:1 | 8.55:1 | 3:1 |
| `--color-warning` on `--color-bg` | 4.57:1 | 11.77:1 | 3:1 |
| `--color-warning` on `--color-surface-1` | 5.02:1 | 10.70:1 | 3:1 |
| `--color-warning` on `--color-warning-subtle` | 4.51:1 | 8.73:1 | 3:1 |
| `--color-danger` on `--color-bg` | 5.89:1 | 7.10:1 | 3:1 |
| `--color-danger` on `--color-surface-1` | 6.47:1 | 6.46:1 | 3:1 |
| `--color-danger` on `--color-danger-subtle` | 5.30:1 | 5.84:1 | 3:1 |
| `--color-info` on `--color-bg` | 5.40:1 | 9.17:1 | 3:1 |
| `--color-info` on `--color-surface-1` | 5.93:1 | 8.34:1 | 3:1 |
| `--color-info` on `--color-info-subtle` | 5.17:1 | 6.48:1 | 3:1 |
| `--color-focus` on `--color-bg` | 4.70:1 | 10.89:1 | 3:1 |
| `--color-focus` on `--color-surface-1` | 5.17:1 | 9.90:1 | 3:1 |
| `--color-focus` on `--color-surface-2` | 4.38:1 | 8.77:1 | 3:1 |
| `--color-focus` on `--color-success-subtle` (completed set row) | 4.71:1 | 8.27:1 | 3:1 |
| `--color-text-muted` (switch thumb, off) on `--color-surface-2` | 6.55:1 | 6.17:1 | 3:1 |
| `--color-text-disabled` on `--color-surface-1` | 2.56:1 | 2.70:1 | exempt (disabled) |

The focus ring is always drawn with `outline-offset`, so it sits on the surface around a control and never on the accent fill itself. `--color-border` is decorative only. Never use it as the only edge of a control whose edge identifies it (inputs, buttons with a fill, switch, segments). List rows are identified by their text and chevron, not their dividers, so dividers may use it.

**`@media (prefers-contrast: more)`:** `--color-border` → `--color-border-strong`, `--color-text-muted` → `--color-text`.

**`@media (forced-colors: active)`:** don't override author colors. All component edges are real `border`s or `outline`s, so they survive. Icons use `currentColor`. Custom-styled controls that use `appearance: none` (Switch, SegmentedControl, NumberField suffix) add `border-color: ButtonText`. The selected segment and the switch thumb use `background: Highlight`, and the completed-set check uses `CanvasText`. Never use `forced-color-adjust: none` just to keep the look. Charts may use it on the data line only.

### 3.2 Typography

- **Font stack:** `--font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";` and `--font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;` (JSON textarea only). No web fonts.
- **Never set `font-size` on `:root`/`html`.** The browser's root size (and OS text scaling, where supported) flows through `rem`. `body` inherits `1rem`.
- **Sizes are `rem` only.** Line heights are unitless.

| Token | Size (rem / px at default) | Line height | Use |
|---|---|---|---|
| `--text-xs` | 0.75 / 12 | 1.333 | Badges, tab-bar labels, column headers in set grid |
| `--text-sm` | 0.875 / 14 | 1.43 | Secondary text, previous values, list subtitles, hints, toasts |
| `--text-md` | 1 / 16 | 1.5 | Body, inputs, buttons, list titles |
| `--text-lg` | 1.125 / 18 | 1.33 | Page title (`h1` in PageHeader), exercise name, dialog title |
| `--text-xl` | 1.375 / 22 | 1.27 | Rest-timer remaining time, section display numbers |
| `--text-2xl` | 1.75 / 28 | 1.14 | Summary stats (finish summary, history detail) |
| `--text-3xl` | 2.25 / 36 | 1.11 | Chart headline value (Progress) |

- **Weights:** `--weight-regular: 400` (body), `--weight-medium: 500` (list titles, buttons), `--weight-semibold: 600` (headings, selected segment, active tab), `--weight-bold: 700` (stat numbers only).
- **Numbers:** `.tabular { font-variant-numeric: tabular-nums; }` on set rows, timers, stats, tables, chart labels, and any column of numbers.
- **Inputs are ≥ 16 px** (`font-size: max(1rem, 16px)`), or iOS Safari zooms in on focus.
- Headings: `text-wrap: balance` (enhancement). Paragraphs longer than one line: `max-inline-size: 65ch`, `text-wrap: pretty`. Long strings (exercise names, imported text, URLs): `overflow-wrap: anywhere`.
- No all-caps for meaning. The set-grid column headers may use `text-transform: uppercase` at `--text-xs` with `letter-spacing: 0.04em`, because they are short labels that are repeated for each exercise.

### 3.3 Spacing, size, radius, border

4 px base, expressed in `rem` so spacing scales with text.

| Token | Value | | Token | Value |
|---|---|---|---|---|
| `--space-1` | 0.25rem (4) | | `--space-6` | 1.5rem (24) |
| `--space-2` | 0.5rem (8) | | `--space-8` | 2rem (32) |
| `--space-3` | 0.75rem (12) | | `--space-10` | 2.5rem (40) |
| `--space-4` | 1rem (16) | | `--space-12` | 3rem (48) |
| `--space-5` | 1.25rem (20) | | `--space-16` | 4rem (64) |

- `--gutter: clamp(0.75rem, 4vw, 1.5rem)`: horizontal page padding (≈ 12.8 px at 320, 15 px at 375, 24 px wide).
- `--tap-min: max(44px, 2.75rem)`: minimum block and inline size of every interactive target. Use `min-block-size` / `min-inline-size` or padding, never a fixed `height`.
- `--control-h: var(--tap-min)`: inputs and md buttons. `--control-h-lg: max(52px, 3.25rem)`: lg buttons.
- `--content-max: 42rem`: max content width (§5.2). `--tabbar-h: max(56px, 3.5rem)`, `--header-h: max(56px, 3.5rem)`, `--rail-w: 5.5rem`.
- Radii (px, don't scale): `--radius-sm: 6px` (badges, set-row inputs), `--radius-md: 10px` (buttons, inputs, list groups on phones), `--radius-lg: 16px` (cards, dialogs, sheet top corners), `--radius-full: 999px` (switch, pills, progress bar).
- Borders: `--border-w: 1px` (all edges); `--focus-w: 2px` and `--focus-offset: 2px` (focus ring: `outline: var(--focus-w) solid var(--color-focus); outline-offset: var(--focus-offset)`). Style `:focus-visible`, never remove the outline without a replacement.

### 3.4 Elevation

Levels are surface colors plus borders: `--color-bg` (0) → `--color-surface-1` (1) → `--color-surface-2` (2) → `--color-surface-3` (3). The only shadow:

- `--shadow-overlay: 0 8px 32px var(--color-shadow)`: Dialog, Sheet, Toast. Always paired with `border: var(--border-w) solid var(--color-border)`, so forced colors (which removes `box-shadow`) still shows an edge.

### 3.5 Motion

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 120ms | Button press colors, check-mark pop, switch thumb |
| `--duration-base` | 200ms | Dialog/toast enter, segment change |
| `--duration-slow` | 300ms | Sheet slide |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Color/state changes |
| `--ease-enter` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | Things appearing |
| `--ease-exit` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | Things leaving (use 0.75× the enter duration) |

- What moves: overlay enter/exit (opacity + `scale(0.96 → 1)` for dialogs/toasts, `translateY(100% → 0)` for sheets), the check mark on set completion (`scale(0.8 → 1)`), the PR badge when a completed set becomes a record (opacity + `scale(0.6 → 1)`, `--duration-base` `--ease-enter`, once), the switch thumb, the rest-timer progress fill (`transform: scaleX()` with a 1 s linear transition, so it glides between the whole-second updates without layout), and page navigation (below). Press states fade their colors over `--duration-fast` (Button, IconButton, ListRow). Nothing else: no list animations, no scroll effects.
- **Page transitions** (T8.34, [ui-polish.md](ui-polish.md)): `onNavigate` in `+layout.svelte` calls `startNavTransition` (`src/lib/ui/navTransition.ts`), which uses `document.startViewTransition` only when it exists, reduced motion isn't requested and the route changes (not for a query or hash change). The direction goes on `<html data-nav>` while it runs. A page nested under the current one (`/history` → `/history/:id`) is `forward`: the old page fades out moving `--space-4` to the start, the new one fades in from `--space-8` at the end, over `--duration-base`. Its parent is `back`, the mirror image. Everything else, tabs included (Home is a tab, not everyone's parent), is `fade`: a cross-fade over `--duration-fast`. The tab bar has `view-transition-name: tabbar` and doesn't animate. The current-tab bar is a `.indicator` element named `tab-indicator`, so it glides to the new tab. The browser ignores taps on the snapshot overlay while a transition runs, which is why they stay ≤ 200 ms and why state changes inside a page (set completion, sheets, dialogs) never use View Transitions. Without the API (Safari < 18), navigation is unchanged.
- **Reduced motion** (`@media (prefers-reduced-motion: reduce)`): no transforms. Overlays only fade, at `--duration-fast`. No page transitions are started (and `::view-transition-*` animations are off as a backstop). The PR badge appears without the pop, and the rest-timer fill steps once a second. The Spinner stops rotating and shows a static icon with its label. Color fades on press stay (they aren't motion). Don't use a global `* { transition: none !important }`: it breaks the exit-fallback probe in §6.9. Set the reduced-motion rule in each component.
- Never use motion as the only signal of a state change.

### 3.6 Z-layers

Dialogs, sheets and popover toasts use the **top layer**, so they need no `z-index`. Other layers:

| Token | Value | Use |
|---|---|---|
| `--z-sticky` | 10 | Sticky page header, sticky bottom action area, rest-timer bar |
| `--z-nav` | 20 | Tab bar / side rail |
| `--z-banner` | 30 | App-level banners (update available) when stuck to the top |
| `--z-toast` | 100 | Toast region **fallback** only (no Popover support) |

---

## 4. Theme mechanism

- `<meta name="color-scheme" content="light dark">` in `app.html` and `:root { color-scheme: light dark; }`: the default follows the OS.
- Override: the `theme` setting (`system` / `light` / `dark`, stored in Dexie [settings](data-model.md), included in backups) is applied as `data-theme` on `<html>`. Remove the attribute for `system`.

  ```css
  :root { color-scheme: light dark; }
  :root[data-theme="light"] { color-scheme: light; }
  :root[data-theme="dark"]  { color-scheme: dark; }
  ```

  All color tokens use `light-dark()`, so they follow `color-scheme` with no other branching. If non-color values ever need to branch, combine `@media (prefers-color-scheme: dark)` with `:root[data-theme]` selectors. Never use a JS-only class.
- **No flash of the wrong theme:** Dexie is async, so the theme is also mirrored to `localStorage` under `workout-tracker:theme` (an app-specific key, because the origin is shared, see [browser-limitations.md](browser-limitations.md)). `static/theme-init.js` is a classic script (not a module, not deferred, allowed by the CSP `script-src 'self'`). It is loaded right after the color-scheme meta, reads the key inside `try/catch`, and sets `data-theme`. Dexie stays the source of truth: the settings store rewrites the mirror on load and on change. If JS never runs, the page follows the OS.
- **`theme-color`:** two metas, `<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f4f4f5">` and `… media="(prefers-color-scheme: dark)" content="#0b0b0f">`. When `data-theme` overrides the OS, the theme code sets **both** metas' `content` to the chosen scheme's value. The manifest keeps `#0b0b0f` for `theme_color` / `background_color` (splash screen, one value only).
- **iOS status bar:** `apple-mobile-web-app-status-bar-style` = **`default`**, not `black-translucent`. `black-translucent` draws white status-bar text over the page, which can't be read in light theme. Check on a real device during the [pwa-install.md](pwa-install.md) checklist that the bar follows `theme-color` in both schemes.
- **OS text scale:** add `<meta name="text-scale" content="scale">` (Chromium enhancement). Other browsers ignore it, and pinch-zoom and browser zoom still work. Layouts must survive 200% text (§5.6).
- **Settings UI:** a SegmentedControl "System / Light / Dark" in Settings → Appearance. The System segment shows what it resolves to: "System (dark)". There is no theme toggle in the app chrome.

---

## 5. Layout

### 5.1 Viewport and shell

`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">`. Never disable zoom.

The **document scrolls** (not an inner `overflow: auto` container). This keeps iOS address-bar collapse, tap-status-bar-to-top, find-in-page and keyboard scrolling working.

```
Phone (< 48em)                          Wide (≥ 48em)
┌──────────────────────────┐            ┌──────┬──────────────────────────────┐
│ PageHeader (sticky top)  │            │ Rail │      PageHeader (sticky)      │
│  + safe-area-inset-top   │            │ ⌂    │   ┌──────────────────────┐    │
├──────────────────────────┤            │ ☰    │   │ main, centered,      │    │
│ main                     │            │ ⟲    │   │ max --content-max    │    │
│  padding-inline: gutter  │            │ 🏋   │   │ (42rem)              │    │
│  …                       │            │ 📈   │   │                      │    │
│ sticky action area (opt.)│            │      │   └──────────────────────┘    │
├──────────────────────────┤            │ ⚙    │                               │
│ Tab bar (fixed bottom)   │            │      │                               │
│  + safe-area-inset-bottom│            └──────┴──────────────────────────────┘
└──────────────────────────┘
```

- **Breakpoint:** one, `@media (width >= 48em)` (em-based, so it moves with text size). Components respond to their container with `@container` queries in `em`, not to the viewport.
- **Tab bar (phones):** `position: fixed; inset-inline: 0; bottom: 0`, `--color-bg` with a top `--color-border` line, five equal items (icon 24 px over a `--text-xs` label), each ≥ `--tap-min`, height `--tabbar-h` + `env(safe-area-inset-bottom)`. Current item: `--color-accent-text` icon and label, `--weight-semibold`, a 3 px `--color-accent` bar above the icon, and `aria-current="page"` (shape + weight + color, not color alone). Items: Home (`home`), Routines (`list`), History (`history`), Exercises (`dumbbell`), Progress (`chart`). Tabs for features that don't exist yet stay hidden ([PRD §5](PRD.md)).
- **Side rail (wide):** `position: sticky; top: 0; block-size: 100dvh`, `--rail-w` wide, same items stacked vertically (icon over label), Settings pinned at the bottom. Content is centered in the remaining space with `max-inline-size: var(--content-max)`.
- **Shell offsets:** `--shell-bottom` is defined on `:root` (so `html`'s `scroll-padding` can read it): `calc(var(--tabbar-h) + var(--safe-bottom))` while the phone tab bar is shown, otherwise just `var(--safe-bottom)` (wide screens, `/workout`, and while typing, §5.5). `main` has `padding-block-end: var(--shell-bottom)`.

### 5.2 Content width

Every page's content is centered at `max-inline-size: var(--content-max)` (42rem ≈ 672 px). That covers lists, the logger, settings and the chart. Dialogs are `min(100% - 2 * var(--gutter), 28rem)`, and the exercise picker on wide screens is `36rem`.

### 5.3 Safe areas

- `viewport-fit=cover`. `--safe-top/right/bottom/left: env(safe-area-inset-*, 0px)` are defined on `:root` in `src/app.css`, next to `--shell-bottom` (§5.1), which uses them.
- The PageHeader adds `--safe-top` to its top padding. The shell adds `--safe-left/right` to the gutters (landscape notch). The bottom-most fixed or sticky element (tab bar, rest-timer bar, sticky action area, bottom sheet) adds `--safe-bottom`. Nothing else uses the insets.

### 5.4 Sticky areas

- **PageHeader:** `position: sticky; top: 0; z-index: var(--z-sticky)`.
- **Sticky bottom action area** (Import confirm, History edit save, picker "Add N"): last child of `main`, `position: sticky; bottom: var(--shell-bottom)`, `--color-bg` with a top `--color-border` line, padding `--space-3` `--gutter`. Holds one primary Button (block on phones) and at most one secondary.
- `html { scroll-padding-block: calc(var(--header-h) + var(--safe-top)) calc(var(--shell-bottom) + var(--sticky-bottom-h, 0px) + var(--space-4)); }`. A page with a sticky action area or rest-timer bar sets `--sticky-bottom-h` to its height. This way, focusing or scrolling to an element never leaves it under a sticky bar.

### 5.5 Virtual keyboard

- **Chromium (Android):** `interactive-widget=resizes-content` shrinks the layout viewport, so sticky footers ride above the keyboard. The browser scrolls the focused field into view, and `scroll-padding` (§5.4) keeps it clear of the bars.
- **Hide the tab bar while typing** on touch devices, and drop its height from the offsets in the same rule so no gap is left:

  ```css
  @media (pointer: coarse) {
    :root:has(:is(input:not([type=checkbox], [type=radio]), textarea, select):focus) {
      --shell-bottom: var(--safe-bottom);
      & .tabbar { display: none; }
    }
  }
  ```

  This saves space on Android. On iOS the bar is behind the keyboard anyway.
- **iOS (ignores `interactive-widget`, the keyboard covers the layout viewport):** a single shared helper (`keepAboveKeyboard` in `src/lib/ui/keyboard.ts`, an attachment; SetRow attaches it to the whole row, so the row and not only the field stays visible) listens to `visualViewport` `resize`/`scroll` while a field is focused. If the field's bottom edge is below `visualViewport.offsetTop + visualViewport.height - 8px`, it calls `field.scrollIntoView({ block: 'center' })`. This keeps the active set row visible above the keyboard ([PRD §18](PRD.md)). The helper never scrolls when the field is already visible, so it doesn't fight the user.
- Dismissing the keyboard (blur, "Done") keeps the typed value. Values commit on `change`/blur, never only on Enter.

### 5.6 Reflow and text scale

- Everything works at **320 CSS px** wide with no horizontal scrolling (set row: §7.2), and at **200% text** with no clipped content. Containers grow (`min-block-size`, never a fixed `height`). Rows wrap: a ListRow's trailing area drops below the title when its container is narrower than `20em`.
- No `white-space: nowrap` on sentences. Short labels in compact controls (tab labels, segments, badges) may truncate with an ellipsis only if their full text is also the accessible name.

### 5.7 Where things live

- **Settings** (and backup/restore, storage status, about) is a secondary destination at `/settings`, not a tab. Entry points: a `settings` icon link (label "Settings") in the trailing slot of the PageHeader on phones (the shell's link is `position: fixed` over the header, and the shell sets `--header-end-reserve: var(--tap-min)` so PageHeader keeps that slot free; on wide screens and `/workout` the reserve is 0), and the bottom item of the side rail on wide screens. Settings has a back button.
- **The tab bar and side rail are hidden on the active workout screen (`/workout`)** at every width. The workout header's leading back button ("Home", `chevron-left`) leaves the screen with the session still active. Home then shows the resume banner. Hiding the bar keeps the logger focused and gives the rest-timer bar the bottom edge.
- The update-available Banner sits at the top of `main` under the PageHeader. It is suppressed during an active workout ([ADR 0003](decisions/0003-pwa-shell-and-updates.md)).

---

## 6. Components

All live in `src/lib/components/ui/` and are imported as `#lib/components/ui/<Name>.svelte`. Reuse them before writing markup. Add a variant here before adding it in code. API sketches use Svelte 5 props. `children` and other snippets are noted as `Snippet`. Every interactive component forwards `class`, `id` and `aria-*`/`data-*` rest props to its root element.

**Shared states** (wherever they apply):

| State | Treatment |
|---|---|
| default | as specified per component |
| hover | only inside `@media (hover: hover)`: one surface level up, or the `*-hover` token. Never the only way to reach something. |
| active (pressed) | `--color-surface-3` or the `*-active`/`*-hover` token, `--duration-fast`. No scale transform. |
| focus | `:focus-visible` ring (§3.3). Fields also switch their border to `--color-accent`. |
| disabled | `disabled` attribute for real disabling, `--color-text-disabled` text, background unchanged, `cursor: not-allowed`. Don't use opacity on the whole control. If the user needs to know *why* it's disabled, keep it enabled-looking with `aria-disabled="true"` and explain on press, or put a hint next to it. |
| loading | `aria-busy="true"`, Spinner replaces the leading icon, width unchanged, further presses ignored (`aria-disabled`) |
| error | `--color-danger` edge + `alert-triangle` icon + `--color-danger-text` message, linked with `aria-describedby`. Shown after interaction only (`:user-invalid`, or after submit). |

### 6.1 Button

```ts
{ variant?: 'primary' | 'secondary' | 'ghost' | 'danger' = 'secondary';
  size?: 'sm' | 'md' | 'lg' = 'md'; block?: boolean; icon?: IconName; iconEnd?: IconName;
  loading?: boolean; disabled?: boolean; href?: string /* renders <a> */;
  type?: 'button' | 'submit' = 'button'; onclick?; children: Snippet }
```

| Variant | Fill / text / edge | Hover · Pressed |
|---|---|---|
| primary | `--color-accent` / `--color-on-accent` / none | `--color-accent-hover` · `--color-accent-active` |
| secondary | `--color-surface-2` / `--color-text` / `--color-border-strong` | `--color-surface-3` · `--color-surface-3` |
| ghost | transparent / `--color-accent-text` / none | `--color-surface-2` · `--color-surface-3` |
| danger | `--color-danger` / `--color-on-danger` / none | `--color-danger-hover` · `--color-danger-hover` |

Sizes: `sm` is `min-block-size: 2.25rem`, padding-inline `--space-3`, `--text-sm`, with an invisible `::after` that extends the hit area to `--tap-min`. Use it only inside dense rows. `md` is `--control-h`, `--space-4`, `--text-md`. `lg` is `--control-h-lg`, `--space-5`, `--text-md` semibold. All: `--radius-md`, `--weight-medium`, icon 1.25em with `--space-2` gap, label never wraps mid-word (the button grows taller instead). Labels are verbs (§8.1). One primary per view.

### 6.2 IconButton

```ts
{ icon: IconName; label: string /* required → aria-label */; variant?: 'ghost' | 'secondary' | 'primary' | 'danger' = 'ghost';
  size?: 'sm' | 'md' = 'md'; pressed?: boolean /* → aria-pressed */; disabled?; href?; onclick? }
```
Square, `--tap-min` × `--tap-min` (`sm` draws 36 px and expands its hit area to 44 px), icon 24 px, `--radius-md`. The colors follow Button. With `pressed`, the pressed visual is a filled or alternate icon, not only a color change.

### 6.3 Icon

```ts
{ name: IconName; size?: string = '1em'; label?: string }
```
Inline `<svg viewBox="0 0 24 24">`, `stroke="currentColor"`, `fill="none"`, stroke width 2, round caps and joins. The set is curated in `src/lib/icons.ts` (T1.03; Lucide, ISC, attribution in [attribution.md](attribution.md)). No `label` → `aria-hidden="true"`. With `label` → `role="img"` and `aria-label`. Icons never stand alone as the only label of a control (IconButton supplies the name). Sizes: 16 (inline in `--text-sm`), 20 (in buttons), 24 (tab bar, IconButton), 32 (EmptyState).

### 6.4 TextField

```ts
{ label: string; value: string /* bindable */; type?: 'text' | 'search' | 'url' = 'text'; hint?: string; error?: string;
  required?: boolean; multiline?: boolean /* <textarea> */; mono?: boolean; autocomplete?: string;
  enterkeyhint?: 'done' | 'next' | 'search' | 'go'; placeholder?: string; disabled?; readonly? }
```
Visible `<label>` above. Hint between the label and the field (so autocomplete popups don't cover it), `--text-sm` muted. Field: `--control-h`, `--color-surface-2` fill, `--border-w` `--color-border-strong` edge, `--radius-md`, padding-inline `--space-3`, text `max(1rem,16px)`. Focus: ring + `--color-accent` border. Error: shown when `:user-invalid` or when `error` is set. Danger border, then a message below with an `alert-triangle` icon, wired with `aria-describedby` (hint + error ids) and `aria-invalid`. `multiline`: min 6 rows, grows with `field-sizing: content` where supported, `resize: vertical`. `mono` uses `--font-mono` at `--text-sm` (the textarea stays ≥ 16 px, so `mono` uses `max(1rem,16px)` too). Placeholders are examples, never labels.

### 6.5 NumberField

```ts
{ label: string; labelVisible?: boolean = true /* false → visually hidden, still the accessible name */;
  value: number | null /* bindable; emitted parsed on change */; mode?: 'decimal' | 'integer' = 'decimal';
  placeholder?: string /* e.g. prefill "80" */; suffix?: string /* "kg", "s" */; min?: number = 0; max?: number;
  enterkeyhint?: 'next' | 'done' = 'done'; hint?; error?; disabled?; onchange?: (n: number | null) => void;
  oninvalid?: (message: string) => void /* set rows: revert instead of showing the error */ }
```
- `<input type="text">`. Not `type="number"`: that rejects a decimal comma, adds spinners and changes value on wheel. Use `inputmode="decimal"` or `"numeric"`, `autocomplete="off"`, `spellcheck="false"`, `class="tabular"`, `text-align: end`.
- **Select on focus** (the whole value is selected, so typing replaces it). While focused it keeps the raw typed string. On `change`/blur it parses with `src/lib/numberInput.ts`: `82,5` and `82.5` → 82.5, surrounding spaces ignored. Anything else is rejected.
- **Display** when not focused: `Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false })`, so the user's decimal separator is used.
- **Invalid input:** a standalone field shows the error state ("Enter a number"). Inside a set row there is no room for the message, so the row passes `oninvalid`: the field reverts to its last valid value and the row announces "Set 2 weight not changed – enter a number" through a polite `role="status"` region (§6.13).
- Suffix: `--text-sm` muted, inside the field edge at the end. It is referenced by the field's `aria-describedby`. Set rows omit the suffix and put the unit in the column header instead.
- Size in set rows: `min-block-size: --tap-min`, `--radius-sm`, padding-inline `--space-2`.
- **Prefilled vs typed:** a prefill is the `placeholder` (`--color-text-muted`). A stored value is `--color-text`. Completing a set with only placeholders stores the placeholder values (§7.2).

### 6.6 Select

```ts
{ label: string; value: string /* bindable */; options: { value: string; label: string }[]; hint?; error?; disabled? }
```
Native `<select>` with `appearance: none`, the same box as TextField, and a `chevron-down` Icon in an overlaid `aria-hidden` span at the end (`pointer-events: none`). The picker UI stays native: wheel on iOS, sheet on Android. Use it for lists with more than 4 options (week start, default rest, reminder interval). Use SegmentedControl for 2–4.

### 6.7 Switch

```ts
{ label: string; checked: boolean /* bindable */; description?: string; disabled? }
```
`<input type="checkbox" switch role="switch">` inside a `<label>` row (the whole row is the target, ≥ `--tap-min`). Styled with `appearance: none` in **all** browsers for one look, with no polyfill. Track 44 × 26 px, `--radius-full`. **Off:** `--color-surface-2` fill, `--color-border-strong` edge, `--color-text-muted` thumb at the start. **On:** `--color-accent` fill and edge, `--color-on-accent` thumb at the end. Thumb position (shape) carries the state, not only color. The thumb moves with `--duration-fast` (instant under reduced motion). Focus ring on the track. Forced colors: track `border-color: ButtonText`, on-thumb `Highlight`. The label is on the start side, the switch at the end. `description` goes below the label, `--text-sm` muted, via `aria-describedby`. The change applies immediately, with no Save button.

### 6.8 SegmentedControl

```ts
{ legend: string; legendVisible?: boolean = false; value: string /* bindable */;
  options: { value: string; label: string; icon?: IconName }[] /* 2–4 */ }
```
`<fieldset>` + `<legend>` + native radio inputs (visually hidden, still focusable) with `<label>` segments, so arrow keys and screen readers behave natively. Container: `--color-surface-2`, `--border-w` `--color-border-strong`, `--radius-md`, padding 2 px. Segments are equal width, ≥ `--tap-min` tall, `--text-sm` medium, `--color-text`. **Selected:** `--color-accent-subtle` fill, `--border-w` `--color-accent` edge, `--color-accent-text` text, `--weight-semibold` (fill + edge + weight, not color alone). The focus ring is on the segment of the focused radio. At 320 px with long labels, it is still one row and labels truncate (the full text is the accessible name). Uses: theme, kg/lb, chart metric, chart range.

### 6.9 Dialog

```ts
{ open: boolean /* bindable */; title: string; description?: string; dismissible?: boolean = true;
  children?: Snippet; actions?: Snippet; onopen?: (dialog: HTMLDialogElement) => void;
  onclose?: (returnValue: string) => void }
```
- Native `<dialog>` opened with `showModal()` (focus moves in, the page goes inert, Esc closes, no hand-written focus trap). `aria-labelledby` points to the title (`<h2>`, `--text-lg` semibold) and `aria-describedby` to the description. Focus returns to the opener on close. `onopen` runs right after `showModal()`, for moving initial focus somewhere other than the first focusable element.
- `dismissible`: `closedby="any"` plus the click-outside fallback for browsers without `closedby` (feature-detect `'closedBy' in HTMLDialogElement.prototype`). `false` → `closedby="closerequest"`. Use `false` for forms with unsaved input.
- Box: `--color-surface-1`, border, `--radius-lg`, `--shadow-overlay`, padding `--space-6` (`--space-4` below 24em), width `min(100% - 2 * var(--gutter), 28rem)`, `max-block-size: calc(100dvh - 2 * var(--gutter))`, its own body scrolls. Actions row at the bottom, end-aligned, gap `--space-2`. The primary action is last (rightmost). Below 24em the actions stack full-width, primary last (bottom, nearest the thumb).
- Backdrop: `--color-backdrop`. Scroll lock: `dialog:modal { overscroll-behavior: contain }` and `dialog::backdrop { overflow: hidden; overscroll-behavior: contain }`. Never set `overflow: hidden` on `html`/`body`. WebKit ignores `overscroll-behavior` on boxes that don't overflow (and this can't be feature-detected), so while a modal is open a capture-phase `wheel`/`touchmove` listener cancels any scroll that no scroll container inside the dialog can take (pinch zoom is left alone). The e2e suite checks this in WebKit.
- **Animation:** enter with `@starting-style` (opacity 0, `scale(0.96)`) over `--duration-base` `--ease-enter`. Exit transitions `opacity, transform, display, overlay` with `transition-behavior: allow-discrete`. Where `overlay` or a discrete `display` transition is unsupported (Safari, Firefox), close through the `data-closing` helper: set the attribute, wait for `getAnimations()` to finish (2 s cap), then `close()`. The `cancel` event (Esc, light dismiss) goes through the same helper. Reduced motion: opacity only, `--duration-fast`.

### 6.10 ConfirmDialog

`confirm({ title, body, confirmLabel, cancelLabel = 'Cancel', danger = false, secondaryAction? }) → Promise<boolean>`, with one host mounted in `+layout.svelte`. A `confirm()` made while another is open waits until the first has closed and resolved. The promise resolves once the dialog has closed (focus is back on the opener). `secondaryAction?: { label: string; run: () => void | Promise<void> }` renders a ghost Button at the start of the actions row (on its own line below 24em). It runs **without closing** the dialog (it shows `loading` while a promise is pending), so the user can still confirm or cancel afterwards. It is used only for "Export a backup first" on restore. It is a Dialog with `dismissible` (Esc/backdrop resolve `false`). `confirmLabel` is a specific verb phrase ("Discard workout", "Delete session", "Replace all data"), never "OK" or "Yes". `danger` → confirm uses the `danger` variant and **initial focus goes to Cancel**. Otherwise initial focus is on the confirm button. The body says exactly what is lost or replaced, with counts ("12 completed sets will be deleted.").

### 6.11 Sheet

The same API as Dialog, plus `size?: 'auto' | 'full' = 'auto'`. It renders through Dialog (one implementation of focus, dismissal, scroll lock and animation).
- **< 48em: bottom sheet.** A `<dialog>` with `margin: auto 0 0`, `inline-size: 100%`, `max-inline-size: none`, top corners `--radius-lg`, padding-bottom `--space-4` + `--safe-bottom`, `max-block-size: calc(100dvh - var(--safe-top) - var(--space-6))`. `size="full"` uses that full height. A decorative 36 × 4 px `--color-border-strong` grab bar sits at the top (`aria-hidden`). There is no drag gesture in P0: close with the header `x` IconButton, Esc or the backdrop. Enter: `translateY(100%) → 0`, `--duration-slow` `--ease-enter`. Reduced motion: fade.
- **≥ 48em:** renders exactly as a Dialog (centered; `size="full"` → 36rem wide, up to 80dvh tall).
- **Header row:** title (`--text-lg` semibold) + close IconButton (`x`, "Close"), sticky inside the sheet. Footer actions sticky at the bottom.
- **Action menus are Sheets** holding a list of ListRow buttons (an "action sheet"; destructive rows use `--color-danger-text` plus a `trash` icon). There is no separate Menu component.

### 6.12 Toast (with Undo)

`toast(message: string, { action?: { label: string; run: () => void }, durationMs?: number })`. The default duration is 4000 ms, or 6000 ms with an action.
- One Toaster host in `+layout.svelte`. The region is always in the DOM: `<section aria-live="polite" aria-label="Notifications">`. The region itself is `popover="manual"` and stays open (top layer, not light-dismissed), so the toasts stack in normal flow inside it.
- **While a modal dialog or sheet is open, toasts wait.** Everything outside a modal is inert, so a toast there could be neither used nor announced. New toasts are held (their timers not started) and visible ones pause; they all show when the last modal closes. Example: "Export a backup first" inside the restore confirm shows "Backup exported" after the confirm closes. Without Popover support (among our minimums only Firefox 121–124), the region falls back to `position: fixed` with `z-index: var(--z-toast)`. Feature-detect `'popover' in HTMLElement.prototype` and style with `:is(:popover-open, .open)`.
- Placement: bottom center, `bottom: calc(var(--shell-bottom) + var(--sticky-bottom-h, 0px) + var(--space-3))`, width `min(100% - 2 * var(--gutter), 28rem)`. At most 3 visible, newest at the bottom, gap `--space-2`.
- Box: `--color-surface-3`, `--border-w` `--color-border-strong`, `--radius-md`, `--shadow-overlay`, padding `--space-3` `--space-4`, `--text-sm`. Layout: message, optional action (ghost Button `sm`, `--color-accent-text`), close IconButton (`x`, "Dismiss").
- The timer pauses while the toast is hovered or contains focus. Enter/exit per §3.5. The action runs at most once: using it dismisses the toast, and a timed-out or dismissed toast's action never runs. When the toast being removed holds focus (keyboard Undo/Dismiss), focus moves to the next toast's first button, or back to the element that was focused before focus entered the region, never to `<body>`.
- **Undo semantics:** the destructive change is **already written** to IndexedDB when the toast appears (write-through). Undo restores it, and a timeout simply keeps the change. Nothing waits for the toast to expire before saving.
- Toasts are for outcomes ("Set deleted", "Imported 3 routines"). Never use them for errors that need action (use a Banner), and never as the only place important information appears.

### 6.13 Live announcer

One visually hidden `aria-live="polite"` region (and one `assertive` region, used only for data-loss risks such as a failed save) in `+layout.svelte`, with an `announce(text, { assertive? })` helper. Use it for silent outcomes that have no visible text change (a NumberField revert, "Rest done"). Don't announce loading states.

### 6.14 Banner

```ts
{ variant: 'info' | 'success' | 'warning' | 'danger'; title?: string; children: Snippet;
  action?: { label: string; onclick }; dismissible?: boolean; ondismiss? }
```
In-flow, full content width. `--color-<variant>-subtle` fill, a 4 px inline-start border in `--color-<variant>` (a real border, so it shows in forced colors), `--radius-md`, padding `--space-3`. Leading Icon (info: `info`, success: `check`, warning: `alert-triangle`, danger: `alert-triangle`) in `--color-<variant>`, title in `--color-<variant>-text` semibold, body in `--color-text`. The action is a secondary Button `sm` at the end (it wraps below on narrow widths). Dismiss is an IconButton `x`. Role: `status` for info/success. Use `alert` only for a danger banner that appears as the direct result of a user action. Uses: resume workout, update available, backup reminder, storage not persistent, restore failed, timer limitation note.

### 6.15 PageHeader

```ts
{ title: string; back?: { href: string; label: string }; actions?: Snippet; subtitle?: string }
```
`<header>` that is sticky (§5.4), `--color-bg` fill with a bottom `--color-border` line, `min-block-size: --header-h` + `--safe-top`. It bleeds through `main`'s gutter (`margin-inline: calc(-1 * var(--gutter))`, padding-inline `--gutter`, plus `--header-end-reserve` at the end), so its title lines up with the content and the bottom line runs edge to edge. `main` has no top padding: the header is the first thing on every page and adds `--safe-top` itself. Layout: [back IconButton `chevron-left`, labelled with the destination ("Home", "History")] [title `<h1>` `--text-lg` semibold, wraps to 2 lines then clamps; subtitle `--text-sm` muted under it] [actions: up to 2 IconButtons or 1 Button `sm`]. The shell's Settings link fills the reserved trailing slot on phones (§5.7), so pages don't add their own. There is one `<h1>` per page, and the `<title>` is `"<title> · Workouts"`.

### 6.16 ListRow

```ts
{ title: string; subtitle?: string; href?: string; onclick?; leading?: Snippet; trailing?: Snippet;
  selected?: boolean; danger?: boolean }
```
Renders `<a>` with `href`, `<button>` with `onclick`, otherwise a `<div>`. **No interactive element inside an `<a>`/`<button>` row.** If the row needs its own trailing control (Start, Switch, menu), render a static row with the control as a sibling target. `min-block-size: --tap-min` (one line) or `max(56px, 3.5rem)` (with subtitle), padding `--space-3` `--space-4`, gap `--space-3`. Title `--text-md` medium. Subtitle `--text-sm` muted, may wrap. Link rows show a trailing `chevron-right` (muted). `selected` → `--color-accent-subtle` fill + `check` icon trailing + `aria-selected`/`aria-pressed` as appropriate. Rows are grouped in a **list group**: a `<ul>` with `--color-surface-1` fill, border, `--radius-md`, and dividers of `--color-border` between rows, inset from the leading edge by `--space-4`.

### 6.17 Card

```ts
{ children: Snippet; header?: Snippet; padding?: 'none' | 'md' = 'md'; as?: 'section' | 'article' | 'div' = 'div' }
```
`--color-surface-1`, `--border-w` `--color-border`, `--radius-lg`, padding `--space-4` (`--space-3` below 24em). No shadow. Not clickable as a whole (put a link inside instead). `header` gets a bottom divider when the body is a list.

### 6.18 EmptyState

```ts
{ icon: IconName; title: string; body?: string; action?: Snippet /* one Button */ }
```
Centered column, padding-block `--space-10`, icon 32 px muted, title `--text-md` semibold, body `--text-sm` muted (max 40ch), action below with `--space-4` gap. The copy says what will appear here and how to make it appear (§8.3).

### 6.19 Badge

```ts
{ variant?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info' = 'neutral'; icon?: IconName; children: Snippet }
```
Inline, `--text-xs` semibold, padding `2px var(--space-2)`, `--radius-sm`, `--color-<variant>-subtle` fill and `--color-<variant>-text` text (neutral: `--color-surface-2` / `--color-text-muted`, with a `--color-border` edge). It always has text, and an icon for status badges. Standard badges: **Matched** (success, `check`), **Suggested** (warning, `alert-triangle`), **Unresolved** (danger, `x`), **PR** (accent, `star`), **Warm-up** (neutral, text "W" in the set column with `aria-label="Warm-up set"`), **Persistent** / **Not persistent** (success / warning).

### 6.20 Spinner

```ts
{ label?: string = 'Loading'; size?: string = '1em' }
```
A 1em circle with a 2 px `--color-border-strong` track and a `--color-accent` arc, rotating at 800 ms linear. The label is visually hidden text next to it (`role` none, not a live region). Reduced motion: no rotation, a static `timer` icon instead, and the label becomes visible. Show it only after 300 ms of waiting, so fast local reads never flash a spinner.

---

## 7. Screens

The wireframes are drawn at **320 px** (≈ 34 columns). `[ … ]` = Button, `(◯)`/`(✓)` = complete IconButton, `⋮` = `more-vertical` IconButton, `›` = link chevron, `▢` = input. Every color named is a token from §3. Both themes are covered by the tokens alone: no screen has scheme-specific rules unless noted. Wide screens (≥ 48em) use the side rail and center the same layout at `--content-max`, unless noted.

### 7.1 Home (`/`)

```
┌──────────────────────────────────┐
│ Home                          ⚙  │ PageHeader; ⚙ = IconButton "Settings"
├──────────────────────────────────┤
│┃▶ Workout in progress            │ Banner info (only if a session is active)
│┃  Push A · 23 min     [Resume]   │  body: name · elapsed (tabular)
│                                  │
│ [＋        Start workout       ] │ Button primary lg block
│                                  │  (→ "Resume workout" if active; never
│ Routines                See all ›│   creates a second session)
│ ┌──────────────────────────────┐ │ h2 --text-md semibold + ghost link
│ │ Push A               [Start] │ │ list group; static ListRow +
│ │ 6 exercises · Wed 14 Oct     │ │  secondary Button sm "Start"
│ ├──────────────────────────────┤ │  (max 3 routines)
│ │ Pull A               [Start] │ │
│ └──────────────────────────────┘ │
│ 3 workouts this week             │ --text-sm muted; week per setting
│                                  │
│ Recent                           │ h2
│ ┌──────────────────────────────┐ │ ListRow links → /history/:id
│ │ Push A                     › │ │  subtitle: date · duration · sets
│ │ Wed 14 Oct · 58 mins ·       │ │  (last 3); the subtitle wraps
│ │ 18 sets                      │ │
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│  ⌂     ☰      ⟲      🏋     📈   │ Tab bar (Home current)
│ Home Routines History Exerc. Prog│
└──────────────────────────────────┘
```
- The Start button renders first, with no data dependency ([PRD §21](PRD.md)). The other sections fill in as their queries resolve, with no spinner unless a query takes > 300 ms.
- No routines yet: the Routines section becomes an EmptyState (`list`, "No routines yet", "Import a plan to start from a routine.", secondary Button "Import routine" → Import). No history: the Recent section is omitted.
- The backup-reminder Banner (warning) goes below the Start button. It is never shown while a session is active.

### 7.2 Active workout (`/workout`)

```
┌──────────────────────────────────┐
│ ‹  Push A             [Finish] ⋮ │ PageHeader: back "Home" (session stays
│    42:13 · 7/18 sets             │  active); title = editable name (tap →
├──────────────────────────────────┤  Dialog with TextField); subtitle tabular
│ ┌──────────────────────────────┐ │  elapsed · completed/total; Finish =
│ │ Bench Press                ⋮ │ │  Button primary sm; ⋮ = action Sheet
│ │ Rest 2:00                    │ │  (Discard workout…)
│ │ SET PREVIOUS   KG   REPS     │ │ ExerciseCard = Card padding none
│ │  W  40 × 10   ▢40   ▢10  (◯) │ │  header: name --text-lg semibold +
│ │  1  80 × 8    ▢80   ▢8   (✓) │ │  ⋮ (Rest time, Replace, Notes, Remove)
│ │  2  80 × 8    ▢80   ▢8   (◯) │ │  column header row --text-xs muted
│ │  3  77.5 × 8  ▢     ▢    (◯) │ │  uppercase; unit from settings
│ │ [＋ Add set]                 │ │ ghost Button sm block
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ Barbell Row                ⋮ │ │
│ │ …                            │ │
│ └──────────────────────────────┘ │
│ [＋ Add exercise              ]  │ secondary Button block → picker Sheet
│                                  │
├──────────────────────────────────┤
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░│ Rest-timer bar (§7.3), sticky bottom:
│ ⏱ 1:23        [−15] [+15] ⏸  ⏭  │  progress strip above the controls
└──────────────────────────────────┘ (no tab bar on this screen)
```

**Set-row anatomy** (one CSS grid shared by the header row and the set rows, inside an `@container`):

| Column | Width | Content |
|---|---|---|
| Set label | `--tap-min` | A ghost button showing `1`, `2`, … in `--text-sm` semibold tabular (other set types → Badge "W" warning, "D" info, "F" danger; only normal sets are numbered), label "Set 2 options" ("Warm-up 1", "Drop set 1", "Failure set 1" for the others). It opens the row's action Sheet. |
| Previous | `minmax(3.5rem, 1fr)` (`minmax(0, 1fr)` when stacked) | `80 × 8` in `--text-sm` muted tabular (display unit, §8.2); `–` when none. Wraps rather than truncate. |
| Weight | `4rem` | NumberField decimal, `labelVisible=false`, label "Set 2 weight, kg", `enterkeyhint="next"` |
| Reps | `3.25rem` | NumberField integer, label "Set 2 reps", `enterkeyhint="done"` |
| Complete | `--tap-min` | IconButton, `pressed` = completed |

Gap `--space-1`, row `min-block-size: --tap-min`, card padding-inline `--space-1`. Width check at 320 px: 320 − 2 × 12.8 gutter − 2 × 4 padding = 286 px available. Columns need 44 + 56 + 64 + 52 + 44 + 4 × 4 = 276 px (17.25em), so it fits.

**Stacked layout, when the row's container is narrower than `17.5em`** (container query; `em` there is the container's font size, so larger text triggers it). This happens at 320 px from about 110% text, and at 200% text on any phone. The row becomes two lines through a `grid-template-areas` switch:

```
┌ label ┬ previous (wraps) ┬ complete ┐   row 1: --tap-min | minmax(0, 1fr) | --tap-min
├───────┴──────┬───────────┴──────────┤
│ weight (1fr) │ reps (1fr)           │   row 2: two equal fields
└──────────────┴──────────────────────┘
```

Width check at 320 px with 200% text (1em = 32 px): the gutter is 24 px (the `clamp` minimum, 0.75rem) and the padding 8 px, so 256 px is available. Row 1: 88 + 88 + 2 × 8 gaps = 192 px fixed, leaving 64 px for Previous (`80 × 8` wraps to two lines, nothing is clipped). Row 2: (256 − 8) / 2 = 124 px per field. `102.5` at 32 px with 16 px padding needs about 112 px, so it fits. The column header row uses the same areas (`SET · PREVIOUS` over `KG · REPS`), so the unit stays visible without a suffix eating field width.

**States of a set row:**
- *Not completed:* row transparent on `--color-surface-1`. Complete button: secondary IconButton with a `circle` outline icon (the plain ring), label "Complete set 2".
- *Prefilled:* empty fields show the prefill as `--color-text-muted` placeholder. One tap on Complete stores those values and completes the set ([PRD §8.3](PRD.md)). Editing a value never completes it.
- *Completed:* row fill `--color-success-subtle`. The Complete button turns into a filled `--color-success` circle with a `--color-on-success` `check` (shape change; the mark pops with `--duration-fast`). `aria-pressed="true"`, label "Set 2 completed, undo". Values stay editable. Tapping the button again un-completes the set (a toggle, so there is no toast and no confirm; the button itself is the undo). Not color alone: a filled vs outline icon plus `aria-pressed`.
- *Invalid entry:* revert + announce (§6.5).
- *Row menu* (tap the set label): action Sheet with Duplicate, a "Set type" SegmentedControl (Normal / Warm-up / Drop / Failure; choosing one applies it and closes the Sheet, so previous values re-align per PRD §8.4), Delete. The same Sheet is used in history edit mode. Delete → Toast "Set deleted" [Undo].

**Supersets** (PRD P1): consecutive exercises sharing a `supersetGroupId` render as a group: an accent rail on the left edge and an accent Badge "A1", "A2", … before the name (group letters in order of appearance; the Badge carries a visually hidden "Superset" prefix). Rounds are the sets at the same position in each member. Completing a set starts the rest timer only once every member's set of that round is done, using the last member's rest (override or default). Outside a superset nothing changes. The card menu adds "Superset with previous/next" (disabled when there is no neighbour or it is already in the group) and "Remove from superset" (a middle member splits the group). Building supersets in the routine editor is T8.07.

**Exercise card menu** (⋮): Rest time (Dialog with Select), Replace exercise (see below), Notes (Dialog with multiline TextField), Remove exercise (Toast with Undo; no confirm, because it is undoable).

**Replace exercise** (T8.21): a Sheet "Replace {name}" lists suggested substitutes (`suggestSubstitutes`: same movement pattern and primary muscle first, then same primary muscle; up to 8, none already in the workout) as ListRows, plus "Browse all exercises" which opens the exercise picker (single mode). Tapping one swaps the exercise and keeps the prescription, rest, notes and uncompleted sets. With no completed sets the card changes in place. With completed sets a ConfirmDialog ("Replace {name}?", "2 completed sets stay with {name}. The other 1 set moves to {new}.", "Replace exercise") precedes the swap: the completed sets stay on the original card (history shows what was performed) and the rest move to a new card right after it, in the same superset group. In the finish summary, an in-place swap appears as "Replace X with Y" in the save-to-routine offer (T6.10).

**Discard workout** (header ⋮): ConfirmDialog `danger` ("Discard workout?", "All 7 completed sets will be deleted. This can't be undone.", "Discard workout") → Home + Toast "Workout discarded".

**Finish:** Button disabled while saving (`loading`). If some sets are incomplete → ConfirmDialog (not danger). Then the summary Sheet: stats (`--text-2xl` bold tabular: duration, sets, volume) and "Done" → History.

**Keyboard:** weight `next` → reps `done`. The focused row stays above the keyboard (§5.5).

**Wide:** same single column at `--content-max`. No side rail (§5.7).

### 7.3 Rest-timer bar

```
┌──────────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░│ progress: 4 px, track --color-surface-3,
│ ⏱ 1:23        [−15] [+15] ⏸  ⏭  │  fill --color-accent, full width
└──────────────────────────────────┘
 Done:
┌──────────────────────────────────┐
│ ✓ Rest done          [+15] [ ✕ ] │ fill --color-success-subtle,
└──────────────────────────────────┘  text --color-success-text
```
- `position: sticky; bottom: 0`, `--z-sticky`, `--color-surface-1` with a top `--color-border` line, padding `--space-2` `--gutter` + `--safe-bottom`. Shown only while a timer exists. When idle, a ghost Button "Start rest" sits in the same slot.
- Remaining time: `--text-xl` bold tabular, `m:ss`, computed from `endsAt` on every render tick and on `visibilitychange` (never from counting ticks). It has `role="timer"` and is **not** a live region, so it doesn't announce every second.
- Controls: `−15` and `+15` are secondary Buttons `sm` (label "Subtract 15 seconds" / "Add 15 seconds"). Pause/resume is an IconButton `pause`/`play` with `pressed`. Skip is an IconButton `skip-forward` "Skip rest". At 320 px: time 64 + 2 × 52 + 2 × 44 + 4 × 4 gaps = 272 px of 294 px available. The leading `timer` icon is shown only when the bar is wider than 22em.
- Progress bar: a `<div role="progressbar" aria-valuenow aria-valuemax aria-label="Rest">`. The time text carries the same information, so the bar is not the only signal. The fill is a full-width element scaled with `transform: scaleX(remaining / total)` and a 1 s linear transition (§3.5).
- **Done:** the bar switches to the done style with a `check` icon and the text "Rest done" (`--text-md` semibold). `announce("Rest done")`. Optional sound and `navigator.vibrate` where available. A one-time 2-step flash of `--color-success-subtle` (fade only, none under reduced motion). It auto-hides after 10 s or on dismiss.
- **Honest limits:** the first time a timer starts, a Banner info appears above the bar: "Rest alerts only work while the app is open. With the screen locked or the app in the background, you'll see the result when you come back." [Got it]. The same text is in Settings → Workout.

### 7.4 Exercise picker (Sheet, `size="full"`)

```
┌──────────────────────────────────┐
│ ▬                                │ grab bar (decorative)
│ Add exercise                  ✕  │ sticky header
│ ┌──────────────────────────────┐ │
│ │ 🔍 Search exercises          │ │ TextField type=search, label visually
│ └──────────────────────────────┘ │  hidden "Search exercises",
│ ┌──────────────────────────────┐ │  enterkeyhint=search
│ │ ★ Bench Press              ✓ │ │ list group of selectable ListRows
│ │   Chest · Barbell            │ │  (button, aria-pressed); selected →
│ ├──────────────────────────────┤ │  --color-accent-subtle + check
│ │ Incline Dumbbell Press       │ │  subtitle: primary muscle · equipment
│ │   Chest · Dumbbell           │ │  favorites first (★), then A–Z
│ ├──────────────────────────────┤ │
│ │ ＋ Create “bench pres”       │ │ reserved row (T6.03)
│ └──────────────────────────────┘ │
│ [         Add 2 exercises      ] │ sticky footer: primary block,
└──────────────────────────────────┘  disabled until ≥ 1 selected
```
- **Autofocus the search field only on `(pointer: fine)`.** On touch the keyboard would cover the list, so the user taps the field. Results update on every input (< 100 ms, [PRD §21](PRD.md)). The count is announced politely, debounced 500 ms ("12 results").
- Single-select mode: tapping a row picks it and closes the sheet, with no footer.
- No results: EmptyState inside the list (`search`, "No exercise matches “xyz”", with the Create row still shown).
- Wide: a centered dialog 36rem wide.

### 7.5 Import (`/routines/import`)

**Step 1 – input**
```
┌──────────────────────────────────┐
│ ‹  Import routines               │ PageHeader, back "Routines"
├──────────────────────────────────┤
│ Paste a plan in the import format│ --text-sm muted + link "Format
│ or open a .json file. Format ›   │  reference" (import-schema.md)
│ Plan JSON                        │ TextField multiline mono, label
│ ┌──────────────────────────────┐ │  "Plan JSON", 10 rows,
│ │ { "schemaVersion": 1, …      │ │  autocomplete=off, spellcheck=false
│ │                              │ │
│ └──────────────────────────────┘ │
│ [📄 Open file…]                  │ secondary Button (hidden file input,
│┃⚠ Line 3: "sets" must be ≥ 1    │  accept=".json,application/json")
│┃  routines[0].exercises[2]      │ Banner danger with error list (max 5
│                                  │  shown + "and N more"), focus moves
├──────────────────────────────────┤  to the banner heading on failure
│ [           Preview            ] │ sticky action area: primary block,
└──────────────────────────────────┘  disabled while empty
```
**Step 2 – preview** (same route, step state)
```
┌──────────────────────────────────┐
│ ‹  Review import                 │ back → step 1, input kept
├──────────────────────────────────┤
│ Program name                     │ TextField (editable)
│ ▢ Upper/Lower 4-day              │
│ 2 routines · 11 exercises        │ --text-sm muted
│┃⚠ 1 exercise needs a match      │ Banner warning (unresolved count)
│ Upper A                          │ h2 per routine
│ ┌──────────────────────────────┐ │ Card per exercise:
│ │ Bench Press      [✓ Matched] │ │  name + Badge; summary tabular
│ │ 3 × 6–10 @ 80 kg · rest 2:00 │ │  --text-sm muted; notes/warnings
│ ├──────────────────────────────┤ │  below in --text-sm
│ │ "Chest flys"  [⚠ Suggested]  │ │ Suggested: original name in quotes,
│ │ → Cable Fly                  │ │  suggestion, [Accept] [Choose…]
│ │ [Accept]  [Choose…]        ⋮ │ │  (secondary sm); ⋮ → Remove,
│ ├──────────────────────────────┤ │  Create custom
│ │ "Zercher thing" [✕ Unresolved]│ │ Unresolved: [Choose…] primary sm
│ │ [Choose…]                  ⋮ │ │
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ [ Cancel ] [  Import 2 routines ]│ sticky: secondary + primary;
└──────────────────────────────────┘  primary disabled until all resolved
```
- Matching status is always a Badge with icon + text (Matched / Suggested / Unresolved). The disabled Import button has a hint above it ("Resolve 1 exercise to continue") instead of being silently inert.
- Errors block saving. Warnings (Banner warning, list) don't. The page never says a plan is safe or optimal.
- Success → Toast "Imported 2 routines" → Routines. A failed save → Banner danger with the cause, and the data is untouched ([PRD §11.1](PRD.md)).

### 7.6 Routines (`/routines`)

```
┌──────────────────────────────────┐
│ Routines        [＋ New routine] ⋮ ⚙│ PageHeader actions: primary Button sm
├──────────────────────────────────┤  + ⋮ "More routine actions" (action Sheet:
│                                  │  Import, Generate with AI, New program,
│                                  │  New folder) + Settings
│ Upper/Lower 4-day                │ h2 per program (or "Routines" if none)
│ ┌──────────────────────────────┐ │ static ListRow: title, subtitle
│ │ Upper A          [Start]  ⋮  │ │  "6 exercises · last done Mon";
│ │ 6 exercises · last done Mon  │ │  trailing: secondary Button sm Start
│ ├──────────────────────────────┤ │  + ⋮ (Duplicate, Delete)
│ │ Lower A          [Start]  ⋮  │ │
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ tab bar (Routines current)       │
└──────────────────────────────────┘
```
- Empty: EmptyState (`list`, "No routines yet", "Ask an AI assistant for a plan in the import format, then paste it here.", primary Button "Import routines").
- Delete routine → ConfirmDialog `danger` ("Delete Upper A? Past workouts stay in History."). Starting while a session is active goes to the active session (with Toast "A workout is already in progress").

### 7.7 History list (`/history`) and detail (`/history/[id]`)

```
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ History              [＋ Log]  ⚙ │   │ ‹  Push A              [Edit]  ⋮ │
├──────────────────────────────────┤   │    14 Oct 2026, 18:05            │
│ October 2026                     │   ├──────────────────────────────────┤
│ ┌──────────────────────────────┐ │   │ ┌────────┬────────┬────────────┐ │
│ │ Push A                     › │ │   │ │ 58 mins│18 sets │ 7,420 kg   │ │
│ │ Wed 14 Oct · 58 mins ·       │ │   │ │Duration│  Sets  │ Volume     │ │
│ │ 18 sets                      │ │   │ └────────┴────────┴────────────┘ │
│ ├──────────────────────────────┤ │   │ Bench Press                      │
│ │ Pull A                     › │ │   │ ┌──────────────────────────────┐ │
│ │ Mon 12 Oct · 1 hr 4 mins ·   │ │   │ │ SET    KG     REPS           │ │
│ │ 16 sets                      │ │   │ │  W     40     10             │ │
│ └──────────────────────────────┘ │   │ │  1     80     8     [★ PR]   │ │
│ September 2026                   │   │ │  2     80     8              │ │
│ …                                │   │ │  3     80     7              │ │
│ [        Load more          ]    │   │ └──────────────────────────────┘ │
├──────────────────────────────────┤   │ Notes: …                         │
│ tab bar (History current)        │   │                                  │
└──────────────────────────────────┘   └──────────────────────────────────┘
```
- **List:** grouped by month in the session's time zone (`h2`, `--text-sm` semibold muted). ListRow links. Pages of 30 with a secondary "Load more" Button (bounded queries, [PRD §21](PRD.md)). The header action "Log" (secondary sm, `plus`) logs a past workout (Dialog: date + time fields, then the logger). Empty: EmptyState (`history`, "No workouts yet", "Finished workouts show up here.", primary "Start workout").
- **List / Calendar switch:** under the header, a SegmentedControl ("History view", `list` / `calendar`) switches between `/history` and `/history/calendar`.
- **Calendar (`/history/calendar`):** month heading (`h2`, polite live region) between `chevron-left` / `chevron-right` IconButtons, plus a secondary "Today" Button when another month is shown. A 7-column `<table>` follows, weekday headers first, rows from `monthGrid` (the week start is the setting; padding days from neighbouring months are blank). Days with workouts are buttons (`--tap-min` tall, cells are ~41 px wide at 320 px) on `--color-surface-2` with a strong border, the day number, and an accent pill with the **workout count**, so the marker never relies on color alone; the accessible name is "Tuesday 20 October, 2 workouts". Today's number is bold and underlined. The selected day uses the SegmentedControl's selected treatment (fill + edge + weight) and lists its sessions as ListRows below under a `--text-sm` muted heading; with no day selected a muted hint gives the month's workout count. Days come from each session's own `timeZone`; there are no streaks, goals or rest-day marks ([PRD §10.2](PRD.md)). Only the displayed month is queried (a UTC window padded by one day each side, then grouped by local date).
- **Detail:** read-only by default. Stats in a 3-column grid of Cards (`--text-2xl` bold tabular value over a `--text-xs` muted label; it wraps to 1 column below 20em). Per exercise: a read-only `<table>` with the same column rhythm as the set row (tabular, warm-up Badge, PR Badge from T7.05). Incomplete sets are shown muted with the text "not completed".
- **Edit** (explicit action): the same screen with SetRows editable, a sticky action area [Cancel] [Save changes] (primary). **Save changes → ConfirmDialog** ([PRD §5.3](PRD.md)): "Save changes to Wed 14 Oct?", "Volume and PRs will be recalculated.", confirm "Save changes" (not the `danger` variant). Leaving with unsaved edits → ConfirmDialog `danger` ("Discard changes?"). ⋮ → Delete session → ConfirmDialog `danger` naming the date and set count.

### 7.8 Settings (`/settings`)

```
┌──────────────────────────────────┐
│ ‹  Settings                      │ back = previous tab
├──────────────────────────────────┤
│ Units                            │ h2 --text-sm semibold muted
│ ┌──────────────────────────────┐ │ list group of static rows
│ │ Weight unit       [ kg | lb ]│ │  SegmentedControl (legend = row title)
│ └──────────────────────────────┘ │
│ Workout                          │
│ ┌──────────────────────────────┐ │
│ │ Default rest        [2:00 ▾] │ │  Select (0:30 … 5:00, 15 s steps)
│ ├──────────────────────────────┤ │
│ │ Start rest timer          ◉━ │ │  Switch, description:
│ │ after completing a set       │ │   "after completing a set"
│ ├──────────────────────────────┤ │
│ │ Week starts on    [Monday ▾] │ │  Select
│ └──────────────────────────────┘ │
│ Rest alerts only work while the  │  --text-sm muted (timer limits)
│ app is open.                     │
│ Appearance                       │
│ ┌──────────────────────────────┐ │
│ │ Theme                        │ │  SegmentedControl, full row width
│ │ [System (dark)|Light| Dark]  │ │   (stacks under its title)
│ └──────────────────────────────┘ │
│ Data                             │
│ ┌──────────────────────────────┐ │
│ │ Last backup: 3 Oct · 12 KB   │ │  static row; warning Badge if overdue
│ │ [Export backup] [Restore…]   │ │  secondary Buttons
│ ├──────────────────────────────┤ │
│ │ Remind after     [14 days ▾] │ │  Select (7, 14, 21, 30, 60 days)
│ ├──────────────────────────────┤ │
│ │ …or after     [10 workouts ▾]│ │  Select (5, 10, 15, 20, 30 workouts)
│ ├──────────────────────────────┤ │
│ │ Storage      [✓ Persistent]  │ │  Badge + explanation text when
│ └──────────────────────────────┘ │   not persistent (Banner warning)
│ About                            │
│ │ Version 0.3.0 · Attribution ›  │
└──────────────────────────────────┘
```
- Every change applies immediately with no Save button. Units and theme update the whole app at once.
- Backup reminder ([backup-restore.md](backup-restore.md)): a Banner appears when the last backup is older than N days **or** more than N workouts ago, whichever comes first. Defaults are 14 days and 10 workouts, and both are configurable. There is no "off" option because the PRD doesn't define one.
- Restore → file pick → validate → ConfirmDialog `danger` ("Replace all data?", lists the counts in the file vs on this device and the latest session date, `secondaryAction` "Export a backup first" ([backup-restore.md](backup-restore.md)), confirm "Replace all data"). A validation failure → Banner danger, nothing changed. Export success → Toast "Backup saved · 12 KB" ([PRD §13](PRD.md)).
- Plate calculator (T8.11): a Settings card edits the bar weight and, for the current weight unit, how many plates of each size are available per side (0 = not owned), with "Add plate" and "Reset to defaults". In the logger, barbell exercises get "Plate calculator" in the set menu: a Sheet with the target weight (starts from the set's weight, else its prefill), the bar weight, a drawn plate stack for one side (plate height scales with weight; the summary is in the accessible name) and the closest achievable load when the inventory can't make it exactly. All values are shown in the display unit; stored in kg.
- At 320 px: rows whose control can't fit next to the title (Theme, the backup buttons) stack the control below the title (ListRow container rule, §5.6).

### 7.9 Progress (`/progress`)

```
┌──────────────────────────────────┐
│ Progress                       ⚙ │
├──────────────────────────────────┤
│ Exercise                         │ button-like secondary row opening the
│ [ Bench Press                 ▾ ]│  picker Sheet (single-select)
│ [ e1RM | Max weight | Volume ]   │ SegmentedControl (metric)
│ [ 3M | 6M | 1Y | All ]           │ SegmentedControl (range)
│ ┌──────────────────────────────┐ │ Card:
│ │ 112.5 kg  est. 1RM           │ │  latest value --text-3xl bold tabular
│ │ ╭─────────────────────╮ 115  │ │  + --text-sm muted label
│ │ │        ·──·   ·──●  │      │ │  LineChart (T7.03): line+points
│ │ │  ·──·─´    `─´      │ 100  │ │  --color-accent, grid --color-border,
│ │ ╰─────────────────────╯      │ │  labels --text-xs muted tabular;
│ │  Jul   Aug   Sep   Oct       │ │  points focusable (value + date)
│ └──────────────────────────────┘ │
│ Personal records                 │ h2
│ ┌──────────────────────────────┐ │ list group (static rows):
│ │ ★ Max weight      100 kg     │ │  title + trailing value tabular,
│ │   14 Oct 2026                │ │  subtitle date
│ │ ★ Best e1RM       112.5 kg   │ │
│ │ ★ 5-rep max       92.5 kg    │ │
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ tab bar (Progress current)       │
└──────────────────────────────────┘
```
- "e1RM" is labelled "Estimated 1RM" the first time it appears on the page and in the chart's accessible summary (it's an estimate, [PRD §10.1](PRD.md)).
- The chart has `role="img"` with an `aria-label` summary ("Estimated 1RM for Bench Press rose from 100 to 112.5 kg between July and October") plus a visually hidden data table. The SegmentedControls stay full width at 320 px. Chart height `clamp(10rem, 40vw, 16rem)`.
- Empty (no completed sets for the exercise): EmptyState (`chart`, "No data yet", "Complete sets of this exercise to see progress."). One data point: a single labelled point, no line.

---

## 8. Content rules

### 8.1 Tone and wording

- Plain, short, calm. Address the user as "you". Never blame ("Invalid input!" → "Enter a number").
- **Sentence case** everywhere (titles, buttons, labels). No exclamation marks, no emoji in UI copy, no praise or gamification ("Great job!", streak warnings, guilt about rest days).
- Buttons start with a verb and name the object when it isn't obvious: "Start workout", "Add set", "Import 2 routines", "Discard workout". Avoid "OK", "Yes", "Submit".
- Destructive copy names what is affected, with counts: "Delete session from Wed 14 Oct? 18 sets will be deleted."
- Errors say what happened and what to do: "Couldn't read the file. Check that it's a .json backup and try again." Technical details go in a collapsed `<details>` ("Details").
- Use consistent terms: **workout** (in the UI) = session (in code), **routine**, **program**, **set**, **rep**, **rest**, **backup**. Use "Exercise", not "movement" or "lift".

### 8.2 Numbers, units, dates

All formatting goes through `Intl` with the user's locale (`navigator.language`), via shared helpers in `src/lib` (`units.ts`, `time.ts`). Components never format by hand. The examples are real `Intl` output for **en-GB / en-US** (14 Oct 2026 is a Wednesday). The wireframes in §7 use en-GB. Other locales differ, and that is intended.

| Value | Rule | Example (en-GB / en-US) |
|---|---|---|
| Weight | `Intl.NumberFormat(locale, { maximumFractionDigits: 2 })` of the display-unit value; no grouping in inputs; unit after a no-break space | `82.5 kg` / `185 lb`; `82,5 kg` in de |
| Set | weight × reps with U+00D7 and thin no-break spaces; bodyweight shows reps only, or `+10 kg × 8` | `80 × 8` |
| Volume | grouped integer in display unit | `7,420 kg` |
| Reps, sets, counts | integers; plural via `Intl.PluralRules` | `1 set`, `18 sets` |
| Rest / timer | `m:ss`; `h:mm:ss` from 1 h; tabular | `1:30`, `1:02:13` |
| Duration (summary) | hours and minutes joined with a space, each from `Intl.NumberFormat(locale, { style: 'unit', unit: 'hour' \| 'minute', unitDisplay: 'short' })`; no `Intl.DurationFormat` | `1 hr 58 mins` / `1 hr 58 min`; `58 mins` / `58 min` |
| Date (list) | `Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: session.timeZone })`; add `year` when not the current year | `Wed 14 Oct` / `Wed, Oct 14` |
| Date + time (detail) | `dateStyle: 'medium', timeStyle: 'short'`, session `timeZone`; locale picks the 12/24 h clock | `14 Oct 2026, 18:05` / `Oct 14, 2026, 6:05 PM` |
| Relative (Home) | "Today" / "Yesterday" via `Intl.RelativeTimeFormat(locale, { numeric: 'auto' })` computed on the session's local day; older → the list date | `today`, `yesterday` (capitalize the first letter for display) |
| Month group | `{ month: 'long', year: 'numeric' }`, session `timeZone` | `October 2026` (both) |

- **Session dates always use the session's stored `timeZone`**, not the device's current zone ([PRD §5.4](PRD.md)). Travel must not move a workout to another day.
- Display rounds to at most 2 decimals with trailing zeros trimmed. Stored values are never rounded ([PRD §10.3](PRD.md)).
- Missing values show `–` (en dash), not `0`, `NaN` or blank.

### 8.3 Empty, error and offline states

- **Empty:** EmptyState with what will appear and the one action that makes it appear. No illustrations.
- **Loading:** content renders as soon as local data arrives. A Spinner appears only after 300 ms. Keep layout space stable (reserve list heights where known).
- **Errors:** inline at the field (`:user-invalid` + message), or a Banner danger at the top of the affected section with a recovery action ("Try again"). Never a toast for an error that needs action. Never lose what the user typed or did: inputs keep their value after a failed action.
- **Data-loss risk** (a save to IndexedDB failed): Banner danger with `role="alert"` at the top of the page: "Your last change couldn't be saved. Export a backup now." [Export backup]. Plus the assertive announcement.
- **Offline:** the app works fully offline, so there is **no global offline banner**. Only an action that truly needs the network (none in P0; later URL import) shows an inline note with the `wifi-off` icon: "Needs an internet connection."
- **Unsupported capability:** say what is missing and what happens instead, at the place where it matters: "Sharing files isn't available here, so the backup will download instead." / "This browser didn't grant persistent storage. Keep regular backups."

### 8.4 Destructive actions: confirm or undo

| Use **Undo** (Toast, change applied immediately) | Use **Confirm** (ConfirmDialog) |
|---|---|
| Delete a set, remove an exercise from the active workout, remove an exercise in import preview | `danger`: discard the active workout, delete a completed session, delete a routine, discard unsaved edits, restore a backup (replaces everything), merge exercises. Not `danger`: save edits to a past session |
| Small, local, cheap to restore | Large, affects history, or replaces data |

Completing and un-completing a set is a toggle: the same button undoes it, so it gets neither a toast nor a confirm. Never both for the same action. Never confirm something that is trivially undoable. A Confirm button repeats the action ("Delete session"), and Cancel is always available and focused first for `danger`.

---

## 9. Review checklist

Self-review done for T1.01 (2026-10-20). Recheck these items when this document changes, and in each UI PR.

- [x] **Every Scope bullet of T1.01 is covered with concrete values:** browser policy + minimum iOS version (§1), visual direction with do/don't (§2), color/type/spacing/radius/border/elevation/motion/z/touch tokens (§3), theme mechanism (§4), layout incl. safe areas, sticky areas, viewport key, keyboard rule, Settings location, tab bar on the workout screen (§5), all 19 components from the issue with API sketch and states, plus the live announcer (§6), the 9 required screens (§7), content rules (§8). No "TBD".
- [x] **Contrast:** every color pair the components use is listed with ratios in both schemes. Text ≥ 4.5:1 and UI ≥ 3:1 in all rows. The only exception is disabled text, which WCAG exempts (§3.1).
- [x] **Screens use only defined tokens and components.** Menus are action Sheets, the exercise card is a Card, the rest-timer bar is built from Buttons/IconButtons plus a progressbar `div`, the chart is the T7.03 LineChart. Nothing references a raw color or an undefined component.
- [x] **320 px:** each screen is drawn at 320 px. The set-row width is computed at default text (one line) and at 200% text (stacked layout, §7.2). Rows stack their trailing controls under 20em (§5.6).
- [x] **Both themes:** all colors are `light-dark()` pairs. No screen needs scheme-specific rules. Theme-color and the status bar are specified for both (§4).
- [x] **Touch targets** ≥ 44 × 44 px (`--tap-min`), including `sm` controls through an expanded hit area.
- [x] **Not color alone:** completed set (filled check + `aria-pressed`), current tab (bar + weight), selected segment (accent fill + edge + weight), switch (thumb position), badges and banners (icon + text), errors (icon + message).
- [x] **Reduced motion, forced colors and more contrast** handled at the token and component level (§3.1, §3.5).
- [x] **iOS constraints:** inputs ≥ 16 px, `visualViewport` keyboard rule, no `closedby`/Popover/`switch` dependence, no vibration-only cues, safe areas, status-bar style.
- [x] **Data safety in UI patterns:** undo writes immediately, confirm names what's lost, the active workout hides the nav and never reloads for updates.
- [ ] **Still to verify on real devices** (pwa-install checklist, not blocking): the `default` status-bar style follows `theme-color` in both schemes on installed iOS; the iOS keyboard rule keeps the active set row visible.
