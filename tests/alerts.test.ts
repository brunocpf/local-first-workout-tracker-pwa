import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  playCountdownCue,
  playRestDoneAlert,
  playTestAlert,
  vibrationSupported,
  prepareAlerts,
  resetAlertsForTests,
} from "#lib/alerts";

function stubAudio() {
  const osc = {
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const gain = {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  };
  const ctx = {
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {}),
    createOscillator: vi.fn(() => osc),
    createGain: vi.fn(() => gain),
  };
  const Ctor = vi.fn(function () {
    return ctx;
  });
  vi.stubGlobal("AudioContext", Ctor);
  return { ctx, Ctor, osc };
}

describe("rest-done alerts", () => {
  beforeEach(() => resetAlertsForTests());
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "vibrate");
  });

  it("beeps and vibrates when supported", () => {
    const { ctx, osc } = stubAudio();
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", {
      value: vibrate,
      configurable: true,
    });
    playRestDoneAlert({ sound: true });
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
    expect(osc.start).toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledOnce();
  });

  it("stays silent when sound is off", () => {
    const { Ctor } = stubAudio();
    playRestDoneAlert({ sound: false });
    expect(Ctor).not.toHaveBeenCalled();
  });

  it("does nothing, without throwing, when neither API exists (iOS)", () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(() => playRestDoneAlert({ sound: true })).not.toThrow();
    expect(() => prepareAlerts()).not.toThrow();
  });

  it("swallows errors from the APIs", () => {
    vi.stubGlobal("AudioContext", function () {
      throw new Error("blocked");
    });
    Object.defineProperty(navigator, "vibrate", {
      value: () => {
        throw new Error("nope");
      },
      configurable: true,
    });
    expect(() => playRestDoneAlert({ sound: true })).not.toThrow();
  });

  it("unlocks the audio context on a user gesture", () => {
    const { ctx } = stubAudio();
    prepareAlerts();
    expect(ctx.resume).toHaveBeenCalled();
  });

  it("skips vibration when turned off", () => {
    stubAudio();
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    playRestDoneAlert({ sound: true, vibrate: false });
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("reports vibration support (absent on iOS)", () => {
    expect(vibrationSupported()).toBe(false);
    Object.defineProperty(navigator, "vibrate", { value: () => true, configurable: true });
    expect(vibrationSupported()).toBe(true);
  });

  it("plays a single tick for the countdown cue", () => {
    const { ctx } = stubAudio();
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    playCountdownCue({ sound: true });
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith([80]);
  });

  it("test alert unlocks audio and plays the rest-done alert", () => {
    const { ctx } = stubAudio();
    playTestAlert({ sound: true, vibrate: false });
    expect(ctx.resume).toHaveBeenCalled();
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
  });
});
