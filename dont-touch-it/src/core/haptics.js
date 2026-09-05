// ============================================================
// haptics.js — vibration vocabulary
// ------------------------------------------------------------
// The web only gives us on/off durations, so "texture" is built from
// gaps: a detent is 8ms, a thunk is 26ms, a shatter is a burst chain
// with randomised gaps. Rate-limited so continuous gestures (turning a
// screw, dragging cloth) can call it freely without becoming a buzz.
// ============================================================

const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

export const Haptics = {
  enabled: true,
  _last: 0,
  _minGap: 0.022,

  fire(pattern, minGap = this._minGap) {
    if (!this.enabled || !canVibrate) return false;
    const t = performance.now() / 1000;
    if (t - this._last < minGap) return false;
    this._last = t;
    try { navigator.vibrate(pattern); } catch (_) {}
    return true;
  },

  // --- vocabulary ---
  tick()      { this.fire(6, 0.018); },        // finest detent
  detent()    { this.fire(10, 0.03); },        // screw click, notch
  tap()       { this.fire(12, 0.03); },
  select()    { this.fire([0, 8, 14, 12], 0.06); },
  press()     { this.fire(18, 0.04); },        // switch break
  bottom()    { this.fire([0, 26, 18, 9], 0.06); }, // switch bottom-out
  release()   { this.fire(8, 0.03); },
  thunk()     { this.fire([0, 30, 24, 14], 0.08); },
  snap()      { this.fire([0, 14, 10, 22], 0.05); },
  tear(i = 0) { this.fire(4 + (i % 3), 0.016); },
  squish()    { this.fire([0, 6, 10, 8, 14, 6], 0.09); },
  stress(l)   { this.fire(3 + Math.round(l * 6), 0.05); },
  shatter()   {
    const p = [0, 40];
    for (let i = 0; i < 9; i++) { p.push(8 + Math.random() * 30 | 0, 6 + Math.random() * 26 | 0); }
    this.fire(p, 0.2);
  },
  heavy()     { this.fire([0, 60, 30, 90], 0.25); },
  reveal()    { this.fire([0, 12, 60, 18, 60, 40], 0.3); },
  stop()      { if (canVibrate) try { navigator.vibrate(0); } catch (_) {} },
};

export default Haptics;
