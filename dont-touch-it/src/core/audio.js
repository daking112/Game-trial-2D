// ============================================================
// audio.js — fully procedural sound engine (no samples, no network)
// ------------------------------------------------------------
// Everything is synthesised: modal (resonant-partial) synthesis for
// metal/glass, filtered noise for cloth/air, physically-shaped envelopes
// for clicks and impacts. A generated impulse response gives every sound
// a shared room, which is what makes a set of effects feel like one place.
// ============================================================

import { clamp, clamp01, lerp, rand, rrange } from './math.js';

const now = () => Audio.ctx ? Audio.ctx.currentTime : 0;

export const Audio = {
  ctx: null,
  master: null,
  dry: null,
  wet: null,
  verb: null,
  comp: null,
  duck: null,
  ready: false,
  muted: false,
  noiseBuf: null,
  _ambience: null,

  /**
   * Build the whole signal chain on a given AudioContext.
   * Split out of init() so tools/audio-lab.mjs can bind an OfflineAudioContext
   * and measure the EXACT chain the game plays through, master bus included.
   */
  attach(ctx) {
    this.ctx = ctx;

    // A brick-ish safety limiter, not a tone shaper. Measured peaks across
    // the whole vocabulary sat between -50 and -18 dBFS, which on a phone
    // speaker is inaudible, so the master runs hot and this catches the
    // transients rather than levelling everything to mush.
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -7;
    this.comp.knee.value = 8;
    this.comp.ratio.value = 14;
    this.comp.attack.value = 0.002;
    this.comp.release.value = 0.16;

    this.master = ctx.createGain();
    this.master.gain.value = this.baseGain = 2.7;

    // gentle high shelf to take the digital edge off
    const tilt = ctx.createBiquadFilter();
    tilt.type = 'highshelf';
    tilt.frequency.value = 8200;
    tilt.gain.value = -3.5;

    this.master.connect(tilt);
    tilt.connect(this.comp);
    this.comp.connect(ctx.destination);

    this.dry = ctx.createGain(); this.dry.gain.value = 1;
    this.wet = ctx.createGain(); this.wet.gain.value = 0.17;
    this.verb = ctx.createConvolver();
    // A gallery is a small, hard, quiet room: short tail, dense early
    // reflections, highs gone fast. The previous 1.9s tail was a cathedral
    // and it was smearing every transient in the game.
    this.verb.buffer = this._impulse(1.15, 3.2, 0.30);
    this.dry.connect(this.master);
    this.wet.connect(this.verb);
    this.verb.connect(this.master);

    this.noiseBuf = this._noise(2.2);
    this.ready = true;
    return this;
  },

  init() {
    if (this.ctx) return this;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return this;
    return this.attach(new AC({ latencyHint: 'interactive' }));
  },

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
    return this;
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.baseGain, now(), 0.05);
  },

  /** Room size control — levels can change the space they live in. */
  setRoom(seconds, decay, wetness) {
    if (!this.ctx) return;
    this.verb.buffer = this._impulse(seconds, decay, 0.42);
    this.wet.gain.setTargetAtTime(wetness, now(), 0.4);
  },

  _noise(sec) {
    const ctx = this.ctx;
    const n = (ctx.sampleRate * sec) | 0;
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = rand() * 2 - 1;
    return b;
  },

  _impulse(sec, decay, diffusion) {
    const ctx = this.ctx;
    const n = Math.max(1, (ctx.sampleRate * sec) | 0);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        // early reflections then a smooth exponential tail
        const env = Math.pow(1 - t, decay);
        let s = (rand() * 2 - 1) * env;
        // low-pass the tail: real rooms lose highs first
        lp += (s - lp) * lerp(0.9, 0.06, t);
        d[i] = lp * (1 + diffusion * Math.sin(t * 40 + ch));
      }
      // sparse early reflections
      for (let k = 0; k < 9; k++) {
        const idx = ((0.004 + rand() * 0.09) * ctx.sampleRate) | 0;
        if (idx < n) d[idx] += (rand() * 2 - 1) * 0.5;
      }
      // normalise: the reflections above are added on top of a tail that
      // already starts at unity, so without this the IR itself clips
      let peak = 0;
      for (let i = 0; i < n; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
      if (peak > 0) { const k = 0.92 / peak; for (let i = 0; i < n; i++) d[i] *= k; }
    }
    return b;
  },

  // ---------- primitives ----------

  /** Route a node through dry+send. `send` 0..1 */
  out(node, send = 0.3) {
    node.connect(this.dry);
    if (send > 0) {
      const g = this.ctx.createGain();
      g.gain.value = send;
      node.connect(g);
      g.connect(this.wet);
    }
  },

  env(gain, t, { a = 0.002, d = 0.15, s = 0, r = 0.1, peak = 1, hold = 0 } = {}) {
    const g = gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    if (s > 0) {
      g.exponentialRampToValueAtTime(Math.max(0.0002, peak * s), t + a + d);
      g.setValueAtTime(Math.max(0.0002, peak * s), t + a + d + hold);
      g.exponentialRampToValueAtTime(0.0001, t + a + d + hold + r);
      return t + a + d + hold + r;
    }
    g.exponentialRampToValueAtTime(0.0001, t + a + d);
    return t + a + d;
  },

  noiseSource(t, dur, playbackRate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.playbackRate.value = playbackRate;
    s.start(t, rand() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  },

  /**
   * Modal synthesis: a bank of exponentially-decaying sine partials.
   * This is what makes metal sound like metal and glass like glass.
   * modes: [[freqRatio, amp, decaySeconds], ...]
   */
  modal(f0, modes, opts = {}) {
    if (!this.ready || this.muted) return;
    const { gain = 0.3, send = 0.18, t = now(), detune = 0.004, pan = 0, hp = 0 } = opts;
    const bus = this.ctx.createGain();
    bus.gain.value = gain;
    let tail = bus;
    if (hp > 0) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = hp; f.Q.value = 0.7;
      bus.connect(f); tail = f;
    }
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; tail.connect(p); this.out(p, send); }
    else this.out(tail, send);

    for (const [ratio, amp, dec] of modes) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      const f = f0 * ratio * (1 + (rand() - 0.5) * detune);
      o.frequency.setValueAtTime(f, t);
      // very slight downward pitch drift — real struck bodies do this
      o.frequency.exponentialRampToValueAtTime(f * 0.997, t + dec);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + 0.0016);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g); g.connect(bus);
      o.start(t); o.stop(t + dec + 0.05);
    }
  },

  /** Filtered noise burst — air, cloth, scrape, hiss. */
  air(opts = {}) {
    if (!this.ready || this.muted) return;
    const {
      t = now(), dur = 0.2, gain = 0.2, send = 0.3,
      type = 'bandpass', f0 = 900, f1 = 900, q = 1.2, rate = 1,
      a = 0.01, curve = 2, pan = 0,
    } = opts;
    const src = this.noiseSource(t, dur, rate);
    const flt = this.ctx.createBiquadFilter();
    flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + a);
    g.gain.setValueAtTime(Math.max(0.0002, gain), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g);
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; g.connect(p); this.out(p, send); } else this.out(g, send);
  },

  /** Single-cycle transient — the "tick" that sells mechanical contact. */
  click(opts = {}) {
    if (!this.ready || this.muted) return;
    const { t = now(), f = 2400, gain = 0.24, dur = 0.02, send = 0.14, q = 8 } = opts;
    const src = this.noiseSource(t, dur, 1);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g);
    this.out(g, send);
  },

  /** Low-frequency body — thuds, impacts, the floor of a big moment. */
  thud(opts = {}) {
    if (!this.ready || this.muted) return;
    const { t = now(), f0 = 120, f1 = 42, gain = 0.5, dur = 0.32, send = 0.2, click: cl = 0.2 } = opts;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); this.out(g, send);
    o.start(t); o.stop(t + dur + 0.05);
    if (cl > 0) this.click({ t, f: 1400, gain: cl, dur: 0.035, q: 2 });
  },

  /** Sustained tone with vibrato — hums, alarms, drones. Returns a handle. */
  drone(opts = {}) {
    if (!this.ready) return null;
    const {
      f = 55, gain = 0.06, type = 'sine', send = 0.5,
      lfoRate = 0.13, lfoDepth = 1.2, attack = 2, filter = 0,
    } = opts;
    const t = now();
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    let tail = g;
    if (filter) {
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass'; flt.frequency.value = filter; flt.Q.value = 0.7;
      g.connect(flt); tail = flt;
    }
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = lfoRate;
    const lg = this.ctx.createGain(); lg.gain.value = lfoDepth;
    lfo.connect(lg); lg.connect(o.frequency);
    lfo.start(t);
    o.connect(g);
    this.out(tail, send);
    o.start(t);
    return {
      node: o, gain: g, lfo,
      set(v, time = 0.4) { g.gain.setTargetAtTime(Math.max(0.0001, v), now(), time); },
      pitch(v, time = 0.6) { o.frequency.setTargetAtTime(v, now(), time); },
      stop(fade = 0.8) {
        const tt = now();
        g.gain.cancelScheduledValues(tt);
        g.gain.setValueAtTime(Math.max(0.0002, g.gain.value), tt);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + fade);
        o.stop(tt + fade + 0.1); lfo.stop(tt + fade + 0.1);
      },
    };
  },

  /** Momentarily duck everything — used to make a big hit feel bigger. */
  sidechain(depth = 0.45, dur = 0.35) {
    if (!this.master) return;
    const t = now();
    const g = this.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this.baseGain * (1 - depth), t + 0.012);
    g.linearRampToValueAtTime(this.baseGain, t + dur);
  },
};

