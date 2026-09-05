// ============================================================
// haptics.js — vibration vocabulary
// ------------------------------------------------------------
// The web gives us only on/off durations, so "texture" is built out of
// gaps: a detent is 8ms, a bottom-out is 26ms followed by a shorter
// bounce, a shatter is a burst chain with randomised gaps. Every entry
// below is paired with the sound it accompanies in core/audio.js — if
// you change one, change the other, because a haptic that disagrees with
// its sound reads as latency rather than as touch.
//
// IMPORTANT: iOS Safari does not implement the Vibration API at all, so
// on a large share of phones none of this fires. Rather than let those
// players get nothing, the strong events fall back to a very small
// camera impulse — see `fallback`. High-frequency events (ticks,
// detents) deliberately have NO visual substitute: a screen that twitches
// sixty times while you turn a screw is worse than silence.
// ============================================================

const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

export const Haptics = {
  enabled: true,
  supported: canVibrate,
  /** Set by the shell: (intensity 0..1) => void, for devices with no motor. */
  fallback: null,
  _last: 0,
  _minGap: 0.022,

  /**
   * fire(pattern, minGap, visual)
   * `visual` is the 0..1 intensity handed to `fallback` when there is no
   * vibration motor. Leave it 0 for anything that repeats quickly.
   */
  fire(pattern, minGap = this._minGap, visual = 0) {
    if (!this.enabled) return false;
    const t = performance.now() / 1000;
    if (t - this._last < minGap) return false;
    this._last = t;
    if (canVibrate) {
      try { navigator.vibrate(pattern); } catch (_) {}
      return true;
    }
    if (visual > 0 && this.fallback) this.fallback(visual);
    return false;
  },

  // --- vocabulary, paired with SFX ---
  tick()      { this.fire(6, 0.018); },                       // SFX.uiTick
  detent()    { this.fire(10, 0.028); },                      // SFX.screwTick
  tap()       { this.fire(12, 0.03); },
  select()    { this.fire([0, 8, 14, 12], 0.06, 0.22); },     // SFX.uiSoft
  press()     { this.fire(18, 0.04, 0.20); },                 // SFX.buttonPress
  bottom()    { this.fire([0, 26, 18, 9], 0.06, 0.85); },     // SFX.buttonBottom
  release()   { this.fire(8, 0.03); },                        // SFX.buttonRelease
  thunk()     { this.fire([0, 30, 24, 14], 0.08, 0.5); },     // SFX.glassSet
  snap()      { this.fire([0, 14, 10, 22], 0.05, 0.35); },    // SFX.screwFree
  tear(i = 0) { this.fire(4 + (i % 3), 0.016); },             // SFX.clothPull
  squish()    { this.fire([0, 6, 10, 8, 14, 6], 0.09, 0.18); },
  stress(l)   { this.fire(3 + Math.round(l * 6), 0.05); },    // SFX.glassStress
  shatter()   {                                               // SFX.glassShatter
    // randomised gaps: an even pulse train feels like a phone alert,
    // an uneven one feels like something coming apart
    const p = [0, 40];
    for (let i = 0; i < 9; i++) p.push(8 + Math.random() * 30 | 0, 6 + Math.random() * 26 | 0);
    this.fire(p, 0.2, 1);
  },
  heavy()     { this.fire([0, 60, 30, 90], 0.25, 1); },       // SFX.bigImpact
  reveal()    { this.fire([0, 12, 60, 18, 60, 40], 0.3, 0.4); },
  stop()      { if (canVibrate) try { navigator.vibrate(0); } catch (_) {} },
};

export default Haptics;
