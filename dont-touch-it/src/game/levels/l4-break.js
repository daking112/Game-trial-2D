// ============================================================
// l4-break.js — CHAPTER IV · DO NOT BREAK
// ------------------------------------------------------------
// A pane of tempered glass standing upright on the plinth, with one
// hairline flaw in its left edge. Behind it, a dark slab you assume is
// backing board. It isn't.
//
// Beats:
//   1. tap                 → it rings. Long, inharmonic, beautiful. Nothing else.
//   2. press and hold      → heat bloom at the fingertip, photoelastic
//                            fringes radiating out, the pane creaking. The
//                            field visibly ELONGATES toward a second, absent
//                            contact and a ghost ring pulses where it wants
//                            one. One finger is never enough.
//   3. two fingers         → the two fringe families beat against each other;
//                            a moiré node blooms where they intersect and the
//                            flaw starts to grow.
//   4. propagation         → a crack you can WATCH. It steers toward the
//                            midpoint of your fingers, branches, ticks. Lift
//                            both fingers and it ARRESTS — a permanent scar,
//                            the pane survives, you can back out. Press again
//                            and it resumes exactly where you stopped.
//   5. failure             → Voronoi dice seeded from the impact (cells small
//                            at the impact, coarse at the edges, and the crack
//                            you grew is preserved as cell boundaries), time
//                            dilates, the shards fall, tumble and pile.
//   6. the reveal          → the dark slab behind was a mirror. It resolves.
//                            The room. The plinth. You, holding a phone.
//                            Touch it and your reflection touches back —
//                            fingertip to fingertip, exactly, because that is
//                            what a mirror does.
//   7. the moment          → break the mirror and every shard KEEPS ITS PIECE
//                            OF THE REFLECTION. The pile on the plinth is a
//                            scattered, broken portrait of the player.
// ============================================================

import { Level } from '../level.js';
import {
  TAU, clamp, clamp01, lerp, damp, smoothstep, smootherstep,
  rand, rrange, makeRng, noise1, wrapAngle,
} from '../../core/math.js';
import {
  PALETTES, metalFill, contactShadow, engrave, caustic, roundRectPath,
} from '../../render/materials.js';
import { KEY, facetNormal } from '../../render/materials.js';
import { Debris } from '../../render/particles.js';
import { Layer } from '../../render/renderer.js';
import { Audio } from '../../core/audio.js';
import Haptics from '../../core/haptics.js';
import { Pulse } from '../../core/tween.js';

const A = Audio;
const nowA = () => (A.ctx ? A.ctx.currentTime : 0);

// ------------------------------------------------------------
// Sound, composed here from the modal / air / click / thud primitives.
// A large rectangular plate has strongly inharmonic modes; that ratio set
// is the difference between "glass" and "bell".
// ------------------------------------------------------------
const PLATE = [
  [1, 0.100, 2.30], [1.72, 0.070, 1.70], [2.35, 0.048, 1.20],
  [2.96, 0.032, 0.86], [4.12, 0.019, 0.54], [5.44, 0.011, 0.34],
];

const S = {
  /** finger meets glass — almost nothing, but not nothing */
  contact(pan = 0) {
    A.click({ f: 2200, gain: 0.05, dur: 0.012, q: 3, send: 0.2 });
    A.air({ dur: 0.06, f0: 1100, f1: 380, gain: 0.022, q: 1.1, send: 0.35, pan });
  },
  /** a tap: the pane rings and rings and does nothing else */
  ring(f0 = 940, amp = 1, pan = 0) {
    A.modal(f0, PLATE.map(([r, a, d]) => [r, a * amp, d]), { gain: 0.55, send: 0.75, pan });
    A.click({ f: 5400, gain: 0.055 * amp, dur: 0.012, q: 4, send: 0.3 });
    A.air({ dur: 0.09, f0: 6400, f1: 2600, gain: 0.02 * amp, q: 1.4, send: 0.4, pan });
  },
  /** load-bearing creak — micro-fracture noise, pitch climbs with stress */
  creak(level = 0, pan = 0) {
    const l = clamp01(level);
    A.air({ dur: 0.07 + l * 0.06, f0: 2600 + l * 3800, f1: 1500 + l * 2600,
            gain: 0.012 + l * 0.035, q: 7 + l * 6, send: 0.35, pan });
    A.modal(210 + l * 130, [[1, 0.010 + l * 0.022, 0.16], [3.4, 0.006 + l * 0.012, 0.09]],
      { gain: 0.5, send: 0.3, pan });
  },
  /** the pane taking real load — a low groan under the creak */
  groan(level = 0) {
    const l = clamp01(level);
    A.modal(96 + l * 44, [[1, 0.05 + l * 0.09, 0.5], [2.03, 0.02 + l * 0.05, 0.3]],
      { gain: 0.5, send: 0.4 });
  },
  /** the two fields meeting — a shimmering beat tone */
  interfere(level = 0) {
    const l = clamp01(level);
    const f = 1600 + l * 900;
    A.modal(f, [[1, 0.018 + l * 0.03, 0.5], [1.008, 0.018 + l * 0.03, 0.5]],
      { gain: 0.5, send: 0.8, detune: 0.0002 });
  },
  /** one crack advance / branch */
  tick(gen = 0, pan = 0, hard = 0) {
    const p = 1 + gen * 0.42;
    A.click({ f: (3200 + rrange(-500, 900)) * p, gain: 0.075 / p + hard * 0.1, dur: 0.011, q: 9, send: 0.35 });
    A.modal((2400 + rrange(-300, 600)) * p,
      [[1, 0.02 / p + hard * 0.03, 0.07 + hard * 0.1], [2.71, 0.012 / p, 0.04]],
      { gain: 0.5, send: 0.6, pan });
  },
  /** a branch forks — a small double-tick with a body under it */
  branch(gen = 0, pan = 0) {
    S.tick(gen, pan, 0.35);
    A.click({ t: nowA() + 0.014, f: 1800, gain: 0.05, dur: 0.02, q: 3, send: 0.3 });
    A.modal(760, [[1, 0.035, 0.2], [2.4, 0.018, 0.11]], { gain: 0.5, send: 0.55, pan });
  },
  /** the crack stops. relief. */
  arrest() {
    A.air({ dur: 0.5, f0: 3200, f1: 420, gain: 0.05, q: 1.4, send: 0.6 });
    A.modal(620, [[1, 0.07, 1.1], [1.72, 0.04, 0.7], [2.35, 0.02, 0.45]], { gain: 0.5, send: 0.75 });
    A.thud({ f0: 130, f1: 54, gain: 0.13, dur: 0.3, click: 0 });
  },
  /** THE break. Layered: rip, body, granular cloud, swallow. */
  failure(intensity = 1, mirror = false) {
    if (!A.ready) return;
    const t0 = nowA();
    // the rip
    A.air({ t: t0, dur: 0.09, f0: 9000, f1: 2200, gain: 0.34 * intensity, q: 0.5, send: 0.35 });
    A.air({ t: t0 + 0.01, dur: 0.30, f0: 5200, f1: 900, gain: 0.16 * intensity, q: 0.8, send: 0.7 });
    // the body
    A.thud({ t: t0, f0: 300, f1: 58, gain: 0.40 * intensity, dur: 0.34, click: 0.24 });
    // the granular cloud — dozens of individual plates letting go, spread in
    // time so it reads as a cascade rather than a single hit
    const n = 44;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const t = t0 + Math.pow(rand(), 1.6) * 1.15;
      const f = rrange(1400, 7200) * (1 - k * 0.35);
      A.modal(f, [
        [1, rrange(0.012, 0.05) * intensity, rrange(0.05, 0.34)],
        [rrange(1.7, 3.6), rrange(0.006, 0.022), rrange(0.03, 0.16)],
      ], { t, gain: 0.55, send: 0.72, pan: rrange(-0.85, 0.85) });
    }
    // the swallow — the room inhaling afterwards
    A.air({ t: t0 + 0.12, dur: 1.5, f0: 520, f1: 70, gain: 0.055 * intensity, q: 0.7, send: 0.85 });
    if (mirror) {
      // silvered glass has a duller, darker cascade with a metal ghost in it
      A.modal(240, [[1, 0.05, 2.4], [1.44, 0.03, 1.7], [2.19, 0.018, 1.1]],
        { t: t0 + 0.05, gain: 0.5, send: 0.9 });
    }
    A.sidechain(0.55, 0.6);
  },
  /** a shard landing */
  tinkle(size = 1, pan = 0) {
    A.modal(rrange(2400, 6000) / (0.55 + size * 0.7),
      [[1, 0.038, rrange(0.05, 0.22)], [rrange(2.1, 3.7), 0.016, 0.06]],
      { gain: 0.4, send: 0.7, pan });
  },
  /** many shards sliding into place */
  settle(pan = 0) {
    A.air({ dur: 0.28, f0: 5200, f1: 2200, gain: 0.03, q: 1.1, send: 0.6, pan });
    for (let i = 0; i < 4; i++)
      A.modal(rrange(2800, 6400), [[1, 0.012, rrange(0.04, 0.12)]],
        { t: nowA() + rand() * 0.16, gain: 0.4, send: 0.7, pan: rrange(-0.6, 0.6) });
  },
  /** the mirror resolves */
  reveal() {
    [1, 1.5, 2.25, 3].forEach((r, i) => {
      A.modal(148 * r, [[1, 0.045, 2.8 - i * 0.35], [2, 0.018, 1.6]],
        { t: nowA() + i * 0.095, gain: 0.5, send: 0.85 });
    });
    A.air({ dur: 1.2, f0: 140, f1: 2400, gain: 0.05, q: 1.0, send: 0.7 });
  },
  /** touching your own reflection */
  mirrorTouch(pan = 0) {
    A.modal(1320, [[1, 0.05, 1.4], [1.72, 0.03, 0.9], [2.35, 0.016, 0.6]],
      { gain: 0.5, send: 0.85, pan });
    A.air({ dur: 0.22, f0: 300, f1: 1800, gain: 0.022, q: 1.6, send: 0.6, pan });
  },
};

// ------------------------------------------------------------
// Photoelastic fringe palette. Real isochromatic fringes cycle through
// this sequence as the fringe order climbs (grey → yellow → red →
// blue-green → …). Faked with a table, sampled by fringe index.
// ------------------------------------------------------------
const FRINGE = [
  [255, 250, 236], [255, 226, 150], [255, 158, 96], [236, 96, 120],
  [156, 120, 232], [92, 168, 240], [110, 226, 196], [206, 232, 128],
  [255, 196, 118], [242, 122, 132], [130, 144, 234], [104, 200, 226],
];

// ------------------------------------------------------------
// Geometry helpers
// ------------------------------------------------------------

/** Clip a polygon [x,y,...] to the half-plane nearer to a than to b. */
function clipBisector(poly, ax, ay, bx, by) {
  const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5;
  const nx = bx - ax, ny = by - ay;
  const n = poly.length >> 1;
  if (n < 3) return poly;
  const out = [];
  let x0 = poly[(n - 1) * 2], y0 = poly[(n - 1) * 2 + 1];
  let d0 = (x0 - mx) * nx + (y0 - my) * ny;
  for (let i = 0; i < n; i++) {
    const x1 = poly[i * 2], y1 = poly[i * 2 + 1];
    const d1 = (x1 - mx) * nx + (y1 - my) * ny;
    if (d1 <= 0) {
      if (d0 > 0) { const t = d0 / (d0 - d1); out.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t); }
      out.push(x1, y1);
    } else if (d0 <= 0) {
      const t = d0 / (d0 - d1); out.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
    x0 = x1; y0 = y1; d0 = d1;
  }
  return out;
}

function polyArea(p) {
  let a = 0;
  for (let i = 0, n = p.length >> 1; i < n; i++) {
    const j = (i + 1) % n;
    a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  return Math.abs(a) * 0.5;
}

function polyCentroid(p) {
  let cx = 0, cy = 0, a = 0;
  const n = p.length >> 1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cr = p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
    a += cr;
    cx += (p[i * 2] + p[j * 2]) * cr;
    cy += (p[i * 2 + 1] + p[j * 2 + 1]) * cr;
  }
  if (Math.abs(a) < 1e-6) return [p[0], p[1]];
  return [cx / (3 * a), cy / (3 * a)];
}

// ============================================================

export class L4Break extends Level {
  static id = 'l4';
  static chapter = 'III';
  static rule = 'Do not break';
  static label = {
    title: 'Pane (with reverse)',
    medium: ['Tempered glass, 6mm.', 'Silvered on the far face.'],
  };

