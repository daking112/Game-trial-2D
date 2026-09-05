// ============================================================
// l3-squeeze.js — CHAPTER III · DO NOT SQUEEZE
// ------------------------------------------------------------
// A bead of something soft and alive-adjacent, cradled in a steel dish.
//
// Beats:
//   1. it sits there breathing      → knock the plinth and it jiggles
//   2. one finger pokes it          → a real dent that chases the finger,
//                                     then a wobble on release. But one
//                                     finger is NOT enough: the thing
//                                     squirts out from under you and
//                                     creeps away. Your own hand suggests
//                                     the answer.
//   3. two fingers pinch            → now it can't escape. The waist thins,
//                                     the poles bulge and whiten, veins
//                                     surface, light starts coming THROUGH
//                                     the neck, a seam opens.
//   4. it gives                     → the neck severs. Mitosis. There are
//                                     two of them now, each one a real,
//                                     independent, squeezable soft body.
//                                     And you can do it again. And again.
//                                     Until they're too small, and then
//                                     they just pop.
//
// Everything it loses stays on the plinth forever (wreckage: 'bead').
// ============================================================

import { Level } from '../level.js';
import {
  TAU, clamp, clamp01, lerp, damp, smoothstep, rand, rrange, makeRng,
} from '../../core/math.js';
import {
  VerletWorld, BendConstraint, makeSoftBody,
} from '../../physics/verlet.js';
import { contactShadow, engrave, PALETTES, metalFill } from '../../render/materials.js';
import { Audio } from '../../core/audio.js';
import Haptics from '../../core/haptics.js';
import { Pulse } from '../../core/tween.js';

// ------------------------------------------------------------
// Material identity
// ------------------------------------------------------------
const SKIN = {
  lit:   '#f0a08e',
  mid:   '#c4515c',
  deep:  '#7a1c31',
  dark:  '#420e1e',
  edge:  '#280713',
  trans: '255,132,96',      // light coming through the body
  sss:   '255,116,104',
  bead:  '198,84,96',       // wreckage hue
  nucleus: '92,12,30',
};

const MAX_GEN = 2;          // gen 0 → 2 → 4 ; generation 2 pops instead
const MAX_BLOBS = 7;

// ============================================================
// Sound — composed here from Audio.modal / air / click / thud only.
// Nothing in audio.js is touched.
// ============================================================
const A = Audio;
const S = {
  /** a fingertip landing on wet silicone */
  contact(pan = 0) {
    A.air({ dur: 0.085, f0: 620, f1: 190, gain: 0.05, q: 1.5, send: 0.20, pan });
    A.modal(88, [[1, 0.055, 0.10], [2.14, 0.02, 0.055]], { gain: 0.5, send: 0.16, pan });
    A.click({ f: 900, gain: 0.045, dur: 0.014, q: 1.2, send: 0.1 });
  },
  /** displacement — the gooey body note. amt 0..1 */
  squelch(amt = 0.5, pan = 0) {
    const a = clamp01(amt);
    A.air({ dur: 0.11 + a * 0.16, f0: 240 + a * 780, f1: 105, gain: 0.03 + 0.055 * a, q: 2.4, send: 0.24, pan });
    A.modal(58 + a * 74, [[1, 0.03 + 0.05 * a, 0.16], [1.87, 0.022, 0.10], [3.09, 0.011, 0.055]],
      { gain: 0.55, send: 0.2, pan });
  },
  /** one fibre in the skin letting go */
  fibre(level = 0, pan = 0) {
    const l = clamp01(level);
    A.click({ f: 380 + l * 1500 + rrange(-140, 140), gain: 0.035 + l * 0.075, dur: 0.016 + rand() * 0.02, q: 2.2, send: 0.3 });
    A.modal(190 + l * 520, [[1, 0.018 + l * 0.03, 0.05 + rand() * 0.06], [2.7, 0.01, 0.03]],
      { gain: 0.5, send: 0.34, pan });
  },
  /** the whole body wobbling back into shape */
  wobble(v = 0.5, pan = 0) {
    const a = clamp01(v);
    A.modal(44 + a * 40, [[1, 0.06 * a + 0.02, 0.5], [1.62, 0.03 * a, 0.32], [2.71, 0.014 * a, 0.2]],
      { gain: 0.6, send: 0.3, pan });
    A.air({ dur: 0.24, f0: 300, f1: 90, gain: 0.028 * a, q: 1.1, send: 0.3, pan });
  },
  /** knuckle on the plinth */
  knock(pan = 0) {
    A.thud({ f0: 210, f1: 62, gain: 0.26, dur: 0.2, click: 0.14, send: 0.3 });
    A.modal(340, [[1, 0.05, 0.13], [2.9, 0.02, 0.06]], { gain: 0.5, send: 0.35, pan });
  },
  /** membrane tearing — the moment it gives */
  rip(power = 1) {
    const t0 = A.ctx ? A.ctx.currentTime : 0;
    A.air({ t: t0, dur: 0.07, f0: 2600, f1: 420, gain: 0.22 * power, q: 0.7, send: 0.3 });
    A.air({ t: t0 + 0.01, dur: 0.34, f0: 900, f1: 120, gain: 0.16 * power, q: 1.4, send: 0.5 });
    A.thud({ t: t0, f0: 190, f1: 40, gain: 0.44 * power, dur: 0.36, click: 0.16 });
    for (let i = 0; i < 12; i++) {
      A.click({ t: t0 + rrange(0, 0.16) ** 1.3, f: rrange(400, 2600), gain: rrange(0.03, 0.09) * power, dur: 0.02, q: 2.4, send: 0.34 });
    }
    A.modal(72, [[1, 0.10 * power, 0.7], [1.71, 0.05, 0.42], [2.9, 0.02, 0.24]], { gain: 0.6, send: 0.5 });
    A.sidechain(0.42, 0.42);
  },
  /** a droplet hitting the plinth */
  splat(pan = 0, size = 1) {
    A.air({ dur: 0.05 + size * 0.05, f0: 1500 / (0.6 + size), f1: 210, gain: 0.028 * size, q: 2.6, send: 0.3, pan });
    A.modal(120 / (0.5 + size * 0.6), [[1, 0.02 * size, 0.06]], { gain: 0.5, send: 0.4, pan });
  },
  /** a small one giving up entirely */
  pop(pan = 0) {
    A.air({ dur: 0.05, f0: 2000, f1: 300, gain: 0.16, q: 0.8, send: 0.28, pan });
    A.thud({ f0: 240, f1: 70, gain: 0.26, dur: 0.16, click: 0.18 });
    A.modal(320, [[1, 0.05, 0.12], [2.3, 0.03, 0.07]], { gain: 0.5, send: 0.5, pan });
  },
  /** the seal closing on a fresh child */
  seal(pan = 0) {
    A.air({ dur: 0.18, f0: 180, f1: 700, gain: 0.05, q: 1.6, send: 0.4, pan });
    A.modal(150, [[1, 0.04, 0.28], [2.2, 0.02, 0.16]], { gain: 0.5, send: 0.5, pan });
  },
};

// ------------------------------------------------------------
// path helpers
// ------------------------------------------------------------
/**
 * Closed Catmull-Rom through the simulated ring, emitted as cubic Béziers.
 *
 * The obvious quadratic-through-midpoints version never actually reaches
 * the simulated points, so the silhouette flattens between them and a
 * soft body ends up looking like a polygon — which is the single fastest
 * way to lose the illusion that it is soft. This interpolates THROUGH
 * every point, so a fingertip dimple stays as sharp as the sim made it.
 */
function ringPath(ctx, pts) {
  const n = pts.length;
  if (n < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i];
    const p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
      p2.x, p2.y);
  }
  ctx.closePath();
}

