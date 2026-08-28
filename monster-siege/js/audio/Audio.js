// Monster Siege - audio.
//
// Every sound in this file is SYNTHESISED in WebAudio at runtime. There are
// no .wav/.mp3 assets and no fetches: the game ships as static files with no
// asset pipeline, and the deploy target's CSP blocks external media anyway.
// A synth-only bank also costs zero bytes and zero load time, which matters
// more than sample fidelity for a game whose art is 4px-per-unit pixel art.
//
// Three things separate this from a beeper, and all three are structural
// rather than cosmetic:
//
//  1. NOTHING PLAYS TWICE THE SAME. Every voice gets a randomised pitch
//     (a few percent), a randomised detune, a small level jitter and a
//     little stereo spread. A Sporeling fires 1.6 times a second for a whole
//     wave; an identical click at that rate is the single fastest way to
//     make a player reach for the mute button.
//  2. VOICE LIMITING. By wave 20 there are hundreds of shots and hits in
//     flight. Each sound name has a concurrency cap and a minimum retrigger
//     gap; over the cap the oldest voice is stolen with a 20ms fade (a hard
//     disconnect would click), and per-voice gain is scaled down as the
//     stack deepens so a stampede gets denser, not louder. The master bus
//     ends in a compressor plus a soft-clip shaper whose curve saturates at
//     ~0.9, so the output physically cannot pin at 0 dBFS.
//  3. ENVELOPES, NOT RAW OSCILLATORS. Every voice has a real attack/decay.
//     Gain ramps start from a small non-zero value because
//     exponentialRampToValueAtTime can neither start from nor reach 0.
//
// All timing is scheduled against ctx.currentTime. The music sequencer uses
// a 25ms lookahead timer, but that timer only *schedules* - every note lands
// on a precomputed AudioContext timestamp, so nothing jitters when the frame
// rate dips (the standard "two clocks" pattern).
(function (global) {
  'use strict';

  // exponentialRampToValueAtTime(0) is a no-op/throw depending on browser;
  // every "silence" target in this file is this epsilon instead.
  var EPS = 0.0001;
  var SR_HINT = 48000;

  // ------------------------------------------------------------------
  // small utilities
  // ------------------------------------------------------------------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // Deterministic PRNG so the offline measurement harness renders the exact
  // same signal twice; Math.random would make peak/RMS numbers unrepeatable.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rr(rnd, a, b) { return a + rnd() * (b - a); }
  function pick(rnd, arr) { return arr[(rnd() * arr.length) | 0]; }

  // One 2s white-noise buffer per context, reused by every noise voice. A
  // fresh buffer per shot would allocate ~400KB per Sporeling burst.
  var _noiseCache = new WeakMap();
  function noiseBuffer(ctx) {
    var b = _noiseCache.get(ctx);
    if (b) return b;
    var len = Math.floor(ctx.sampleRate * 2);
    b = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = b.getChannelData(0);
    var rnd = mulberry32(0x9E3779B9);
    for (var i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
    _noiseCache.set(ctx, b);
    return b;
  }

  // Master safety curve: perfectly linear below 0.6, tanh-saturating above,
  // asymptote 0.9046. Anything the compressor's 3ms attack lets through gets
  // rounded off instead of squaring off into a click.
  var _curve = null;
  function softClipCurve() {
    if (_curve) return _curve;
    var n = 2048, c = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      var a = Math.abs(x);
      var y = a <= 0.6 ? a : 0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4);
      c[i] = (x < 0 ? -1 : 1) * y;
    }
    _curve = c;
    return c;
  }

  // ------------------------------------------------------------------
  // envelope + primitive voices
  // ------------------------------------------------------------------
  // attack is linear (from EPS, so no click and no exp-from-zero), decay is
  // exponential because that is what a struck/plucked body actually does -
  // a linear decay reads as synthetic at these short lengths.
  function adsr(ctx, t0, o) {
    var attack = o.attack != null ? o.attack : 0.005;
    var hold = o.hold || 0;
    var decay = o.decay != null ? o.decay : 0.2;
    var peak = Math.max(EPS * 10, o.peak != null ? o.peak : 0.25);
    var g = ctx.createGain();
    g.gain.setValueAtTime(EPS, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    if (hold > 0) g.gain.setValueAtTime(peak, t0 + attack + hold);
    var end = t0 + attack + hold + decay;
    g.gain.exponentialRampToValueAtTime(EPS, end);
    g.gain.setValueAtTime(0, end + 0.001);
    return { node: g, end: end + 0.002 };
  }

  function addFilter(ctx, node, t0, o, dur) {
    if (!o.filter) return node;
    var bq = ctx.createBiquadFilter();
    bq.type = o.filter;
    bq.frequency.setValueAtTime(Math.max(20, o.ff0), t0);
    if (o.ff1 != null) {
      bq.frequency.exponentialRampToValueAtTime(Math.max(20, o.ff1), t0 + (o.fglide != null ? o.fglide : dur));
    }
    if (o.q != null) bq.Q.setValueAtTime(o.q, t0);
    node.connect(bq);
    return bq;
  }

  // A single pitched voice: osc -> [filter] -> envelope -> out.
  function oscVoice(ctx, out, o) {
    var t0 = o.t0;
    var osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(1, o.f0), t0);
    var dur = (o.attack || 0.005) + (o.hold || 0) + (o.decay != null ? o.decay : 0.2);
    if (o.f1 != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + (o.glide != null ? o.glide : dur));
    }
    if (o.detune) osc.detune.setValueAtTime(o.detune, t0);
    var node = addFilter(ctx, osc, t0, o, dur);
    var env = adsr(ctx, t0, o);
    node.connect(env.node);
    env.node.connect(out);
    osc.start(t0);
    osc.stop(env.end + 0.02);
    // Optional vibrato/tremolo LFO, used by the alarm and the gacha charge.
    if (o.lfoRate) {
      var lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(o.lfoRate, t0);
      if (o.lfoRate1) lfo.frequency.exponentialRampToValueAtTime(o.lfoRate1, t0 + dur);
      var lg = ctx.createGain();
      lg.gain.setValueAtTime(o.lfoDepth || 20, t0);
      lfo.connect(lg);
      lg.connect(o.lfoTarget === 'gain' ? env.node.gain : osc.detune);
      lfo.start(t0);
      lfo.stop(env.end + 0.02);
    }
    return env.end;
  }

  // A single noise voice: looping white noise -> [filter] -> envelope -> out.
  // The buffer is started at a random offset so two consecutive bursts are
  // not literally the same slice of noise.
  function noiseVoice(ctx, out, o) {
    var t0 = o.t0;
    var dur = (o.attack || 0.003) + (o.hold || 0) + (o.decay != null ? o.decay : 0.1);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    if (o.rate) src.playbackRate.setValueAtTime(o.rate, t0);
    var node = addFilter(ctx, src, t0, o, dur);
    var env = adsr(ctx, t0, o);
    node.connect(env.node);
    env.node.connect(out);
    src.start(t0, (o.offset != null ? o.offset : 0));
    src.stop(env.end + 0.02);
    return env.end;
  }

  function later(a, b) { return b > a ? b : a; }

  // ------------------------------------------------------------------
  // the sound bank
  //
  // Each entry:
  //   trim     output calibration (see the note in SfxPlayer.play)
  //   cap      max simultaneous voices of this name
  //   gap      minimum seconds between two starts (drops the extras)
  //   pri      steal priority when the global voice budget is exhausted
  //   dur      nominal length, used for voice bookkeeping / offline render
  //   build(ctx, out, t0, rnd, opts) -> end time
  // ------------------------------------------------------------------
  var SFX = {};

  function def(name, o) { SFX[name] = o; }

  // --- towers ---------------------------------------------------------
  // Woody thunk plus a rising two-note figure: the "yes, that landed" sound.
  def('tower_placed', {
    trim: 1.45, cap: 3, gap: 0.05, pri: 3, dur: 0.5,
    build: function (ctx, out, t0, rnd) {
      var p = rr(rnd, 0.97, 1.03);
      var e = oscVoice(ctx, out, { t0: t0, type: 'sine', f0: 160 * p, f1: 104 * p, glide: 0.12, attack: 0.004, decay: 0.17, peak: 0.30 });
      e = later(e, noiseVoice(ctx, out, { t0: t0, filter: 'lowpass', ff0: 2600, ff1: 700, q: 0.9, attack: 0.002, decay: 0.045, peak: 0.11, offset: rr(rnd, 0, 1.5) }));
      e = later(e, oscVoice(ctx, out, { t0: t0 + 0.005, type: 'triangle', f0: 523.25 * p, detune: rr(rnd, -8, 8), attack: 0.005, decay: 0.13, peak: 0.15 }));
      e = later(e, oscVoice(ctx, out, { t0: t0 + 0.085, type: 'triangle', f0: 783.99 * p, detune: rr(rnd, -8, 8), attack: 0.005, decay: 0.20, peak: 0.13 }));
      return e;
    }
  });

  // Falling minor third with a small coin shimmer - a refund, not a failure.
  def('tower_sold', {
    trim: 1.65, cap: 3, gap: 0.05, pri: 3, dur: 0.45,
    build: function (ctx, out, t0, rnd) {
      var p = rr(rnd, 0.98, 1.02);
      var e = oscVoice(ctx, out, { t0: t0, type: 'triangle', f0: 698.46 * p, attack: 0.004, decay: 0.11, peak: 0.13 });
      e = later(e, oscVoice(ctx, out, { t0: t0 + 0.085, type: 'triangle', f0: 466.16 * p, attack: 0.004, decay: 0.20, peak: 0.12 }));
      e = later(e, oscVoice(ctx, out, { t0: t0, type: 'sine', f0: 130 * p, f1: 96 * p, attack: 0.004, decay: 0.12, peak: 0.14 }));
      e = later(e, noiseVoice(ctx, out, { t0: t0 + 0.02, filter: 'bandpass', ff0: 3400, ff1: 5200, q: 2.5, attack: 0.004, decay: 0.14, peak: 0.045, offset: rr(rnd, 0, 1.5) }));
      return e;
    }
  });

  // Deliberately NOT a buzzer. A muffled, lowpassed double-thud that slides
  // down a little: reads as "no" without any high-frequency bite, so a player
  // who spams a blocked cell ten times is not punished for it.
  def('place_invalid', {
    trim: 1.35, cap: 2, gap: 0.09, pri: 3, dur: 0.4,
    build: function (ctx, out, t0, rnd) {
      var p = rr(rnd, 0.97, 1.03);
      var e = oscVoice(ctx, out, { t0: t0, type: 'triangle', f0: 208 * p, f1: 156 * p, glide: 0.16, filter: 'lowpass', ff0: 620, ff1: 330, q: 0.8, attack: 0.012, decay: 0.20, peak: 0.24 });
      e = later(e, oscVoice(ctx, out, { t0: t0 + 0.004, type: 'triangle', f0: 204 * p, f1: 152 * p, glide: 0.16, filter: 'lowpass', ff0: 600, q: 0.8, attack: 0.012, decay: 0.18, peak: 0.16 }));
      e = later(e, noiseVoice(ctx, out, { t0: t0, filter: 'lowpass', ff0: 420, ff1: 200, attack: 0.006, decay: 0.10, peak: 0.10, offset: rr(rnd, 0, 1.5) }));
      return e;
    }
  });

  // --- tower fire -----------------------------------------------------
  // Sporeling: a light, quick spit. ~100ms, quiet, bandpassed noise chirp
  // over a tiny pitched pop. Wide pitch randomisation (+/-9%) because this is
  // the single most-repeated sound in the game.
  def('fire_light', {
    trim: 3.3, cap: 6, gap: 0.028, pri: 1, dur: 0.14,
    build: function (ctx, out, t0, rnd) {
      var p = rr(rnd, 0.91, 1.09);
      var e = noiseVoice(ctx, out, { t0: t0, filter: 'bandpass', ff0: 2300 * p, ff1: 900 * p, fglide: 0.055, q: rr(rnd, 2.4, 4.0), attack: 0.002, decay: 0.055, peak: 0.17, offset: rr(rnd, 0, 1.5), rate: rr(rnd, 0.85, 1.2) });
      e = later(e, oscVoice(ctx, out, { t0: t0, type: 'sine', f0: 540 * p, f1: 320 * p, glide: 0.045, attack: 0.002, decay: 0.045, peak: 0.10 }));
      return e;
    }
  });

  // Coilfang: heavier, slower venom shot. Saw body dropping an octave and a
  // half through a closing lowpass, a wet noise "shhk", and a sub thump.
  def('fire_heavy', {
    trim: 1.5, cap: 4, gap: 0.05, pri: 2, dur: 0.36,
    build: function (ctx, out, t0, rnd) {
      var p = rr(rnd, 0.93, 1.07);
      var e = oscVoice(ctx, out, { t0: t0, type: 'sawtooth', f0: 270 * p, f1: 86 * p, glide: 0.17, detune: rr(rnd, -14, 14), filter: 'lowpass', ff0: 1500, ff1: 380, fglide: 0.19, q: 4.5, attack: 0.006, decay: 0.20, peak: 0.24 });
      e = later(e, noiseVoice(ctx, out, { t0: t0, filter: 'bandpass', ff0: 950 * p, ff1: 260 * p, fglide: 0.2, q: 1.4, attack: 0.004, decay: 0.20, peak: 0.13, offset: rr(rnd, 0, 1.5), rate: rr(rnd, 0.9, 1.1) }));
      e = later(e, oscVoice(ctx, out, { t0: t0, type: 'sine', f0: 74 * p, attack: 0.005, decay: 0.19, peak: 0.13 }));
      return e;
    }
  });

  // --- combat feedback ------------------------------------------------
  // Enemy hit: a 60ms tick. Three timbre variants and a never-repeat rule so
  // a stream of hits reads as texture rather than a stuck key.
  def('enemy_hit', {
    trim: 3.8, cap: 8, gap: 0.022, pri: 0, dur: 0.1,
    build: function (ctx, out, t0, rnd, opts) {
      var centers = [900, 1350, 1950];
      var idx = opts && opts._variant != null ? opts._variant : (rnd() * 3) | 0;
      var c = centers[idx] * rr(rnd, 0.9, 1.1);
      var e = noiseVoice(ctx, out, { t0: t0, filter: 'bandpass', ff0: c, ff1: c * 0.55, fglide: 0.05, q: rr(rnd, 4, 7), attack: 0.002, decay: 0.05, peak: 0.14, offset: rr(rnd, 0, 1.5) });
      e = later(e, oscVoice(ctx, out, { t0: t0, type: 'sine', f0: rr(rnd, 280, 330), f1: 200, glide: 0.05, attack: 0.002, decay: 0.055, peak: 0.075 }));
      return e;
    }
  });

  // Enemy killed: downward chirp + puff + one bright sparkle (the bounty).
  def('enemy_killed', {
    trim: 2.3, cap: 6, gap: 0.03, pri: 1, dur: 0.28,
    build: function (ctx, out, t0, rnd) {
      var p = rr(rnd, 0.92, 1.08);
      var e = oscVoice(ctx, out, { t0: t0, type: 'sine', f0: 640 * p, f1: 230 * p, glide: 0.1, attack: 0.003, decay: 0.11, peak: 0.17 });
      e = later(e, noiseVoice(ctx, out, { t0: t0, filter: 'lowpass', ff0: 2000, ff1: 600, q: 1, attack: 0.003, decay: 0.09, peak: 0.11, offset: rr(rnd, 0, 1.5) }));
      e = later(e, oscVoice(ctx, out, { t0: t0 + 0.035, type: 'triangle', f0: 932 * p, attack: 0.003, decay: 0.13, peak: 0.06 }));
      return e;
    }
  });

  // Elder Ramhorn down: the boom gets a low sine drop, a wide noise collapse,
  // a transient crack, and a small consonant chime so it feels earned.
  def('big_enemy_killed', {
    trim: 1.55, cap: 3, gap: 0.06, pri: 4, dur: 0.9,
    build: function (ctx, out, t0, rnd) {
      var p = rr(rnd, 0.95, 1.05);
      var e = oscVoice(ctx, out, { t0: t0, type: 'sine', f0: 118 * p, f1: 41 * p, glide: 0.4, attack: 0.005, decay: 0.45, peak: 0.34 });
      e = later(e, noiseVoice(ctx, out, { t0: t0, filter: 'lowpass', ff0: 2200, ff1: 190, fglide: 0.35, q: 1.2, attack: 0.004, decay: 0.40, peak: 0.16, offset: rr(rnd, 0, 1.5) }));
      e = later(e, noiseVoice(ctx, out, { t0: t0, filter: 'bandpass', ff0: 2700, q: 1.5, attack: 0.001, decay: 0.03, peak: 0.12, offset: rr(rnd, 0, 1.5) }));
      e = later(e, oscVoice(ctx, out, { t0: t0 + 0.06, type: 'triangle', f0: 392 * p, attack: 0.008, decay: 0.5, peak: 0.10 }));
      e = later(e, oscVoice(ctx, out, { t0: t0 + 0.06, type: 'triangle', f0: 587.33 * p, detune: rr(rnd, -6, 6), attack: 0.008, decay: 0.55, peak: 0.085 }));
      return e;
    }
  });

  // --- stakes ---------------------------------------------------------
  // The one alarming sound in the game: a beating pair of lowpassed saws a
  // semitone-ish apart, wavering, sliding down, over an impact thump. It is
  // the loudest thing in the bank on purpose - it must cut through a wave.
  def('life_lost', {
    trim: 1.25, cap: 2, gap: 0.12, pri: 6, dur: 1.0,
    build: function (ctx, out, t0, rnd) {
      var p = rr(rnd, 0.98, 1.02);
      var e = oscVoice(ctx, out, { t0: t0, type: 'sawtooth', f0: 466 * p, f1: 372 * p, glide: 0.6, filter: 'lowpass', ff0: 1700, ff1: 800, fglide: 0.55, q: 2, attack: 0.012, hold: 0.1, decay: 0.45, peak: 0.20, lfoRate: 6.5, lfoDepth: 22 });
      e = later(e, oscVoice(ctx, out, { t0: t0, type: 'sawtooth', f0: 440 * p, f1: 352 * p, glide: 0.6, filter: 'lowpass', ff0: 1500, ff1: 700, q: 2, attack: 0.012, hold: 0.1, decay: 0.42, peak: 0.16, lfoRate: 7.4, lfoDepth: 18 }));
      e = later(e, oscVoice(ctx, out, { t0: t0, type: 'sine', f0: 150, f1: 58, glide: 0.22, attack: 0.004, decay: 0.28, peak: 0.30 }));
      e = later(e, noiseVoice(ctx, out, { t0: t0, filter: 'lowpass', ff0: 1300, ff1: 400, q: 1, attack: 0.003, decay: 0.14, peak: 0.12, offset: rr(rnd, 0, 1.5) }));
      return e;
    }
  });

  // Game over: a long collapse. Three triangles slide down a tritone through
  // a closing filter over ~1.6s, on a tom hit and a noise wash.
  def('game_over', {
    trim: 1.1, cap: 1, gap: 0.5, pri: 9, dur: 2.4,
    build: function (ctx, out, t0, rnd) {
      var roots = [329.63, 261.63, 196.00];
      var e = t0;
      for (var i = 0; i < roots.length; i++) {
        e = later(e, oscVoice(ctx, out, {
          t0: t0 + i * 0.05, type: 'triangle', f0: roots[i], f1: roots[i] * 0.59, glide: 1.5,
          filter: 'lowpass', ff0: 1100, ff1: 300, fglide: 1.6, q: 1.2,
          attack: 0.03, hold: 0.15, decay: 1.5, peak: 0.145 - i * 0.012, detune: rr(rnd, -10, 10)
        }));
      }
      e = later(e, oscVoice(ctx, out, { t0: t0, type: 'sine', f0: 128, f1: 42, glide: 0.5, attack: 0.005, decay: 0.55, peak: 0.30 }));
      e = later(e, noiseVoice(ctx, out, { t0: t0, filter: 'lowpass', ff0: 900, ff1: 180, fglide: 1.7, q: 0.8, attack: 0.05, decay: 1.7, peak: 0.07, offset: rr(rnd, 0, 1.5) }));
      return e;
    }
  });

  // --- wave flow ------------------------------------------------------
  // Wave start: a two-note horn call up a fifth, saw+triangle stack through
  // a swelling lowpass, on a soft drum. Announcement, not fanfare.
  def('wave_start', {
    trim: 1.0, cap: 2, gap: 0.2, pri: 7, dur: 1.1,
    build: function (ctx, out, t0, rnd) {
      var e = t0;
      function horn(at, f, dur, peak) {
        e = later(e, oscVoice(ctx, out, { t0: at, type: 'sawtooth', f0: f, detune: rr(rnd, -8, 8), filter: 'lowpass', ff0: 700, ff1: 2400, fglide: 0.12, q: 2.5, attack: 0.03, hold: dur * 0.45, decay: dur * 0.6, peak: peak }));
        e = later(e, oscVoice(ctx, out, { t0: at, type: 'triangle', f0: f * 2, detune: rr(rnd, -8, 8), attack: 0.035, hold: dur * 0.4, decay: dur * 0.5, peak: peak * 0.42 }));
        e = later(e, oscVoice(ctx, out, { t0: at, type: 'triangle', f0: f * 1.5, attack: 0.04, hold: dur * 0.35, decay: dur * 0.5, peak: peak * 0.30 }));
      }
      horn(t0, 293.66, 0.26, 0.15);
      horn(t0 + 0.27, 440.00, 0.60, 0.17);
      e = later(e, oscVoice(ctx, out, { t0: t0, type: 'sine', f0: 98, f1: 52, glide: 0.2, attack: 0.004, decay: 0.24, peak: 0.26 }));
      e = later(e, noiseVoice(ctx, out, { t0: t0 + 0.27, filter: 'bandpass', ff0: 3000, ff1: 6000, q: 1.5, attack: 0.01, decay: 0.25, peak: 0.05, offset: rr(rnd, 0, 1.5) }));
      return e;
    }
  });

  // Wave cleared: rising major arpeggio with a warm root underneath. Short
  // enough that it never delays the next build phase.
  def('wave_cleared', {
    trim: 1.3, cap: 2, gap: 0.2, pri: 7, dur: 1.3,
    build: function (ctx, out, t0, rnd) {
      var notes = [523.25, 659.25, 783.99, 1046.5];
      var e = t0;
      for (var i = 0; i < notes.length; i++) {
        var at = t0 + i * 0.085;
        e = later(e, oscVoice(ctx, out, { t0: at, type: 'triangle', f0: notes[i], detune: rr(rnd, -6, 6), attack: 0.005, decay: 0.45 + i * 0.09, peak: 0.135 - i * 0.012 }));
        e = later(e, oscVoice(ctx, out, { t0: at, type: 'sine', f0: notes[i] * 2, attack: 0.005, decay: 0.22, peak: 0.035 }));
      }
      e = later(e, oscVoice(ctx, out, { t0: t0, type: 'triangle', f0: 130.81, filter: 'lowpass', ff0: 900, q: 1, attack: 0.05, hold: 0.2, decay: 0.7, peak: 0.11 }));
      e = later(e, noiseVoice(ctx, out, { t0: t0 + 0.26, filter: 'highpass', ff0: 4500, q: 0.7, attack: 0.02, decay: 0.45, peak: 0.04, offset: rr(rnd, 0, 1.5) }));
      return e;
    }
  });

  // --- UI -------------------------------------------------------------
  // Dry, tiny, 70ms. Two partials so it has a body instead of being a beep.
  def('ui_click', {
    trim: 2.2, cap: 4, gap: 0.02, pri: 2, dur: 0.12,
    build: function (ctx, out, t0, rnd) {
      var p = rr(rnd, 0.94, 1.06);
      var e = oscVoice(ctx, out, { t0: t0, type: 'triangle', f0: 880 * p, attack: 0.002, decay: 0.055, peak: 0.115 });
      e = later(e, oscVoice(ctx, out, { t0: t0, type: 'sine', f0: 2100 * p, attack: 0.001, decay: 0.028, peak: 0.045 }));
      e = later(e, noiseVoice(ctx, out, { t0: t0, filter: 'highpass', ff0: 2500, q: 0.7, attack: 0.001, decay: 0.02, peak: 0.05, offset: rr(rnd, 0, 1.5) }));
      return e;
    }
  });

  // Panel open: an upward noise whoosh plus a soft chord bloom.
  def('ui_panel', {
    trim: 1.6, cap: 2, gap: 0.06, pri: 3, dur: 0.55,
    build: function (ctx, out, t0, rnd) {
      var e = noiseVoice(ctx, out, { t0: t0, filter: 'bandpass', ff0: 420, ff1: 3200, fglide: 0.24, q: 1.1, attack: 0.03, decay: 0.24, peak: 0.09, offset: rr(rnd, 0, 1.5) });
      var ch = [329.63, 440, 554.37];
      for (var i = 0; i < ch.length; i++) {
        e = later(e, oscVoice(ctx, out, { t0: t0 + i * 0.02, type: 'triangle', f0: ch[i], detune: rr(rnd, -7, 7), filter: 'lowpass', ff0: 1800, q: 0.9, attack: 0.05, decay: 0.32, peak: 0.055 }));
      }
      return e;
    }
  });

  // --- gacha ----------------------------------------------------------
  // Build-up: a saw rising two and a half octaves through an opening filter,
  // tremolo accelerating from 4Hz to 20Hz, with a noise riser on top. Ends
  // hanging, so silence -> reveal lands hard.
  def('gacha_charge', {
    trim: 0.5, cap: 1, gap: 0.3, pri: 8, dur: 1.9,
    build: function (ctx, out, t0, rnd, opts) {
      var len = (opts && opts.duration) ? clamp(opts.duration, 0.6, 4) : 1.55;
      var e = oscVoice(ctx, out, {
        t0: t0, type: 'sawtooth', f0: 110, f1: 660, glide: len,
        filter: 'lowpass', ff0: 420, ff1: 4200, fglide: len, q: 6,
        attack: 0.25, hold: len - 0.25, decay: 0.12, peak: 0.17,
        lfoRate: 4, lfoRate1: 20, lfoDepth: 45
      });
      e = later(e, oscVoice(ctx, out, { t0: t0, type: 'sawtooth', f0: 110 * 1.005, f1: 660 * 1.005, glide: len, filter: 'lowpass', ff0: 400, ff1: 3600, fglide: len, q: 5, attack: 0.3, hold: len - 0.3, decay: 0.12, peak: 0.11 }));
      e = later(e, noiseVoice(ctx, out, { t0: t0, filter: 'bandpass', ff0: 600, ff1: 5200, fglide: len, q: 2.2, attack: 0.35, hold: len - 0.35, decay: 0.1, peak: 0.10, offset: rr(rnd, 0, 1.5) }));
      e = later(e, oscVoice(ctx, out, { t0: t0, type: 'sine', f0: 55, attack: 0.4, hold: len - 0.4, decay: 0.15, peak: 0.12 }));
      return e;
    }
  });

  // Payoff: an inharmonic bell stack over a sub thump, with a shimmer tail.
  // opts.rarity (0..1) adds a higher partial and lifts the tail - the same
  // sound "upgrades" rather than being a different cue for rare pulls.
  def('gacha_reveal', {
    trim: 1.55, cap: 2, gap: 0.15, pri: 8, dur: 1.8,
    build: function (ctx, out, t0, rnd, opts) {
      var rarity = clamp((opts && opts.rarity) || 0, 0, 1);
      var base = 659.25 * rr(rnd, 0.995, 1.005);
      var parts = [[1, 0.13, 1.3], [1.5, 0.095, 1.1], [2.0, 0.07, 0.9], [3.0, 0.04, 0.7]];
      if (rarity > 0.5) parts.push([4.5, 0.03 * rarity, 1.4]);
      var e = t0;
      for (var i = 0; i < parts.length; i++) {
        e = later(e, oscVoice(ctx, out, {
          t0: t0 + i * 0.012, type: i < 2 ? 'triangle' : 'sine', f0: base * parts[i][0],
          detune: rr(rnd, -5, 5), attack: 0.006, decay: parts[i][2] * (1 + rarity * 0.3), peak: parts[i][1]
        }));
      }
      e = later(e, oscVoice(ctx, out, { t0: t0, type: 'sine', f0: 88, f1: 62, glide: 0.3, attack: 0.005, decay: 0.35, peak: 0.28 }));
      e = later(e, oscVoice(ctx, out, { t0: t0 + 0.02, type: 'triangle', f0: base * 0.5, attack: 0.02, decay: 0.9, peak: 0.07 }));
      e = later(e, noiseVoice(ctx, out, { t0: t0 + 0.02, filter: 'highpass', ff0: 5000, q: 0.7, attack: 0.03, decay: 0.7 + rarity * 0.5, peak: 0.045, offset: rr(rnd, 0, 1.5) }));
      return e;
    }
  });

  // ------------------------------------------------------------------
  // SfxPlayer - owns one AudioContext's worth of buses and voice state.
  // Split out from the singleton so the offline measurement path renders
  // through the exact same graph and the exact same voice limiter as the
  // live game does.
  // ------------------------------------------------------------------
  var GLOBAL_VOICE_CAP = 40;

  function SfxPlayer(ctx, destination, seed) {
    this.ctx = ctx;
    this.rnd = mulberry32(seed == null ? 0x5EED : seed);
    this.voices = new Map();   // name -> [{ end, gain, pri }]
    this.lastStart = new Map();
    this.lastVariant = new Map();
    this.activeCount = 0;
    this.canPan = typeof ctx.createStereoPanner === 'function';

    var master = ctx.createGain();
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-11, 0);
    comp.knee.setValueAtTime(9, 0);
    comp.ratio.setValueAtTime(7, 0);
    comp.attack.setValueAtTime(0.003, 0);
    comp.release.setValueAtTime(0.22, 0);
    var shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve();
    shaper.oversample = '2x';
    var sfx = ctx.createGain();
    var music = ctx.createGain();

    sfx.connect(master);
    music.connect(master);
    master.connect(comp);
    comp.connect(shaper);
    shaper.connect(destination);

    this.master = master;
    this.sfxBus = sfx;
    this.musicBus = music;
    this.comp = comp;
  }

  SfxPlayer.prototype._prune = function (name, when) {
    var list = this.voices.get(name);
    if (!list) { list = []; this.voices.set(name, list); }
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].end <= when) { list.splice(i, 1); this.activeCount--; }
    }
    return list;
  };

  // Steal = 20ms fade to silence then let the nodes die naturally. Yanking
  // disconnect() mid-waveform is an audible click, which is the exact thing
  // voice limiting is supposed to prevent.
  SfxPlayer.prototype._steal = function (list, when) {
    var v = list.shift();
    if (!v) return;
    this.activeCount--;
    try {
      v.gain.gain.cancelScheduledValues(when);
      v.gain.gain.setValueAtTime(Math.max(EPS, v.gain.gain.value), when);
      v.gain.gain.exponentialRampToValueAtTime(EPS, when + 0.02);
      v.gain.gain.setValueAtTime(0, when + 0.021);
    } catch (err) { /* node already finished */ }
  };

  SfxPlayer.prototype.play = function (name, opts) {
    opts = opts || {};
    var d = SFX[name];
    if (!d) return null;
    var ctx = this.ctx;
    var now = ctx.currentTime;
    var when = opts.when != null ? Math.max(opts.when, now) : now + 0.002;
    if (opts.delay) when += opts.delay;

    // rate limit: a stampede of identical events becomes one dense texture
    // instead of N phase-locked copies (which sum to +N dB and comb-filter).
    var last = this.lastStart.get(name);
    if (last != null && when - last < d.gap) return null;

    var list = this._prune(name, when);
    if (list.length >= d.cap) this._steal(list, when);
    if (this.activeCount >= GLOBAL_VOICE_CAP) {
      // budget exhausted: only high-priority cues get in, and they take the
      // slot from the oldest voice of their own name.
      if (d.pri < 4) return null;
      if (list.length) this._steal(list, when);
    }

    // depth ducking: each extra concurrent voice of this name is quieter, so
    // eight overlapping hits are ~2.4x one hit, not 8x.
    var depth = list.length;
    var duck = 1 / Math.sqrt(1 + depth * 0.75);
    // `trim` is the per-sound output calibration: envelope peaks are pre-filter,
    // and a narrow bandpass on white noise loses ~10dB, so the authored numbers
    // do not predict loudness. These are tuned against measured post-chain peaks
    // (see measure.js) so the whole bank sits in one coherent loudness range.
    var level = (opts.volume != null ? opts.volume : 1) * duck * (d.trim || 1) * rr(this.rnd, 0.92, 1.0);

    var vg = ctx.createGain();
    vg.gain.setValueAtTime(level, when);
    var tail = vg;
    var pan = opts.pan;
    if (pan == null && d.pri <= 2) pan = rr(this.rnd, -0.32, 0.32); // shots/hits spread out
    if (this.canPan && pan) {
      var p = ctx.createStereoPanner();
      p.pan.setValueAtTime(clamp(pan, -1, 1), when);
      vg.connect(p);
      tail = p;
    }
    tail.connect(this.sfxBus);

    // never play the same timbre variant twice in a row
    if (name === 'enemy_hit') {
      var prev = this.lastVariant.get(name);
      var v = (this.rnd() * 3) | 0;
      if (v === prev) v = (v + 1 + ((this.rnd() * 2) | 0)) % 3;
      this.lastVariant.set(name, v);
      opts = Object.assign({}, opts, { _variant: v });
    }

    var end;
    try {
      end = d.build(ctx, vg, when, this.rnd, opts);
    } catch (err) {
      if (global.console) console.warn('[GameAudio] failed to build "' + name + '"', err);
      return null;
    }
    if (!(end > when)) end = when + d.dur;

    list.push({ end: end, gain: vg, pri: d.pri });
    this.activeCount++;
    this.lastStart.set(name, when);
    return end;
  };

  // ------------------------------------------------------------------
  // Music - a generative bed, not a loop.
  //
  // Why generative rather than a written loop: a fixed loop is the thing that
  // gets annoying inside five minutes, and a tower defense session runs 20+
  // minutes on one screen. Here the harmony walks an 8-bar A/B pair, the
  // voicing of each pad chord is re-rolled every bar, and the melody notes
  // are drawn from a pentatonic set by probability - so the *character* is
  // constant and the *surface* never repeats.
  //
  // Intensity (0..1) drives layer count, note density and the bus filter, so
  // the same material settles between waves and lifts during one.
  // ------------------------------------------------------------------
  var A_SECTION = [
    { root: 220.00, chord: [0, 3, 7, 12] },   // Am
    { root: 174.61, chord: [0, 4, 7, 11] },   // Fmaj7
    { root: 261.63, chord: [0, 4, 7, 11] },   // Cmaj7
    { root: 196.00, chord: [0, 4, 7, 10] }    // G7
  ];
  var B_SECTION = [
    { root: 220.00, chord: [0, 3, 7, 10] },   // Am7
    { root: 146.83, chord: [0, 3, 7, 10] },   // Dm7
    { root: 196.00, chord: [0, 4, 7, 14] },   // Gadd9
    { root: 164.81, chord: [0, 3, 7, 10] }    // Em7
  ];
  var PENTA = [0, 3, 5, 7, 10, 12, 15];

  function semi(f, n) { return f * Math.pow(2, n / 12); }

  function MusicEngine(ctx, dest, seed) {
    this.ctx = ctx;
    this.rnd = mulberry32(seed == null ? 0xC0FFEE : seed);
    this.bpm = 82;
    this.stepDur = 60 / this.bpm / 2;   // eighth notes
    this.step = 0;
    this.nextStepTime = 0;
    this.running = false;
    this.intensity = 0;
    this.target = 0;
    this.lastMelody = -1;

    var bus = ctx.createGain();
    bus.gain.setValueAtTime(1, 0);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(800, 0);
    lp.Q.setValueAtTime(0.6, 0);
    bus.connect(lp);
    lp.connect(dest);
    this.bus = bus;
    this.lp = lp;
    this.timer = null;
  }

  MusicEngine.prototype.start = function (at) {
    if (this.running) return;
    this.running = true;
    this.nextStepTime = (at != null ? at : this.ctx.currentTime) + 0.08;
    var self = this;
    // Lookahead scheduler: this timer only decides *what* to queue; every
    // note it queues is stamped with an exact AudioContext time, so a stalled
    // main thread delays scheduling, never playback.
    this.timer = setInterval(function () { self.scheduleUntil(self.ctx.currentTime + 0.35); }, 25);
    this.scheduleUntil(this.ctx.currentTime + 0.35);
  };

  MusicEngine.prototype.stop = function (fade) {
    if (!this.running) return;
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    var t = this.ctx.currentTime;
    var f = fade == null ? 0.8 : fade;
    try {
      this.bus.gain.cancelScheduledValues(t);
      this.bus.gain.setValueAtTime(Math.max(EPS, this.bus.gain.value), t);
      this.bus.gain.exponentialRampToValueAtTime(EPS, t + f);
    } catch (err) { /* ignore */ }
  };

  MusicEngine.prototype.setIntensity = function (v) { this.target = clamp(v, 0, 1); };

  MusicEngine.prototype.scheduleUntil = function (until) {
    var guard = 0;
    while (this.nextStepTime < until && guard++ < 512) {
      this.emitStep(this.step, this.nextStepTime);
      this.step++;
      this.nextStepTime += this.stepDur;
    }
  };

  MusicEngine.prototype.emitStep = function (step, t) {
    var ctx = this.ctx, rnd = this.rnd, out = this.bus;
    // intensity glides ~0.6/s toward target, so a wave start lifts the bed
    // over about a second instead of snapping.
    var d = this.target - this.intensity;
    var maxd = 0.6 * this.stepDur;
    this.intensity += clamp(d, -maxd, maxd);
    var I = this.intensity;

    // bus filter and level follow intensity
    try {
      this.lp.frequency.setTargetAtTime(700 + I * 4200, t, 0.4);
      this.bus.gain.setTargetAtTime(0.55 + I * 0.45, t, 0.4);
    } catch (err) { /* ignore */ }

    var inBar = step % 8;
    var bar = Math.floor(step / 8);
    var sect = (Math.floor(bar / 4) % 2 === 0) ? A_SECTION : B_SECTION;
    var h = sect[bar % 4];

    // --- pad: one long, softly-voiced chord per bar, always present -----
    if (inBar === 0) {
      var voicing = h.chord.slice();
      // re-roll the top voice each bar so the pad never settles into one shape
      voicing[voicing.length - 1] = pick(rnd, [12, 14, 15, 19]);
      for (var i = 0; i < voicing.length; i++) {
        var f = semi(h.root, voicing[i]);
        oscVoice(ctx, out, {
          t0: t, type: 'triangle', f0: f, detune: rr(rnd, -9, 9),
          filter: 'lowpass', ff0: 900 + I * 1500, q: 0.8,
          attack: 0.5, hold: this.stepDur * 8 - 0.5, decay: 1.6,
          peak: (0.05 + I * 0.02) * (i === 0 ? 1.2 : 1)
        });
        // a second, detuned copy gives the pad slow beating instead of a
        // static organ tone
        oscVoice(ctx, out, {
          t0: t, type: 'sine', f0: f, detune: rr(rnd, -14, -5),
          attack: 0.7, hold: this.stepDur * 8 - 0.7, decay: 1.4, peak: 0.028 + I * 0.012
        });
      }
    }

    // --- bass: root pulse, enters early ---------------------------------
    if (I > 0.12 && (inBar === 0 || inBar === 4 || (I > 0.5 && inBar === 6))) {
      oscVoice(ctx, out, {
        t0: t, type: 'triangle', f0: semi(h.root, -12), f1: semi(h.root, -12) * 0.98, glide: 0.3,
        filter: 'lowpass', ff0: 420, q: 1.2,
        attack: 0.012, decay: 0.42 + I * 0.1, peak: 0.11 + I * 0.06
      });
    }

    // --- pulse: a soft heartbeat kick on quarters -----------------------
    if (I > 0.3 && inBar % 2 === 0) {
      oscVoice(ctx, out, { t0: t, type: 'sine', f0: 105, f1: 46, glide: 0.09, attack: 0.004, decay: 0.16, peak: 0.10 + I * 0.10 });
    }

    // --- tick: filtered noise on offbeats, high intensity only ----------
    if (I > 0.55 && inBar % 2 === 1 && rnd() < 0.75) {
      noiseVoice(ctx, out, { t0: t, filter: 'bandpass', ff0: rr(rnd, 5200, 7200), q: 2.5, attack: 0.002, decay: 0.035, peak: 0.028 * I, offset: rr(rnd, 0, 1.5) });
    }

    // --- melody: sparse pentatonic plucks, never the same note twice -----
    var pMel = 0.06 + I * 0.30;
    if (rnd() < pMel) {
      var n = (rnd() * PENTA.length) | 0;
      if (n === this.lastMelody) n = (n + 1) % PENTA.length;
      this.lastMelody = n;
      var mf = semi(h.root, PENTA[n] + 12);
      oscVoice(ctx, out, {
        t0: t, type: 'triangle', f0: mf, detune: rr(rnd, -6, 6),
        attack: 0.006, decay: rr(rnd, 0.35, 0.7), peak: 0.045 + I * 0.03
      });
      oscVoice(ctx, out, { t0: t, type: 'sine', f0: mf * 2, attack: 0.005, decay: 0.16, peak: 0.014 + I * 0.01 });
    }
  };

  // ------------------------------------------------------------------
  // the public singleton
  // ------------------------------------------------------------------
  function GameAudioSystem() {
    this.ctx = null;
    this.player = null;
    this.music = null;
    this.ready = false;
    this.muted = false;
    this.masterVolume = 0.85;
    this.sfxVolume = 0.9;
    this.musicVolume = 0.45;
    this._gestureHooked = false;
    this._loadPrefs();
  }

  var LS = {
    master: 'ms.audio.master', sfx: 'ms.audio.sfx',
    music: 'ms.audio.music', muted: 'ms.audio.muted'
  };

  GameAudioSystem.prototype._loadPrefs = function () {
    try {
      var g = function (k, d) { var v = global.localStorage.getItem(k); return v == null ? d : parseFloat(v); };
      this.masterVolume = clamp(g(LS.master, this.masterVolume), 0, 1);
      this.sfxVolume = clamp(g(LS.sfx, this.sfxVolume), 0, 1);
      this.musicVolume = clamp(g(LS.music, this.musicVolume), 0, 1);
      this.muted = global.localStorage.getItem(LS.muted) === '1';
    } catch (err) { /* storage blocked - defaults are fine */ }
  };

  GameAudioSystem.prototype._savePrefs = function () {
    try {
      global.localStorage.setItem(LS.master, String(this.masterVolume));
      global.localStorage.setItem(LS.sfx, String(this.sfxVolume));
      global.localStorage.setItem(LS.music, String(this.musicVolume));
      global.localStorage.setItem(LS.muted, this.muted ? '1' : '0');
    } catch (err) { /* ignore */ }
  };

  // Must be called from inside a user gesture - browsers refuse to start an
  // AudioContext otherwise. Safe to call repeatedly: subsequent calls only
  // try to resume a suspended context.
  GameAudioSystem.prototype.init = function (opts) {
    opts = opts || {};
    if (this.ready) { this.resume(); return true; }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) {
      if (global.console) console.warn('[GameAudio] WebAudio unavailable; running silent.');
      return false;
    }
    try {
      this.ctx = new AC({ latencyHint: 'interactive', sampleRate: opts.sampleRate || undefined });
    } catch (err) {
      try { this.ctx = new AC(); } catch (err2) { return false; }
    }
    this.player = new SfxPlayer(this.ctx, this.ctx.destination, opts.seed);
    this.music = new MusicEngine(this.ctx, this.player.musicBus, opts.musicSeed);
    this.ready = true;
    this._applyVolumes(0);
    this.resume();
    this._hookGesture();
    if (opts.music !== false) this.startMusic();
    return true;
  };

  // Belt and braces: if init() was called somewhere the browser did not count
  // as a gesture, the context is left suspended and everything is silent with
  // no error. These one-shot listeners recover from that.
  GameAudioSystem.prototype._hookGesture = function () {
    if (this._gestureHooked || !global.addEventListener) return;
    this._gestureHooked = true;
    var self = this;
    var kick = function () {
      self.resume();
      if (self.ctx && self.ctx.state === 'running') {
        global.removeEventListener('pointerdown', kick, true);
        global.removeEventListener('keydown', kick, true);
        global.removeEventListener('touchstart', kick, true);
      }
    };
    global.addEventListener('pointerdown', kick, true);
    global.addEventListener('keydown', kick, true);
    global.addEventListener('touchstart', kick, true);
  };

  GameAudioSystem.prototype.resume = function () {
    if (this.ctx && this.ctx.state === 'suspended' && this.ctx.resume) {
      var p = this.ctx.resume();
      if (p && p.catch) p.catch(function () {});
    }
  };

  GameAudioSystem.prototype.suspend = function () {
    if (this.ctx && this.ctx.state === 'running' && this.ctx.suspend) this.ctx.suspend();
  };

  GameAudioSystem.prototype._applyVolumes = function (ramp) {
    if (!this.ready) return;
    var t = this.ctx.currentTime;
    var r = ramp == null ? 0.05 : ramp;
    var m = this.muted ? 0 : this.masterVolume;
    var set = function (param, v) {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      if (r > 0) param.linearRampToValueAtTime(v, t + r); else param.setValueAtTime(v, t);
    };
    set(this.player.master.gain, m);
    set(this.player.sfxBus.gain, this.sfxVolume);
    set(this.player.musicBus.gain, this.musicVolume);
  };

  GameAudioSystem.prototype.play = function (name, opts) {
    if (!this.ready || this.muted) return null;
    if (!SFX[name]) {
      if (global.console) console.warn('[GameAudio] unknown sound "' + name + '"');
      return null;
    }
    if (this.ctx.state === 'suspended') this.resume();
    return this.player.play(name, opts);
  };

  GameAudioSystem.prototype.names = function () { return Object.keys(SFX); };
  GameAudioSystem.prototype.has = function (name) { return !!SFX[name]; };

  GameAudioSystem.prototype.setMasterVolume = function (v) { this.masterVolume = clamp(v, 0, 1); this._applyVolumes(); this._savePrefs(); };
  GameAudioSystem.prototype.setSfxVolume = function (v) { this.sfxVolume = clamp(v, 0, 1); this._applyVolumes(); this._savePrefs(); };
  GameAudioSystem.prototype.setMusicVolume = function (v) { this.musicVolume = clamp(v, 0, 1); this._applyVolumes(); this._savePrefs(); };
  GameAudioSystem.prototype.getVolumes = function () {
    return { master: this.masterVolume, sfx: this.sfxVolume, music: this.musicVolume, muted: this.muted };
  };
  GameAudioSystem.prototype.setMuted = function (m) {
    this.muted = !!m;
    this._applyVolumes(0.08);
    this._savePrefs();
    return this.muted;
  };
  GameAudioSystem.prototype.toggleMute = function () { return this.setMuted(!this.muted); };
  GameAudioSystem.prototype.isMuted = function () { return this.muted; };

  GameAudioSystem.prototype.startMusic = function () { if (this.ready) this.music.start(); };
  GameAudioSystem.prototype.stopMusic = function (fade) { if (this.ready) this.music.stop(fade); };

  // level: 0..1, or one of 'calm' | 'build' | 'wave' | 'boss'.
  var INTENSITY_NAMES = { calm: 0.08, build: 0.22, wave: 0.6, boss: 0.92, over: 0 };
  GameAudioSystem.prototype.setMusicIntensity = function (level) {
    if (!this.ready) return;
    var v = typeof level === 'string' ? (INTENSITY_NAMES[level] != null ? INTENSITY_NAMES[level] : 0.3) : level;
    this.music.setIntensity(clamp(v, 0, 1));
  };
  GameAudioSystem.prototype.getMusicIntensity = function () { return this.ready ? this.music.intensity : 0; };

  // ------------------------------------------------------------------
  // offline rendering - the measurement path.
  //
  // Kept in the shipped module rather than in the test harness so anyone
  // (including a critic) can measure the real signal chain from a console:
  //   await GameAudio.renderOffline('fire_light')  ->  { peak, rms, buffer }
  // OfflineAudioContext is deterministic and needs no gesture, which makes it
  // far more reliable headless than an AnalyserNode read.
  // ------------------------------------------------------------------
  function analyse(buffer) {
    var peak = 0, sum = 0, n = 0;
    for (var c = 0; c < buffer.numberOfChannels; c++) {
      var d = buffer.getChannelData(c);
      for (var i = 0; i < d.length; i++) {
        var a = d[i] < 0 ? -d[i] : d[i];
        if (a > peak) peak = a;
        sum += d[i] * d[i];
        n++;
      }
    }
    var rms = Math.sqrt(sum / Math.max(1, n));
    return {
      peak: peak, rms: rms,
      peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
      rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity
    };
  }

  function offlineCtx(seconds, sampleRate) {
    var OAC = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    if (!OAC) throw new Error('OfflineAudioContext unavailable');
    return new OAC(2, Math.ceil(seconds * (sampleRate || SR_HINT)), sampleRate || SR_HINT);
  }

  // Render one sound in isolation through the production bus chain.
  GameAudioSystem.prototype.renderOffline = function (name, opts) {
    opts = opts || {};
    var d = SFX[name];
    if (!d) return Promise.reject(new Error('unknown sound ' + name));
    var seconds = opts.seconds || (d.dur + 0.6);
    var ctx = offlineCtx(seconds, opts.sampleRate);
    var p = new SfxPlayer(ctx, ctx.destination, opts.seed);
    p.master.gain.value = opts.masterVolume != null ? opts.masterVolume : this.masterVolume;
    p.sfxBus.gain.value = opts.sfxVolume != null ? opts.sfxVolume : this.sfxVolume;
    p.play(name, Object.assign({ when: 0.02 }, opts.play || {}));
    return ctx.startRendering().then(function (buf) {
      var a = analyse(buf);
      a.name = name;
      a.buffer = buf;
      return a;
    });
  };

  // Render an arbitrary event list - used to prove the voice limiter and the
  // master chain survive a wave-20 stampede.
  // events: [{ name, at, opts }]
  GameAudioSystem.prototype.renderOfflineSequence = function (events, seconds, opts) {
    opts = opts || {};
    var ctx = offlineCtx(seconds, opts.sampleRate);
    var p = new SfxPlayer(ctx, ctx.destination, opts.seed);
    p.master.gain.value = opts.masterVolume != null ? opts.masterVolume : this.masterVolume;
    p.sfxBus.gain.value = opts.sfxVolume != null ? opts.sfxVolume : this.sfxVolume;
    p.musicBus.gain.value = opts.musicVolume != null ? opts.musicVolume : this.musicVolume;
    var accepted = 0, dropped = 0, stats = {};
    var music = null;
    if (opts.music) {
      music = new MusicEngine(ctx, p.musicBus, opts.musicSeed);
      music.setIntensity(opts.musicIntensity != null ? opts.musicIntensity : 0.6);
      music.nextStepTime = 0.05;
      music.running = true;
      music.scheduleUntil(seconds);
    }
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var r = p.play(ev.name, Object.assign({ when: ev.at }, ev.opts || {}));
      var st = stats[ev.name] || (stats[ev.name] = { played: 0, dropped: 0 });
      if (r == null) { dropped++; st.dropped++; } else { accepted++; st.played++; }
    }
    return ctx.startRendering().then(function (buf) {
      var a = analyse(buf);
      a.accepted = accepted;
      a.dropped = dropped;
      a.perName = stats;
      a.buffer = buf;
      return a;
    });
  };

  // Render the music bed alone for N seconds at a fixed intensity.
  GameAudioSystem.prototype.renderOfflineMusic = function (seconds, intensity, opts) {
    opts = opts || {};
    return this.renderOfflineSequence([], seconds, Object.assign({
      music: true, musicIntensity: intensity == null ? 0.6 : intensity
    }, opts));
  };

  GameAudioSystem.prototype.analyseBuffer = analyse;

  global.GameAudio = new GameAudioSystem();
  global.GameAudio.SFX_NAMES = Object.keys(SFX);
})(typeof window !== 'undefined' ? window : this);