  // ---------------------------------------------------------
  // layout
  // ---------------------------------------------------------
  layout(w, h, u) {
    const G = this.game.set.geom;
    const R = G.heroR;
    const cx = G.cx;
    const baseY = G.topY - u * 0.25;

    const paneW = R * 1.58;
    const paneH = R * 2.16;

    const mk = (i, scale, backY) => {
      const pw = paneW * scale, ph = paneH * scale;
      const by = baseY - backY;
      return {
        i, scale,
        cx, baseY: by,
        w: pw, h: ph,
        x0: cx - pw / 2, x1: cx + pw / 2,
        y0: by - ph, y1: by,
        th: u * (0.85 * scale),         // visual glass thickness
      };
    };

    this.g = {
      w, h, u, cx, R, baseY,
      panes: [mk(0, 1, 0), mk(1, 0.935, u * 2.9)],
      shoeH: u * 2.0,
      floorBase: G.topY + u * 0.5,
    };

    // the flaw: a chip in the left edge, a third of the way up
    for (const P of this.g.panes) {
      P.flaw = { x: P.x0 + P.w * 0.012, y: P.y1 - P.h * 0.36 };
    }
    if (this.panes) this._syncPanes();
    this._reflection = null;         // rebuilt lazily at the new size
    this._buildRoomLayer();
    // invalidate; the first draw that wants one bakes it at the new size
    if (this.panes) for (const P of this.panes) P.refr = undefined;
  }

  _syncPanes() {
    for (let i = 0; i < this.panes.length; i++) {
      const st = this.panes[i], G = this.g.panes[i];
      st.g = G;
    }
  }

  // ---------------------------------------------------------
  // enter
  // ---------------------------------------------------------
  enter() {
    const g = this.g;
    this.panes = g.panes.map((G, i) => ({
      i, g: G,
      kind: i === 0 ? 'glass' : 'mirror',
      broken: false,
      ring: 0,               // struck shimmer 0..1
      ringPhase: 0,
      crack: null,
      scars: [],             // arrested cracks that survived
      reveal: i === 0 ? 1 : 0,
      shards: [],
      settled: 0,
    }));
    this._syncPanes();

    this.active = 0;         // which pane accepts touch
    this.phase = 'intact';   // intact | stressing | cracking | arrested | breaking | reveal | mirror | done
    this.fingers = [];
    this.taps = 0;
    this.holdTalked = 0;
    this.oneFingerPeak = 0;
    this.combined = 0;
    this.arrests = 0;
    this.dust = 0;
    this.glare = 0;
    this.mirrorTouched = false;
    this.mirrorReveal = 0;
    this.revealT = 0;
    this.pile = new Float32Array(56);
    this.pileBack = new Float32Array(56);
    this.hintPulse = new Pulse(1.2);
    this.flawPulse = new Pulse(1.0);
    this._creakT = 0;
    this._lastNarr = -99;
    this._reflection = null;
    this._refHands = [];
    this.drawCost = 0;

    this.hideHint();
  }

  /**
   * The pane and the mirror, both of which used to vanish with the
   * chapter. Between them they are most of the glass in the game.
   */
  exit() {
    this.hideHint();
    // the mirror first, so its bigger wedges survive the per-kind cap
    for (const P of [this.panes[1], this.panes[0]]) {
      if (P && P.shards.length) this.leaveBiggest(P.shards, 'shard', P.kind === 'mirror' ? 10 : 14);
    }
  }

  roomLight() { return 1; }

  intro() {
    this.say("Six millimetres of tempered glass.", { hold: 1.5 });
    this.say("There is a single flaw in the left edge. Ignore it.", { hold: 2.4 });
  }

  probe() {
    const P = this.panes ? this.panes[0] : null;
    const M = this.panes ? this.panes[1] : null;
    const cr = this._activePane() && this._activePane().crack;
    return {
      phase: this.phase,
      activePane: this.active,
      fingers: this.fingers.length,
      stress: this.fingers.map(f => +f.s.toFixed(2)),
      combined: +this.combined.toFixed(2),
      oneFingerPeak: +this.oneFingerPeak.toFixed(2),
      crack: cr ? {
        progress: +cr.progress.toFixed(3),
        nodes: cr.nodes,
        branches: cr.branches,
        tips: cr.tips.filter(t => t.alive).length,
        running: cr.running,
      } : null,
      arrests: this.arrests,
      scars: (P ? P.scars.length : 0) + (M ? M.scars.length : 0),
      paneBroken: P ? P.broken : false,
      mirrorBroken: M ? M.broken : false,
      mirrorRevealed: +this.mirrorReveal.toFixed(2),
      mirrorTouched: this.mirrorTouched,
      shards: (P ? P.shards.length : 0) + (M ? M.shards.length : 0),
      settled: (P ? P.settled : 0) + (M ? M.settled : 0),
      taps: this.taps,
      solved: this.solved,
    };
  }

  _activePane() { return this.panes ? this.panes[this.active] : null; }

  // ---------------------------------------------------------
  // update
  // ---------------------------------------------------------
  update(dt) {
    this.hintPulse.update(dt);
    this.flawPulse.update(dt);

    this._updateTouch(dt);
    this._updateCrack(dt);
    this._updateShards(dt);

    for (const P of this.panes) {
      P.ring = damp(P.ring, 0, 2.4, dt);
      P.ringPhase += dt * 9;
    }
    this.dust = damp(this.dust, 0, 0.7, dt);
    this.glare = damp(this.glare, 0, 3.0, dt);

    if (this.revealT > 0) {
      this.revealT -= dt;
      this.mirrorReveal = clamp01(this.mirrorReveal + dt * 0.42);
      this.panes[1].reveal = this.mirrorReveal;
    }

    // idle attract: the flaw catches the light
    if (!this.solved && this.input.idle() > 3.4 && !this.flawPulse.active
        && this.phase !== 'breaking' && Math.random() < 0.02) {
      this.flawPulse.fire();
    }

    this._hints(dt);
  }

  // ---------------- touch / stress ----------------
  _updateTouch(dt) {
    const P = this._activePane();
    if (!P || P.broken) { this.fingers.length = 0; this.combined = 0; return; }
    const G = P.g;

    // claim new contacts
    for (const p of this.input.presses) {
      if (p.claimedBy) continue;
      if (!this._inPane(G, p.x, p.y)) continue;
      p.claimedBy = this.tag;
      p.data.l4 = { s: 0, t0: this.t, creak: 0 };
      S.contact((p.x - G.cx) / (G.w * 1.2));
      Haptics.tick();
      P.ring = Math.max(P.ring, 0.22);
      if (P.kind === 'mirror' && !this.mirrorTouched) {
        this.mirrorTouched = true;
        S.mirrorTouch();
        Haptics.select();
        this._narrate("That is you. Try not to think about it too hard.", 2.6);
      }
    }

    // releases → a short contact is a tap: the pane just rings
    for (const p of this.input.releases) {
      if (p.claimedBy !== this.tag || !p.data.l4) continue;
      const d = p.data.l4;
      if (p.age < 0.42 && d.s < 0.34 && p.maxTravel < 16) this._tap(P, p);
      p.data.l4 = null;
      p.claimedBy = null;
    }

    // live fingers
    this.fingers.length = 0;
    for (const p of this.input.list) {
      if (p.claimedBy !== this.tag || !p.data.l4) continue;
      const d = p.data.l4;
      const press = clamp(0.62 + (p.pressure || 0.5) * 0.76, 0.62, 1.32);
      d.s = clamp01((p.age - 0.09) / 1.28) * press;
      this.fingers.push({ p, d, x: p.x, y: p.y, s: clamp01(d.s) });
    }

    const n = this.fingers.length;
    let combined = 0;
    if (n >= 2) {
      // the two strongest fingers, and they must be genuinely apart:
      // pinching one spot is not two stress fields, it is one.
      const f = this.fingers.slice().sort((a, b) => b.s - a.s);
      const a = f[0], b = f[1];
      const sep = Math.hypot(a.x - b.x, a.y - b.y) / G.w;
      const sepK = smoothstep(clamp01((sep - 0.20) / 0.32));
      combined = Math.min(a.s, b.s) * (0.34 + 0.66 * sepK);
      this.stressMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    } else if (n === 1) {
      this.oneFingerPeak = Math.max(this.oneFingerPeak, this.fingers[0].s);
      this.stressMid = null;
    } else {
      this.stressMid = null;
    }
    this.combined = damp(this.combined, combined, 14, dt);

    if (n > 0 && this.phase === 'intact') this.phase = 'stressing';
    if (n === 0 && this.phase === 'stressing') this.phase = P.crack ? 'arrested' : 'intact';

    // ---- creak / groan while loaded ----
    const load = n >= 2 ? Math.max(this.combined, this._maxS()) : this._maxS();
    if (load > 0.10 && !P.broken) {
      this._creakT -= dt;
      if (this._creakT <= 0) {
        this._creakT = lerp(0.30, 0.055, load);
        S.creak(load, this.fingers.length ? (this.fingers[0].x - G.cx) / (G.w * 1.2) : 0);
        Haptics.stress(load);
        if (Math.random() < 0.34) S.groan(load);
        if (load > 0.55) this.shake(0.008 + load * 0.022);
        if (n >= 2) S.interfere(this.combined);
      }
    }

    // ---- narration ----
    if (n === 1 && this.fingers[0].s > 0.62 && this.holdTalked === 0) {
      this.holdTalked = 1;
      this._narrate("You're warming it. It doesn't like that.", 2.2, true);
    }
    if (n === 1 && this.fingers[0].s > 0.96 && this.holdTalked === 1) {
      this.holdTalked = 2;
      // the narrator gives it away without meaning to
      this._narrate("One finger will never be enough. …I shouldn't have said that.", 2.8, true);
      this.hintPulse.fire();
    }
    if (n >= 2 && this.combined > 0.5 && this.holdTalked < 3) {
      this.holdTalked = 3;
      this._narrate("No — no, stop, stop—", 1.8, true);
    }

    // ---- failure threshold ----
    if (!P.crack && this.combined > 0.78 && n >= 2) this._startCrack(P);
  }

  _maxS() { let m = 0; for (const f of this.fingers) m = Math.max(m, f.s); return m; }

  _inPane(G, x, y) {
    const pad = this.g.u * 1.6;
    return x > G.x0 - pad && x < G.x1 + pad && y > G.y0 - pad && y < G.y1 + pad;
  }

  _tap(P, p) {
    this.taps++;
    P.ring = 1;
    P.ringPhase = 0;
    const pan = clamp((p.x - P.g.cx) / (P.g.w * 0.9), -0.9, 0.9);
    // struck nearer an edge → higher, deader; struck centre → the full plate
    const edge = clamp01(Math.abs(p.x - P.g.cx) / (P.g.w * 0.5));
    S.ring(880 + edge * 420 + rrange(-40, 40), 1 - edge * 0.3, pan);
    Haptics.tap();
    this.shake(0.03);
    this.glare = 0.5;
    this.p.burst(p.x, p.y, 4, {
      speed: 60, dir: -Math.PI / 2, spread: TAU, life: 0.5, size: 1.0,
      kind: 3, grav: -20, drag: 2.4, color: [210, 236, 255], alpha: 0.4,
    });
    const lines = P.kind === 'mirror' ? [
      "It rings differently. Heavier. There's silver behind it.",
      "You're knocking on yourself.",
      "Please stop knocking.",
    ] : [
      "It rings. That is the entire trick. Enjoy it.",
      "Tapping is not breaking. Keep it that way.",
      "You're testing it. I can hear you testing it.",
      "It is stronger than you. Structurally, at least.",
    ];
    if (this.taps <= lines.length) this._narrate(lines[this.taps - 1], 2.0, this.taps > 2);
    if (this.taps === 3) this.tl.after(1.2, () => this.flawPulse.fire());
  }

  _narrate(text, hold = 2.0, agitated = false) {
    if (this.t - this._lastNarr < 0.55) return;
    this._lastNarr = this.t;
    this.interrupt(text, { hold, agitated });
  }

  // ---------------- crack propagation ----------------
  _startCrack(P) {
    const G = P.g;
    const mid = this.stressMid || { x: G.cx, y: G.cy };
    const rng = makeRng(1471 + P.i * 977);
    const dir = Math.atan2(mid.y - G.flaw.y, mid.x - G.flaw.x);
    P.crack = {
      rng,
      progress: 0,
      running: true,
      nodes: 1,
      branches: 0,
      len: 0,
      tips: [{
        x: G.flaw.x, y: G.flaw.y, dir, gen: 0, alive: true,
        speed: 0.98, steer: 1.0, len: 0, lastNode: 0, seed: rng() * 200,
        pts: [G.flaw.x, G.flaw.y],
      }],
      paths: [],
      path2d: null,
      target: mid,
      arrested: false,
    };
    P.crack.paths.push(P.crack.tips[0]);
    this.phase = 'cracking';
    S.branch(0, 0);
    S.groan(1);
    Haptics.snap();
    this.shake(0.16);
    this.flash('200,226,255', 0.10, 0.22);
    this._narrate("…", 0.8, true);
    this.tl.after(0.9, () => {
      if (P.crack && P.crack.running && !P.broken)
        this._narrate("You can still let go. Right now. Let go.", 2.4, true);
    });
  }

