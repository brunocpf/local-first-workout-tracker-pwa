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

/** Sound (if `sound`) and vibration (where supported). Never throws; the visual alert is the caller's job. */
export function playRestDoneAlert({ sound }: { sound: boolean }): void {
  if (sound) {
    try {
      const ctx = audioContext();
      if (ctx) {
        void ctx.resume?.()?.catch?.(() => {});
        beep(ctx);
      }
    } catch {
      // sound is best effort
    }
  }
  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    )
      navigator.vibrate([200, 100, 200]);
  } catch {
    // vibration is best effort
  }
}

/** Test hook: forgets the cached AudioContext. */
export function resetAlertsForTests(): void {
  audio = undefined;
}
