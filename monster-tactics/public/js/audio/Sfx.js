// Fully procedural sound effects via the raw Web Audio API - no audio files,
// no network dependency, no licensing to track. Every effect is a short
// oscillator/noise-burst envelope. Deliberately not Phaser's sound manager:
// this needs to work before any asset load finishes, and the palette is
// small enough that hand-writing envelopes is simpler than wiring up
// spritesheet-style audio sprites.
//
// Browsers refuse to start an AudioContext before a user gesture - call
// Sfx.unlock() on the page's first pointerdown (see main.js) so the very
// first real sound (a menu button click) isn't silently dropped.
const Sfx = (() => {
  let ctx = null;
  let master = null;

  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function getMaster() {
    const c = ensureCtx();
    if (!master) {
      master = c.createGain();
      master.gain.value = 0.35;
      master.connect(c.destination);
    }
    return master;
  }

  // A short tone with a fast attack / exponential decay envelope, optionally
  // sweeping frequency for a "blip"/"whoosh" character.
  function tone(freq, { duration = 0.12, type = 'sine', gain = 0.3, sweepTo = null, delay = 0 } = {}) {
    const c = ensureCtx();
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(getMaster());
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  // A short burst of filtered white noise - percussive "hit"/"crunch" sounds
  // that a pure tone can't produce.
  function noiseBurst({ duration = 0.08, gain = 0.25, filterFreq = 2000, delay = 0 } = {}) {
    const c = ensureCtx();
    const t0 = c.currentTime + delay;
    const size = Math.max(1, Math.floor(c.sampleRate * duration));
    const buffer = c.createBuffer(1, size, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filt).connect(g).connect(getMaster());
    src.start(t0);
  }

  // Every call site is wrapped in try/catch - a sound effect must never be
  // able to break gameplay (a browser that blocks/lacks Web Audio should
  // degrade to silence, not a thrown error mid-battle).
  function safe(fn) {
    return (...args) => {
      try { fn(...args); } catch (e) { /* audio is best-effort */ }
    };
  }

  return {
    unlock: safe(() => ensureCtx()),
    place: safe(() => {
      tone(220, { duration: 0.09, type: 'triangle', gain: 0.3 });
      tone(330, { duration: 0.07, type: 'sine', gain: 0.18, delay: 0.02 });
    }),
    pickup: safe(() => tone(440, { duration: 0.08, type: 'sine', gain: 0.22, sweepTo: 660 })),
    click: safe(() => tone(880, { duration: 0.04, type: 'square', gain: 0.1 })),
    hit: safe(() => noiseBurst({ duration: 0.05, gain: 0.14, filterFreq: 2400 })),
    kill: safe(() => {
      noiseBurst({ duration: 0.12, gain: 0.22, filterFreq: 1200 });
      tone(180, { duration: 0.15, type: 'sawtooth', gain: 0.13, sweepTo: 60, delay: 0.02 });
    }),
    coin: safe(() => {
      tone(660, { duration: 0.06, type: 'square', gain: 0.14 });
      tone(990, { duration: 0.08, type: 'square', gain: 0.14, delay: 0.05 });
    }),
    error: safe(() => tone(160, { duration: 0.15, type: 'square', gain: 0.18, sweepTo: 110 })),
    waveStart: safe(() => tone(330, { duration: 0.2, type: 'sine', gain: 0.22, sweepTo: 660 })),
    waveClear: safe(() => {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, { duration: 0.18, type: 'triangle', gain: 0.2, delay: i * 0.09 }));
    }),
    gameOver: safe(() => {
      [392, 330, 262, 196].forEach((f, i) => tone(f, { duration: 0.35, type: 'sawtooth', gain: 0.18, delay: i * 0.15 }));
    }),
    egg: safe(() => {
      noiseBurst({ duration: 0.06, gain: 0.18, filterFreq: 3000 });
      tone(200, { duration: 0.2, type: 'sine', gain: 0.18, sweepTo: 500, delay: 0.03 });
    })
  };
})();