  _updateCrack(dt) {
    const P = this._activePane();
    if (!P || P.broken || !P.crack) return;
    const c = P.crack, G = P.g;
    const twoDown = this.fingers.length >= 2;

    if (twoDown) {
      c.target = this.stressMid || c.target;
      c.running = true;
      c.arrested = false;
      // watching a crack grow deserves room to breathe
      this.slowmo(0.58, 0.35);
    } else if (c.running) {
      c.running = false;
      c.arrested = true;
      this.arrests++;
      this.phase = 'arrested';
      S.arrest();
      Haptics.thunk();
      this.shake(0.10);
      P.ring = 0.5;
      const lines = [
        "Oh thank god. Oh thank god.",
        "…You did it again. Don't do it again.",
        "You enjoy this. That's the part I mind.",
      ];
      this._narrate(lines[Math.min(this.arrests - 1, lines.length - 1)], 2.6, this.arrests > 1);
      this.tl.after(2.6, () => {
        if (!P.broken && P.crack && !P.crack.running)
          this._narrate("Please don't finish it.", 2.2, true);
      });
    }

    if (!c.running) return;

    // progress is a clean, watchable ramp; the tips do the geometry
    const rate = 1 / 1.55;
    c.progress = clamp01(c.progress + dt * rate);

    const step = G.h * 1.05 * dt;   // px advanced by the primary tip this frame
    const seg = this.g.u * 1.5;
    let live = 0;

    for (const tip of c.tips) {
      if (!tip.alive) continue;
      live++;
      const sp = step * tip.speed;
      // steer toward where the fingers actually are — the crack follows you
      const want = Math.atan2(c.target.y - tip.y, c.target.x - tip.x);
      tip.dir += wrapAngle(want - tip.dir) * clamp01(tip.steer * dt * 2.6);
      // glass does not travel straight: jitter from a smooth noise field
      tip.dir += noise1(tip.seed + tip.len * 0.035) * 2.6 * dt * (1 + tip.gen * 0.5);
      tip.x += Math.cos(tip.dir) * sp;
      tip.y += Math.sin(tip.dir) * sp;
      tip.len += sp;
      c.len += sp;

      // reached an edge? that tip is spent
      if (tip.x < G.x0 || tip.x > G.x1 || tip.y < G.y0 || tip.y > G.y1) {
        tip.x = clamp(tip.x, G.x0, G.x1);
        tip.y = clamp(tip.y, G.y0, G.y1);
        tip.pts.push(tip.x, tip.y);
        tip.alive = false;
        c.nodes++;
        S.tick(tip.gen, (tip.x - G.cx) / (G.w * 1.2), 0.5);
        Haptics.tick();
        this._crackDust(tip, G, 6);
        c.path2d = null;
        continue;
      }

      if (tip.len - tip.lastNode > seg) {
        tip.lastNode = tip.len;
        tip.pts.push(tip.x, tip.y);
        c.nodes++;
        c.path2d = null;
        S.tick(tip.gen, (tip.x - G.cx) / (G.w * 1.2));
        Haptics.tick();
        this._crackDust(tip, G, 2);
        // branching: more likely under high stress, never from deep gens
        const bp = 0.10 + this.combined * 0.16 - tip.gen * 0.05;
        if (tip.gen < 3 && c.paths.length < 11 && c.rng() < bp) {
          const side = c.rng() < 0.5 ? 1 : -1;
          const nt = {
            x: tip.x, y: tip.y,
            dir: tip.dir + side * (0.42 + c.rng() * 0.55),
            gen: tip.gen + 1, alive: true,
            speed: tip.speed * (0.52 + c.rng() * 0.26),
            steer: tip.steer * 0.42,
            len: 0, lastNode: 0, seed: c.rng() * 200,
            pts: [tip.x, tip.y],
          };
          c.tips.push(nt);
          c.paths.push(nt);
          c.branches++;
          S.branch(nt.gen, (tip.x - G.cx) / (G.w * 1.2));
          Haptics.detent();
          this.shake(0.05);
          this._crackDust(tip, G, 5);
        }
      }
    }

    // all tips dead but progress not complete → revive the longest as a
    // secondary front so the crack never just stops mid-air
    if (live === 0 && c.progress < 1) {
      const best = c.paths.reduce((a, b) => (b.len > a.len ? b : a));
      const nt = {
        x: best.pts[best.pts.length - 2], y: best.pts[best.pts.length - 1],
        dir: best.dir + Math.PI * (0.6 + c.rng() * 0.3),
        gen: 1, alive: true, speed: 0.72, steer: 0.5,
        len: 0, lastNode: 0, seed: c.rng() * 200,
        pts: [best.pts[best.pts.length - 2], best.pts[best.pts.length - 1]],
      };
      c.tips.push(nt); c.paths.push(nt); c.branches++;
      S.branch(1, 0);
    }

    if (c.progress >= 1) this._shatter(P, c.target.x, c.target.y);
  }

  _crackDust(tip, G, n) {
    this.p.burst(tip.x, tip.y, n, {
      speed: 90, dir: tip.dir + Math.PI, spread: 2.4, life: 0.5, size: 0.9,
      kind: 1, grav: 700, drag: 2.6, color: [226, 242, 255], alpha: 0.5,
    });
    if (Math.random() < 0.5) {
      this.p.emit({
        x: tip.x, y: tip.y, vx: rrange(-30, 30), vy: rrange(-40, 20),
        life: 0.45, size: 1.6, kind: 3, grav: 0, drag: 3,
        color: [220, 240, 255], alpha: 0.7,
      });
    }
  }

  // ---------------- the shatter ----------------
  _shardCap() {
    const q = this.r.qualityName;
    return q === 'high' ? 116 : q === 'medium' ? 86 : 56;
  }

  _shatter(P, ix, iy) {
    const g = this.g, G = P.g;
    P.broken = true;
    P.crack.running = false;
    this.phase = 'breaking';

    ix = clamp(ix, G.x0 + G.w * 0.06, G.x1 - G.w * 0.06);
    iy = clamp(iy, G.y0 + G.h * 0.06, G.y1 - G.h * 0.06);
    P.impact = { x: ix, y: iy };

    // ---- seeds: dense at the impact, coarse at the edges ----
    const rng = makeRng(9001 + P.i * 313);
    const cap = this._shardCap();
    const diag = Math.hypot(G.w, G.h);
    // A mirror does not go to gravel. It comes apart into a dozen big
    // wedges, each of which keeps a whole readable piece of the picture —
    // which is the entire point of breaking this particular pane.
    const big = P.kind === 'mirror';
    let s0 = diag * (big ? 0.215 : 0.084), k = big ? 0.46 : 0.30;
    let seeds = this._seed(G, ix, iy, s0, k, rng);
    // adaptive: coarsen until we are inside budget rather than truncating,
    // so the pattern stays a correct Voronoi at every quality tier
    let guard = 0;
    while (seeds.length / 2 > cap && guard++ < 6) {
      s0 *= 1.22; k *= 1.14;
      seeds = this._seed(G, ix, iy, s0, k, rng);
    }
    // the crack you grew becomes real cell boundaries: seed pairs straddling
    // each segment so the Voronoi edge between them lies along the crack
    const off = s0 * 0.34;
    const seedCap = big ? 26 : cap * 1.5;
    const stride = big ? 10 : 2;
    for (const tip of P.crack.paths) {
      for (let i = 0; i + 3 < tip.pts.length; i += stride) {
        const ax = tip.pts[i], ay = tip.pts[i + 1];
        const bx = tip.pts[i + 2], by = tip.pts[i + 3];
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        const L = Math.hypot(bx - ax, by - ay) || 1;
        const nx = -(by - ay) / L, ny = (bx - ax) / L;
        if (seeds.length / 2 > seedCap) break;
        seeds.push(mx + nx * off, my + ny * off, mx - nx * off, my - ny * off);
      }
    }

    // ---- Voronoi: clip the pane rect by the bisectors of near neighbours ----
    const rect = [G.x0, G.y0, G.x1, G.y0, G.x1, G.y1, G.x0, G.y1];
    const n = seeds.length / 2;
    const cells = [];
    const order = new Array(n);
    for (let i = 0; i < n; i++) {
      const sx = seeds[i * 2], sy = seeds[i * 2 + 1];
      for (let j = 0; j < n; j++) {
        order[j] = [(seeds[j * 2] - sx) ** 2 + (seeds[j * 2 + 1] - sy) ** 2, j];
      }
      order.sort((a, b) => a[0] - b[0]);
      let poly = rect;
      const kn = Math.min(n, 17);
      for (let q = 1; q < kn; q++) {
        const j = order[q][1];
        poly = clipBisector(poly, sx, sy, seeds[j * 2], seeds[j * 2 + 1]);
        if (poly.length < 6) break;
      }
      if (poly.length < 6) continue;
      const area = polyArea(poly);
      if (area < (g.u * 0.8) ** 2) continue;
      cells.push({ poly, sx, sy, area });
    }

    // ---- build the shards ----
    const dpr = clamp(this.r.dpr, 1, 2);
    const bake = P.kind === 'mirror' && this._reflection;
    const floorBase = P.i === 0 ? g.floorBase : g.floorBase + g.u * 2.2;
    let biggest = 0;
    for (const cell of cells) {
      const [ccx, ccy] = polyCentroid(cell.poly);
      const local = [];
      let rmax = 0;
      for (let i = 0; i < cell.poly.length; i += 2) {
        const lx = cell.poly[i] - ccx, ly = cell.poly[i + 1] - ccy;
        local.push(lx, ly);
        rmax = Math.max(rmax, Math.hypot(lx, ly));
      }
      const dx = ccx - ix, dy = ccy - iy;
      const dd = Math.hypot(dx, dy) || 1;
      // energy falls off with distance from the impact; near cells are flung,
      // far ones essentially just lose their footing
      const e = 1 / (1 + (dd / (diag * 0.20)) ** 1.5);
      const spd = (60 + e * 640) * (big ? 1.6 : 1);
      const d = new Debris(ccx, ccy, local, {
        vx: (dx / dd) * spd + rrange(-70, 70),
        vy: (dy / dd) * spd * 0.72 - rrange(40, 260) * (0.35 + e) * (big ? 0.55 : 1),
        a: 0, va: rrange(-7, 7) * (0.4 + e),
        restitution: 0.24 + rand() * 0.16,
        friction: 0.78,
        grav: 2500,
        data: { r: rmax, area: cell.area, restX: ccx, restY: ccy, kind: P.kind },
      });
      d.baseFloor = floorBase + rrange(-1.5, 2.5);
      d.floorY = d.baseFloor;
      d.wasFast = 0;
      d.spark = ((ccx * 13 + ccy * 7) | 0) % 4;
      // How flat a piece comes to rest. Most lie down — foreshortened to a
      // lozenge — but a few catch on the ones beneath and stand up, and
      // those are the ones with a face in them. A pile that is uniformly
      // flat has no picture left in it; a pile that is uniformly upright is
      // a hedge. The mix is the whole image.
      d.tilt = big
        ? clamp(0.20 + rand() ** 2.2 * 0.52 + (rmax / diag) * 0.44, 0.18, 0.94)
        : 0.52;
      // cached local drawing state — built once, reused every frame
      d.p2 = new Path2D();
      for (let i = 0; i < local.length; i += 2)
        i ? d.p2.lineTo(local[i], local[i + 1]) : d.p2.moveTo(local[i], local[i + 1]);
      d.p2.closePath();
      biggest = Math.max(biggest, rmax);

      if (bake) d.img = this._bakeShard(P, cell, ccx, ccy, rmax, dpr);
      P.shards.push(d);
    }
    P.shardR = biggest;

    // ---- the moment ----
    const isMirror = P.kind === 'mirror';
    S.failure(1, isMirror);
    Haptics.shatter();
    this.transgress(ix, iy, {
      zoom: 1.14, flash: isMirror ? '210,222,255' : '224,242,255', flashA: 0.30,
      slow: 0.13, hold: 0.9, release: 0.6, shake: 0.72, lean: 0.30,
    });
    Audio.setRoom(3.0, 2.0, 0.40);
    this.tl.after(2.6, () => Audio.setRoom(1.9, 2.6, 0.26));
    this.dust = 1;
    this.glare = 1;

    this.p.burst(ix, iy, 54, {
      speed: 620, dir: -Math.PI / 2, spread: TAU, life: 0.7, size: 1.5,
      kind: 2, grav: 2100, drag: 1.0, color: [224, 242, 254], alpha: 0.95, jitter: G.w * 0.3,
    });
    this.p.burst(ix, iy, 22, {
      speed: 380, dir: -Math.PI / 2, spread: TAU, life: 0.55, size: 2.2,
      kind: 3, grav: 700, drag: 1.5, color: [206, 232, 255], alpha: 0.8, jitter: G.w * 0.28,
    });
    this.p.burst(G.cx, G.y1 - G.h * 0.3, 22, {
      speed: 220, dir: 0, spread: TAU, life: 1.7, size: 6,
      kind: 4, grav: -25, drag: 1.5, color: [186, 204, 222], alpha: 0.42, jitter: G.w * 0.6,
    });

    if (!isMirror) {
      this.transgressed = true;
      this._narrate("…", 1.0, true);
      this.say("You broke it.", { hold: 1.6, agitated: true });
      this.tl.after(1.9, () => {
        this.say("There was another one behind it.", { hold: 2.4 });
      });
      // the slab behind stops being a slab
      this.tl.after(3.0, () => {
        this.active = 1;
        // fresh pane, fresh reading of how the player is touching it
        this.oneFingerPeak = 0;
        this.phase = 'reveal';
        this.revealT = 4.0;
        this._buildReflection();
        S.reveal();
        Haptics.reveal();
        this.tl.after(1.7, () => this.say("Oh. …That one is a mirror.", { hold: 2.6 }));
        this.tl.after(4.6, () => { this.phase = 'mirror'; this.holdTalked = 0; });
      });
    } else {
      this.say("…", { hold: 1.2, agitated: true });
      this.tl.after(1.2, () => this.say("You're in pieces on the floor.", { hold: 2.4, agitated: true }));
      // Then the camera crosses the room and looks. Telling the player that
      // every piece still has a bit of them in it is worth nothing while
      // the pieces are forty pixels wide — so we go and read them.
      this.tl.after(3.3, () => this._closeOnPile());
      this.tl.after(4.9, () => this.say("Every one of them still has a bit of you in it.", { hold: 3.4 }));
      this.tl.after(9.4, () => {
        this.game.cam.focus(0, 0, Math.max(1, this.constructor.push || 1), 1.1);
        Audio.setRoom(1.9, 2.6, 0.26);
      });
      this.phase = 'done';
      this.solve(11.0);
    }
  }

