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

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.22;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;

    // gentle high shelf to take the digital edge off
    const tilt = ctx.createBiquadFilter();
    tilt.type = 'highshelf';
    tilt.frequency.value = 8200;
    tilt.gain.value = -3.5;

    this.master.connect(tilt);
    tilt.connect(this.comp);
    this.comp.connect(ctx.destination);

    this.dry = ctx.createGain(); this.dry.gain.value = 1;
    this.wet = ctx.createGain(); this.wet.gain.value = 0.26;
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(1.9, 2.6, 0.42);
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
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, now(), 0.05);
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
    const { gain = 0.3, send = 0.34, t = now(), detune = 0.004, pan = 0 } = opts;
    const bus = this.ctx.createGain();
    bus.gain.value = gain;
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; bus.connect(p); this.out(p, send); }
    else this.out(bus, send);

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
    g.linearRampToValueAtTime(0.9 * (1 - depth), t + 0.012);
    g.linearRampToValueAtTime(0.9, t + dur);
  },
};

// ============================================================
// SFX — the named vocabulary levels actually call
// ============================================================
const A = Audio;

export const SFX = {
  // --- generic UI ---
  uiTick(p = 1) { A.click({ f: 3200 * p, gain: 0.09, dur: 0.014, q: 3, send: 0.1 }); },
  uiSoft(p = 1) { A.air({ dur: 0.16, f0: 1800 * p, f1: 620 * p, gain: 0.055, q: 0.8, send: 0.3 }); },
  whoosh(power = 1, dir = 1) {
    A.air({ dur: 0.34 * power, f0: 380, f1: 2200, gain: 0.09 * power, q: 0.7, type: 'bandpass', send: 0.4, pan: dir * 0.3 });
    A.air({ dur: 0.42 * power, f0: 1600, f1: 220, gain: 0.06 * power, q: 0.6, send: 0.45 });
  },

  // --- mechanical ---
  /** One detent of a turning screw. `i` rises as it comes loose. */
  screwTick(i = 0, pan = 0) {
    const p = 1 + i * 0.08;
    A.click({ f: 1500 * p + rrange(-120, 120), gain: 0.11, dur: 0.02, q: 6, send: 0.2 });
    A.modal(2100 * p, [[1, 0.05, 0.045], [2.31, 0.03, 0.03]], { gain: 0.5, send: 0.25, pan });
    A.air({ dur: 0.05, f0: 5200, f1: 2400, gain: 0.035, q: 1.4, send: 0.15, pan });
  },
  screwFree(pan = 0) {
    A.modal(720, [[1, 0.16, 0.5], [2.05, 0.1, 0.34], [3.41, 0.06, 0.22], [5.9, 0.03, 0.15]],
      { gain: 0.5, send: 0.5, pan });
    A.click({ f: 900, gain: 0.16, dur: 0.05, q: 2 });
  },
  screwDrop(pan = 0) {
    A.modal(1450, [[1, 0.12, 0.22], [2.76, 0.07, 0.14], [5.4, 0.04, 0.08]], { gain: 0.45, send: 0.55, pan });
    A.thud({ f0: 220, f1: 90, gain: 0.12, dur: 0.1, click: 0.06 });
  },

  /** Deep, expensive-feeling switch. Two-stage: break, then bottom-out. */
  buttonPress() {
    A.click({ f: 2600, gain: 0.3, dur: 0.018, q: 4, send: 0.12 });
    A.modal(420, [[1, 0.2, 0.09], [2.4, 0.12, 0.06], [4.7, 0.05, 0.04]], { gain: 0.6, send: 0.22 });
    A.thud({ f0: 150, f1: 58, gain: 0.42, dur: 0.16, click: 0 });
  },
  buttonBottom() {
    A.click({ f: 1100, gain: 0.34, dur: 0.03, q: 2.4, send: 0.2 });
    A.thud({ f0: 96, f1: 34, gain: 0.62, dur: 0.42, click: 0.1 });
    A.sidechain(0.4, 0.4);
  },
  buttonRelease() {
    A.click({ f: 3400, gain: 0.16, dur: 0.014, q: 5, send: 0.1 });
    A.modal(680, [[1, 0.08, 0.06], [2.2, 0.05, 0.04]], { gain: 0.5, send: 0.2 });
  },

  // --- glass ---
  glassLift() {
    A.air({ dur: 0.5, f0: 260, f1: 900, gain: 0.05, q: 0.9, send: 0.5 });
    A.modal(1180, [[1, 0.05, 0.7], [2.02, 0.032, 0.5], [3.31, 0.02, 0.34]], { gain: 0.4, send: 0.6 });
  },
  glassSet(force = 1) {
    A.modal(1560, [[1, 0.12 * force, 0.55], [2.11, 0.08 * force, 0.4],
                   [3.44, 0.05 * force, 0.26], [5.7, 0.028 * force, 0.16]],
      { gain: 0.55, send: 0.6 });
    A.click({ f: 4200, gain: 0.1 * force, dur: 0.02, q: 3 });
    A.thud({ f0: 180, f1: 70, gain: 0.16 * force, dur: 0.12, click: 0 });
  },
  glassRing(f = 1400, g = 0.3) {
    A.modal(f, [[1, 0.09 * g, 1.5], [2.04, 0.05 * g, 1.0], [3.37, 0.03 * g, 0.7], [5.81, 0.015 * g, 0.4]],
      { gain: 0.5, send: 0.7 });
  },
  glassStress(level = 0) {
    A.air({ dur: 0.1, f0: 3400 + level * 2600, f1: 5200 + level * 3000, gain: 0.03 + level * 0.05, q: 6, send: 0.3 });
    A.modal(2600 + level * 900, [[1, 0.02 + level * 0.03, 0.08]], { gain: 0.5, send: 0.3 });
  },
  glassShatter(intensity = 1) {
    const t0 = now();
    A.air({ t: t0, dur: 0.06, f0: 6000, f1: 2600, gain: 0.34 * intensity, q: 0.6, send: 0.3 });
    A.thud({ t: t0, f0: 260, f1: 70, gain: 0.34 * intensity, dur: 0.22, click: 0.2 });
    for (let i = 0; i < 22; i++) {
      const t = t0 + rrange(0, 0.42) ** 1.5;
      A.modal(rrange(1500, 6200), [[1, rrange(0.02, 0.08) * intensity, rrange(0.06, 0.3)],
                                   [rrange(1.8, 3.4), rrange(0.01, 0.04), rrange(0.04, 0.18)]],
        { t, gain: 0.55, send: 0.6, pan: rrange(-0.8, 0.8) });
    }
    A.sidechain(0.5, 0.5);
  },
  shardTinkle(size = 1, pan = 0) {
    A.modal(rrange(2200, 5400) / (0.6 + size * 0.6),
      [[1, 0.045, rrange(0.05, 0.2)], [rrange(2.1, 3.6), 0.02, 0.06]],
      { gain: 0.4, send: 0.65, pan });
  },

  // --- soft / organic ---
  squish(amount = 1, pan = 0) {
    A.air({ dur: 0.14 + amount * 0.1, f0: 300 + amount * 500, f1: 130, gain: 0.07 * amount, q: 1.6, send: 0.25, pan });
    A.modal(180 + amount * 120, [[1, 0.05 * amount, 0.1], [1.9, 0.02, 0.06]], { gain: 0.5, send: 0.2, pan });
  },
  stretch(t01 = 0) {
    A.air({ dur: 0.09, f0: 500 + t01 * 2200, f1: 900 + t01 * 3000, gain: 0.02 + t01 * 0.035, q: 4, send: 0.3 });
  },
  clothPull(speed = 1, pan = 0) {
    A.air({ dur: 0.09, f0: 1600 + speed * 2200, f1: 700, gain: 0.02 + 0.035 * clamp01(speed), q: 0.9, send: 0.3, pan });
  },
  threadSnap(pan = 0) {
    A.click({ f: 2800, gain: 0.14, dur: 0.02, q: 3 });
    A.modal(1300, [[1, 0.06, 0.16], [2.4, 0.03, 0.09]], { gain: 0.45, send: 0.5, pan });
  },

  // --- world ---
  chainPull(i = 0) {
    for (let k = 0; k < 3; k++) {
      A.modal(rrange(1800, 3400), [[1, 0.035, rrange(0.03, 0.09)], [2.3, 0.02, 0.03]],
        { t: now() + k * rrange(0.008, 0.03), gain: 0.5, send: 0.4, pan: rrange(-0.2, 0.2) });
    }
  },
  lampClick() {
    A.click({ f: 1800, gain: 0.3, dur: 0.02, q: 3 });
    A.modal(560, [[1, 0.14, 0.11], [3.1, 0.06, 0.05]], { gain: 0.6, send: 0.3 });
    A.thud({ f0: 130, f1: 60, gain: 0.2, dur: 0.1, click: 0 });
  },
  powerDown() {
    A.air({ dur: 1.1, f0: 3000, f1: 60, gain: 0.11, q: 1.1, send: 0.6 });
    A.thud({ f0: 90, f1: 26, gain: 0.5, dur: 1.2, click: 0.14 });
    A.sidechain(0.6, 0.9);
  },
  powerUp() {
    A.air({ dur: 0.8, f0: 90, f1: 3400, gain: 0.09, q: 1.1, send: 0.5 });
    A.modal(180, [[1, 0.1, 0.9], [2, 0.06, 0.6], [3, 0.03, 0.4]], { gain: 0.5, send: 0.5 });
  },
  bigImpact(power = 1) {
    A.thud({ f0: 180 * power, f1: 30, gain: 0.72, dur: 0.7, click: 0.3 });
    A.air({ dur: 0.5, f0: 900, f1: 90, gain: 0.14, q: 0.6, send: 0.7 });
    A.sidechain(0.55, 0.6);
  },
  reveal() {
    const base = 196;
    [1, 1.5, 2, 3].forEach((r, i) => {
      A.modal(base * r, [[1, 0.05, 2.2 - i * 0.3], [2, 0.02, 1.4]],
        { t: now() + i * 0.075, gain: 0.5, send: 0.75 });
    });
  },
};

export default Audio;