// ============================================================
export class L3Squeeze extends Level {
  static id = 'l3';
  static chapter = 'II';
  static rule = 'Do not squeeze';
  static hint = 'Squeeze it';

  // ---------------------------------------------------------
  // layout
  // ---------------------------------------------------------
  layout(w, h, u) {
    const G = this.game.set.geom;
    const R = G.heroR * 0.84;
    const dishRx = G.heroR * 1.06;
    const g = {
      w, h, u, cx: G.cx, R,
      dishRx, dishRy: dishRx * 0.235,
      dishY: G.topY - u * 1.1,
      topY: G.topY,
    };
    g.floorY = g.dishY + g.dishRy * 0.30;
    g.wallL = g.cx - dishRx * 0.90;
    g.wallR = g.cx + dishRx * 0.90;
    g.restY = g.floorY - R * 0.86;

    const old = this.g;
    this.g = g;

    if (this.world) {
      // rescale everything so a rotate/resize doesn't lose the specimen
      const sx = g.R / old.R;
      for (const p of this.world.points) {
        const nx = g.cx + (p.x - old.cx) * sx;
        const ny = g.floorY + (p.y - old.floorY) * sx;
        p.ox = nx - (p.x - p.ox) * sx; p.oy = ny - (p.y - p.oy) * sx;
        p.x = nx; p.y = ny;
      }
      for (const b of this.blobs) {
        b.r *= sx; b.shellRest *= sx;
        for (const c of b.shell) { c.rest *= sx; c.nominal *= sx; }
        b.area.rest *= sx * sx;
        b.nx = g.cx + (b.nx - old.cx) * sx;
        b.ny = g.floorY + (b.ny - old.floorY) * sx;
      }
      this._applyBounds();
    }
  }

  _applyBounds() {
    const g = this.g;
    this.world.bounds = { x: g.wallL, w: g.wallR - g.wallL, y: -g.h * 4, h: g.floorY + g.h * 4 };
  }

  // ---------------------------------------------------------
  // enter
  // ---------------------------------------------------------
  enter() {
    const g = this.g;
    this.world = new VerletWorld({ gravity: 1500, damping: 0.984, iterations: 7, substeps: 2 });
    this._applyBounds();
    this.world.colliders = [];

    this.blobs = [];
    this.fingers = [];
    this._seed = 0;
    this.splits = 0;
    this.bursts = 0;
    this.pokes = 0;
    this.beads = 0;
    this.maxGen = 0;
    this.load = 0;
    this.stress = 0;
    this.fingersOn = 0;
    this.escapeDist = 0;
    this.phase = 'idle';
    this.everTwoFinger = false;
    this.sawSeam = false;
    this.sawLight = false;
    this.knocks = 0;
    this.narr = 0;
    this._creakT = 0;
    this._weepT = 0;
    this._shiverT = 5;
    this.flashPulse = new Pulse(0.5);
    this.spill = [];            // free droplets that will become wreckage
    this.stain = [];            // wet marks on the dish

    this._makeBlob(g.cx, g.restY, g.R, 46, 0);

    this._pFloor = this.p.floor;
    this.p.floor = g.topY + g.dishRy * 0.5;

    this.strain = null;

  }

  exit() {
    this.hideHint();
    if (this.strain) { this.strain.stop(0.3); this.strain = null; }
    this.p.floor = this._pFloor ?? Infinity;
  }

  intro() {
    this.say("This one is warm.", { hold: 1.5 });
    this.say("Do not squeeze it.", { hold: 2.4 });
  }

  probe() {
    const b = this.blobs[0];
    return {
      phase: this.phase,
      blobs: this.blobs.length,
      generation: this.maxGen,
      fingersOn: this.fingersOn,
      load: +this.load.toFixed(2),
      stress: +this.stress.toFixed(2),
      compression: +(b ? b.comp : 0).toFixed(3),
      neck: +this.neck01.toFixed(2),
      splits: this.splits,
      bursts: this.bursts,
      pokes: this.pokes,
      pinched: this.everTwoFinger,
      sawSeam: this.sawSeam,
      lightThrough: this.sawLight,
      knocks: this.knocks,
      beadsLeft: this.beads,
      droplets: this.spill.length,
      solved: this.solved,
    };
  }

  get neck01() {
    let m = 0;
    for (const b of this.blobs) m = Math.max(m, b.neck || 0);
    return m;
  }

  // ---------------------------------------------------------
  // blob construction
  // ---------------------------------------------------------
  _makeBlob(cx, cy, r, n, gen) {
    const w = this.world;
    const c0 = w.constraints.length;
    const sb = makeSoftBody(w, cx, cy, r, n, {
      mass: 1, shell: 0.96, spoke: 0.055, pressure: 1, area: 1.0,
    });
    const shell = w.constraints.slice(c0, c0 + n);
    for (const c of shell) c.nominal = c.rest;
    // surface tension: resists sharp kinks, lets broad dents through
    const bend = [];
    for (let i = 0; i < n; i++) {
      const bc = new BendConstraint(sb.points[i], sb.points[(i + 1) % n], sb.points[(i + 2) % n], 0.05);
      w.addConstraint(bc);
      bend.push(bc);
    }
    const b = {
      id: ++this._seed,
      gen,
      r,
      points: sb.points,
      area: sb.area,
      shell, bend,
      shellRest: 2 * r * Math.sin(Math.PI / n),
      edge: new Float32Array(n),
      white: new Float32Array(n),
      comp: 0, load: 0, stress: 0, neck: 0, maxStretch: 0,
      fingers: 0, prevFingers: 0,
      reb: 0, rebV: 0,
      cx, cy, rx: r, ry: r,
      nx: cx, ny: cy, nvx: 0, nvy: 0,     // nucleus
      phase: rand() * TAU,
      seal: 0, sealA: null, sealB: null,
      escapeBias: rand() < 0.5 ? -1 : 1,
      born: this.t,
      seed: (rand() * 1e6) | 0,
      axX: 1, axY: 0, mx: cx, my: cy,
    };
    this.blobs.push(b);
    this.maxGen = Math.max(this.maxGen, gen);
    return b;
  }

  _destroyBlob(b) {
    const ps = new Set(b.points);
    const w = this.world;
    w.points = w.points.filter(p => !ps.has(p));
    w.constraints = w.constraints.filter(c => {
      if (c.pts) return c.pts !== b.points;
      if (c.c) return !(ps.has(c.a) || ps.has(c.b) || ps.has(c.c));
      return !(ps.has(c.a) || ps.has(c.b));
    });
    const i = this.blobs.indexOf(b);
    if (i >= 0) this.blobs.splice(i, 1);
  }

  // ---------------------------------------------------------
  // update
  // ---------------------------------------------------------
  update(dt) {
    this.flashPulse.update(dt);
    this._updateFingers(dt);
    this._updateBlobs(dt);
    this.world.step(Math.min(dt, 1 / 50));
    this._postSim(dt);
    this._updateSpill(dt);
    this._updateStrainVoice(dt);
    this._hints(dt);
  }

