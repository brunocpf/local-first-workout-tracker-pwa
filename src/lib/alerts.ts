// Foreground-only rest-done cues. Nothing here can fire while the page is suspended (iOS has no background
// timers and no `navigator.vibrate`; docs/browser-limitations.md), so every API is feature-detected and optional.

type AudioContextCtor = typeof AudioContext;

let audio: AudioContext | undefined;

function audioContext(): AudioContext | undefined {
  if (audio) return audio;
  const Ctor: AudioContextCtor | undefined =
    typeof globalThis === "undefined"
      ? undefined
      : (globalThis.AudioContext ??
        (globalThis as { webkitAudioContext?: AudioContextCtor })
          .webkitAudioContext);
  if (!Ctor) return undefined;
  try {
    audio = new Ctor();
  } catch {
    // audio unavailable
  }
  return audio;
}

/**
 * Creates the AudioContext (suspended until a gesture resumes it) off the critical path. Creating it costs tens to
 * hundreds of ms on some devices, which must not land inside the first set-completion tap (PRD §21 feedback budget).
 */
export function warmUpAlerts(): void {
  const create = () => void audioContext();
  if (typeof requestIdleCallback === "function") requestIdleCallback(create, { timeout: 3000 });
  else setTimeout(create, 1000);
}

/** Call from a user gesture (starting a timer): browsers only let an AudioContext run once the user has interacted. */
export function prepareAlerts(): void {
  void audioContext()
    ?.resume?.()
    ?.catch?.(() => {});
}

/** Two short beeps. */
function beep(ctx: AudioContext): void {
  const start = ctx.currentTime;
  for (const offset of [0, 0.25]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.3, start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start + offset);
    osc.stop(start + offset + 0.2);
  }
}

/** A single short tick for the countdown warning; the rest-done alert is two longer beeps. */
function tick(ctx: AudioContext): void {
  const start = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 660;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + 0.14);
}

/** Whether this browser can vibrate. False on iOS/iPadOS Safari, where the setting is hidden. */
export function vibrationSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export type AlertOptions = { sound: boolean; vibrate?: boolean };

function emit({ sound, vibrate = true }: AlertOptions, draw: (ctx: AudioContext) => void, pattern: number[]): void {
  if (sound) {
    try {
      const ctx = audioContext();
      if (ctx) {
        void ctx.resume?.()?.catch?.(() => {});
        draw(ctx);
      }
    } catch {
      // sound is best effort
    }
  }
  if (!vibrate) return;
  try {
    if (vibrationSupported()) navigator.vibrate(pattern);
  } catch {
    // vibration is best effort
  }
}

/** Sound (if `sound`) and vibration (if `vibrate`, default on, and supported). Never throws; the visual alert is the caller's job. */
export function playRestDoneAlert(options: AlertOptions): void {
  emit(options, beep, [200, 100, 200]);
}

/** Quieter cue a few seconds before the rest ends. */
export function playCountdownCue(options: AlertOptions): void {
  emit(options, tick, [80]);
}

/** Settings "Test alert": plays the rest-done alert with the current choices (call from a tap, which unlocks audio). */
export function playTestAlert(options: AlertOptions): void {
  prepareAlerts();
  playRestDoneAlert(options);
}

/** Test hook: forgets the cached AudioContext. */
export function resetAlertsForTests(): void {
  audio = undefined;
}