  /**
   * Cross the room to the wreckage. Aimed at the centre of mass of the
   * mirror's own pieces rather than at the pane, because that is where the
   * picture ended up — and held there, so the last line has something to
   * land on.
   */
  _closeOnPile() {
    const M = this.panes[1];
    if (!M.shards.length || !this.r.w) return;
    let sx = 0, sy = 0;
    for (const d of M.shards) { sx += d.x; sy += d.y; }
    const px = sx / M.shards.length;
    const py = sy / M.shards.length - this.g.u * 0.5;
    // far enough in to read a face, not so far that the plinth's cached
    // layers start showing their own pixels
    const z = clamp(this.r.w / (M.g.w * 1.5), 1.4, 1.95);
    this.game.cam.focus(this.r.w / 2 - px, this.r.h / 2 - py, z, 0.95);
    Audio.setRoom(2.3, 2.4, 0.30);
  }

  /** polar seeding: ring spacing grows with radius → small cells at impact */
  _seed(G, ix, iy, s0, k, rng) {
    const out = [ix + rrange(-1, 1), iy + rrange(-1, 1)];
    const maxR = Math.hypot(G.w, G.h) * 0.78;
    let r = s0 * 0.62;
    let phase = 0;
    while (r < maxR) {
      const sp = s0 + k * r;
      const count = Math.max(5, Math.round(TAU * r / sp));
      phase += 0.7 + rng();
      for (let i = 0; i < count; i++) {
        const a = ((i + rng() * 0.85) / count) * TAU + phase;
        const rr = r * (0.86 + rng() * 0.3);
        const x = ix + Math.cos(a) * rr;
        const y = iy + Math.sin(a) * rr * 1.02;
        if (x < G.x0 - sp || x > G.x1 + sp || y < G.y0 - sp || y > G.y1 + sp) continue;
        out.push(x, y);
      }
      r += sp;
    }
    return out;
  }

  /** Bake a mirror shard's piece of the reflection into a small canvas. */
  _bakeShard(P, cell, ccx, ccy, rmax, dpr) {
    const G = P.g, ref = this._reflection;
    if (!ref) return null;
    const pad = 2;
    const R = rmax + pad;
    if (R < 2) return null;
    // Big wedges bake at a reduced scale so no single piece costs more than
    // a modest texture; on screen they still land at 1:1 or better.
    const MAX = 512;
    const k = Math.min(dpr, MAX / (R * 2));
    const size = Math.max(4, Math.round(R * 2 * k));
    const L = new Layer(size, size);
    const c = L.ctx;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.translate(R, R);
    c.beginPath();
    for (let i = 0; i < cell.poly.length; i += 2) {
      const lx = cell.poly[i] - ccx, ly = cell.poly[i + 1] - ccy;
      i ? c.lineTo(lx, ly) : c.moveTo(lx, ly);
    }
    c.closePath();
    c.clip();
    // A mirror in one piece has one viewpoint. A mirror in twenty pieces
    // has twenty, because every piece now faces its own way — so each one
    // shows the room from somewhere slightly different, and a good number
    // of them are pointed straight back at the person standing in front of
    // it. Sampling every shard from the same fixed slice is what made the
    // pile read as anonymous grey plates: most slices are empty wall.
    const rng = makeRng((((ccx * 977 + ccy * 613) | 0) >>> 0) + 17);
    const sees = rng() < 0.5;                   // this piece can see you
    const zm = 1 + rng() * 0.55;
    const tx = sees ? G.w * (0.52 + rng() * 0.18) : G.w * (0.10 + rng() * 0.82);
    const ty = sees ? G.h * (0.30 + rng() * 0.34) : G.h * (0.12 + rng() * 0.78);
    // place pane-space (tx, ty) at this shard's own centre
    c.drawImage(ref.canvas, -tx * zm, -ty * zm, G.w * zm, G.h * zm);
    // A piece of mirror lying on a lit plinth is far brighter than the same
    // piece was inside a dim frame. Lifting it additively raises the room
    // and leaves the silhouette black, which is what makes the shape of you
    // still legible at a tenth of the size.
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.38;
    c.drawImage(ref.canvas, -tx * zm, -ty * zm, G.w * zm, G.h * zm);
    return { canvas: L.canvas, r: R };
  }

  // ---------------- shard physics ----------------
  _updateShards(dt) {
    const g = this.g;
    const G0 = this.game.set.geom;
    const bounds = { x: G0.cx - G0.topRx * 0.96, w: G0.topRx * 1.92 };
    for (const P of this.panes) {
      if (!P.shards.length) continue;
      let settled = 0;
      for (const d of P.shards) {
        if (d.rest) { settled++; continue; }
        const bins = P.i === 0 ? this.pile : this.pileBack;
        d.floorY = d.baseFloor - this._pileAt(bins, d.x);
        const fast = Math.abs(d.vy);
        d.step(dt, d.floorY, bounds);
        if (fast > 240 && Math.abs(d.vy) < fast * 0.62) {
          if (Math.random() < 0.42) S.tinkle(d.data.r / g.u, clamp((d.x - g.cx) / (g.u * 26), -0.9, 0.9));
          if (Math.random() < 0.25) Haptics.tick();
          this.p.burst(d.x, d.floorY, 2, {
            speed: 110, dir: -Math.PI / 2, spread: 2.2, life: 0.34, size: 0.9,
            kind: 1, grav: 900, drag: 3, color: [220, 236, 250], alpha: 0.34,
          });
        }
        if (d.rest) {
          // Glass heaps. Mirror plates do not: a dozen flat pieces the
          // size of your hand lie over each other on the plinth like a
          // dropped deck, and charging them by radius would build a hedge
          // that hides every picture in the chapter.
          this._addPile(bins, d.x, P.kind === 'mirror'
            ? g.u * 0.09 + d.data.r * 0.10 * (d.tilt ?? 0.4)
            : d.data.r * 0.24);
          settled++;
          if (settled === P.shards.length) S.settle();
        }
      }
      P.settled = settled;
    }
  }

  _pileBin(x) {
    const G = this.game.set.geom;
    return clamp(Math.floor((x - (G.cx - G.topRx)) / (G.topRx * 2) * 56), 0, 55);
  }
  _pileAt(bins, x) { return bins[this._pileBin(x)]; }
  _addPile(bins, x, h) {
    const i = this._pileBin(x);
    // The heap used to stand high enough to bury the bottom third of the
    // mirror behind it — which is to say, to bury the reflection.
    const cap = this.g.u * 4.6;
    for (let k = -3; k <= 3; k++) {
      const j = i + k;
      if (j < 0 || j > 55) continue;
      bins[j] = Math.min(cap, bins[j] + h * (1 - Math.abs(k) * 0.26));
    }
  }

  // ---------------- hints ----------------
  _hints(dt) {
    if (this.solved) { this.hideHint(); return; }
    const idle = this.input.idle();
    const P = this._activePane();
    if (!P || P.broken) { this.hideHint(); return; }
    if (this.phase === 'cracking') { this.hideHint(); return; }
    // Late, and describing what the player can see rather than naming the
    // gesture. "TWO FINGERS" was also carrying over onto the mirror after
    // the first pane broke, because oneFingerPeak was never reset — so the
    // answer to the puzzle just solved was on screen during its reveal.
    if (this.phase === 'arrested' && idle > 12) { this.hint('It stopped'); return; }
    if (this.oneFingerPeak > 0.85 && idle > 13) { this.hint('One is not enough'); return; }
    if (idle > 18) { this.hint('It is under tension'); return; }
    this.hideHint();
  }

  // =========================================================
  // DRAW
  // =========================================================
  draw(ctx, glow) {
    const t0 = performance.now();
    const g = this.g;
    const M = this.panes[1], F = this.panes[0];

    // shadows both panes throw on the plinth
    this._paneShadow(ctx, M);
    this._paneShadow(ctx, F);

    // back plane first
    if (!M.broken) this._drawPane(ctx, glow, M);
    this._drawShoe(ctx, M);
    if (!F.broken) this._drawPane(ctx, glow, F);
    this._drawShoe(ctx, F, true);

    // The mirror comes apart toward you, so its wedges land in front of the
    // glass and draw over it. Any other order buries the only thing in this
    // chapter worth looking at under a hundred and sixty clear pebbles.
    this._drawShards(ctx, glow, F);
    this._drawShards(ctx, glow, M);

    // stress + crack ride on the active pane
    const P = this._activePane();
    if (P && !P.broken) {
      this._drawStress(ctx, glow, P);
      this._drawCrack(ctx, glow, P);
    }
    this.drawCost = performance.now() - t0;
  }

  drawFront(ctx, glow) {
    const g = this.g;
    if (this.dust > 0.01) {
      const G = this.panes[0].g;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const y = G.y1 - G.h * 0.42;
      const gg = ctx.createRadialGradient(g.cx, y, 0, g.cx, y, G.w * 1.5);
      gg.addColorStop(0, `rgba(196,218,238,${0.10 * this.dust})`);
      gg.addColorStop(0.5, `rgba(180,200,224,${0.045 * this.dust})`);
      gg.addColorStop(1, 'rgba(180,200,224,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(g.cx - G.w * 1.5, y - G.w * 1.5, G.w * 3, G.w * 3);
      ctx.restore();
    }
  }

  // ---------- shadow / shoe ----------
  _paneShadow(ctx, P) {
    const G = P.g, g = this.g;
    const lit = this.game.set.lit;
    if (P.broken) return;
    ctx.save();
    // key is upper-left, so the pane's shadow lies down and to the right
    ctx.translate(G.cx + G.w * 0.13, G.baseY + g.u * 0.5);
    ctx.scale(1, 0.30);
    const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, G.w * 0.62);
    gg.addColorStop(0, `rgba(0,0,0,${0.52 * lit})`);
    gg.addColorStop(0.55, `rgba(0,0,0,${0.22 * lit})`);
    gg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(0, 0, G.w * 0.62, 0, TAU); ctx.fill();
    ctx.restore();

    // the caustic the pane throws: a bright line right under the glass
    if (P.kind === 'glass') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85 * lit;
      caustic(ctx, G.cx + G.w * 0.06, G.baseY + g.u * 0.6, G.w * 0.45, this.t, { alpha: 0.16 });
      const cg = ctx.createLinearGradient(G.x0, 0, G.x1, 0);
      cg.addColorStop(0, 'rgba(255,244,214,0)');
      cg.addColorStop(0.28, `rgba(255,246,220,${0.16 + this.glare * 0.14})`);
      cg.addColorStop(0.55, `rgba(210,238,255,${0.20 + this.glare * 0.2})`);
      cg.addColorStop(0.8, 'rgba(255,246,220,0.07)');
      cg.addColorStop(1, 'rgba(255,244,214,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(G.x0 - g.u, G.baseY + g.u * 0.1, G.w + g.u * 2, g.u * 0.9);
      ctx.restore();
    }
  }

  _drawShoe(ctx, P, plaque = false) {
    const G = P.g, g = this.g, u = g.u;
    const h = g.shoeH * G.scale;
    const w = G.w * 1.06;
    const x = G.cx - w / 2, y = G.baseY - h * 0.42;
    const lit = this.game.set.lit;

    ctx.save();
    contactShadow(ctx, G.cx, y + h + u * 0.2, w * 0.56, u * 0.8, { strength: 0.62 * lit });
    roundRectPath(ctx, x, y, w, h, u * 0.28);
    ctx.save(); ctx.clip();
    metalFill(ctx, x, y, x + w, y + h, PALETTES.gunmetal);
    // a machined top face catching the key
    const tg = ctx.createLinearGradient(0, y, 0, y + h);
    tg.addColorStop(0, 'rgba(232,240,252,0.30)');
    tg.addColorStop(0.16, 'rgba(150,164,180,0.10)');
    tg.addColorStop(0.55, 'rgba(0,0,0,0.16)');
    tg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = tg;
    ctx.fillRect(x, y, w, h);
    // the slot the glass sits in
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(G.cx - G.th * 1.5, y, G.th * 3, h * 0.36);
    ctx.restore();
    ctx.lineWidth = Math.max(1, u * 0.14);
    ctx.strokeStyle = `rgba(226,238,252,${0.34 * lit})`;
    roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, u * 0.28);
    ctx.stroke();
    ctx.restore();