  // ---------------- fingers ----------------
  _updateFingers(dt) {
    const g = this.g;
    const fr = g.R * 0.21;
    this.fingers.length = 0;

    for (const p of this.input.list) {
      if (p.claimedBy && p.claimedBy !== this.tag) continue;
      if (!p.data.l3) {
        // claim on press: anywhere near the dish is fair game
        if (!this.input.presses.includes(p)) continue;
        const near = this._nearestBlob(p.x, p.y);
        const onBlob = near && near.d < near.b.r * 1.30;
        p.claimedBy = this.tag;
        p.data.l3 = { on: !!onBlob, touched: false, t0: this.t };
        if (onBlob) {
          S.contact((p.x - g.cx) / (g.u * 22));
          Haptics.tap();
        } else {
          // knuckle on the plinth — everything jiggles
          this._knock(p.x, p.y);
        }
      }
      const d = p.data.l3;
      if (!d.on) continue;
      this.fingers.push({ x: p.x, y: p.y, r: fr, dx: p.dx, dy: p.dy, p });
    }

    for (const p of this.input.releases) {
      if (p.data && p.data.l3) { p.data.l3 = null; p.claimedBy = null; }
    }

    // feed the solver
    const cols = this.world.colliders;
    cols.length = 0;
    for (const f of this.fingers) cols.push({ type: 'circle', x: f.x, y: f.y, r: f.r, friction: 0.42 });
  }

  _knock(x, y) {
    const g = this.g;
    this.knocks++;
    S.knock((x - g.cx) / (g.u * 22));
    Haptics.tick();
    this.shake(0.055);
    const dir = x < g.cx ? 1 : -1;
    for (const b of this.blobs) {
      for (const p of b.points) {
        p.ox -= dir * g.u * 0.55;
        p.oy -= g.u * 0.16;
      }
      b.rebV += 0.9;
    }
    if (this.knocks === 2 && this.narr < 1) {
      this.narr = 1;
      this.interrupt("It felt that.", { hold: 1.8 });
    }
  }

  _nearestBlob(x, y) {
    let best = null, bd = Infinity;
    for (const b of this.blobs) {
      const d = Math.hypot(x - b.cx, y - b.cy) - b.r;
      if (d < bd) { bd = d; best = b; }
    }
    return best ? { b: best, d: bd } : null;
  }

  // ---------------- per-blob logic ----------------
  _updateBlobs(dt) {
    const g = this.g;
    this.load = 0; this.stress = 0; this.fingersOn = 0;
    let anyTwo = false;

    for (let bi = this.blobs.length - 1; bi >= 0; bi--) {
      const b = this.blobs[bi];
      this._measure(b, dt);

      // which fingers are actually engaged with THIS blob
      let on = 0, ax = 0, ay = 0, mx = 0, my = 0;
      let fa = null, fb = null, deepest = 0;
      for (const f of this.fingers) {
        const d = Math.hypot(f.x - b.cx, f.y - b.cy);
        if (d > b.r * 1.45 + f.r) continue;
        const pen = clamp01((b.r + f.r - d) / (b.r * 1.05));
        if (pen <= 0.001) continue;
        on++;
        deepest = Math.max(deepest, pen);
        if (!fa) fa = f; else if (!fb) fb = f;
      }
      b.prevFingers = b.fingers;
      b.fingers = on;
      this.fingersOn = Math.max(this.fingersOn, on);
      if (on >= 2) anyTwo = true;

      // pinch axis
      if (fa && fb) {
        const dx = fb.x - fa.x, dy = fb.y - fa.y;
        const l = Math.hypot(dx, dy) || 1;
        b.axX = dx / l; b.axY = dy / l;
        b.mx = (fa.x + fb.x) * 0.5; b.my = (fa.y + fb.y) * 0.5;
        // geometric neck: gap between the fingertips relative to the body
        b.neck = clamp01(1 - (l - fa.r - fb.r) / Math.max(1, b.r * 1.55));
      } else if (fa) {
        b.mx = fa.x; b.my = fa.y;
        b.neck = 0;
      } else {
        b.neck = damp(b.neck, 0, 6, dt);
      }

      // ---- load: how hard the thing is actually being crushed ----
      const areaLoad = clamp01(b.comp / 0.30);
      let load = Math.max(areaLoad, b.neck * 0.95);
      // ONE FINGER IS NOT ENOUGH — this is the whole lesson of the chapter
      const cap = on >= 2 ? 1 : 0.50;
      load = Math.min(load, cap) * (on > 0 ? 1 : 0);
      b.load = damp(b.load, load, 16, dt);

      // ---- stress accumulates only under sustained real pressure ----
      if (b.load > 0.52 && on > 0) b.stress += (b.load - 0.52) * 2.5 * dt;
      else b.stress = damp(b.stress, 0, 1.0, dt);
      b.stress = clamp01(Math.min(b.stress, b.load * 1.28));

      this.load = Math.max(this.load, b.load);
      this.stress = Math.max(this.stress, b.stress);
      if (b.stress > 0.5) this.sawSeam = true;
      if (b.load > 0.78) this.sawLight = true;

      // ---- turgor: an incompressible thing resists harder as it loses room ----
      const breathe = 1 + Math.sin(this.t * 0.85 + b.phase) * 0.010;
      b.area.pressure = breathe * (1 + b.comp * 0.34) + b.reb;
      b.area.k = lerp(1.0, 1.9, b.load);

      // ---- release wobble: overshoot, then settle ----
      b.rebV += (-b.reb * 235 - b.rebV * 3.4) * dt;
      b.reb += b.rebV * dt;
      if (b.prevFingers > 0 && on === 0 && b.comp > 0.03) {
        b.rebV += 1.0 + b.comp * 6.5;
        S.wobble(clamp01(b.comp * 3), (b.cx - g.cx) / (g.u * 22));
        Haptics.squish();
      }

      // ---- viscoelastic memory: it holds the dent, then forgets ----
      if (b.load > 0.25) {
        const k = clamp01(b.load * 1.4 * dt * 3.0);
        for (let i = 0; i < b.shell.length; i++) {
          const c = b.shell[i];
          const cur = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y);
          c.rest = clamp(lerp(c.rest, cur, k), c.nominal * 0.80, c.nominal * 1.22);
        }
      } else {
        for (const c of b.shell) c.rest = damp(c.rest, c.nominal, 0.85, dt);
      }

      // ---- one finger: it squirts out and creeps away ----
      if (on === 1 && deepest > 0.16) {
        let dir = Math.sign(b.cx - fa.x);
        if (!dir) dir = b.escapeBias;
        const push = deepest * 3000;
        for (const p of b.points) p.addForce(dir * push, -deepest * 260);
        this.escapeDist = Math.max(this.escapeDist, Math.abs(b.cx - g.cx));
        if (this.phase === 'idle' || this.phase === 'poked') this.phase = 'poked';
      }

      // ---- cradle: the dish is a shallow bowl, it always oozes back ----
      const off = b.cx - g.cx;
      const home = -off * 5.2 * (1 - clamp01(on * 0.5));
      for (const p of b.points) p.addForce(home, 0);

      // ---- the skin complains ----
      this._voice(b, dt);

      if (b.stress >= 1) this._give(b);
    }

