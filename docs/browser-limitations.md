# Known browser limitations

Design for the weakest platform (iOS), enhance where available. Entries marked _verify_ must be confirmed on a real device; add findings from device testing below. Install steps: [pwa-install.md](pwa-install.md).

| Area | iOS / iPadOS Safari (installed) | Android Chrome (installed) | Desktop Chromium | Desktop Safari | Desktop Firefox |
|---|---|---|---|---|---|
| Install | Share → Add to Home Screen; no prompt | Install prompt / menu | Address-bar install | Add to Dock | **Not installable** (tab only) |
| Background execution / timer alerts | Suspended soon after leaving the app; **no guaranteed alert** | Throttled/suspended; no guaranteed alert | Background tabs throttled | Throttled | Throttled |
| Notifications | Web push only for installed apps; **not a substitute for local timer alarms**; no scheduled local notifications | Notifications possible via service worker; no scheduled triggers | Same as Android | Limited | Limited |
| Vibration / haptics | **`navigator.vibrate` unsupported** | Supported | Mostly n/a | n/a | n/a |
| Screen wake lock | Supported on recent iOS; _verify_ in installed mode | Supported | Supported | Supported (recent) | Supported (recent) |
| Storage eviction | Tab data can be evicted (inactivity cap); installed app is more durable but **separate from the Safari tab**; _verify_ `persist()` | Usually durable once installed; `persist()` is heuristic | `persist()` heuristic | Limited | `persist()` prompts the user |
| File save / share | Web Share API with files → Files/iCloud/Drive | Web Share API with files | Download via anchor | Download | Download |

Rules that follow:

- The rest timer is timestamp-based (`endsAt`) and recomputed on return; alerts are foreground-only. Do not claim locked-screen alarms until verified on device.
- Haptics are optional; always provide a visual/audio cue.
- Request `navigator.storage.persist()`, show the result, and keep JSON backups (reminders in-app). Storage is bound to the origin: keep one stable origin (all project sites on `brunocpf.github.io` share it, so use app-specific DB and cache names).
- Feature-detect `navigator.canShare({files})` and fall back to a download. Don't depend on the File System Access API.
- Don't rely on `beforeinstallprompt` (Chromium only).
- Updates never reload during an active workout.

## Findings from real-device testing

_None yet._ Record date, device, OS/browser version, and observation.
