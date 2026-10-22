# Known browser limitations

Design for the weakest platform (iOS), enhance where available. Entries marked _verify_ must be confirmed on a real device; add findings from device testing below. Install steps: [pwa-install.md](pwa-install.md).

| Area | iOS / iPadOS Safari (installed) | Android Chrome (installed) | Desktop Chromium | Desktop Safari | Desktop Firefox |
|---|---|---|---|---|---|
| Install | Share → Add to Home Screen; no prompt | Install prompt / menu | Address-bar install | Add to Dock | **Not installable** (tab only) |
| Background execution / timer alerts | Suspended soon after leaving the app; **no guaranteed alert** | Throttled/suspended; no guaranteed alert | Background tabs throttled | Throttled | Throttled |
| Notifications | Web push only for installed apps (iOS 16.4+, permission from a tap); no scheduled local notifications, so rest-timer notifications need the optional push relay | Notifications via service worker; no scheduled triggers (push relay for rest timers) | Same as Android | Limited | Limited |
| Vibration / haptics | **`navigator.vibrate` unsupported** | Supported | Mostly n/a | n/a | n/a |
| Screen wake lock | Supported on recent iOS; _verify_ in installed mode | Supported | Supported | Supported (recent) | Supported (recent) |
| Storage eviction | Tab data can be evicted (inactivity cap); installed app is more durable but **separate from the Safari tab**; _verify_ `persist()` | Usually durable once installed; `persist()` is heuristic | `persist()` heuristic | Limited | `persist()` prompts the user |
| File save / share | Web Share API with files → Files/iCloud/Drive | Web Share API with files | Download via anchor | Download | Download |

Rules that follow:

- The rest timer is timestamp-based (`endsAt`) and recomputed on return; alerts are foreground-only. Do not claim locked-screen alarms until verified on device.
- Rest-timer alerts (`src/lib/alerts.ts`, `RestTimerBar`) fire only if the timer reaches zero while the page is visible: a short beep (Web Audio, unlocked by the tap that starts the timer; `timerSound` setting, default on), `navigator.vibrate` where it exists (not iOS; `timerVibration` setting, default on, hidden where unsupported), an optional 10-second warning tick (`timerCountdownCue`, default off), a "Test alert" button in Settings and the visual "Rest done" bar. A timer that ended while the app was backgrounded, locked or reloaded just shows "Rest done" on return, with no late alert. The UI says so (first-run note above the bar).
- **Optional background rest-timer notifications** ([ADR 0014](decisions/0014-rest-timer-push.md), `src/lib/push.ts`, `relay/`): a small relay sends an empty Web Push at `endsAt`, and the service worker shows "Rest over". Needs a deployed relay and the build variables `VITE_PUSH_RELAY_URL` / `VITE_PUSH_VAPID_PUBLIC_KEY`; off by default and hidden when unset. What works where: iOS/iPadOS 16.4+ only when installed to the Home Screen (the app says so in Settings and next to the timer); Android Chrome and desktop Chromium/Firefox in the browser or installed; desktop Safari and others _verify_. Foreground behaviour is unchanged: the push is cancelled shortly before the end while the page is visible. If the relay is unreachable nothing breaks. _Verify_ on real devices with the screen locked (#196).
  - Known gap, last 3 seconds: while the page is visible the app cancels the push 3 s before the end and plays its own alert. If the screen is locked inside that window, the app re-schedules on `visibilitychange`, but iOS may suspend the page before that request is sent, so there may be no notification (the alert shows on return).
  - Known gap, rate limit: the relay allows about 20 requests per minute per IP. Very rapid ±15 s / pause taps are coalesced (only the latest request is sent once the previous one finishes), but if the relay still answers 429, the previous schedule stays in place and the notification can come at the old time. The next timer change fixes it.
  - Not handled yet: `pushsubscriptionchange` (ADR 0014 follow-up); turn notifications off and on in Settings if they stop arriving.
- Privacy: the relay sees the device's push endpoint, IP and the time of a rest timer; never workout data. The subscription stays in `localStorage` and is not in backups.
- Haptics are optional; always provide a visual/audio cue.
- Screen wake lock (`src/lib/wakeLock.ts`) is held for the whole active workout: acquired when a session starts or is loaded, released on finish/discard. The browser drops it when the page is hidden, so it is re-requested on return. Missing API or a refused request is ignored, never an error.
- Request `navigator.storage.persist()`, show the result, and keep JSON backups (reminders in-app). Storage is bound to the origin: keep one stable origin (all project sites on `brunocpf.github.io` share it, so use app-specific DB and cache names).
- Feature-detect `navigator.canShare({files})` and fall back to a download. Don't depend on the File System Access API.
- Don't rely on `beforeinstallprompt` (Chromium only).
- Updates never reload during an active workout.

## Findings from real-device testing

Open `/diagnostics` (link on Home) on the device, then use **Copy report** and paste the output here. It shows standalone mode, service-worker control, share/wake-lock/vibrate/notification support, persistence status, storage estimate and a launch counter (separate `workout-tracker-probe` IndexedDB).

_None yet._ Record date, device, OS/browser version, and observation.
