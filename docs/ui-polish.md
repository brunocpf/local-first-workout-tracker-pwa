# UI polish: research and review (T8.34)

What other workout apps do, what we take from them, and the polish gaps found in our own app. Decisions here
are reflected in [design.md](design.md) (the source of truth for how the app looks). Research date: 2026-10-21.

**Method.** I read the vendors' feature and help pages and independent reviews, and looked at the public
screenshots on the vendors' sites and App Store listings. Nothing was copied: no assets, layouts, text or media
are bundled, and the takeaways below are our own wording of general patterns. Vendor pages are marketing, so they
show what the apps want to be good at, not measured usability.

## 1. Sources

| App | Sources |
|---|---|
| Hevy | [Track workouts](https://www.hevyapp.com/features/track-workouts/) (logger screenshot), [Rest timer](https://www.hevyapp.com/features/workout-rest-timer/), [Live PR](https://www.hevyapp.com/features/live-pr/) (PR screenshots), [Workout settings](https://www.hevyapp.com/features/workout-settings/), [Live activity](https://www.hevyapp.com/features/live-activity/), help center: [Live PR notifications](https://help.hevyapp.com/hc/en-us/articles/36012016405655-Hevy-Live-PR-Notifications-Get-Instant-Updates-on-Your-Best-Lifts), [Set records vs personal records](https://help.hevyapp.com/hc/en-us/articles/38279531346455-Set-Records-vs-Personal-Records); review: [WhistleOut](https://www.whistleout.com/CellPhones/Apps/hevy-app-review) |
| Strong | [App Store listing](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577) (screenshots), [AppleVis](https://applevis.com/apps/ios/health-fitness/strong-workout-tracker-gym-log) (accessibility notes) |
| Fitbod | [App Store listing](https://apps.apple.com/us/app/fitbod-gym-fitness-planner/id1041517543) (screenshots), [TechRadar review](https://www.techradar.com/health-fitness/fitbod-app-review) |
| Liftoff | [Liftoff – Ranked Gym Workouts](https://apps.apple.com/us/app/liftoff-ranked-gym-workouts/id6448081563) (screenshots), [Liftoff – Workout Log](https://apps.apple.com/app/id1085414909) (a different, minimal app with the same name), [screensdesign showcase](https://screensdesign.com/showcase/liftoff-ranked-gym-workouts) (design review) |
| JEFIT | [App Store listing](https://apps.apple.com/us/app/workout-tracker-gym-log-exercise-trainer-by-jefit/id449810000) (screenshots), [watch guide](https://www.jefit.com/blog/watch-guideworkout-on-the-go-with-jefit-watch-app) |
| Platform guidance | [Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion), [App Store reduced-motion criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria), [Material motion: duration and easing](https://m1.material.io/motion/duration-easing.html) |

## 2. Patterns seen

- **Set logging density.** Hevy and Strong both use one dense grid per exercise: set number, a muted "previous"
  column, weight, reps, a check at the end. Completed rows are tinted green across the whole row, and the check
  fills in. Inputs are borderless numbers in Hevy, light pills in Strong. From the screenshots, rows look about
  36–40 pt tall, smaller than our 44 px minimum.
- **Workout header.** One compact row: elapsed time, a timer shortcut and Finish at the top end. Hevy draws a thin
  progress line under it.
- **Rest timer.** It starts when a set is completed. It's docked at the bottom with a progress strip along its top
  edge and a large countdown with −15 / +15 / Skip (Hevy), and it shows on the lock screen through Live
  Activities and watch apps (native only).
- **PR feedback.** Hevy shows an optional (off by default) "live PR" pill at the top when a checked set is a
  record, and puts a medal in that set's number column. Records also appear in the saved workout. Liftoff turns
  records into ranks, leagues, XP and medals.
- **History and progress.** JEFIT and Fitbod lead with a big headline number with its change ("225 lb, down 56 lb
  vs last week"), range chips (14D/1M/3M/…), a line chart with a goal line and the selected point called out, and
  min/max under the chart. Fitbod shows a muscle recovery map with large stat numbers.
- **Empty states and onboarding.** Fitbod and Liftoff have long, illustrated onboarding. A review of Liftoff
  calls its onboarding very long and its theme switch abrupt.
- **Feedback.** Hevy offers a check sound on set completion and timer sounds. Haptics are native-only.

## 3. Adopted (and where)

| Takeaway | Done in this task |
|---|---|
| A compact, one-row workout header with Finish at the end, like Hevy and Strong. Ours wrapped to two rows because the header was indented by two gutters. | Header bleeds through main's gutter and the Settings link has a reserved slot (§5 of [design.md](design.md)), so every header is one row at 375 px and titles line up with the content. |
| Fast, quiet tap feedback; nothing "sticks". | Press colors fade over `--duration-fast`. Hover only applies where `(hover: hover)`, because on touch `:hover` sticks after a tap. |
| Spatial navigation: drill-down slides in, back slides out, and tabs don't slide. | View transitions on page navigation (§3.5): tabs cross-fade (120 ms), nested pages slide a short distance (200 ms), the tab bar stays still and its current-tab bar glides. Feature-detected; off under reduced motion. |
| A record is marked on the set row at the moment it happens, plus a list in the finish summary. We already had both; Hevy's medal-in-row is the same idea. | The PR badge pops in once (scale + fade, 200 ms). |
| A rest timer whose progress reads at a glance. | The progress strip glides between seconds (compositor `transform`, no layout) instead of jumping. |
| Big numbers with small labels for stats. | History detail stats no longer break inside a number ("43,19 / 7.5 kg"); the grid drops to fewer columns instead. |
| One primary action per screen. | Routines header: "New routine" plus a More sheet (Import, Generate with AI, New program, New folder) instead of five wrapping buttons. |

## 4. Rejected (with reasons)

- **Gamification** (Liftoff's ranks, leagues, XP, streaks, medals; Hevy's medal achievements): against the visual
  direction (design.md §2: no streak guilt, no praise, no confetti). A record is information, so it gets a badge
  and a summary line.
- **A live PR pop-up/toast** (Hevy's top pill): the row badge already marks it where the user is looking, and
  design.md §6.12 keeps toasts for outcomes of the user's own action. A toast per record during a heavy session
  would stack up over the rest timer.
- **Borderless set inputs** (Hevy): our inputs need a ≥ 3:1 edge (WCAG 1.4.11), and a visible box tells a tired
  user where to tap.
- **Rows under 44 px** (Strong): our minimum tap target stays at `--tap-min`.
- **Illustrated onboarding and empty states**: design.md §8.3 says to leave empty space empty. EmptyState stays
  icon, one line and one action.
- **Skeleton screens**: reads are local and usually finish before a skeleton could be drawn. A skeleton would
  flash for no reason. We keep "spinner only after 300 ms" (§8.3).
- **View transitions for set completion, sheets and dialogs**: while a transition runs the page doesn't receive
  taps, and logging sets back to back must never wait. Set completion keeps its CSS check-mark pop, and
  dialogs/sheets keep their `@starting-style` entry. Neither blocks input.
- **Haptics on every set**: the rest-timer haptics already exist (feature-detected, behind a setting, T8.25).
  A buzz on every tap is noise, and iOS has no `navigator.vibrate`, so it could never be the signal anyway.
- **Lock-screen timer / Live Activities / watch apps**: native-only. Our honest-limits note and the optional push
  relay ([ADR 0014](decisions/0014-rest-timer-push.md)) cover what a PWA can do.
- **Headline value with change vs the previous period** (JEFIT, Fitbod): worth having on Progress, but it is a
  feature (a new computation in `src/lib/progress`), not polish. Candidate follow-up.

## 5. Review of our app (375 × 812, light and dark, WebKit)

Reviewed in Playwright's iPhone 15 profile (WebKit) with an empty database and with the ~300-session perf
fixture, every tab plus history detail, exercise detail, the active workout, the finish confirm and the summary.

| Gap | Status |
|---|---|
| The Settings link lost a specificity fight (`.tabbar a` beat `.settings`) and sat in the tab bar as an unlabelled sixth item, while `main` kept ~52 px of empty space above every header for it | Fixed |
| PageHeader added the gutter inside main's gutter: titles were indented 16 px from the content, and the workout header wrapped to two rows | Fixed |
| `:hover` sticky after taps on touch (Button, IconButton, ListRow, calendar day) | Fixed |
| No press fade; colors snapped | Fixed |
| History detail stats split numbers across lines | Fixed |
| Progress → Personal records: every row after the first was indented (an old copy of the list-group CSS) | Fixed |
| "Resume workout" used a plus icon | Fixed (play) |
| Routines header: 5 buttons in 3 rows, two primary buttons when empty | Fixed |
| Exercise card header is tall (about 70 px for one line of name) | Open: changes the logger's rhythm; worth a dedicated logger-density pass with real-device checks |
| Delete in the history detail header is a filled danger IconButton next to Edit (design.md §7.7 puts Delete in a ⋮ sheet) | Open: small follow-up |
| Home with no routines and no history is a lone button (design.md §7.1 asks for a Routines EmptyState) | Open: small follow-up |

## 6. Not verified

- Real devices: View Transitions in installed iOS 18+ (standalone mode) and Android Chrome, the reserved header
  slot with a real notch and safe areas, and the rest-timer glide while the screen dims. Playwright WebKit stands in
  for Safari, not for an installed PWA.
- iOS/iPadOS 17.5 (no View Transitions) is covered only by the e2e test that removes the API.