// ============================================================
// SFX — the named vocabulary levels actually call
// ============================================================
const A = Audio;

export const SFX = {
  // --- generic UI ---
  uiTick(p = 1) { A.click({ f: 3200 * p, gain: 0.30, dur: 0.014, q: 3, send: 0.06 }); },
  uiSoft(p = 1) { A.air({ dur: 0.16, f0: 1800 * p, f1: 620 * p, gain: 0.13, q: 0.8, send: 0.16 }); },
  whoosh(power = 1, dir = 1) {
    A.air({ dur: 0.34 * power, f0: 380, f1: 2200, gain: 0.18 * power, q: 0.7,
            type: 'bandpass', send: 0.18, pan: dir * 0.3 });
    A.air({ dur: 0.42 * power, f0: 1600, f1: 220, gain: 0.12 * power, q: 0.6, send: 0.20 });
  },

  // --- mechanical ---
  /** One detent of a turning screw. `i` rises as it comes loose. */
  /**
   * One detent of a turning screw — the sound the player hears more than
   * any other in the game. A real detent is DRY and short: a hard tick
   * with almost no body. The tonal ring that used to sit under it made
   * sixty of these in a row sound like a xylophone.
   */
  screwTick(i = 0, pan = 0) {
    const p = 1 + i * 0.07;
    // Q stays low: a high-Q bandpass rings UP over ~10ms, which turns a
    // tick into a little chirp and costs the detent its instant feel.
    A.click({ f: 2100 * p + rrange(-160, 160), gain: 0.40, dur: 0.013, q: 3.2, send: 0.07 });
    A.click({ f: 880 * p, gain: 0.17, dur: 0.020, q: 2.2, send: 0.05 });
    A.air({ dur: 0.026, f0: 6400, f1: 3600, gain: 0.045, q: 1.2, send: 0.06, pan });
  },
  screwFree(pan = 0) {
    A.modal(720, [[1, 0.30, 0.42], [2.05, 0.19, 0.28], [3.41, 0.11, 0.18], [5.9, 0.06, 0.12]],
      { gain: 0.7, send: 0.24, pan, hp: 220 });
    A.click({ f: 1100, gain: 0.34, dur: 0.04, q: 2.4 });
  },
  screwDrop(pan = 0) {
    A.modal(1450, [[1, 0.26, 0.20], [2.76, 0.15, 0.12], [5.4, 0.08, 0.07]],
      { gain: 0.65, send: 0.26, pan, hp: 320 });
    A.thud({ f0: 240, f1: 110, gain: 0.20, dur: 0.08, click: 0.14 });
  },

  /** Deep, expensive-feeling switch. Two-stage: break, then bottom-out. */
  /** The switch breaking free of its detent: crisp, dry, mechanical. */
  buttonPress() {
    A.click({ f: 2600, gain: 0.42, dur: 0.016, q: 4, send: 0.08 });
    A.modal(430, [[1, 0.26, 0.075], [2.4, 0.15, 0.05], [4.7, 0.07, 0.035]],
      { gain: 0.7, send: 0.12, hp: 180 });
    A.thud({ f0: 160, f1: 62, gain: 0.40, dur: 0.13, click: 0 });
  },
  /** Bottoming out. This one is allowed to be the loudest thing so far. */
  buttonBottom() {
    A.click({ f: 1250, gain: 0.86, dur: 0.026, q: 2.2, send: 0.12 });
    A.click({ f: 420, gain: 0.52, dur: 0.05, q: 1.6, send: 0.08 });
    A.modal(190, [[1, 0.22, 0.13], [2.7, 0.11, 0.07], [5.1, 0.05, 0.04]],
      { gain: 0.8, send: 0.12, hp: 120 });
    A.thud({ f0: 104, f1: 32, gain: 0.85, dur: 0.46, click: 0.16 });
    A.sidechain(0.42, 0.4);
  },
  buttonRelease() {
    A.click({ f: 3400, gain: 0.26, dur: 0.012, q: 5, send: 0.06 });
    A.modal(700, [[1, 0.13, 0.05], [2.2, 0.08, 0.035]], { gain: 0.6, send: 0.10, hp: 300 });
  },

  // --- glass ---
  glassLift() {
    A.air({ dur: 0.5, f0: 260, f1: 900, gain: 0.11, q: 0.9, send: 0.22 });
    A.modal(1180, [[1, 0.11, 0.6], [2.02, 0.07, 0.42], [3.31, 0.04, 0.28]],
      { gain: 0.55, send: 0.22 });
  },
  glassSet(force = 1) {
    A.modal(1560, [[1, 0.26 * force, 0.48], [2.11, 0.17 * force, 0.34],
                   [3.44, 0.10 * force, 0.22], [5.7, 0.055 * force, 0.13]],
      { gain: 0.7, send: 0.24 });
    A.click({ f: 4200, gain: 0.24 * force, dur: 0.018, q: 3, send: 0.06 });
    A.thud({ f0: 190, f1: 76, gain: 0.24 * force, dur: 0.1, click: 0 });
  },
  glassRing(f = 1400, g = 0.3) {
    A.modal(f, [[1, 0.22 * g, 1.25], [2.04, 0.12 * g, 0.85], [3.37, 0.07 * g, 0.55],
                [5.81, 0.035 * g, 0.32]],
      { gain: 0.7, send: 0.26, hp: 400 });
  },
  glassStress(level = 0) {
    A.air({ dur: 0.09, f0: 3400 + level * 2600, f1: 5200 + level * 3000,
            gain: 0.075 + level * 0.11, q: 6, send: 0.10 });
    A.modal(2600 + level * 900, [[1, 0.05 + level * 0.07, 0.07]], { gain: 0.7, send: 0.12 });
  },
  /**
   * Breaking glass is not one event. It is a crack, then a burst of a
   * hundred small inharmonic hits whose DENSITY decays, then a sparse
   * tail of individual pieces still settling. Getting the density
   * envelope right is what makes it sound expensive; the individual
   * pitches barely matter.
   */
  glassShatter(intensity = 1) {
    const t0 = now();
    A.air({ t: t0, dur: 0.05, f0: 7000, f1: 3000, gain: 0.5 * intensity, q: 0.6, send: 0.12 });
    A.thud({ t: t0, f0: 280, f1: 76, gain: 0.42 * intensity, dur: 0.2, click: 0.3 });
    const N = 54;
    for (let i = 0; i < N; i++) {
      // exponential arrivals: dense at the front, thinning to a tail
      const t = t0 + (-Math.log(1 - rand() * 0.985)) * 0.20;
      const late = clamp01(t - t0);
      A.modal(rrange(1800, 6800), [
        [1, rrange(0.03, 0.12) * intensity * (1 - late * 0.55), rrange(0.05, 0.26)],
        [rrange(1.8, 3.4), rrange(0.015, 0.05) * intensity, rrange(0.03, 0.14)],
      ], { t, gain: 0.62, send: 0.22, pan: rrange(-0.85, 0.85), hp: 600 });
    }
    A.sidechain(0.5, 0.5);
  },
  shardTinkle(size = 1, pan = 0) {
    A.modal(rrange(2200, 5400) / (0.6 + size * 0.6),
      [[1, 0.11, rrange(0.05, 0.2)], [rrange(2.1, 3.6), 0.05, 0.06]],
      { gain: 0.55, send: 0.26, pan, hp: 700 });
  },

  // --- soft / organic ---
  /** Wet and close, with the pitch tracking compression. */
  squish(amount = 1, pan = 0) {
    A.air({ dur: 0.13 + amount * 0.09, f0: 900 + amount * 900, f1: 300,
            gain: 0.20 * amount, q: 1.3, send: 0.10, pan });
    A.modal(300 + amount * 220, [[1, 0.13 * amount, 0.09], [1.9, 0.06, 0.05]],
      { gain: 0.6, send: 0.10, pan, hp: 200 });
  },
  stretch(t01 = 0) {
    A.air({ dur: 0.09, f0: 500 + t01 * 2200, f1: 900 + t01 * 3000,
            gain: 0.07 + t01 * 0.11, q: 4, send: 0.12 });
  },
  clothPull(speed = 1, pan = 0) {
    A.air({ dur: 0.09, f0: 1600 + speed * 2200, f1: 700,
            gain: 0.06 + 0.10 * clamp01(speed), q: 0.9, send: 0.12, pan });
  },
  threadSnap(pan = 0) {
    A.click({ f: 2800, gain: 0.32, dur: 0.018, q: 3 });
    A.modal(1300, [[1, 0.14, 0.13], [2.4, 0.07, 0.08]], { gain: 0.6, send: 0.20, pan, hp: 400 });
  },

  // --- world ---
  chainPull(i = 0) {
    for (let k = 0; k < 3; k++) {
      A.modal(rrange(1800, 3400), [[1, 0.10, rrange(0.025, 0.07)], [2.3, 0.05, 0.025]],
        { t: now() + k * rrange(0.006, 0.026), gain: 0.6, send: 0.16,
          pan: rrange(-0.2, 0.2), hp: 700 });
    }
  },
  lampClick() {
    A.click({ f: 1900, gain: 0.5, dur: 0.018, q: 3 });
    A.modal(580, [[1, 0.24, 0.09], [3.1, 0.10, 0.04]], { gain: 0.75, send: 0.14, hp: 240 });
    A.thud({ f0: 140, f1: 62, gain: 0.30, dur: 0.09, click: 0 });
  },
  powerDown() {
    A.air({ dur: 1.1, f0: 3000, f1: 60, gain: 0.18, q: 1.1, send: 0.26 });
    A.thud({ f0: 90, f1: 26, gain: 0.5, dur: 1.2, click: 0.14 });
    A.sidechain(0.6, 0.9);
  },
  powerUp() {
    A.air({ dur: 0.8, f0: 240, f1: 3800, gain: 0.15, q: 1.1, send: 0.22 });
    // fundamental sits above the 200-500Hz mud band, where a "lights on"
    // gesture actually reads as brightening rather than as a hum
    A.modal(523, [[1, 0.13, 0.6], [1.5, 0.09, 0.45], [2, 0.06, 0.35], [3, 0.03, 0.22]],
      { gain: 0.6, send: 0.24, hp: 300 });
  },
  bigImpact(power = 1) {
    A.thud({ f0: 180 * power, f1: 30, gain: 0.8, dur: 0.7, click: 0.36 });
    A.air({ dur: 0.5, f0: 900, f1: 90, gain: 0.22, q: 0.6, send: 0.30 });
    A.sidechain(0.55, 0.6);
  },
  reveal() {
    // Sat almost entirely in the low mids before: a chord at 196Hz with
    // two-second decays is mud, not a reveal. Up an octave, shorter, drier.
    const base = 392;
    [1, 1.5, 2, 3].forEach((r, i) => {
      A.modal(base * r, [[1, 0.10, 1.5 - i * 0.22], [2, 0.04, 0.9]],
        { t: now() + i * 0.07, gain: 0.6, send: 0.30, hp: 260 });
    });
  },
};

export default Audio;
