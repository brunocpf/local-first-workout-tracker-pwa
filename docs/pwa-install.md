# Installing the PWA

The app is a static site: deployed to GitHub Pages (or any static **HTTPS** host) on a **stable origin** (data is bound to the origin; moving host or domain means exporting a backup first and restoring afterwards). Load it once online so the service worker caches the shell, then verify offline.

## iOS / iPadOS (Safari)

1. Open the URL in **Safari** (other iOS browsers can add to Home Screen too, but test with Safari).
2. Share → **Add to Home Screen** → Add.
3. Launch from the Home Screen icon (standalone).

> **Always use the installed app on iOS.** It has storage separate from the Safari tab: data logged in the tab won't appear in the installed app. Install first, then enter data only there. Move data between them with backup/restore.

## Android (Chrome)

1. Open the URL in Chrome.
2. Menu → **Install app** (or accept the install prompt).
3. Launch from the launcher/home screen.

## Desktop

- **Chrome / Edge:** install icon in the address bar, or menu → Install.
- **macOS Safari 17+:** File → **Add to Dock**.
- **Firefox desktop:** cannot install; use it as a normal tab (works offline after first load, storage not guaranteed persistent).

## Verify offline

1. Open the installed app online, wait for it to finish loading.
2. Enable airplane mode (or DevTools → Offline on desktop).
3. Force-quit and relaunch the app: it must open, resume an active workout, and allow logging.

## Device checklist (iOS **and** Android; run each on a real device)

- [ ] Install; launch standalone with correct icon, name and safe-area layout.
- [ ] Load online once, go offline, force-quit, relaunch: app opens in < 2 s.
- [ ] Start a workout, log sets with the virtual keyboard (active set stays visible, no zoom/scroll jank).
- [ ] Force-quit mid-workout, relaunch: session and completed sets restored; rest timer correct.
- [ ] Lock/unlock the device, switch apps: timer shows correct time; note whether any alert fired in background.
- [ ] Vibration/haptics: works (Android) / absent (iOS) with a visual fallback.
- [ ] Screen wake lock behavior during a workout.
- [ ] Persistent storage status shown; storage still intact after a few days.
- [ ] Export a backup via Share (Files/iCloud/Drive); restore it after clearing data.
- [ ] Publish an update: banner appears; no reload during an active workout.
- [ ] Record findings in [browser-limitations.md](browser-limitations.md).

Requirements: PRD §22–23.