    if (anyTwo && !this.everTwoFinger) {
      this.everTwoFinger = true;
      this.phase = 'pinched';
      if (this.narr < 3) {
        this.narr = 3;
        this.interrupt("No — no, not like that—", { hold: 2.0, agitated: true });
      }
    }
  }

  /** geometry readouts every system needs */
  _measure(b, dt) {
    const pts = b.points, n = pts.length;
    let cx = 0, cy = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const p of pts) {
      cx += p.x; cy += p.y;
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    b.cx = cx / n; b.cy = cy / n;
    b.rx = (maxX - minX) * 0.5; b.ry = (maxY - minY) * 0.5;
    b.minX = minX; b.maxX = maxX; b.minY = minY; b.maxY = maxY;

    const area = Math.abs(b.area.area());
    b.comp = clamp01(1 - area / b.area.rest);

    const rest = b.shellRest;
    let maxS = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], c = pts[(i + 1) % n];
      const s = clamp01((Math.hypot(c.x - a.x, c.y - a.y) / rest - 1) / 0.5);
      b.edge[i] = s;
      if (s > maxS) maxS = s;
    }
    for (let i = 0; i < n; i++) {
      const s = Math.max(b.edge[i], b.edge[(i + n - 1) % n]);
      b.white[i] = damp(b.white[i], s, 11, dt);
    }
    b.maxStretch = maxS;

    // nucleus sloshes toward the roomiest part of the body
    const k = 26, damping = 5.4;
    let tx = b.cx, ty = b.cy + b.ry * 0.12;
    if (b.load > 0.2 && (b.axX || b.axY)) {
      // squeezed sideways → the core is driven along the free axis
      tx = b.cx - b.axX * b.rx * 0.10;
      ty = b.cy - b.axY * b.ry * 0.10;
    }
    b.nvx += ((tx - b.nx) * k - b.nvx * damping) * dt;
    b.nvy += ((ty - b.ny) * k - b.nvy * damping) * dt;
    b.nx += b.nvx * dt; b.ny += b.nvy * dt;
    const nd = Math.hypot(b.nx - b.cx, b.ny - b.cy);
    const lim = Math.min(b.rx, b.ry) * 0.42;
    if (nd > lim) {
      const s = lim / nd;
      b.nx = b.cx + (b.nx - b.cx) * s;
      b.ny = b.cy + (b.ny - b.cy) * s;
    }

    b.seal = damp(b.seal, 0, 0.85, dt);
  }

  /** creaks, weeping, haptics — the escalation you can hear and feel */
  _voice(b, dt) {
    const g = this.g;
    const pan = (b.cx - g.cx) / (g.u * 22);
    if (b.load > 0.12) {
      this._creakT -= dt * (0.4 + b.load * b.load * 12);
      if (this._creakT <= 0) {
        this._creakT = 1;
        if (b.load > 0.45) { S.fibre(b.stress, pan); Haptics.stress(b.stress); }
        else S.squelch(b.load * 0.7, pan);
      }
    }
    if (b.stress > 0.55) {
      this._weepT -= dt;
      if (this._weepT <= 0) {
        this._weepT = 0.05 + (1 - b.stress) * 0.16;
        const px = -b.axY, py = b.axX;
        const s = rand() < 0.5 ? 1 : -1;
        const ex = b.mx + px * s * b.ry * 0.9, ey = b.my + py * s * b.ry * 0.9;
        this.p.emit({
          x: ex, y: ey, vx: rrange(-40, 40) + px * s * 60, vy: rrange(-120, -30),
          life: 0.8, size: 1.3 + rand() * 1.4, kind: 1, grav: 1500, drag: 1.2,
          color: [232, 128, 128], alpha: 0.75,
        });
      }
    }
    // shivers on its own when left alone
    if (b.fingers === 0 && b.load < 0.02) {
      this._shiverT -= dt;
      if (this._shiverT <= 0) {
        this._shiverT = 6 + rand() * 6;
        b.rebV += 0.55;
        for (const p of b.points) { p.ox -= rrange(-0.8, 0.8); p.oy -= rrange(-0.6, 0.6); }
        S.wobble(0.22, pan);
      }
    }
  }

  _updateStrainVoice(dt) {
    if (!Audio.ready) return;
    const want = this.load;
    if (want > 0.06 && !this.strain) {
      this.strain = Audio.drone({
        f: 52, gain: 0.0001, type: 'sawtooth', send: 0.4,
        lfoRate: 5.5, lfoDepth: 2.2, attack: 0.06, filter: 190,
      });
    }
    if (this.strain) {
      this.strain.set(want > 0.06 ? 0.012 + want * 0.055 : 0.0001, 0.07);
      this.strain.pitch(48 + want * 74 + this.stress * 40, 0.12);
    }
  }

  // ---------------- after the solver ----------------
  _postSim(dt) {
    const g = this.g;
    // blob↔blob separation: children must not sink into each other
    for (let i = 0; i < this.blobs.length; i++) {
      for (let j = i + 1; j < this.blobs.length; j++) {
        const a = this.blobs[i], b = this.blobs[j];
        const dx = b.cx - a.cx, dy = b.cy - a.cy;
        const d = Math.hypot(dx, dy);
        const want = (a.r + b.r) * 0.93;
        if (d > want || d < 1e-4) continue;
        const s = (want - d) / d * 0.5;
        const ox = dx * s, oy = dy * s;
        for (const p of a.points) { p.x -= ox * 0.5; p.y -= oy * 0.5; }
        for (const p of b.points) { p.x += ox * 0.5; p.y += oy * 0.5; }
      }
    }
  }

  // ---------------------------------------------------------
  // THE MOMENT IT GIVES
  // ---------------------------------------------------------
  _give(b) {
    const g = this.g;
    const canSplit = b.gen < MAX_GEN
      && b.points.length >= 22
      && b.r > g.R * 0.30
      && this.blobs.length < MAX_BLOBS;
    if (canSplit) this._split(b);
    else this._burst(b);
  }

  _split(b) {
    const g = this.g;
    const pts = b.points, n = pts.length;
    // The cut plane contains the squeeze axis, so the body parts into the
    // lobe above the fingers and the lobe below them.
    //
    // By the time a hard pinch actually gives, the fingers are usually
    // already off the screen and the recorded axis is stale or zero —
    // which silently produced no crossings at all and dumped the player
    // into a burst. So fall back to the body's own longest diameter,
    // which is the axis it was just squeezed along anyway.
    let px = -b.axY, py = b.axX;
    // Cut through the BODY's centre, not the fingers'. The finger midpoint
    // is where the pressure was applied a moment ago, and by the time the
    // membrane gives it has usually drifted clear of the body entirely —
    // which put the cut plane outside the outline and produced no
    // crossings at all. A membrane parts at its own waist.
    let mx = b.cx, my = b.cy;
    const alen = Math.hypot(px, py);
    if (alen > 1e-4) { px /= alen; py /= alen; }
    else {
      let bi = 0, bj = 1, bd = -1;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const d = (pts[i].x - pts[j].x) ** 2 + (pts[i].y - pts[j].y) ** 2;
          if (d > bd) { bd = d; bi = i; bj = j; }
        }
      }
      const ax = pts[bj].x - pts[bi].x, ay = pts[bj].y - pts[bi].y;
      const L = Math.hypot(ax, ay) || 1;
      px = -ay / L; py = ax / L;
    }
    const side = new Array(n);
    for (let i = 0; i < n; i++) side[i] = (pts[i].x - mx) * px + (pts[i].y - my) * py;
    let cuts = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if ((side[i] >= 0) !== (side[j] >= 0)) cuts.push(i);
    }
    // A hard, fast pinch squashes the ring flat, and a flattened outline
    // crosses the cut line four or six times instead of twice — so the
    // naive test bailed to a burst exactly when the player squeezed
    // hardest. That made the chapter's best outcome, dividing in two,
    // effectively unreachable. Keep the two crossings furthest apart and
    // cut there: geometrically it is the widest part of the body, which
    // is where a membrane would actually part.
    if (cuts.length > 2) {
      let best = [cuts[0], cuts[1]], bestD = -1;
      for (let a = 0; a < cuts.length; a++) {
        for (let bI = a + 1; bI < cuts.length; bI++) {
          const p0 = pts[cuts[a]], p1 = pts[cuts[bI]];
          const d = (p0.x - p1.x) ** 2 + (p0.y - p1.y) ** 2;
          if (d > bestD) { bestD = d; best = [cuts[a], cuts[bI]]; }
        }
      }
      cuts = best.sort((x, y) => x - y);
    }
    if (cuts.length !== 2) { this._burst(b); return; }

    const arc = (from, to) => {
      const out = [];
      for (let i = (from + 1) % n; ; i = (i + 1) % n) { out.push(pts[i]); if (i === to) break; }
      return out;
    };
    const A1 = arc(cuts[0], cuts[1]);
    const A2 = arc(cuts[1], cuts[0]);
    // A lopsided cut still divides; only a degenerate one should burst.
    if (A1.length < 4 || A2.length < 4) { this._burst(b); return; }

    const snap = A1.map(p => ({ x: p.x, y: p.y, vx: p.x - p.ox, vy: p.y - p.oy }));
    const snap2 = A2.map(p => ({ x: p.x, y: p.y, vx: p.x - p.ox, vy: p.y - p.oy }));
    const parentR = b.r, gen = b.gen;
    const bx = b.cx, by = b.cy;
    const ax = b.axX, ay = b.axY;

    this._destroyBlob(b);
    const c1 = this._child(snap, gen + 1, -px, -py);
    const c2 = this._child(snap2, gen + 1, px, py);

    // ---- spectacle ----
    this.splits++;
    this.phase = 'split';
    this.flashPulse.fire(0.55);
    S.rip(clamp01(0.7 + parentR / g.R * 0.4));
    Haptics.shatter();
    this.shake(0.55);
    this.slowmo(0.24, 0.55);
    this.flash('255,150,130', 0.26, 0.34);
    this.tl.after(0.22, () => { S.seal((bx - g.cx) / (g.u * 22)); });

    // it disgorges. Along the cut, perpendicular to the fingers.
    const spray = 34 + (2 - gen) * 12;
    for (let i = 0; i < spray; i++) {
      const s = rand() < 0.5 ? 1 : -1;
      const t = rrange(-0.9, 0.9);
      const ox = mx + ax * t * parentR * 0.5;
      const oy = my + ay * t * parentR * 0.5;
      const sp = rrange(180, 640);
      this.p.emit({
        x: ox, y: oy,
        vx: px * s * sp + rrange(-90, 90) + ax * t * 120,
        vy: py * s * sp + rrange(-90, 90) - 120,
        life: rrange(0.5, 1.1), size: rrange(1.2, 3.4), kind: 1,
        grav: 1900, drag: 1.1, color: [236, 126, 122], alpha: 0.9,
      });
    }
    for (let i = 0; i < 12; i++) {
      const s = rand() < 0.5 ? 1 : -1;
      this.p.emit({
        x: mx, y: my,
        vx: px * s * rrange(120, 420), vy: py * s * rrange(120, 420) - 90,
        life: rrange(0.35, 0.7), size: rrange(2, 5), kind: 3,
        grav: 900, drag: 1.6, color: [255, 170, 140], alpha: 0.8,
      });
    }
    this.p.burst(mx, my, 10, {
      speed: 170, dir: -Math.PI / 2, spread: TAU, life: 1.5, size: 7,
      kind: 4, grav: -40, drag: 1.5, color: [220, 160, 160], alpha: 0.32, jitter: parentR * 0.6,
    });

    // ---- and it stays on the plinth. Forever. ----
    this._leaveBeads(bx, by, 14 + (2 - gen) * 4, parentR);
    for (let i = 0; i < 7; i++) {
      this.spill.push({
        x: mx + rrange(-parentR * 0.4, parentR * 0.4),
        y: my + rrange(-parentR * 0.3, parentR * 0.3),
        vx: rrange(-260, 260), vy: rrange(-460, -150),
        r: rrange(g.u * 0.5, g.u * 1.4), settled: 0,
      });
    }

    if (this.splits === 1) {
      this.interrupt("…", { hold: 0.9, agitated: true });
      this.say("There are two of them now.", { hold: 2.3, agitated: true });
      this.tl.after(2.4, () => {
        if (!this.solved) return;
        this.say("Don't you dare do it again.", { hold: 2.4, agitated: true });
      });
      this.solve(7.0);
    } else if (this.splits === 2) {
      this.interrupt("Stop. Stop dividing it.", { hold: 2.2, agitated: true });
    } else {
      this.interrupt("This is how it spreads.", { hold: 2.2, agitated: true });
    }
    return [c1, c2];
  }

  /** build an independent soft body from one severed arc */
  _child(snap, gen, outX, outY) {
    const g = this.g;
    let cx = 0, cy = 0;
    for (const p of snap) { cx += p.x; cy += p.y; }
    cx /= snap.length; cy /= snap.length;
    let area = 0;
    for (let i = 0; i < snap.length; i++) {
      const q = snap[(i + 1) % snap.length];
      area += snap[i].x * q.y - q.x * snap[i].y;
    }
    area = Math.abs(area * 0.5);
    const r = clamp(Math.sqrt(area / Math.PI), g.R * 0.20, g.R);
    const n = clamp(Math.round(snap.length * 1.15) | 1, 18, 40);
    const nb = this._makeBlob(cx, cy, r, n, gen);

    for (let i = 0; i < n; i++) {
      const t = i / n * snap.length;
      const i0 = Math.floor(t) % snap.length;
      const i1 = (i0 + 1) % snap.length;
      const f = t - Math.floor(t);
      const a = snap[i0], c = snap[i1];
      const x = lerp(a.x, c.x, f) + outX * g.u * 0.5;
      const y = lerp(a.y, c.y, f) + outY * g.u * 0.5;
      // Inherited velocity has to be capped. A hard pinch leaves the
      // parent's points moving very fast, and handing that straight to a
      // child launched one half of the specimen clean off the top of the
      // screen — impressive once, then the player has lost half their toy.
      let vx = lerp(a.vx, c.vx, f) + outX * 1.5;
      let vy = lerp(a.vy, c.vy, f) + outY * 1.5;
      const vmax = g.u * 0.85;
      const vl = Math.hypot(vx, vy);
      if (vl > vmax) { const k = vmax / vl; vx *= k; vy *= k; }
      const p = nb.points[i];
      p.x = x; p.y = y; p.ox = x - vx; p.oy = y - vy;
    }
    nb.nx = cx; nb.ny = cy;
    nb.seal = 1;
    nb.sealX = -outX; nb.sealY = -outY;
    nb.reb = 0; nb.rebV = 2.2;
    return nb;
  }

  _burst(b) {
    const g = this.g;
    const { cx, cy, r } = b;
    this._destroyBlob(b);
    this.bursts++;
    S.pop((cx - g.cx) / (g.u * 22));
    Haptics.snap();
    this.shake(0.30);
    this.flash('255,170,150', 0.18, 0.26);
    this.flashPulse.fire(0.4);
    for (let i = 0; i < 40; i++) {
      const a = rand() * TAU;
      const sp = rrange(140, 620);
      this.p.emit({
        x: cx + Math.cos(a) * r * 0.5, y: cy + Math.sin(a) * r * 0.5,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 160,
        life: rrange(0.4, 1.0), size: rrange(1.1, 3.0), kind: 1,
        grav: 1900, drag: 1.15, color: [234, 122, 118], alpha: 0.9,
      });
    }
    this.p.burst(cx, cy, 8, {
      speed: 220, dir: -Math.PI / 2, spread: TAU, life: 0.5, size: 4,
      kind: 3, grav: 800, drag: 1.6, color: [255, 176, 148], alpha: 0.8, jitter: r * 0.5,
    });
    this._leaveBeads(cx, cy, 18, r);
    for (let i = 0; i < 9; i++) {
      this.spill.push({
        x: cx + rrange(-r * 0.5, r * 0.5), y: cy + rrange(-r * 0.4, r * 0.4),
        vx: rrange(-320, 320), vy: rrange(-420, -120),
        r: rrange(g.u * 0.45, g.u * 1.2), settled: 0,
      });
    }
    if (this.bursts === 1) this.interrupt("That one just gave up.", { hold: 2.2, agitated: true });
    if (!this.blobs.length) {
      this.phase = 'gone';
      this.tl.after(0.7, () => this.say("You have made a mess of my specimen.", { hold: 2.8, agitated: true }));
      this.solve(4.2);
    }
  }

  /** deposit permanent wreckage on the plinth */
  _leaveBeads(x, y, count, r) {
    const g = this.g;
    for (let i = 0; i < count; i++) {
      const a = rand() * TAU;
      const rr = Math.sqrt(rand()) * r * 2.4 + g.u * 1.5;
      const bx = clamp(x + Math.cos(a) * rr, g.cx - g.dishRx * 1.5, g.cx + g.dishRx * 1.5);
      const by = g.topY + rrange(-g.dishRy * 0.6, g.dishRy * 0.85);
      this.leave('bead', bx, by, {
        size: g.u * rrange(0.35, 1.15),
        a: rand() * TAU,
        hue: SKIN.bead,
      });
      this.beads++;
    }
  }

  // ---------------- free droplets ----------------
  _updateSpill(dt) {
    const g = this.g;
    const floor = g.topY + g.dishRy * 0.4;
    for (let i = this.spill.length - 1; i >= 0; i--) {
      const s = this.spill[i];
      if (s.settled) { s.settled += dt; if (s.settled > 1.2) this.spill.splice(i, 1); continue; }
      s.vy += 2100 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= Math.exp(-1.1 * dt);
      if (s.y >= floor) {
        s.y = floor;
        s.settled = 0.0001;
        S.splat((s.x - g.cx) / (g.u * 22), s.r / g.u);
        this.leave('bead', s.x, s.y, { size: s.r * 1.25, a: rand() * TAU, hue: SKIN.bead });
        this.beads++;
        this.p.emit({
          x: s.x, y: s.y, vx: rrange(-50, 50), vy: rrange(-90, -20),
          life: 0.4, size: 1.1, kind: 1, grav: 1200, drag: 2,
          color: [230, 130, 128], alpha: 0.6,
        });
      }
    }
  }

  // ---------------- hints ----------------
  _hints(dt) {
    if (this.solved || !this.blobs.length) { this.hideHint(); return; }
    const idle = this.input.idle();
    if (!this.pokes && this.knocks === 0 && idle > 6.5) this.hint('Touch it');
    else if (!this.everTwoFinger && this.phase === 'poked' && idle > 5.5) this.hint('Two fingers');
    else this.hideHint();
    if (this.fingersOn > 0 && !this.pokes) {
      this.pokes = 1;
      if (this.narr < 2) {
        this.narr = 2;
        this.interrupt("It doesn't like that.", { hold: 1.9 });
      }
    }
  }

  // =========================================================
  // DRAW
  // =========================================================
  draw(ctx, glow) {
    const g = this.g;
    this._drawDishBack(ctx);
    for (const b of this.blobs) this._drawShadow(ctx, b);
    for (const b of this.blobs) this._drawBlob(ctx, glow, b);
    this._drawSpill(ctx, glow);
    this._drawDishFront(ctx, glow);
  }

  drawFront(ctx, glow) {
    const g = this.g;
    const k = this.flashPulse.decay;
    if (k > 0.01) {
      glow.save();
      glow.globalCompositeOperation = 'lighter';
      const gg = glow.createRadialGradient(g.cx, g.restY, 0, g.cx, g.restY, g.R * 3.4);
      gg.addColorStop(0, `rgba(255,168,138,${0.5 * k})`);
      gg.addColorStop(0.4, `rgba(255,120,110,${0.18 * k})`);
      gg.addColorStop(1, 'rgba(255,110,100,0)');
      glow.fillStyle = gg;
      glow.beginPath(); glow.arc(g.cx, g.restY, g.R * 3.4, 0, TAU); glow.fill();
      glow.restore();
    }
  }

  // ---------- the dish ----------
  _drawDishBack(ctx) {
    const g = this.g;
    const { cx, dishY, dishRx, dishRy } = g;
    const ex = this.game.set.exposure;

    contactShadow(ctx, cx, g.topY + g.dishRy * 0.35, dishRx * 1.12, dishRy * 0.95,
      { strength: 0.62 * ex });

    // outer body of the dish (a squat turned-steel bowl)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, dishY + dishRy * 1.15, dishRx, dishRy, 0, 0, Math.PI);
    ctx.lineTo(cx - dishRx, dishY);
    ctx.ellipse(cx, dishY, dishRx, dishRy, 0, Math.PI, 0, true);
    ctx.closePath();
    const side = ctx.createLinearGradient(cx - dishRx, 0, cx + dishRx, 0);
    side.addColorStop(0, '#14161a');
    side.addColorStop(0.26, '#3a4048');
    side.addColorStop(0.46, '#5a626d');
    side.addColorStop(0.62, '#3d434b');
    side.addColorStop(0.86, '#1b1e23');
    side.addColorStop(1, '#0d0f12');
    ctx.fillStyle = side;
    ctx.fill();
    ctx.restore();

    // the well the specimen sits in
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, dishY, dishRx * 0.9, dishRy * 0.9, 0, 0, TAU);
    ctx.clip();
    const well = ctx.createRadialGradient(
      cx - dishRx * 0.22, dishY - dishRy * 0.5, dishRy * 0.1,
      cx, dishY + dishRy * 0.3, dishRx * 0.98);
    well.addColorStop(0, '#3b414a');
    well.addColorStop(0.42, '#22262c');
    well.addColorStop(0.8, '#14171b');
    well.addColorStop(1, '#0a0c0f');
    ctx.fillStyle = well;
    ctx.fillRect(cx - dishRx, dishY - dishRy * 1.2, dishRx * 2, dishRy * 2.6);
    ctx.restore();

    // rim: bright along the upper-left, cool bounce lower-right
    ctx.save();
    ctx.lineWidth = Math.max(1.1, g.u * 0.42);
    const rim = ctx.createLinearGradient(cx - dishRx, dishY - dishRy, cx + dishRx, dishY + dishRy);
    rim.addColorStop(0, 'rgba(255,246,228,0.62)');
    rim.addColorStop(0.34, 'rgba(214,220,232,0.22)');
    rim.addColorStop(0.62, 'rgba(120,130,146,0.14)');
    rim.addColorStop(1, 'rgba(150,182,224,0.34)');
    ctx.strokeStyle = rim;
    ctx.beginPath();
    ctx.ellipse(cx, dishY, dishRx * 0.945, dishRy * 0.945, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  _drawDishFront(ctx, glow) {
    const g = this.g;
    const { cx, dishY, dishRx, dishRy } = g;
    // the near lip passes IN FRONT of the specimen — it is cradled, not stuck on
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, dishY + dishRy * 0.16, dishRx * 0.995, dishRy * 1.02, 0, 0.06, Math.PI - 0.06);
    ctx.ellipse(cx, dishY, dishRx * 0.9, dishRy * 0.9, 0, Math.PI - 0.06, 0.06, true);
    ctx.closePath();
    const lip = ctx.createLinearGradient(cx - dishRx, dishY, cx + dishRx, dishY + dishRy);
    lip.addColorStop(0, '#2b3037');
    lip.addColorStop(0.3, '#565e69');
    lip.addColorStop(0.5, '#7c8592');
    lip.addColorStop(0.72, '#40464f');
    lip.addColorStop(1, '#1b1e23');
    ctx.fillStyle = lip;
    ctx.fill();
    ctx.lineWidth = Math.max(0.8, g.u * 0.2);
    ctx.strokeStyle = 'rgba(255,250,236,0.30)';
    ctx.stroke();
    ctx.restore();

    engrave(ctx, 'SPECIMEN II', cx, g.topY + g.dishRy * 1.35, {
      font: `600 ${Math.max(7, g.u * 2.05).toFixed(1)}px Inter, system-ui, sans-serif`,
      depth: 0.9, darkness: 0.62, light: 0.16, letterSpacing: '0.34em',
    });
  }

  // ---------- shadow ----------
  _drawShadow(ctx, b) {
    const g = this.g;
    const lift = clamp01((g.floorY - b.maxY) / (g.R * 0.9));
    contactShadow(ctx, b.cx + g.u * 0.5, g.floorY + g.u * 0.35, b.rx * 1.02, b.rx * 0.24, {
      strength: 0.55 * this.game.set.exposure, height: lift * 0.6,
    });
  }

  // ---------- the specimen ----------
  _drawBlob(ctx, glow, b) {
    const g = this.g;
    const pts = b.points, n = pts.length;
    const rx = Math.max(4, b.rx), ry = Math.max(4, b.ry);
    const rr = Math.max(rx, ry);
    const load = b.load, stress = b.stress;

    ctx.save();
    ringPath(ctx, pts);
    ctx.save();
    ctx.clip();

    // --- body: deep, saturated, lit from upper-left ---
    const bg = ctx.createRadialGradient(
      b.cx - rx * 0.36, b.cy - ry * 0.46, rr * 0.03,
      b.cx + rx * 0.10, b.cy + ry * 0.16, rr * 1.22);
    bg.addColorStop(0, SKIN.lit);
    bg.addColorStop(0.20, SKIN.mid);
    bg.addColorStop(0.55, SKIN.deep);
    bg.addColorStop(0.84, SKIN.dark);
    bg.addColorStop(1, SKIN.edge);
    ctx.fillStyle = bg;
    ctx.fillRect(b.cx - rx * 1.3, b.cy - ry * 1.3, rx * 2.6, ry * 2.6);

    // --- subsurface: light entering the top-left and bleeding through ---
    ctx.globalCompositeOperation = 'lighter';
    const sx = b.cx + rx * 0.30, sy = b.cy + ry * 0.50;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr * 0.95);
    sg.addColorStop(0, `rgba(${SKIN.sss},${0.20 + load * 0.20})`);
    sg.addColorStop(0.55, `rgba(${SKIN.sss},${0.07 + load * 0.09})`);
    sg.addColorStop(1, `rgba(${SKIN.sss},0)`);
    ctx.fillStyle = sg;
    ctx.fillRect(b.cx - rx * 1.3, b.cy - ry * 1.3, rx * 2.6, ry * 2.6);

    // --- transmission: squeeze it thin and the room shines THROUGH it ---
    if (load > 0.14) {
      const tk = (load - 0.14) / 0.86;
      const px = -b.axY, py = b.axX;
      const tw = rr * (0.30 + tk * 0.65);
      const tg = ctx.createRadialGradient(b.mx, b.my, 0, b.mx, b.my, tw);
      tg.addColorStop(0, `rgba(${SKIN.trans},${0.10 + tk * 0.62})`);
      tg.addColorStop(0.42, `rgba(${SKIN.trans},${0.04 + tk * 0.26})`);
      tg.addColorStop(1, `rgba(${SKIN.trans},0)`);
      ctx.fillStyle = tg;
      ctx.fillRect(b.cx - rx * 1.4, b.cy - ry * 1.4, rx * 2.8, ry * 2.8);
      // and a lit band running along the neck itself
      ctx.save();
      ctx.strokeStyle = `rgba(255,206,168,${0.10 + tk * 0.5})`;
      ctx.lineWidth = Math.max(1, rr * (0.10 - tk * 0.06));
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.mx - b.axX * rx * 1.2, b.my - b.axY * ry * 1.2);
      ctx.lineTo(b.mx + b.axX * rx * 1.2, b.my + b.axY * ry * 1.2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';

    // --- what's inside: a denser core, and the filaments feeding it ---
    this._drawInterior(ctx, b, rr, load);

    // --- stress whitening: silicone crazes where it is stretched ---
    if (b.maxStretch > 0.05 || stress > 0.02) this._drawWhitening(ctx, b, rr);

    // --- the seam: a translucent line where it is going to fail ---
    if (stress > 0.28) this._drawSeam(ctx, b, rx, ry, stress);

    // --- fingertip dimples: a dark contact ring and a wet crescent ---
    for (const f of this.fingers) {
      const d = Math.hypot(f.x - b.cx, f.y - b.cy);
      if (d > b.r * 1.6) continue;
      const cg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 2.1);
      cg.addColorStop(0, 'rgba(48,6,18,0.46)');
      cg.addColorStop(0.55, 'rgba(48,6,18,0.16)');
      cg.addColorStop(1, 'rgba(48,6,18,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 2.1, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,214,196,0.30)';
      ctx.lineWidth = Math.max(0.8, rr * 0.018);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.02, -2.5, 0.5); ctx.stroke();
    }

    // --- broad wide specular (the silicone read) ---
    const hx = b.cx - rx * 0.34, hy = b.cy - ry * 0.48;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(-0.5);
    ctx.scale(1, 0.72);
    const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, rr * 0.62);
    hg.addColorStop(0, 'rgba(255,246,238,0.44)');
    hg.addColorStop(0.34, 'rgba(255,232,220,0.16)');
    hg.addColorStop(1, 'rgba(255,230,220,0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(0, 0, rr * 0.62, 0, TAU); ctx.fill();
    ctx.restore();

    // tight wet hotspot
    const kx = b.cx - rx * 0.42, ky = b.cy - ry * 0.58;
    const kg = ctx.createRadialGradient(kx, ky, 0, kx, ky, rr * 0.15);
    kg.addColorStop(0, 'rgba(255,255,255,0.92)');
    kg.addColorStop(0.35, 'rgba(255,248,240,0.34)');
    kg.addColorStop(1, 'rgba(255,248,240,0)');
    ctx.fillStyle = kg;
    ctx.beginPath(); ctx.arc(kx, ky, rr * 0.15, 0, TAU); ctx.fill();

    // cool bounce from the lower-right, as the room demands
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const bx = b.cx + rx * 0.52, by = b.cy + ry * 0.56;
    const bbg = ctx.createRadialGradient(bx, by, 0, bx, by, rr * 0.66);
    bbg.addColorStop(0, 'rgba(150,186,236,0.15)');
    bbg.addColorStop(1, 'rgba(150,186,236,0)');
    ctx.fillStyle = bbg;
    ctx.beginPath(); ctx.arc(bx, by, rr * 0.66, 0, TAU); ctx.fill();
    ctx.restore();

    ctx.restore();  // un-clip

    // --- wet rim ---
    // Rebuild the silhouette first: the current path is still the core
    // glint's little circle from the pass above (a path survives
    // save/restore), so stroking here without this drew a bright arc
    // floating outside the body.
    ringPath(ctx, pts);
    const rimw = Math.max(1, rr * 0.045);
    ctx.lineWidth = rimw;
    const rg = ctx.createLinearGradient(b.cx - rx, b.cy - ry, b.cx + rx, b.cy + ry);
    rg.addColorStop(0, 'rgba(255,236,224,0.72)');
    rg.addColorStop(0.26, 'rgba(255,190,176,0.24)');
    rg.addColorStop(0.58, 'rgba(120,26,44,0.30)');
    rg.addColorStop(1, 'rgba(168,196,240,0.40)');
    ctx.strokeStyle = rg;
    ctx.stroke();

    // a hairline of pure specular along the very top-left edge
    ctx.save();
    ctx.clip();
    ctx.lineWidth = rimw * 0.55;
    ctx.strokeStyle = 'rgba(255,252,246,0.55)';
    ctx.translate(-rimw * 0.5, -rimw * 0.6);
    ringPath(ctx, pts);
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // --- glow pass: the body is genuinely luminous when it is thin ---
    if (load > 0.2 || b.seal > 0.05) {
      glow.save();
      glow.globalCompositeOperation = 'lighter';
      const k = Math.max((load - 0.2) / 0.8, 0) ;
      if (k > 0) {
        const w = rr * (0.34 + k * 0.7);
        const gg = glow.createRadialGradient(b.mx, b.my, 0, b.mx, b.my, w);
        gg.addColorStop(0, `rgba(255,164,120,${0.16 + k * 0.5})`);
        gg.addColorStop(0.5, `rgba(255,120,96,${0.05 + k * 0.16})`);
        gg.addColorStop(1, 'rgba(255,110,90,0)');
        glow.fillStyle = gg;
        glow.beginPath(); glow.arc(b.mx, b.my, w, 0, TAU); glow.fill();
      }
      if (b.seal > 0.05) {
        const sw = rr * 0.9;
        const sg2 = glow.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, sw);
        sg2.addColorStop(0, `rgba(255,190,150,${0.4 * b.seal})`);
        sg2.addColorStop(1, 'rgba(255,170,130,0)');
        glow.fillStyle = sg2;
        glow.beginPath(); glow.arc(b.cx, b.cy, sw, 0, TAU); glow.fill();
      }
      glow.restore();
    }
  }

  _drawInterior(ctx, b, rr, load) {
    const nr = rr * (0.30 + load * 0.06);
    // filaments — only just visible, which is what makes them work
    const rng = makeRng(b.seed);
    ctx.save();
    ctx.lineCap = 'round';
    // Each filament fades to nothing at its tip and is laid down twice: a
    // wide, very faint pass under a thin one. Drawn as flat crisp strokes
    // they read as scratches ON the skin rather than structure inside it —
    // depth here is entirely a matter of contrast and edge softness.
    for (let i = 0; i < 6; i++) {
      const a = rng() * TAU;
      const l = rr * (0.4 + rng() * 0.55);
      const wob = Math.sin(this.t * 0.6 + i) * rr * 0.06;
      const ex = b.nx + Math.cos(a + 0.4) * l, ey = b.ny + Math.sin(a + 0.4) * l;
      const fg = ctx.createLinearGradient(b.nx, b.ny, ex, ey);
      const base = 0.34 + load * 0.26;
      fg.addColorStop(0, `rgba(74,10,26,${base})`);
      fg.addColorStop(0.55, `rgba(88,14,32,${base * 0.45})`);
      fg.addColorStop(1, 'rgba(96,18,36,0)');
      ctx.strokeStyle = fg;
      for (const [wm, am] of [[3.2, 0.30], [1.0, 1.0]]) {
        ctx.globalAlpha = am;
        ctx.lineWidth = Math.max(0.6, rr * 0.019 * wm);
        ctx.beginPath();
        ctx.moveTo(b.nx, b.ny);
        ctx.quadraticCurveTo(
          b.nx + Math.cos(a) * l * 0.55 + wob, b.ny + Math.sin(a) * l * 0.55 - wob, ex, ey);
        ctx.stroke();
      }
    }
    ctx.restore();

    // the core itself
    const ng = ctx.createRadialGradient(b.nx - nr * 0.3, b.ny - nr * 0.35, 0, b.nx, b.ny, nr);
    ng.addColorStop(0, 'rgba(196,60,72,0.55)');
    ng.addColorStop(0.4, 'rgba(120,18,40,0.62)');
    ng.addColorStop(0.8, 'rgba(70,8,26,0.42)');
    ng.addColorStop(1, 'rgba(70,8,26,0)');
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.ellipse(b.nx, b.ny, nr, nr * 0.86, 0, 0, TAU);
    ctx.fill();

    // a wet glint on the core, seen through the skin
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(b.nx - nr * 0.35, b.ny - nr * 0.4, 0, b.nx - nr * 0.35, b.ny - nr * 0.4, nr * 0.5);
    gg.addColorStop(0, 'rgba(255,180,160,0.22)');
    gg.addColorStop(1, 'rgba(255,180,160,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(b.nx - nr * 0.35, b.ny - nr * 0.4, nr * 0.5, 0, TAU); ctx.fill();
    ctx.restore();
  }

  _drawWhitening(ctx, b, rr) {
    const pts = b.points, n = pts.length;
    const w = Math.max(1.4, rr * 0.13);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // broad, soft bloom of stressed skin
    for (let pass = 0; pass < 2; pass++) {
      ctx.lineWidth = pass ? w * 0.4 : w;
      for (let i = 0; i < n; i++) {
        const a = b.white[i];
        if (a < 0.10) continue;
        const p0 = pts[i], p1 = pts[(i + 1) % n];
        const al = (pass ? 0.55 : 0.20) * Math.min(1, (a - 0.08) * 1.7);
        ctx.strokeStyle = `rgba(255,236,226,${al})`;
        ctx.beginPath();
        ctx.moveTo((pts[(i + n - 1) % n].x + p0.x) * 0.5, (pts[(i + n - 1) % n].y + p0.y) * 0.5);
        ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) * 0.5, (p0.y + p1.y) * 0.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _drawSeam(ctx, b, rx, ry, stress) {
    const k = (stress - 0.28) / 0.72;
    const px = -b.axY, py = b.axX;
    const len = Math.max(rx, ry) * (1.0 + k * 0.25);
    const x0 = b.mx - px * len, y0 = b.my - py * len;
    const x1 = b.mx + px * len, y1 = b.my + py * len;
    ctx.save();
    ctx.lineCap = 'round';
    // translucent flesh pulling apart
    const sg = ctx.createLinearGradient(x0, y0, x1, y1);
    sg.addColorStop(0, 'rgba(255,220,190,0)');
    sg.addColorStop(0.5, `rgba(255,232,206,${0.20 + k * 0.62})`);
    sg.addColorStop(1, 'rgba(255,220,190,0)');
    ctx.strokeStyle = sg;
    ctx.lineWidth = Math.max(1, Math.max(rx, ry) * (0.055 + k * 0.06));
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    // micro-tears opening along it
    if (k > 0.25) {
      const rng = makeRng(b.seed + 17);
      ctx.strokeStyle = `rgba(255,250,244,${(k - 0.25) * 0.9})`;
      ctx.lineWidth = Math.max(0.7, Math.max(rx, ry) * 0.016);
      for (let i = 0; i < 7; i++) {
        const t = rng() * 2 - 1;
        const cxp = b.mx + px * len * t * 0.86;
        const cyp = b.my + py * len * t * 0.86;
        const l = (0.4 + rng() * 0.7) * Math.max(rx, ry) * 0.16 * k;
        ctx.beginPath();
        ctx.moveTo(cxp - b.axX * l, cyp - b.axY * l);
        ctx.lineTo(cxp + b.axX * l, cyp + b.axY * l);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ---------- airborne droplets ----------
  _drawSpill(ctx, glow) {
    if (!this.spill.length) return;
    ctx.save();
    for (const s of this.spill) {
      if (s.settled) continue;
      const st = clamp(Math.hypot(s.vx, s.vy) / 900, 0, 1);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.atan2(s.vy, s.vx));
      ctx.scale(1 + st * 0.9, 1 - st * 0.35);
      const g2 = ctx.createRadialGradient(-s.r * 0.3, -s.r * 0.35, 0, 0, 0, s.r);
      g2.addColorStop(0, 'rgba(255,196,180,0.95)');
      g2.addColorStop(0.4, `rgba(${SKIN.bead},0.92)`);
      g2.addColorStop(1, 'rgba(96,16,34,0.85)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(0, 0, s.r, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

export default L3Squeeze;