    if (plaque) {
      ctx.save();
      ctx.globalAlpha = clamp01(lit * 1.2);
      engrave(ctx, 'DO NOT BREAK', G.cx, y + h * 0.68, {
        font: `700 ${u * 1.72}px Inter, sans-serif`,
        letterSpacing: `${u * 0.3}px`,
        depth: Math.max(1, u * 0.11), darkness: 0.82, light: 0.24,
      });
      ctx.restore();
    }
  }

  // ---------- the pane ----------
  _panePath(ctx, G) {
    ctx.beginPath();
    ctx.rect(G.x0, G.y0, G.w, G.h);
  }

  /**
   * Grab the room actually rendered behind the pane and put it back
   * refracted. Three slabs: a body with a slight magnification and two
   * grazing edges where the light bends hard. This is real refraction of
   * the real backdrop, not a painted guess.
   */
  /**
   * Build the slice of room that sits behind the pane, ONCE.
   *
   * The obvious way to refract is to re-sample the canvas you are drawing
   * on. It is also a trap: reading the presenting canvas mid-frame forces
   * an eager, unbatched raster of everything queued so far (measured at
   * ~21ms a frame here) and on mobile it can cost the canvas its
   * acceleration outright.
   *
   * Everything behind this pane is static — wall, light cone, plinth, all
   * of which the Set already keeps as cached layers — so we composite
   * them into one world-space layer at layout time and sample that. The
   * refraction then costs three ordinary blits.
   */
  _buildRoomLayer() {
    const g = this.g;
    const set = this.game.set, SG = set.geom;
    if (!SG || !g || !g.panes) return;
    const pad = g.u * 8;
    let wx0 = Infinity, wy0 = Infinity, wx1 = -Infinity, wy1 = -Infinity;
    for (const P of g.panes) {
      wx0 = Math.min(wx0, P.x0); wx1 = Math.max(wx1, P.x1);
      wy0 = Math.min(wy0, P.y0); wy1 = Math.max(wy1, P.y1);
    }
    wx0 -= pad; wy0 -= pad; wx1 += pad; wy1 += pad;
    const k = this.r.dpr;
    const L = (this._roomLayer || (this._roomLayer = new Layer()))
      .size(Math.max(1, Math.ceil((wx1 - wx0) * k)), Math.max(1, Math.ceil((wy1 - wy0) * k)));
    const c = L.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, L.canvas.width, L.canvas.height);
    c.setTransform(k, 0, 0, k, -wx0 * k, -wy0 * k);
    c.fillStyle = '#07070a';
    c.fillRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
    c.drawImage(set.wall.canvas, 0, 0, SG.w, SG.h);
    c.globalCompositeOperation = 'lighter';
    c.drawImage(set.cone.canvas, 0, 0, SG.w, SG.h);
    c.globalCompositeOperation = 'source-over';
    c.drawImage(set.plinth.canvas, 0, 0, SG.w, SG.h);
    this._roomRect = { wx0, wy0, wx1, wy1, k };
  }

  /**
   * Bake it once, blit it once.
   *
   * Everything behind this pane is static, so the refraction is static
   * too: the three scaled blits below produce the same picture on every
   * frame of the chapter. Doing them live cost 0.6ms on a phone and
   * 68.6ms on a tablet — superlinear, because a scaled drawImage of a
   * large region is bandwidth, and six of them per frame at 820x1180@2 is
   * more bandwidth than a frame has. Every other chapter on every other
   * device sat between 2 and 5ms.
   *
   * The only thing that varies is the room's exposure, and that is a
   * global alpha at blit time.
   */
  _bakeRefraction(P) {
    P.refr = null;
    const R = this._roomRect;
    if (!R || !this._roomLayer) return;
    const G = P.g;
    const cv = this._roomLayer.canvas;
    const k = R.k;
    const sx = (G.x0 - R.wx0) * k, sy = (G.y0 - R.wy0) * k;
    const sw = G.w * k, sh = G.h * k;
    if (sw < 4 || sh < 4) return;
    const dk = clamp(this.r.dpr, 1, 2);
    const L = (P.refr = new Layer())
      .size(Math.max(1, Math.ceil(G.w * dk)), Math.max(1, Math.ceil(G.h * dk)));
    const c = L.ctx;
    c.setTransform(dk, 0, 0, dk, -G.x0 * dk, -G.y0 * dk);
    const inset = G.w * 0.085;

    c.save();
    this._panePath(c, G);
    c.clip();
    c.globalAlpha = 0.94;
    // body: magnified a touch and pushed the other way, as thick glass does
    c.drawImage(cv, sx, sy, sw, sh,
      G.x0 - G.w * 0.020, G.y0 - G.h * 0.014, G.w * 1.040, G.h * 1.028);
    // grazing edges: strong horizontal compression
    c.globalAlpha = 0.85;
    c.drawImage(cv, sx, sy, sw * 0.34, sh,
      G.x0, G.y0 - G.h * 0.01, inset, G.h * 1.02);
    c.drawImage(cv, sx + sw * 0.66, sy, sw * 0.34, sh,
      G.x1 - inset, G.y0 - G.h * 0.01, inset, G.h * 1.02);
    c.restore();
  }

  _refract(ctx, G, P) {
    if (!this.r.quality.refract) return;
    if (P.refr === undefined) this._bakeRefraction(P);
    if (!P.refr) return;
    const lit = clamp01(this.game.set.lit);
    if (lit <= 0.004) return;
    ctx.save();
    ctx.globalAlpha = lit;
    ctx.drawImage(P.refr.canvas, G.x0, G.y0, G.w, G.h);
    ctx.restore();
  }

  _drawPane(ctx, glow, P) {
    const G = P.g, g = this.g, u = g.u;
    const lit = this.game.set.lit;
    const brightness = lit;

    if (P.kind === 'glass') this._refract(ctx, G, P);

    ctx.save();
    this._panePath(ctx, G);
    ctx.save();
    ctx.clip();

    if (P.kind === 'mirror') this._drawMirrorFace(ctx, glow, P);

    // --- body: float glass is green on the diagonal, near-nothing in the middle
    const body = ctx.createLinearGradient(G.x0, G.y0, G.x1, G.y1);
    body.addColorStop(0, `rgba(150,196,190,${0.24 * brightness})`);
    body.addColorStop(0.22, `rgba(180,216,220,${0.075 * brightness})`);
    body.addColorStop(0.5, `rgba(226,244,248,${0.028 * brightness})`);
    body.addColorStop(0.78, `rgba(164,202,214,${0.07 * brightness})`);
    body.addColorStop(1, `rgba(128,176,180,${0.26 * brightness})`);
    ctx.fillStyle = body;
    ctx.fillRect(G.x0, G.y0, G.w, G.h);

    // --- vertical falloff: the top is nearer the lamp
    const vg = ctx.createLinearGradient(0, G.y0, 0, G.y1);
    vg.addColorStop(0, `rgba(255,246,224,${0.075 * brightness})`);
    vg.addColorStop(0.34, 'rgba(255,246,224,0)');
    vg.addColorStop(0.82, `rgba(96,132,168,${0.05 * brightness})`);
    vg.addColorStop(1, `rgba(120,160,200,${0.11 * brightness})`);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = vg;
    ctx.fillRect(G.x0, G.y0, G.w, G.h);

    // --- the reflected light cone: a broad slanted sheet from upper-left
    const breathe = 1 + Math.sin(this.t * 0.42) * 0.05;
    ctx.save();
    ctx.translate(G.x0 + G.w * 0.34, G.y0 + G.h * 0.30);
    ctx.rotate(-0.44);
    const sw = G.w * 0.30 * breathe, sh = G.h * 0.78;
    const sg = ctx.createLinearGradient(-sw, 0, sw, 0);
    sg.addColorStop(0, 'rgba(255,250,238,0)');
    sg.addColorStop(0.34, `rgba(255,250,238,${0.09 * brightness})`);
    sg.addColorStop(0.5, `rgba(255,252,246,${0.115 * brightness})`);
    sg.addColorStop(0.68, `rgba(255,250,238,${0.06 * brightness})`);
    sg.addColorStop(1, 'rgba(255,250,238,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(-sw, -sh, sw * 2, sh * 2);
    ctx.restore();

    // --- the tight specular core inside it
    ctx.save();
    ctx.translate(G.x0 + G.w * 0.29, G.y0 + G.h * 0.24);
    ctx.rotate(-0.44);
    // Kept deliberately below saturation: the bloom pass amplifies this,
    // and a specular that clips to white stops reading as a reflection of
    // something and starts reading as a hole in the image.
    const cw = G.w * 0.022, ch = G.h * 0.40 * breathe;
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    cg.addColorStop(0, `rgba(255,253,247,${0.22 * brightness})`);
    cg.addColorStop(0.42, `rgba(255,252,246,${0.08 * brightness})`);
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.scale(cw, ch);
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
    ctx.restore();

    // --- cool bounce from the lower-right
    const bg = ctx.createRadialGradient(
      G.x1 - G.w * 0.12, G.y1 - G.h * 0.10, 0,
      G.x1 - G.w * 0.12, G.y1 - G.h * 0.10, G.w * 0.9);
    bg.addColorStop(0, `rgba(140,182,255,${0.12 * brightness})`);
    bg.addColorStop(1, 'rgba(140,182,255,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(G.x0, G.y0, G.w, G.h);

    // --- smudges: two old fingerprints that only exist in the specular
    ctx.globalCompositeOperation = 'lighter';
    this._smudge(ctx, G.x0 + G.w * 0.66, G.y0 + G.h * 0.42, G.w * 0.11, 0.048 * brightness);
    this._smudge(ctx, G.x0 + G.w * 0.28, G.y0 + G.h * 0.71, G.w * 0.085, 0.036 * brightness);

    // --- struck: a shimmer travelling out from the strike
    if (P.ring > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const k = (P.ringPhase * 0.34 + i / 3) % 1;
        ctx.strokeStyle = `rgba(206,236,255,${(1 - k) * P.ring * 0.34})`;
        ctx.lineWidth = Math.max(1, u * 0.22);
        ctx.beginPath();
        ctx.ellipse(G.cx, G.y1 - G.h * 0.5, G.w * (0.1 + k * 0.72), G.h * (0.1 + k * 0.66), 0, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();   // un-clip

    // --- the edges: this is where the pane catches the gallery
    this._paneEdges(ctx, glow, P, brightness);
    ctx.restore();

    // --- the flaw
    this._drawFlaw(ctx, glow, P, brightness);

    // --- scars from arrested cracks live on the pane forever
    for (const s of P.scars) this._strokeScar(ctx, glow, s, P);

    // glow contribution: the specular core blooms
    if (glow) {
      glow.save();
      glow.globalCompositeOperation = 'lighter';
      const hx = G.x0 + G.w * 0.29, hy = G.y0 + G.h * 0.24;
      // Small and low. The bloom pass blurs this wide and composites it
      // additively, so a generous value here becomes a sun that erases the
      // pane — and with it the crack network, which is the chapter.
      const hr = G.w * 0.19;
      const hg = glow.createRadialGradient(hx, hy, 0, hx, hy, hr);
      hg.addColorStop(0, `rgba(255,252,244,${(0.13 + this.glare * 0.12) * brightness})`);
      hg.addColorStop(1, 'rgba(255,252,244,0)');
      glow.fillStyle = hg;
      glow.beginPath(); glow.arc(hx, hy, hr, 0, TAU); glow.fill();
      glow.restore();
    }
  }

  _smudge(ctx, x, y, r, a) {
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, `rgba(255,250,240,${a})`);
    g.addColorStop(0.6, `rgba(230,240,250,${a * 0.5})`);
    g.addColorStop(1, 'rgba(230,240,250,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  /** The four edges, drawn with real thickness — the money shot of a pane. */
  _paneEdges(ctx, glow, P, b) {
    const G = P.g, u = this.g.u;
    const th = G.th;

    // top edge: a lit parallelogram receding up-right (we see its underside)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(G.x0, G.y0);
    ctx.lineTo(G.x1, G.y0);
    ctx.lineTo(G.x1 + th * 0.55, G.y0 - th * 0.72);
    ctx.lineTo(G.x0 + th * 0.55, G.y0 - th * 0.72);
    ctx.closePath();
    const tg = ctx.createLinearGradient(G.x0, 0, G.x1, 0);
    tg.addColorStop(0, `rgba(178,236,224,${0.55 * b})`);
    tg.addColorStop(0.26, `rgba(255,255,255,${0.92 * b})`);
    tg.addColorStop(0.55, `rgba(206,246,238,${0.5 * b})`);
    tg.addColorStop(0.86, `rgba(255,255,255,${0.7 * b})`);
    tg.addColorStop(1, `rgba(150,214,208,${0.45 * b})`);
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.restore();

    // left / right edges: glass seen end-on is strongly green
    for (const side of [-1, 1]) {
      const x = side < 0 ? G.x0 : G.x1;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, G.y0);
      ctx.lineTo(x, G.y1);
      ctx.lineTo(x + side * th * 0.5, G.y1 - th * 0.2);
      ctx.lineTo(x + side * th * 0.5, G.y0 - th * 0.5);
      ctx.closePath();
      const eg = ctx.createLinearGradient(0, G.y0, 0, G.y1);
      eg.addColorStop(0, `rgba(232,255,250,${0.85 * b})`);
      eg.addColorStop(0.3, `rgba(126,206,190,${0.6 * b})`);
      eg.addColorStop(0.7, `rgba(74,154,150,${0.5 * b})`);
      eg.addColorStop(1, `rgba(150,214,206,${0.7 * b})`);
      ctx.fillStyle = eg;
      ctx.fill();
      ctx.restore();
    }

    // the crisp outline
    ctx.save();
    const og = ctx.createLinearGradient(G.x0, G.y0, G.x1, G.y1);
    og.addColorStop(0, `rgba(255,255,255,${0.90 * b})`);
    og.addColorStop(0.3, `rgba(196,238,232,${0.34 * b})`);
    og.addColorStop(0.62, `rgba(255,255,255,${0.16 * b})`);
    og.addColorStop(1, `rgba(176,214,240,${0.62 * b})`);
    ctx.strokeStyle = og;
    ctx.lineWidth = Math.max(1, u * 0.20);
    ctx.strokeRect(G.x0, G.y0, G.w, G.h);
    ctx.restore();

    if (glow) {
      glow.save();
      glow.globalCompositeOperation = 'lighter';
      const gg = glow.createLinearGradient(G.x0, 0, G.x1, 0);
      gg.addColorStop(0, 'rgba(190,240,230,0)');
      gg.addColorStop(0.3, `rgba(240,255,250,${0.5 * b})`);
      gg.addColorStop(0.62, 'rgba(210,246,240,0.1)');
      gg.addColorStop(1, 'rgba(190,240,230,0)');
      glow.fillStyle = gg;
      glow.fillRect(G.x0, G.y0 - th, G.w, th * 1.9);
      glow.restore();
    }
  }

  _drawFlaw(ctx, glow, P, b) {
    const G = P.g, u = this.g.u;
    const f = G.flaw;
    const pulse = this.flawPulse.active ? Math.sin(this.flawPulse.k * Math.PI) : 0;
    const tw = 0.55 + 0.45 * Math.sin(this.t * 1.7 + P.i);
    const a = (0.5 + pulse * 0.5) * b;

    ctx.save();
    // the conchoidal chip: a tiny bright wedge biting into the edge
    ctx.beginPath();
    ctx.moveTo(f.x - u * 0.5, f.y - u * 1.2);
    ctx.lineTo(f.x + u * 1.5, f.y - u * 0.1);
    ctx.lineTo(f.x + u * 0.5, f.y + u * 0.7);
    ctx.lineTo(f.x - u * 0.5, f.y + u * 1.3);
    ctx.closePath();
    const fg = ctx.createLinearGradient(f.x - u, f.y - u, f.x + u * 1.6, f.y + u);
    fg.addColorStop(0, `rgba(255,255,255,${0.85 * a})`);
    fg.addColorStop(0.5, `rgba(196,244,236,${0.5 * a})`);
    fg.addColorStop(1, `rgba(120,190,190,${0.24 * a})`);
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.6 * a})`;
    ctx.lineWidth = Math.max(0.8, u * 0.1);
    ctx.stroke();
    ctx.restore();

    if (glow) {
      glow.save();
      glow.globalCompositeOperation = 'lighter';
      const r = u * (2.0 + pulse * 3.4);
      const gg = glow.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      gg.addColorStop(0, `rgba(226,255,248,${(0.30 + pulse * 0.5) * tw * b})`);
      gg.addColorStop(1, 'rgba(226,255,248,0)');
      glow.fillStyle = gg;
      glow.beginPath(); glow.arc(f.x, f.y, r, 0, TAU); glow.fill();
      glow.restore();
    }
  }

  // ---------- the mirror ----------
  /**
   * The reflection is not a painting of a room. It is *this* room.
   *
   * The gallery already keeps its wall, its light cone and its plinth as
   * cached layers, so the mirror composites those through a mirror
   * transform — flipped in x, pushed back by a scale about the eye line,
   * then cooled and hazed by the extra distance. The wreckage the player
   * made in Chapters I and II comes with it, lying on the reflected
   * plinth, because it is lying on the real one. Break the mirror having
   * broken nothing yet and the plinth behind you is clean; break it after
   * a bad afternoon and your own mess is in the picture.
   *
   * Then you: two arms, a phone, and the light of it under your jaw.
   *
   * Authored in pane space (0..G.w, 0..G.h) so `_bakeShard` can keep
   * slicing straight out of it, but at device resolution so a shard held
   * close to the camera still has a sharp picture in it.
   */
  _buildReflection() {
    const G = this.g.panes[1];
    const w = Math.max(8, Math.round(G.w)), h = Math.max(8, Math.round(G.h));
    const k = clamp(this.r.dpr, 1, 2);
    const L = new Layer(Math.ceil(w * k), Math.ceil(h * k));
    const c = L.ctx;
    c.setTransform(k, 0, 0, k, 0, 0);
    const u = this.g.u;
    const set = this.game.set, SG = set.geom;

    // the dark the far room sits in — everything else is drawn over it, so
    // any corner the reflected gallery does not reach is simply more room
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#080a11');
    bg.addColorStop(0.46, '#0b0e16');
    bg.addColorStop(1, '#05060a');
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);

    // ---- the gallery, reflected ----
    // s < 1 because the far wall is two mirror-distances away; the flip is
    // about a point left of centre so the reflected plinth clears you
    // instead of hiding directly behind your head.
    if (SG) {
      const s = 0.50;
      const mx = w * 0.24;              // flip axis, in pane space
      const ey = h * 0.42;              // eye line — a mirror's horizon
      c.save();
      c.translate(mx, ey);
      c.scale(-s, s);
      c.translate(-mx, -ey);
      c.translate(-G.x0, -G.y0);        // pane space → world space
      c.globalAlpha = 1;
      c.drawImage(set.wall.canvas, 0, 0, SG.w, SG.h);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.85;
      c.drawImage(set.cone.canvas, 0, 0, SG.w, SG.h);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
      c.drawImage(set.plinth.canvas, 0, 0, SG.w, SG.h);
      // what you have already broken, still on the plinth
      this.game.wreck.draw(c, { ambient: 0.85 });
      c.restore();

      // one exposure lift over the composed room: a reflection of a lit
      // gallery is the brightest thing on this wall, and the figure needs
      // something to be a silhouette against
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.34;
      c.drawImage(L.canvas, 0, 0, w, h);
      c.restore();

      // distance haze: the air between here and there. Weighted to the top,
      // because that is the part of the room furthest behind you — laying it
      // on the bottom instead buries the one object the reflection needs to
      // be recognisable, which is the plinth.
      c.save();
      c.fillStyle = 'rgba(14,19,30,0.12)';
      c.fillRect(0, 0, w, h);
      const hz = c.createLinearGradient(0, 0, 0, h);
      hz.addColorStop(0, 'rgba(20,27,40,0.26)');
      hz.addColorStop(0.62, 'rgba(12,16,25,0.04)');
      hz.addColorStop(1, 'rgba(8,10,16,0.18)');
      c.fillStyle = hz;
      c.fillRect(0, 0, w, h);
      c.restore();

      // the lamp itself, over the viewer's shoulder and out of frame
      c.save();
      c.globalCompositeOperation = 'lighter';
      const lampG = c.createRadialGradient(w * 0.22, -h * 0.05, 0, w * 0.22, -h * 0.05, h * 0.70);
      lampG.addColorStop(0, 'rgba(255,232,190,0.20)');
      lampG.addColorStop(0.42, 'rgba(240,206,160,0.065)');
      lampG.addColorStop(1, 'rgba(240,206,160,0)');
      c.fillStyle = lampG;
      c.fillRect(0, 0, w, h);
      c.restore();
    }

    // ---- you ----
    const px = w * 0.600;
    const headR = w * 0.104, headY = h * 0.330;
    const shY = headY + headR * 2.05;          // shoulder line
    const shHalf = w * 0.200;
    const hy = h * 0.748;                      // hands
    // the phone is placed first and the forearms are aimed at it, so the
    // grip is exact instead of approximately near
    const phW = w * 0.098, phH = phW * 1.86;
    const phX = px + w * 0.004, phY = hy - h * 0.030;
    const hxL = phX - phW * 0.52, hxR = phX + phW * 0.52;
    const INK = '#04050a';
    // Shoulder → elbow → hand as two straight segments with a round join:
    // a bent arm, not a bowed tube. The elbows sit well outside the ribs.
    // The two sides are not quite the same, because nobody's are.
    const armPath = () => {
      c.beginPath();
      c.moveTo(px - shHalf * 0.86, shY + h * 0.012);
      c.lineTo(px - shHalf * 1.62, shY + h * 0.106);
      c.lineTo(hxL, phY + phH * 0.40);
      c.moveTo(px + shHalf * 0.86, shY + h * 0.012);
      c.lineTo(px + shHalf * 1.56, shY + h * 0.092);
      c.lineTo(hxR, phY + phH * 0.34);
    };

    c.save();
    c.fillStyle = INK;
    c.strokeStyle = INK;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // arms first, behind the torso — the elbows reach past the ribs, so
    // what you see of each arm is a bent shape against the room
    c.lineWidth = w * 0.062;
    armPath(); c.stroke();
    // torso: shoulders that fall away to the frame edge, not a bottle
    c.beginPath();
    c.moveTo(px - shHalf * 1.10, h);
    c.bezierCurveTo(px - shHalf * 1.02, h * 0.872, px - shHalf * 0.99, shY + h * 0.050, px - shHalf, shY);
    c.bezierCurveTo(px - shHalf * 0.42, shY - h * 0.022, px - headR * 0.76, shY - h * 0.004, px - headR * 0.62, shY - h * 0.038);
    c.lineTo(px + headR * 0.62, shY - h * 0.038);
    c.bezierCurveTo(px + headR * 0.76, shY - h * 0.004, px + shHalf * 0.42, shY - h * 0.022, px + shHalf, shY);
    c.bezierCurveTo(px + shHalf * 0.99, shY + h * 0.050, px + shHalf * 1.02, h * 0.872, px + shHalf * 1.10, h);
    c.closePath();
    c.fill();
    // neck, then head
    c.strokeStyle = INK;
    c.lineWidth = headR * 0.92;
    c.beginPath();
    c.moveTo(px, headY + headR * 0.85);
    c.lineTo(px, shY - h * 0.028);
    c.stroke();
    c.beginPath();
    c.ellipse(px, headY, headR * 0.86, headR * 1.10, 0, 0, TAU);
    c.fill();
    // the phone catches the top of each forearm — just enough of an edge
    // that the arms do not dissolve into the chest
    c.strokeStyle = 'rgba(128,164,214,0.11)';
    c.lineWidth = Math.max(1, u * 0.22);
    c.beginPath();
    c.moveTo(px - shHalf * 1.60, shY + h * 0.100);
    c.lineTo(hxL - w * 0.008, phY + phH * 0.36);
    c.moveTo(px + shHalf * 1.54, shY + h * 0.086);
    c.lineTo(hxR + w * 0.008, phY + phH * 0.30);
    c.stroke();
    c.restore();

    // the phone: the one bright thing in the room, and it is in your hands
    c.save();
    c.globalCompositeOperation = 'lighter';
    const pg = c.createRadialGradient(phX, phY, 0, phX, phY, h * 0.26);
    pg.addColorStop(0, 'rgba(196,224,255,0.30)');
    pg.addColorStop(0.24, 'rgba(150,190,240,0.075)');
    pg.addColorStop(1, 'rgba(120,160,220,0)');
    c.fillStyle = pg;
    c.fillRect(0, 0, w, h);
    // the screen throwing light up under the jaw
    const ug = c.createRadialGradient(px, headY + headR * 0.72, 0, px, headY + headR * 0.72, headR * 1.6);
    ug.addColorStop(0, 'rgba(150,190,240,0.18)');
    ug.addColorStop(1, 'rgba(150,190,240,0)');
    c.fillStyle = ug;
    c.beginPath(); c.arc(px, headY + headR * 0.72, headR * 1.6, 0, TAU); c.fill();
    c.restore();
    c.save();
    c.translate(phX, phY);
    c.rotate(-0.16);
    roundRectPath(c, -phW / 2, -phH / 2, phW, phH, phW * 0.17);
    const sg = c.createLinearGradient(0, -phH / 2, 0, phH / 2);
    sg.addColorStop(0, 'rgba(216,234,255,0.86)');
    sg.addColorStop(0.55, 'rgba(178,206,242,0.74)');
    sg.addColorStop(1, 'rgba(140,172,214,0.62)');
    c.fillStyle = sg;
    c.fill();
    c.restore();

    // rim light down the left shoulder and skull, from the gallery key
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = 'rgba(255,228,186,0.20)';
    c.lineWidth = Math.max(1, u * 0.20);
    c.beginPath();
    c.arc(px, headY, headR * 0.95, Math.PI * 1.02, Math.PI * 1.42);
    c.stroke();
    c.beginPath();
    c.moveTo(px - shHalf * 1.16, h * 0.905);
    c.bezierCurveTo(px - shHalf * 1.075, h * 0.850, px - shHalf * 1.020, shY + h * 0.048, px - shHalf * 0.975, shY + h * 0.004);
    c.stroke();
    c.restore();

    // the mirror is not perfect: dust and an old wipe arc
    c.save();
    const rng = makeRng(551);
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {
      const a = 0.02 + rng() * 0.05;
      c.fillStyle = `rgba(220,236,255,${a})`;
      c.beginPath();
      c.arc(rng() * w, rng() * h, 0.5 + rng() * 1.6, 0, TAU);
      c.fill();
    }
    c.strokeStyle = 'rgba(226,240,255,0.014)';
    c.lineWidth = u * 1.2;
    c.beginPath();
    c.arc(w * -0.10, h * 0.10, w * 0.42, 0.20, 1.05);
    c.stroke();
    c.restore();

    // vignette so the reflection sits inside the glass rather than on it
    c.save();
    const vg = c.createRadialGradient(w * 0.5, h * 0.48, w * 0.2, w * 0.5, h * 0.5, w * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = vg;
    c.fillRect(0, 0, w, h);
    c.restore();

    this._reflection = L;
  }

  _drawMirrorFace(ctx, glow, P) {
    const G = P.g, u = this.g.u;
    const rv = this.mirrorReveal;
    const lit = this.game.set.lit;

    // the silvered backing: dark and slightly warm even before it resolves
    ctx.fillStyle = '#070810';
    ctx.fillRect(G.x0, G.y0, G.w, G.h);
    const back = ctx.createLinearGradient(G.x0, G.y0, G.x1, G.y1);
    back.addColorStop(0, `rgba(60,72,92,${0.35 * lit})`);
    back.addColorStop(0.45, `rgba(24,28,38,${0.5 * lit})`);
    back.addColorStop(1, `rgba(12,14,20,${0.7 * lit})`);
    ctx.fillStyle = back;
    ctx.fillRect(G.x0, G.y0, G.w, G.h);

    // a resize throws the baked reflection away; rebuild it the first
    // frame it is wanted again rather than showing an empty mirror
    if (rv > 0.005 && !this._reflection) this._buildReflection();

    if (rv > 0.005 && this._reflection) {
      ctx.save();
      ctx.globalAlpha = rv * lit;
      ctx.drawImage(this._reflection.canvas, G.x0, G.y0, G.w, G.h);
      ctx.restore();
      // the phone glow blooms out of the mirror
      if (glow) {
        const px = G.x0 + G.w * 0.563, py = G.y0 + G.h * 0.688;
        glow.save();
        glow.globalCompositeOperation = 'lighter';
        const gg = glow.createRadialGradient(px, py, 0, px, py, G.w * 0.42);
        gg.addColorStop(0, `rgba(180,214,255,${0.34 * rv})`);
        gg.addColorStop(1, 'rgba(180,214,255,0)');
        glow.fillStyle = gg;
        glow.beginPath(); glow.arc(px, py, G.w * 0.42, 0, TAU); glow.fill();
        glow.restore();
      }
      // --- the reflection reaches back ---
      // Touch a mirror and your fingertip meets its reflection exactly at the
      // glass. So the reflected hand terminates precisely under your finger.
      if (rv > 0.5) {
        for (const f of this.fingers) {
          const bx = G.x0 + G.w * 0.5 + (f.x - G.cx) * 0.25;
          const by = G.y1 + G.h * 0.06;
          ctx.save();
          ctx.globalAlpha = clamp01(rv * (0.45 + f.s * 0.55));
          // forearm
          ctx.beginPath();
          ctx.moveTo(bx - G.w * 0.10, by);
          ctx.quadraticCurveTo(
            lerp(bx, f.x, 0.55) - G.w * 0.055, lerp(by, f.y, 0.5),
            f.x - u * 0.9, f.y + u * 0.5);
          ctx.lineTo(f.x + u * 0.9, f.y + u * 0.8);
          ctx.quadraticCurveTo(
            lerp(bx, f.x, 0.55) + G.w * 0.085, lerp(by, f.y, 0.5),
            bx + G.w * 0.11, by);
          ctx.closePath();
          ctx.fillStyle = 'rgba(3,4,8,0.94)';
          ctx.fill();
          // the fingertip itself, meeting yours
          ctx.beginPath();
          ctx.ellipse(f.x, f.y + u * 0.35, u * 1.05, u * 1.5, 0, 0, TAU);
          ctx.fillStyle = 'rgba(6,8,14,0.96)';
          ctx.fill();
          // a rim of gallery light down the near side of the arm
          ctx.strokeStyle = `rgba(255,226,182,${0.16 * rv})`;
          ctx.lineWidth = Math.max(1, u * 0.2);
          ctx.beginPath();
          ctx.moveTo(bx - G.w * 0.10, by);
          ctx.quadraticCurveTo(
            lerp(bx, f.x, 0.55) - G.w * 0.055, lerp(by, f.y, 0.5),
            f.x - u * 0.9, f.y + u * 0.5);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  // ---------- stress fields ----------
  _drawStress(ctx, glow, P) {
    if (!this.fingers.length) return;
    const G = P.g, u = this.g.u;
    const two = this.fingers.length >= 2;

    // where the pane wants a second contact — the field visibly leans there
    let wantX = 0, wantY = 0, wantA = 0;
    if (!two) {
      const f = this.fingers[0];
      wantX = clamp(2 * G.cx - f.x, G.x0 + G.w * 0.12, G.x1 - G.w * 0.12);
      wantY = clamp(2 * (G.y1 - G.h * 0.5) - f.y, G.y0 + G.h * 0.12, G.y1 - G.h * 0.12);
      wantA = smoothstep(clamp01((f.s - 0.28) / 0.5));
    }

    ctx.save();
    this._panePath(ctx, G);
    ctx.clip();

    for (const f of this.fingers) {
      const s = f.s;
      if (s < 0.02) continue;
      // the field is elongated toward wherever the load wants to go
      const tx = two ? this.stressMid.x : wantX;
      const ty = two ? this.stressMid.y : wantY;
      const ang = Math.atan2(ty - f.y, tx - f.x);
      const stretch = two ? 1.18 : 1.0 + wantA * 0.7;

      // --- heat bloom
      const hr = u * (2.2 + s * 9);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // Kept low deliberately. Two of these, drawn additively and then
      // amplified by the bloom pass, were compounding into a single white
      // sun that swallowed the pane — including the crack network, which
      // is the best thing in the chapter. The fringes below carry the
      // information; this is only the warmth under them.
      const hg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, hr);
      hg.addColorStop(0, `rgba(255,214,170,${0.08 + s * 0.13})`);
      hg.addColorStop(0.3, `rgba(255,172,124,${0.05 + s * 0.09})`);
      hg.addColorStop(0.68, `rgba(196,124,190,${0.03 + s * 0.07})`);
      hg.addColorStop(1, 'rgba(160,110,210,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(f.x, f.y, hr, 0, TAU); ctx.fill();
      ctx.restore();

      // --- isochromatic fringes: concentric interference rings
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(f.x, f.y);
      ctx.rotate(ang);
      ctx.scale(stretch, 1 / (0.88 + stretch * 0.12));
      const rings = 3 + Math.round(s * 7);
      const R0 = u * 1.5;
      for (let i = 0; i < rings; i++) {
        const k = (i + 1) / rings;
        const rr = R0 + Math.pow(k, 0.72) * u * (5 + s * 16);
        const col = FRINGE[i % FRINGE.length];
        const a = (0.10 + s * 0.38) * (1 - k * 0.5);
        ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
        ctx.lineWidth = Math.max(0.9, u * (0.34 - k * 0.16));
        ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
      }
      // --- isoclinics: dark brushes radiating outward
      const spokes = 12;
      const rOut = R0 + u * (5 + s * 16) * 1.05;
      for (let i = 0; i < spokes; i++) {
        const a0 = (i / spokes) * TAU + this.t * 0.12;
        const dim = 0.13 + s * 0.28;
        const grd = ctx.createLinearGradient(
          Math.cos(a0) * R0, Math.sin(a0) * R0,
          Math.cos(a0) * rOut, Math.sin(a0) * rOut);
        grd.addColorStop(0, `rgba(255,246,232,${dim})`);
        grd.addColorStop(0.55, `rgba(190,214,255,${dim * 0.5})`);
        grd.addColorStop(1, 'rgba(190,214,255,0)');
        ctx.strokeStyle = grd;
        ctx.lineWidth = Math.max(0.8, u * 0.16);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a0) * R0, Math.sin(a0) * R0);
        ctx.lineTo(Math.cos(a0) * rOut, Math.sin(a0) * rOut);
        ctx.stroke();
      }
      ctx.restore();

      if (glow) {
        glow.save();
        glow.globalCompositeOperation = 'lighter';
        const gr = u * (1.6 + s * 4.2);
        const gg = glow.createRadialGradient(f.x, f.y, 0, f.x, f.y, gr);
        gg.addColorStop(0, `rgba(255,206,164,${0.06 + s * 0.15})`);
        gg.addColorStop(1, 'rgba(255,170,150,0)');
        glow.fillStyle = gg;
        glow.beginPath(); glow.arc(f.x, f.y, gr, 0, TAU); glow.fill();
        glow.restore();
      }
    }

    // --- one finger: the pane reaches for a second one
    if (!two && wantA > 0.02) {
      const f = this.fingers[0];
      const puls = 0.5 + 0.5 * Math.sin(this.t * 4.2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // a tendril of stress leaning across the pane
      const grd = ctx.createLinearGradient(f.x, f.y, wantX, wantY);
      grd.addColorStop(0, `rgba(255,196,150,${0.22 * wantA})`);
      grd.addColorStop(0.6, `rgba(196,152,236,${0.10 * wantA})`);
      grd.addColorStop(1, `rgba(150,190,255,${0.03 * wantA})`);
      ctx.strokeStyle = grd;
      ctx.lineWidth = Math.max(1.4, this.g.u * (0.5 + wantA * 0.7));
      ctx.setLineDash([this.g.u * 1.1, this.g.u * 1.5]);
      ctx.lineDashOffset = -this.t * this.g.u * 8;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.quadraticCurveTo((f.x + wantX) / 2, (f.y + wantY) / 2 - this.g.u * 4, wantX, wantY);
      ctx.stroke();
      ctx.setLineDash([]);
      // the ghost of the contact it is missing
      const rr = this.g.u * (3.4 + puls * 1.3);
      ctx.strokeStyle = `rgba(226,216,255,${(0.16 + puls * 0.26) * wantA})`;
      ctx.lineWidth = Math.max(1.2, this.g.u * 0.3);
      ctx.setLineDash([this.g.u * 0.9, this.g.u * 0.9]);
      ctx.beginPath(); ctx.arc(wantX, wantY, rr, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      const hg = ctx.createRadialGradient(wantX, wantY, 0, wantX, wantY, rr * 1.9);
      hg.addColorStop(0, `rgba(198,178,255,${0.13 * wantA * (0.5 + puls * 0.5)})`);
      hg.addColorStop(1, 'rgba(198,178,255,0)');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(wantX, wantY, rr * 1.9, 0, TAU); ctx.fill();
      ctx.restore();
      if (glow && wantA > 0.4) {
        glow.save();
        glow.globalCompositeOperation = 'lighter';
        const gg = glow.createRadialGradient(wantX, wantY, 0, wantX, wantY, this.g.u * 6);
        gg.addColorStop(0, `rgba(190,170,255,${0.16 * wantA * puls})`);
        gg.addColorStop(1, 'rgba(190,170,255,0)');
        glow.fillStyle = gg;
        glow.beginPath(); glow.arc(wantX, wantY, this.g.u * 6, 0, TAU); glow.fill();
        glow.restore();
      }
    }

    // --- two fingers: where the fringe families meet, they beat
    if (two && this.combined > 0.04) {
      const f = this.fingers.slice().sort((a, b) => b.s - a.s);
      const a = f[0], b = f[1];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const sep = Math.hypot(a.x - b.x, a.y - b.y);
      const lens = Math.max(u * 3, sep * 0.42) * (0.5 + this.combined * 0.7);
      const c = this.combined;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.ellipse(mx, my, lens, lens * 0.78, Math.atan2(b.y - a.y, b.x - a.x), 0, TAU);
      ctx.clip();
      // draw both ring families tightly here → real moiré, not a painted glow
      for (const src of [a, b]) {
        for (let i = 0; i < 16; i++) {
          const rr = u * 1.2 + i * u * (1.5 - c * 0.6);
          const col = FRINGE[(i + 2) % FRINGE.length];
          ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.05 + c * 0.13})`;
          ctx.lineWidth = Math.max(0.8, u * 0.22);
          ctx.beginPath(); ctx.arc(src.x, src.y, rr, 0, TAU); ctx.stroke();
        }
      }
      const ng = ctx.createRadialGradient(mx, my, 0, mx, my, lens);
      ng.addColorStop(0, `rgba(255,252,244,${0.10 + c * 0.34})`);
      ng.addColorStop(0.4, `rgba(255,206,168,${0.05 + c * 0.17})`);
      ng.addColorStop(1, 'rgba(255,180,180,0)');
      ctx.fillStyle = ng;
      ctx.fillRect(mx - lens * 1.2, my - lens * 1.2, lens * 2.4, lens * 2.4);
      ctx.restore();

      // and a hot line joining the two contacts, tightening as it goes
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const lg = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      lg.addColorStop(0, `rgba(255,226,190,${0.1 + c * 0.34})`);
      lg.addColorStop(0.5, `rgba(255,255,246,${0.06 + c * 0.5})`);
      lg.addColorStop(1, `rgba(255,226,190,${0.1 + c * 0.34})`);
      ctx.strokeStyle = lg;
      ctx.lineWidth = Math.max(1, u * (0.16 + c * 0.5));
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.restore();

      // the flaw lights up: it knows
      if (glow) {
        const fl = G.flaw;
        glow.save();
        glow.globalCompositeOperation = 'lighter';
        const rr = u * (2 + c * 8);
        const gg = glow.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, rr);
        gg.addColorStop(0, `rgba(255,240,220,${0.2 + c * 0.6})`);
        gg.addColorStop(1, 'rgba(255,200,190,0)');
        glow.fillStyle = gg;
        glow.beginPath(); glow.arc(fl.x, fl.y, rr, 0, TAU); glow.fill();
        glow.restore();
      }
      if (glow) {
        glow.save();
        glow.globalCompositeOperation = 'lighter';
        const gg = glow.createRadialGradient(mx, my, 0, mx, my, lens * 1.4);
        gg.addColorStop(0, `rgba(255,246,232,${0.14 + c * 0.5})`);
        gg.addColorStop(1, 'rgba(255,220,200,0)');
        glow.fillStyle = gg;
        glow.beginPath(); glow.arc(mx, my, lens * 1.4, 0, TAU); glow.fill();
        glow.restore();
      }
    }

    ctx.restore();
  }

  // ---------- the crack ----------
  _crackPath(c) {
    if (c.path2d) return c.path2d;
    const p = new Path2D();
    for (const tip of c.paths) {
      const pts = tip.pts;
      if (pts.length < 4) continue;
      p.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
    }
    c.path2d = p;
    return p;
  }

  _drawCrack(ctx, glow, P) {
    const c = P.crack;
    if (!c) return;
    const u = this.g.u, G = P.g;
    const path = this._crackPath(c);
    const hot = c.running ? 1 : 0.4;

    ctx.save();
    this._panePath(ctx, G);
    ctx.clip();

    // 1. stress whitening — glass crazes around a running crack
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(214,238,255,${0.055 + hot * 0.06})`;
    ctx.lineWidth = u * (1.5 + hot * 1.6);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke(path);
    ctx.restore();

    // 2. the dark opening
    ctx.strokeStyle = `rgba(8,12,20,${0.55 + hot * 0.25})`;
    ctx.lineWidth = Math.max(1.1, u * 0.30);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke(path);

    // 3. the lit fracture face, offset toward the key light
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(-u * 0.11, -u * 0.15);
    ctx.strokeStyle = `rgba(255,255,255,${0.42 + hot * 0.34})`;
    ctx.lineWidth = Math.max(0.8, u * 0.15);
    ctx.stroke(path);
    ctx.restore();

    // 4. the live tips: hot, and shedding light
    for (const tip of c.tips) {
      if (!tip.alive || !c.running) continue;
      // the last committed node → the current tip
      const n = tip.pts.length;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,246,226,0.8)';
      ctx.lineWidth = Math.max(1, u * 0.22);
      ctx.beginPath();
      ctx.moveTo(tip.pts[n - 2], tip.pts[n - 1]);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.restore();
      if (glow) {
        glow.save();
        glow.globalCompositeOperation = 'lighter';
        // the running tip is a spark, not a floodlight
        const rr = u * (1.5 - tip.gen * 0.3);
        const gg = glow.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, rr * 2.2);
        gg.addColorStop(0, 'rgba(255,244,222,0.30)');
        gg.addColorStop(1, 'rgba(255,214,180,0)');
        glow.fillStyle = gg;
        glow.beginPath(); glow.arc(tip.x, tip.y, rr * 2.4, 0, TAU); glow.fill();
        glow.restore();
      }
    }

    // 5. arrested: a slow glint travels the scar so you never forget it
    if (!c.running) {
      const k = (this.t * 0.32) % 1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.setLineDash([u * 1.4, u * 26]);
      ctx.lineDashOffset = -k * u * 27.4;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(1, u * 0.28);
      ctx.stroke(path);
      ctx.setLineDash([]);
      ctx.restore();
    }
    ctx.restore();
  }

  _strokeScar(ctx, glow, scar, P) { /* scars are folded into P.crack */ }

  // ---------- shards ----------
  _drawShards(ctx, glow, P) {
    if (!P.shards.length) return;
    const u = this.g.u;
    const lit = this.game.set.lit;
    const mirror = P.kind === 'mirror';

    // --- caustics the pile throws on the plinth (bounded count)
    let cn = 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const d of P.shards) {
      if (cn++ > 14) break;
      const a = (d.rest ? 0.09 : 0.05) * lit;
      const r = d.data.r * 1.5;
      const cy = d.rest ? d.floorY + u * 0.5 : d.floorY + u * 0.4;
      const gg = ctx.createRadialGradient(d.x + u * 0.6, cy, 0, d.x + u * 0.6, cy, r);
      gg.addColorStop(0, `rgba(255,244,216,${a})`);
      gg.addColorStop(0.5, `rgba(206,236,255,${a * 0.4})`);
      gg.addColorStop(1, 'rgba(206,236,255,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.ellipse(d.x + u * 0.6, cy, r, r * 0.34, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // --- shadows
    ctx.save();
    for (const d of P.shards) {
      if (!d.rest) continue;
      ctx.globalAlpha = 0.5 * lit;
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath();
      ctx.ellipse(d.x + u * 0.5, d.floorY + u * 0.35, d.data.r * 1.1, d.data.r * 0.34, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // --- bodies
    for (const d of P.shards) {
      if (!d.nrm) d.nrm = facetNormal((d.data.restX ?? d.x) * 131 + (d.data.restY ?? d.y) * 71);
      d.diff = Math.max(0, d.nrm.x * KEY.x + d.nrm.y * KEY.y + d.nrm.z * KEY.z);
      ctx.save();
      ctx.translate(d.x, d.y);
      // Once a piece stops moving it is lying ON the plinth, seen at a
      // shallow angle — not standing on its edge. Without this squash the
      // pile grows into a hedge of vertical slivers.
      if (d.rest) ctx.scale(1, d.tilt ?? 0.52);
      ctx.rotate(d.a);
      if (mirror && d.img) {
        // the shard still shows its piece of the reflection
        ctx.drawImage(d.img.canvas, -d.img.r, -d.img.r, d.img.r * 2, d.img.r * 2);
        if (!d.gloss) d.gloss = this._shardGrad(ctx, d.data.r, true);
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = d.gloss;
        ctx.fill(d.p2);
        ctx.restore();
        // Every piece now faces its own way, so every piece catches the
        // gallery lamp differently. A few blaze white; the rest keep the
        // picture. That split is what a broken mirror actually looks like,
        // and it is why the pile reads as mirror and not as more glass.
        const sheen = 0.5 + 0.5 * Math.cos(d.a * 2 + d.spark * 1.7);
        if (sheen > 0.62) {
          if (!d.sheenG) d.sheenG = this._sheenGrad(ctx, d.data.r);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (sheen - 0.62) * 1.5 * lit;
          ctx.fillStyle = d.sheenG;
          ctx.fill(d.p2);
          ctx.restore();
        }
      } else {
        // Clear glass over a lit surface IS that surface, darkened, plus a
        // caustic on its edges. This was a cached screen-space gradient
        // that did not know which way its own piece was facing, so a
        // hundred and sixty of them had one value between them — a decal
        // sheet, and at moderate alpha the middle of the heap composited
        // to solid white. A flat fill keyed to the facet is both cheaper
        // and the only thing that gives a pile a range.
        ctx.fillStyle = `rgba(10,16,24,${(0.34 - d.diff * 0.16) * lit})`;
        ctx.fill(d.p2);
        if (d.diff > 0.66) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = `rgba(216,240,255,${(d.diff - 0.66) * 0.9 * lit})`;
          ctx.fill(d.p2);
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // --- edges, bucketed
    // Batching all the lit edges into one path made every caustic in the
    // heap the same weight and the same white, whatever the piece was
    // doing — a hundred and sixty identical 2px strokes, which is exactly
    // what cut paper looks like. Three buckets instead of one still costs
    // three strokes for the whole pile, and gives the pile a range.
    const dimP = new Path2D(), litLo = new Path2D(), litHi = new Path2D();
    const LX = -0.55, LY = -0.8;
    for (const d of P.shards) {
      const ca = Math.cos(d.a), sa = Math.sin(d.a);
      const fl = d.rest ? (d.tilt ?? 0.52) : 1;   // matches the body pass
      const poly = d.poly, n = poly.length >> 1;
      const hot = (d.diff ?? 0.5) > 0.55;
      let px = d.x + poly[(n - 1) * 2] * ca - poly[(n - 1) * 2 + 1] * sa;
      let py = d.y + (poly[(n - 1) * 2] * sa + poly[(n - 1) * 2 + 1] * ca) * fl;
      for (let i = 0; i < n; i++) {
        const qx = d.x + poly[i * 2] * ca - poly[i * 2 + 1] * sa;
        const qy = d.y + (poly[i * 2] * sa + poly[i * 2 + 1] * ca) * fl;
        // outward normal of this edge (CCW polygon → normal is (dy,-dx))
        const ex = qx - px, ey = qy - py;
        const L = Math.hypot(ex, ey) || 1;
        const nx = ey / L, ny = -ex / L;
        // Only edges genuinely turned toward the key light catch it: at a
        // loose threshold roughly half of every outline landed in the lit
        // bucket, which reads as a scribble rather than as glass.
        const tgt = (nx * LX + ny * LY) > (mirror ? 0.42 : 0.62)
          ? (hot ? litHi : litLo) : dimP;
        tgt.moveTo(px, py); tgt.lineTo(qx, qy);
        px = qx; py = qy;
      }
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(96,134,156,${0.20 * lit})`;
    ctx.lineWidth = Math.max(0.6, u * 0.08);
    ctx.stroke(dimP);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(226,244,255,${(mirror ? 0.30 : 0.13) * lit})`;
    ctx.lineWidth = Math.max(0.6, u * (mirror ? 0.10 : 0.075));
    ctx.stroke(litLo);
    ctx.strokeStyle = `rgba(255,255,255,${(mirror ? 0.72 : 0.42) * lit})`;
    ctx.lineWidth = Math.max(0.7, u * (mirror ? 0.14 : 0.10));
    ctx.stroke(litHi);
    ctx.restore();

    // --- sparkle: a rotating subset so the pile never sits still
    if (glow) {
      glow.save();
      glow.globalCompositeOperation = 'lighter';
      const off = (this.t * 7) | 0;
      let k = 0;
      for (let i = 0; i < P.shards.length && k < 12; i++) {
        const d = P.shards[(i * 7 + off) % P.shards.length];
        if (!d.rest && Math.abs(d.vy) < 40) continue;
        const tw = 0.4 + 0.6 * Math.sin(this.t * 3.2 + d.spark * 2.1 + d.x * 0.05);
        if (tw < 0.35) continue;
        k++;
        const r = d.data.r * (0.8 + tw * 0.8);
        const gg = glow.createRadialGradient(d.x, d.y, 0, d.x, d.y, r);
        gg.addColorStop(0, `rgba(236,250,255,${0.13 * tw * lit})`);
        gg.addColorStop(1, 'rgba(236,250,255,0)');
        glow.fillStyle = gg;
        glow.beginPath(); glow.arc(d.x, d.y, r, 0, TAU); glow.fill();
      }
      glow.restore();
    }
  }

  /** Warm gallery light landing flat on a silvered face. */
  _sheenGrad(ctx, r) {
    const g = ctx.createLinearGradient(-r * 0.6, -r, r * 0.6, r);
    g.addColorStop(0, 'rgba(255,246,226,0.92)');
    g.addColorStop(0.45, 'rgba(236,242,255,0.52)');
    g.addColorStop(1, 'rgba(176,200,236,0.20)');
    return g;
  }

  /** A local-space gradient cached per shard: built once, drawn every frame. */
  _shardGrad(ctx, r, gloss) {
    const g = ctx.createLinearGradient(-r, -r, r, r);
    if (gloss) {
      g.addColorStop(0, 'rgba(255,255,255,0.30)');
      g.addColorStop(0.35, 'rgba(214,238,255,0.06)');
      g.addColorStop(0.72, 'rgba(120,160,200,0.05)');
      g.addColorStop(1, 'rgba(255,255,255,0.16)');
    } else {
      // Deliberately faint. A hundred and sixty of these overlap, and
      // transparency ACCUMULATES — at 0.5 each the pile composites to
      // solid white and stops being glass. Individually almost invisible
      // is what makes the heap read as a heap.
      g.addColorStop(0, 'rgba(228,250,246,0.30)');
      g.addColorStop(0.28, 'rgba(176,220,226,0.11)');
      g.addColorStop(0.55, 'rgba(242,254,255,0.17)');
      g.addColorStop(0.8, 'rgba(124,178,190,0.10)');
      g.addColorStop(1, 'rgba(200,238,242,0.26)');
    }
    return g;
  }
}
