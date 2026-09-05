// ============================================================
// l1-press.js — CHAPTER I · DO NOT PRESS
// ------------------------------------------------------------
// A red switch under a bolted bell jar.
//
// Beats:
//   1. tap the glass          → it rings, the button flinches, narrator warns
//   2. the four brass screws  → torque them loose (finger torque about the
//                               screw, so both circling AND a flick past it
//                               work), they pop, fall, roll and stay flickable
//   3. the jar comes free     → it has WEIGHT. Set it down gently and it
//                               survives; drop it and it explodes. Both are
//                               valid. Both are yours.
//   4. the switch             → travel, then a detent that fights back, then
//                               a bottom-out you feel in your teeth
// ============================================================

import { Level } from '../level.js';
import {
  TAU, clamp, clamp01, lerp, damp, smoothstep, rand, rrange, makeRng, noise1,
} from '../../core/math.js';
import {
  PALETTES, metalFill, radialBrush, brushedStreaks, knurl, screwHead,
  glassDome, caustic, engrave, emboss, contactShadow, roundRectPath,
} from '../../render/materials.js';
import { Debris } from '../../render/particles.js';
import { Layer } from '../../render/renderer.js';
import { Audio, SFX } from '../../core/audio.js';
import Haptics from '../../core/haptics.js';
import { Smooth, Pulse } from '../../core/tween.js';

const SCREW_ANGLES = [128, 52, 232, 308];      // deg, on the flange ellipse

export class L1Press extends Level {
  static id = 'l1';
  static chapter = 'I';
  static rule = 'Do not press';

  // ---------------------------------------------------------
  // layout
  // ---------------------------------------------------------
  layout(w, h, u) {
    const G = this.game.set.geom;
    const cx = G.cx;
    const R = G.heroR;                       // the room decides how big a hero is
    const plateY = G.topY - u * 0.30;
    const K = 0.255;                          // the room's ellipse foreshortening

    // The assembly is ONE bolted object: plate → gasket → flange → glass.
    // Every radius below is a fraction of the plate so nothing floats.
    this.g = {
      w, h, u, cx, plateY, R, K,
      // base plate: machined steel disc with a chamfered rim
      plateRx: R * 1.30, plateRy: R * 1.30 * K,
      plateTh: u * 2.1,
      chamfer: u * 1.05,
      // raised seat the jar bolts down onto
      seatRx: R * 1.10, seatRy: R * 1.10 * K, seatH: u * 0.85,
      // brass flange, an annulus wide enough to actually hold a screw head
      flangeIn: R * 0.845, flangeOut: R * 1.085, flangeTh: u * 1.15,
      gasketTh: u * 0.62,
      // the glass
      jarR: R * 0.865,
      jarStraight: R * 1.30,
      jarDome: R * 0.94,
      jarWall: u * 0.78,
      // the switch
      bezelRx: R * 0.485, bezelH: u * 1.5,
      collarRx: R * 0.40, collarH: R * 0.24,
      capRx: R * 0.385, capBulge: R * 0.285,
      travel: R * 0.155,
    };
    const g = this.g;
    g.capRy = g.capRx * K * 1.12;
    g.flangeRx = (g.flangeIn + g.flangeOut) * 0.5;   // screw circle
    g.flangeRy = g.flangeRx * K;
    g.jarBaseY = plateY - g.seatH - g.gasketTh;      // glass rests on the gasket
    g.jarTopY = g.jarBaseY - g.jarStraight - g.jarDome;
    g.btnBaseY = plateY - g.seatH * 0.2;

    if (this.screws) this._placeScrews();
    this.floorY = plateY;
  }

  _placeScrews() {
    const g = this.g;
    for (const s of this.screws) {
      const a = s.angle;
      s.x = g.cx + Math.cos(a) * g.flangeRx;
      s.y = g.jarBaseY + g.flangeTh * 0.1 + Math.sin(a) * g.flangeRy;
      s.r = g.R * 0.105;
    }
  }

  // ---------------------------------------------------------
  // enter
  // ---------------------------------------------------------
  enter() {
    const g = this.g;
    this.screws = SCREW_ANGLES.map((deg, i) => ({
      i,
      angle: deg * Math.PI / 180,
      x: 0, y: 0, r: 0,
      spin: 0,             // visual rotation
      progress: 0,         // 0..1 unwound
      target: [3.0, 2.6, 2.2, 1.8][i] * Math.PI,   // radians of turning needed
      turned: 0,
      detent: 0,
      free: false,
      lift: 0,
      wobble: 0,
      claimed: null,
      glow: 0,
      hintPulse: new Pulse(1.1),
    }));
    this._placeScrews();

    this.freed = 0;
    this.jar = {
      grabbed: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vrot: 0,
      lift: 0, tilt: 0, held: false, released: false, gone: false,
      intact: true, restX: 0, restY: 0, restRot: 0, resting: false,
      ringT: 0, stress: 0,
    };
    this.jarSpring = { v: 0 };
    this.debris = [];        // fallen screws
    this.shards = [];        // jar glass
    this.taps = 0;
    this.flinch = new Pulse(0.55);
    this.btn = {
      press: 0,            // 0..1 visual travel
      target: 0,
      resist: 0,           // 0..1 how far into the detent fight
      committed: false,
      down: false,
      holdT: 0,
      pressed: false,
      glow: 1,
      pulse: new Pulse(0.6),
    };
    this.exposed = false;
    this.aftermath = 0;
    this.phase = 'glass';    // glass | jar | button | done
    this.idleHint = 0;
    this.narratorStage = 0;
    this.smoke = 0;

    this.say("Behind the glass is a switch.", { hold: 1.4 });
    this.say("Do not press it.", { hold: 2.2 });
    this.hint('');
  }

  exit() { this.hideHint(); }

  probe() {
    return {
      phase: this.phase,
      freed: this.freed,
      screwProgress: this.screws.map(s => +(s.turned / s.target).toFixed(2)),
      jarLift: +this.jar.lift.toFixed(1),
      jarGone: this.jar.gone,
      jarIntact: this.jar.intact,
      buttonPress: +this.btn.press.toFixed(2),
      solved: this.solved,
      shards: this.shards.length,
    };
  }

  // ---------------------------------------------------------
  // update
  // ---------------------------------------------------------
  update(dt) {
    const g = this.g;
    this.flinch.update(dt);
    this.btn.pulse.update(dt);
    for (const s of this.screws) s.hintPulse.update(dt);

    if (this.phase === 'glass' || this.phase === 'jar') this._updateScrews(dt);
    if (this.phase === 'jar') this._updateJar(dt);
    else if (this.jar.released && !this.jar.gone) this._updateJarPhysics(dt);
    if (this.phase === 'button') this._updateButton(dt);
    if (this.phase === 'glass') this._updateGlassTaps(dt);

    this._updateDebris(dt);
    this._updateShards(dt);
    this._hints(dt);

    // idle attract: one screw catches the light
    if (this.phase === 'glass' && this.freed === 0) {
      this.idleHint += dt;
      if (this.idleHint > 4.2) {
        this.idleHint = 0;
        const s = this.screws.find(x => !x.free);
        if (s) s.hintPulse.fire();
      }
    }
  }

  // ---------------- glass taps ----------------
  _updateGlassTaps(dt) {
    for (const p of this.input.taps) {
      if (p.claimedBy) continue;
      if (!this._insideJar(p.x, p.y)) continue;
      this.taps++;
      this.flinch.fire();
      this.jar.ringT = 1;
      SFX.glassRing(1500 + rrange(-150, 150), 0.45);
      Haptics.tick();
      this.shake(0.05);
      const lines = [
        "It's behind glass. That should be enough.",
        "Tapping will not help you.",
        "You're upsetting it.",
        "Four screws. Please don't.",
      ];
      if (this.taps <= lines.length) this.interrupt(lines[this.taps - 1], { hold: 1.6, agitated: this.taps > 2 });
      if (this.taps === 3) {
        // the narrator accidentally tells you how
        this.tl.after(1.4, () => { for (const s of this.screws) s.hintPulse.fire(); });
      }
    }
    this.jar.ringT = damp(this.jar.ringT, 0, 3.2, dt);
  }

  _insideJar(x, y) {
    const g = this.g, j = this.jar;
    const cx = g.cx + (j ? j.x : 0);
    const baseY = g.jarBaseY - (j ? j.lift : 0);
    const dx = x - cx;
    if (Math.abs(dx) > g.jarR * 1.20) return false;
    if (y > baseY + g.flangeRy * 1.3) return false;
    const shoulder = baseY - g.jarStraight;
    if (y > shoulder) return true;
    return Math.hypot(dx / (g.jarR * 1.14), (y - shoulder) / (g.jarDome * 1.12)) < 1;
  }

  // ---------------- screws ----------------
  _updateScrews(dt) {
    const g = this.g;
    for (const p of this.input.list) {
      if (p.claimedBy && p.claimedBy !== this.tag) continue;
      // claim the nearest unfinished screw once, on press
      if (!p.data.screw) {
        if (p.claimedBy) continue;
        let best = null, bd = g.R * 0.44;
        for (const s of this.screws) {
          if (s.free) continue;
          const d = Math.hypot(p.x - s.x, p.y - s.y);
          if (d < bd) { bd = d; best = s; }
        }
        if (!best) continue;
        p.claimedBy = this.tag;
        p.data.screw = best;
        best.claimed = p;
        best.glow = 1;
        continue;
      }
      const s = p.data.screw;
      if (s.free) continue;
      // finger torque about the screw: ω = (r × v) / |r|²
      const rx = p.x - s.x, ry = p.y - s.y;
      const r2 = Math.max((g.u * 1.5) ** 2, rx * rx + ry * ry);
      const dTheta = (rx * p.dy - ry * p.dx) / r2;
      if (Math.abs(dTheta) < 1e-5) continue;
      s.spin += dTheta;
      // counter-clockwise on screen loosens; clockwise puts it back
      const prev = s.turned;
      s.turned = clamp(s.turned - dTheta, 0, s.target);
      const step = Math.PI / 5;
      const nd = Math.floor(s.turned / step);
      if (nd !== s.detent) {
        const dir = nd > s.detent ? 1 : -1;
        s.detent = nd;
        SFX.screwTick(nd * 0.5 * dir, (s.x - g.cx) / (g.u * 20));
        Haptics.detent();
        s.wobble = 1;
        this.p.emit({
          x: s.x + rrange(-2, 2), y: s.y + rrange(-2, 2),
          vx: rrange(-30, 30), vy: rrange(-50, -10),
          life: 0.5, size: 1.1, kind: 1, grav: 220, drag: 2.6,
          color: [190, 160, 110], alpha: 0.5,
        });
      }
      if (s.turned >= s.target - 1e-4) this._freeScrew(s, p);
    }
    // release claims
    for (const p of this.input.releases) {
      if (p.data && p.data.screw) { p.data.screw.claimed = null; p.data.screw = null; }
    }
    for (const s of this.screws) {
      s.lift = damp(s.lift, s.free ? 1 : (s.turned / s.target) * 0.35, 12, dt);
      s.wobble = damp(s.wobble, 0, 7, dt);
      s.glow = damp(s.glow, s.claimed ? 1 : 0, 6, dt);
    }
  }

  _freeScrew(s, p) {
    const g = this.g;
    s.free = true;
    s.claimed = null;
    if (p) { p.data.screw = null; p.claimedBy = null; }
    this.freed++;
    SFX.screwFree((s.x - g.cx) / (g.u * 20));
    Haptics.snap();
    this.shake(0.09);
    this.p.burst(s.x, s.y, 10, {
      speed: 130, dir: -Math.PI / 2, spread: 2.0, life: 0.5, size: 1.4,
      kind: 1, grav: 900, drag: 2.2, color: [214, 178, 112], alpha: 0.7,
    });
    // it pops out and drops onto the plinth
    this.tl.after(0.16, () => {
      const d = new Debris(s.x, s.y - g.u * 1.4, screwPoly(g.u * 1.9, g.u * 0.8), {
        vx: rrange(-90, 90), vy: rrange(-260, -170),
        va: rrange(-9, 9), restitution: 0.34, friction: 0.9, grav: 2600,
        data: { kind: 'screw', r: g.u * 1.9 },
      });
      d.floorY = g.plateY + g.u * 1.2 + rrange(-2, 2);
      this.debris.push(d);
      SFX.screwDrop((s.x - g.cx) / (g.u * 20));
    });

    const lines = [
      "…That is a screw. That is not an invitation.",
      "Two left. I'd like you to know I'm watching.",
      "One. One screw between you and a very bad idea.",
      null,
    ];
    const l = lines[this.freed - 1];
    if (l) this.interrupt(l, { hold: 1.9, agitated: this.freed >= 2 });

    if (this.freed >= 4) {
      this.phase = 'jar';
      this.interrupt("Don't you dare lift it.", { hold: 2.0, agitated: true });
      SFX.glassLift();
      this.tl.after(0.5, () => { this.jar.ringT = 0.7; });
    }
  }

  // ---------------- the jar ----------------
  _updateJar(dt) {
    const g = this.g;
    const j = this.jar;

    if (!j.grabbed) {
      const p = this.input.find(pt =>
        !pt.claimedBy && pt.down && this._insideJar(pt.x, pt.y), this.tag);
      if (p && this.input.presses.includes(p)) {
        p.claimedBy = this.tag;
        p.data.jar = true;
        j.grabbed = true;
        j.grabY = p.y;
        j.grabLift = j.lift;
        j.grabX = p.x;
        j.baseX = j.x;
        SFX.glassLift();
        Haptics.press();
      }
    }

    const held = this.input.list.find(pt => pt.data && pt.data.jar);
    if (j.grabbed && held) {
      // weight: the jar lags behind the finger, and resists at first
      const wantLift = Math.max(0, j.grabLift + (j.grabY - held.y));
      const heavy = 1 - smoothstep(clamp01(wantLift / (g.u * 6))) * 0.55;
      j.lift = damp(j.lift, wantLift * (1 - 0.28 * heavy), 13, dt);
      j.x = damp(j.x, j.baseX + (held.x - j.grabX) * 0.9, 11, dt);
      j.tilt = damp(j.tilt, clamp((held.x - j.grabX) * 0.0016, -0.24, 0.24), 8, dt);
      j.stress = clamp01(wantLift / (g.u * 26));
      if (j.lift > g.u * 1.2 && !j.lifted) {
        j.lifted = true;
        this.interrupt("Put. It. Back.", { hold: 2.0, agitated: true });
      }
      // glass complains as it swings
      if (Math.abs(held.dx) > 6 && rand() < 0.07) SFX.glassRing(1900, 0.12);
    } else if (j.grabbed) {
      // released
      j.grabbed = false;
      j.released = true;
      j.vy = -(held ? 0 : 0);
      const last = this.input.releases.find(pt => pt.data && pt.data.jar);
      if (last) { j.vx = last.vx * 0.6; j.vy = last.vy * 0.6; last.claimedBy = null; last.data.jar = false; }
      this.phase = 'jarfall';
      SFX.whoosh(0.5);
    }
  }

  _updateJarPhysics(dt) {
    const g = this.g;
    const j = this.jar;
    j.vy += 3000 * dt;
    j.lift -= j.vy * dt;
    j.x += j.vx * dt;
    j.vrot += (j.vx * 0.00006);
    j.tilt += j.vrot * dt;
    j.vx *= Math.exp(-0.6 * dt);

    if (j.lift <= 0) {
      const impact = Math.abs(j.vy);
      j.lift = 0;
      const offPlinth = Math.abs(j.x) > g.plateRx * 0.92;
      if (impact > 640 || offPlinth) this._shatterJar(impact);
      else this._settleJar(impact);
    }
  }

  _settleJar(impact) {
    const g = this.g, j = this.jar;
    j.released = false;
    j.resting = true;
    j.gone = true;
    j.intact = true;
    // it topples over and comes to rest on its side beside the switch
    const dir = j.x >= 0 ? 1 : -1;
    j.restRot = dir * 1.15;
    j.restX = dir * g.plateRx * 0.86;
    SFX.glassSet(clamp01(impact / 500) + 0.4);
    Haptics.thunk();
    this.shake(0.12 + clamp01(impact / 1400) * 0.18);
    this.p.burst(g.cx + j.x, g.plateY, 12, {
      speed: 160, dir: -Math.PI / 2, spread: 2.6, life: 0.7, size: 2.2,
      kind: 1, grav: 500, drag: 2.4, color: [160, 160, 172], alpha: 0.35,
    });
    this.tl.to(j, 'tilt', j.restRot, 0.55, 'outBounce');
    this.tl.to(j, 'x', j.restX, 0.7, 'outCubic');
    this.interrupt("Careful. How considerate.", { hold: 1.8 });
    this._expose(0.5);
  }

  _shatterJar(impact) {
    const g = this.g, j = this.jar;
    j.released = false;
    j.gone = true;
    j.intact = false;
    SFX.glassShatter(clamp01(0.6 + impact / 1600));
    Haptics.shatter();
    this.shake(0.62);
    this.slowmo(0.28, 0.5);
    this.flash('220,238,255', 0.28, 0.32);
    Audio.setRoom(2.4, 2.2, 0.34);

    const rng = makeRng(77);
    const cx = g.cx + j.x, baseY = g.jarBaseY;
    for (let i = 0; i < 46; i++) {
      const a = rng() * TAU;
      const rr = Math.sqrt(rng()) * g.jarR;
      const px = cx + Math.cos(a) * rr;
      const py = baseY - rng() * (g.jarStraight + g.jarR) * 0.95;
      const size = g.u * (0.7 + rng() * 2.1);
      const d = new Debris(px, py, shardPoly(size, rng), {
        vx: (px - cx) * rrange(2.6, 5.0) + rrange(-140, 140),
        vy: rrange(-620, -120) - (baseY - py) * 0.7,
        va: rrange(-16, 16), restitution: 0.32, friction: 0.82, grav: 2700,
        data: { kind: 'shard', size },
      });
      d.floorY = g.plateY + rrange(-1, 5) + (Math.abs(px - g.cx) > g.plateRx ? g.h : 0);
      this.shards.push(d);
    }
    this.p.burst(cx, baseY - g.jarStraight * 0.6, 60, {
      speed: 560, dir: -Math.PI / 2, spread: TAU, life: 0.8, size: 1.5,
      kind: 2, grav: 2200, drag: 1.0, color: [216, 236, 250], alpha: 0.95, jitter: g.jarR,
    });
    this.p.burst(cx, baseY - g.jarStraight * 0.5, 26, {
      speed: 300, dir: -Math.PI / 2, spread: TAU, life: 1.4, size: 5,
      kind: 4, grav: -30, drag: 1.4, color: [190, 205, 220], alpha: 0.5, jitter: g.jarR,
    });
    this.p.burst(cx, baseY - g.jarStraight * 0.5, 18, {
      speed: 420, dir: -Math.PI / 2, spread: TAU, life: 0.5, size: 2,
      kind: 3, grav: 900, drag: 1.6, color: [200, 230, 255], alpha: 0.8, jitter: g.jarR,
    });
    this.smoke = 1;
    this.interrupt("…", { hold: 1.1, agitated: true });
    this.say("You broke it. You actually broke it.", { hold: 2.2, agitated: true });
    this._expose(0.9);
  }

  _expose(delay) {
    this.tl.after(delay, () => {
      this.exposed = true;
      this.phase = 'button';
      this.btn.pulse.fire(0.9);
      SFX.reveal();
      this.tl.after(1.4, () => {
        if (this.phase === 'button' && !this.btn.pressed)
          this.say("There. Now you can see it. Now leave.", { hold: 2.6, agitated: true });
      });
    });
  }

  // ---------------- the switch ----------------
  _updateButton(dt) {
    const g = this.g, b = this.btn;
    const p = this.input.find(pt => !pt.claimedBy && pt.down && this._onButton(pt.x, pt.y), this.tag);
    const holder = this.input.list.find(pt => pt.data && pt.data.btn);

    if (p && !holder && this.input.presses.includes(p)) {
      p.claimedBy = this.tag; p.data.btn = true;
      b.down = true; b.holdT = 0;
      SFX.buttonPress();
      Haptics.press();
      this.shake(0.05);
    }
    if (b.down && !holder) {
      b.down = false;
      if (!b.committed) {
        SFX.buttonRelease();
        Haptics.release();
        b.resist = 0;
        if (b.holdT > 0.25 && !this._nagged) {
          this._nagged = true;
          this.interrupt("It doesn't want to go. Take the hint.", { hold: 2.2, agitated: true });
        }
      }
    }

    if (b.down && !b.committed) {
      b.holdT += dt;
      // stage one: instant travel to the detent
      b.target = 0.42;
      // stage two: the detent fights back, then gives
      if (b.holdT > 0.28) {
        b.resist = clamp01((b.holdT - 0.28) / 0.85);
        b.target = 0.42 + b.resist * 0.22;
        if (rand() < b.resist * 0.6) {
          this.p.emit({
            x: g.cx + rrange(-g.collarRx, g.collarRx), y: g.plateY - g.u * 0.6,
            vx: rrange(-40, 40), vy: rrange(-90, -20),
            life: 0.6, size: 1.6, kind: 1, grav: 120, drag: 2.2,
            color: [170, 160, 150], alpha: 0.35,
          });
        }
        if (rand() < 0.25) { SFX.glassStress(b.resist * 0.7); Haptics.stress(b.resist); }
        this.shake(0.012 + b.resist * 0.05);
        if (b.resist >= 1) this._commit();
      }
    } else if (!b.committed) {
      b.target = 0;
    }

    b.press = damp(b.press, b.target, b.committed ? 26 : 20, dt);

    if (b.committed) {
      this.aftermath += dt;
    }
  }

  _onButton(x, y) {
    const g = this.g, b = this.btn;
    if (!this.exposed) return false;
    const capY = g.btnBaseY - g.bezelH - g.collarH - g.travel * (1 - b.press);
    const cy = capY - g.capBulge * 0.5;
    // generous by design: this is a thumb, not a cursor
    return Math.hypot((x - g.cx) / (g.capRx * 1.45), (y - cy) / (g.capBulge * 1.4)) < 1;
  }

  _commit() {
    const g = this.g, b = this.btn;
    b.committed = true;
    b.pressed = true;
    b.target = 1;
    SFX.buttonBottom();
    Haptics.bottom();
    this.shake(0.85);
    this.slowmo(0.18, 0.42);
    this.flash('255,190,150', 0.34, 0.4);
    this.p.burst(g.cx, g.plateY - g.u * 0.4, 34, {
      speed: 420, dir: -Math.PI / 2, spread: TAU, life: 0.7, size: 2,
      kind: 0, grav: 1400, drag: 2.0, color: [255, 200, 130], alpha: 0.9,
    });
    this.p.burst(g.cx, g.plateY, 26, {
      speed: 260, dir: 0, spread: TAU, life: 1.6, size: 7,
      kind: 4, grav: -40, drag: 1.6, color: [150, 140, 135], alpha: 0.4, jitter: g.u * 8,
    });

    // the room dies
    this.tl.after(0.18, () => {
      SFX.powerDown();
      this.game.tl.to(this.game.set, 'exposure', 0.06, 0.55, 'inQuart');
      this.game.tl.to(this.game.set, 'coneStrength', 0, 0.4, 'inQuart');
      if (this.game.ambience) this.game.ambience.set(0.002, 0.3);
    });
    this.tl.after(1.05, () => {
      this.game.set.tint = '#ff2d18';
      this.game.tl.to(this.game.set, 'exposure', 0.22, 0.3, 'outCubic');
      this.game.set.warmth = 0.05;
      SFX.bigImpact(1);
      Haptics.heavy();
      this.shake(0.5);
      this.interrupt("What have you done.", { hold: 2.4, agitated: true });
    });
    this.tl.after(2.6, () => {
      this.game.set.tint = null;
      this.game.tl.to(this.game.set, 'exposure', 1, 1.4, 'outCubic');
      this.game.tl.to(this.game.set, 'coneStrength', 1, 1.4, 'outCubic');
      this.game.set.warmth = 1;
      if (this.game.ambience) this.game.ambience.set(0.035, 1.2);
      Audio.setRoom(1.9, 2.6, 0.26);
      SFX.powerUp();
    });
    this.solve(4.4);
  }

  // ---------------- debris / shards ----------------
  _updateDebris(dt) {
    const g = this.g;
    const bounds = { x: g.cx - g.plateRx * 1.4, w: g.plateRx * 2.8 };
    for (const d of this.debris) {
      // flickable: a finger passing over a resting screw knocks it
      if (d.rest) {
        for (const p of this.input.list) {
          if (Math.hypot(p.x - d.x, p.y - d.y) < g.u * 3.6 && (Math.abs(p.dx) + Math.abs(p.dy)) > 2) {
            d.rest = false;
            d.vx = p.dx * 22; d.vy = Math.min(-60, p.dy * 18);
            d.va = p.dx * 0.7;
            SFX.screwDrop((d.x - g.cx) / (g.u * 20));
            Haptics.tick();
          }
        }
      } else {
        const wasAir = d.vy;
        d.step(dt, d.floorY, bounds);
        if (wasAir > 300 && Math.abs(d.vy) < wasAir * 0.6) {
          SFX.screwDrop((d.x - g.cx) / (g.u * 20));
        }
      }
    }
  }

  _updateShards(dt) {
    const g = this.g;
    let settled = 0;
    for (const d of this.shards) {
      if (d.rest) { settled++; continue; }
      const fast = Math.abs(d.vy) > 260;
      d.step(dt, d.floorY, null);
      if (fast && Math.abs(d.vy) < 200 && rand() < 0.5)
        SFX.shardTinkle(d.data.size / g.u, (d.x - g.cx) / (g.u * 24));
    }
    this.smoke = damp(this.smoke, 0, 0.9, dt);
  }

  // ---------------- hints ----------------
  _hints(dt) {
    const idle = this.input.idle();
    if (this.solved) { this.hideHint(); return; }
    if (this.phase === 'glass') {
      if (this.freed === 0 && idle > 7) this.hint('Turn the screws');
      else this.hideHint();
    } else if (this.phase === 'jar') {
      if (idle > 4) this.hint('Lift the glass'); else this.hideHint();
    } else if (this.phase === 'button') {
      if (idle > 6 && !this.btn.pressed) this.hint('Press and hold'); else this.hideHint();
    } else this.hideHint();
  }

  // =========================================================
  // DRAW
  // =========================================================
  draw(ctx, glow) {
    // Everything that lives BEHIND the glass is painted into a layer we
    // own, then blitted. The glass then refracts that layer instead of
    // reading back the canvas it is being drawn on — see _beginScene.
    // On capable hardware the interior goes to an owned layer so the glass
    // can refract it. Where that bandwidth isn't available we draw straight
    // to the canvas and the glass simply doesn't bend the scene — the one
    // effect whose cost scales with surface copies rather than draw calls.
    const sc = this.r.quality.refract ? this._beginScene(ctx) : null;
    if (!sc) this._sceneRect = null;
    const t = sc ? sc.ctx : ctx;
    this._drawPlate(t, glow);
    this._drawScrews(t, false);         // back screws
    this._drawButton(t, glow);
    this._drawShards(t, glow);
    this._drawDebris(t);
    if (sc) this._flushScene(ctx, sc);
    if (!this.jar.gone || this.jar.resting) this._drawJar(ctx, glow);
    this._drawScrews(ctx, true);        // front screws
  }

  /**
   * Open an offscreen pass for everything behind the glass.
   *
   * Reading the presenting canvas mid-frame (drawImage(mainCanvas, ...))
   * is a hard performance cliff: it forces an eager, unbatched raster of
   * everything queued so far, and on mobile it can cost a canvas its
   * acceleration for the rest of the session. Measured here it turned a
   * 2.7ms frame into an 80ms one.
   *
   * So we paint the interior into a layer sized to just the object, seed
   * it with the room from the Set's own cached layers, and let the jar
   * sample THAT. Reading a surface we own and have finished writing is
   * cheap and stays cached.
   */
  _beginScene(ctx) {
    const r = this.r, g = this.g, set = this.game.set, G = set.geom;
    if (!G) return null;
    const M = ctx.getTransform();
    const pad = g.u * 5;
    const jarTop = g.jarBaseY - this.jar.lift - g.jarStraight - g.jarDome;
    const wx0 = g.cx + Math.min(0, this.jar.x) - g.plateRx * 1.4;
    const wx1 = g.cx + Math.max(0, this.jar.x) + g.plateRx * 1.4;
    const wy0 = Math.min(jarTop, g.plateY - g.plateRy) - pad * 3;
    const wy1 = g.plateY + g.plateTh + g.plateRy * 2 + pad;

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [px, py] of [[wx0, wy0], [wx1, wy0], [wx0, wy1], [wx1, wy1]]) {
      const dx = M.a * px + M.c * py + M.e;
      const dy = M.b * px + M.d * py + M.f;
      if (dx < x0) x0 = dx;
      if (dx > x1) x1 = dx;
      if (dy < y0) y0 = dy;
      if (dy > y1) y1 = dy;
    }
    x0 = Math.floor(x0); y0 = Math.floor(y0);
    // Quantise the SIZE. Camera shake moves this rect every frame, and a
    // canvas whose width/height changes gets reallocated and cleared by
    // the browser each time — which cost more than everything it drew.
    // The origin may drift freely; only the dimensions must stay put.
    const Q = 32;
    const w = Math.ceil((x1 - x0) / Q) * Q + Q;
    const h = Math.ceil((y1 - y0) / Q) * Q + Q;
    if (w < 8 || h < 8) return null;

    if (!this._scene) this._scene = new Layer();
    const L = this._scene.size(w, h);
    const sx = L.ctx;
    sx.setTransform(1, 0, 0, 1, 0, 0);
    sx.clearRect(0, 0, w, h);
    // same world transform as the main canvas, shifted to this layer's origin
    sx.setTransform(M.a, M.b, M.c, M.d, M.e - x0, M.f - y0);

    // Seed with the room, taken from the Set's cached layers.
    // Blit ONLY the sub-rectangle this layer covers: handing the whole
    // 786x1704 room to drawImage and letting it scale down costs ~11ms a
    // frame even when the destination is small, because the full source
    // is resampled regardless of how little of it lands.
    const inv = M.inverse();
    let rx0 = Infinity, ry0 = Infinity, rx1 = -Infinity, ry1 = -Infinity;
    for (const [dx, dy] of [[x0, y0], [x0 + w, y0], [x0, y0 + h], [x0 + w, y0 + h]]) {
      const pt = inv.transformPoint(new DOMPoint(dx, dy));
      if (pt.x < rx0) rx0 = pt.x;
      if (pt.x > rx1) rx1 = pt.x;
      if (pt.y < ry0) ry0 = pt.y;
      if (pt.y > ry1) ry1 = pt.y;
    }
    rx0 = Math.max(0, rx0 - 2); ry0 = Math.max(0, ry0 - 2);
    rx1 = Math.min(G.w, rx1 + 2); ry1 = Math.min(G.h, ry1 + 2);
    const rw = rx1 - rx0, rh = ry1 - ry0;
    const region = (cvs, alpha, comp) => {
      if (rw <= 0 || rh <= 0 || alpha <= 0.004) return;
      const kx = cvs.width / G.w, ky = cvs.height / G.h;
      sx.globalAlpha = Math.min(1, alpha);
      if (comp) sx.globalCompositeOperation = comp;
      sx.drawImage(cvs, rx0 * kx, ry0 * ky, rw * kx, rh * ky, rx0, ry0, rw, rh);
      if (comp) sx.globalCompositeOperation = 'source-over';
    };
    const lit = Math.min(1, 0.10 + set.lit * 0.90);
    region(set.wall.canvas, lit);
    region(set.cone.canvas, set.coneStrength * set.lit, 'lighter');
    region(set.plinth.canvas, set.plinthOpacity * lit);
    sx.globalAlpha = 1;

    const rect = { ctx: sx, x0, y0, w, h };
    this._sceneRect = rect;
    return rect;
  }

  _flushScene(ctx, sc) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this._scene.canvas, sc.x0, sc.y0);
    ctx.restore();
  }

  drawFront(ctx, glow) {
    const g = this.g;
    if (this.smoke > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gg = ctx.createRadialGradient(g.cx, g.jarBaseY - g.u * 6, 0, g.cx, g.jarBaseY - g.u * 6, g.u * 26);
      gg.addColorStop(0, `rgba(190,210,230,${0.09 * this.smoke})`);
      gg.addColorStop(1, 'rgba(190,210,230,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, g.w, g.h);
      ctx.restore();
    }
  }

  // ---------- base plate ----------
  // A machined steel disc: chamfered rim, turned top face, a raised seat
  // ring the bell jar bolts down onto, and the warning cut into the metal.
  _drawPlate(ctx, glow) {
    const g = this.g;
    const { cx, plateY, plateRx, plateRy } = g;
    const E = this.game.set.lit;
    const th = g.plateTh;
    const ch = g.chamfer;
    const inRx = plateRx - ch, inRy = plateRy - ch * g.K;

    // --- shadow the plate throws on the plinth top ---
    contactShadow(ctx, cx, plateY + th + g.u * 0.5, plateRx * 1.16, plateRy * 1.25,
      { strength: 0.66 * E });
    contactShadow(ctx, cx, plateY + th + g.u * 0.2, plateRx * 0.98, plateRy * 0.78,
      { strength: 0.5 * E });

    // --- side wall (it has real thickness) ---
    ctx.beginPath();
    ctx.ellipse(cx, plateY + th, plateRx, plateRy, 0, 0, Math.PI);
    ctx.lineTo(cx - plateRx, plateY);
    ctx.ellipse(cx, plateY, plateRx, plateRy, 0, Math.PI, 0, true);
    ctx.closePath();
    const sideG = ctx.createLinearGradient(cx - plateRx, 0, cx + plateRx, 0);
    sideG.addColorStop(0, '#101216');
    sideG.addColorStop(0.24, '#3a4049');
    sideG.addColorStop(0.40, '#5a626d');
    sideG.addColorStop(0.58, '#31363d');
    sideG.addColorStop(0.82, '#191c21');
    sideG.addColorStop(1, '#0d0f12');
    ctx.fillStyle = sideG;
    ctx.fill();
    // ground-occlusion at the very bottom of the wall
    ctx.save();
    ctx.clip();
    const og = ctx.createLinearGradient(0, plateY + th * 0.35, 0, plateY + th + plateRy);
    og.addColorStop(0, 'rgba(0,0,0,0)');
    og.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = og;
    ctx.fillRect(cx - plateRx, plateY, plateRx * 2, th + plateRy * 2);
    ctx.restore();

    // --- the 45° chamfer: the ring that catches the key light ---
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, plateY, plateRx, plateRy, 0, 0, TAU);
    ctx.ellipse(cx, plateY + ch * g.K * 0.9, inRx, inRy, 0, 0, TAU);
    ctx.clip('evenodd');
    const cg = ctx.createLinearGradient(cx - plateRx, plateY - plateRy, cx + plateRx, plateY + plateRy);
    cg.addColorStop(0, '#6e7681');
    cg.addColorStop(0.17, '#c8d0d9');
    cg.addColorStop(0.30, '#f2f6fa');
    cg.addColorStop(0.46, '#8f98a3');
    cg.addColorStop(0.66, '#4a515a');
    cg.addColorStop(0.85, '#787f89');
    cg.addColorStop(1, '#33383f');
    ctx.fillStyle = cg;
    ctx.fillRect(cx - plateRx, plateY - plateRy - ch, plateRx * 2, plateRy * 2 + ch * 3);
    ctx.restore();

    // --- top face: turned steel ---
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, plateY + ch * g.K * 0.9, inRx, inRy, 0, 0, TAU);
    ctx.clip();
    const topG = ctx.createLinearGradient(cx - inRx, plateY - inRy, cx + inRx, plateY + inRy);
    topG.addColorStop(0, '#2b3037');
    topG.addColorStop(0.26, '#4c545f');
    topG.addColorStop(0.44, '#6b7480');
    topG.addColorStop(0.60, '#464d57');
    topG.addColorStop(0.82, '#282c32');
    topG.addColorStop(1, '#1b1e23');
    ctx.fillStyle = topG;
    ctx.fillRect(cx - plateRx, plateY - plateRy - ch, plateRx * 2, plateRy * 2 + ch * 3);
    ctx.save();
    ctx.translate(cx, plateY);
    ctx.scale(1, g.K);
    radialBrush(ctx, 0, 0, plateRx / g.K * 0.9, 91, { count: 210, alpha: 0.055 });
    ctx.restore();
    // warm pool from the overhead key, offset up-left like everything else
    ctx.globalCompositeOperation = 'lighter';
    const lp = ctx.createRadialGradient(cx - inRx * 0.18, plateY - inRy * 0.7, 0, cx, plateY, inRx * 1.15);
    lp.addColorStop(0, `rgba(255,228,186,${0.22 * E})`);
    lp.addColorStop(0.55, `rgba(255,216,172,${0.05 * E})`);
    lp.addColorStop(1, 'rgba(255,216,172,0)');
    ctx.fillStyle = lp;
    ctx.fillRect(cx - plateRx, plateY - plateRy - ch, plateRx * 2, plateRy * 2 + ch * 3);
    ctx.restore();

    // --- the warning, cut into the top face and foreshortened onto it ---
    this._drawEngraving(ctx, E);

    // --- inner edge of the chamfer: a crisp machined line ---
    ctx.save();
    ctx.lineWidth = Math.max(1, g.u * 0.16);
    ctx.strokeStyle = `rgba(12,14,18,0.75)`;
    ctx.beginPath();
    ctx.ellipse(cx, plateY + ch * g.K * 0.9, inRx, inRy, 0, Math.PI * 1.02, Math.PI * 1.98);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,244,220,${0.30 * E})`;
    ctx.beginPath();
    ctx.ellipse(cx, plateY + ch * g.K * 0.9, inRx, inRy, 0, 0.04, Math.PI * 0.96);
    ctx.stroke();
    // outer lip catches a hot line
    ctx.strokeStyle = `rgba(255,248,232,${0.6 * E})`;
    ctx.lineWidth = Math.max(1, g.u * 0.14);
    ctx.beginPath();
    ctx.ellipse(cx, plateY, plateRx - 0.5, plateRy - 0.5, 0, Math.PI * 1.06, Math.PI * 1.94);
    ctx.stroke();
    ctx.restore();

    // --- raised seat ring the jar bolts onto ---
    this._drawSeat(ctx, E);
  }

  _drawEngraving(ctx, E) {
    const g = this.g;
    const { cx, plateY } = g;
    // sits on the FRONT half of the top face, squashed into the plane
    const py = plateY + g.plateRy * 0.60;
    ctx.save();
    ctx.globalAlpha = clamp01(E * 1.25);
    ctx.translate(cx, py);
    ctx.scale(1, g.K * 1.55);
    engrave(ctx, 'DO NOT PRESS', 0, 0, {
      font: `800 ${g.u * 4.4}px Inter, sans-serif`,
      letterSpacing: `${g.u * 0.5}px`,
      depth: Math.max(1.2, g.u * 0.32), darkness: 0.86, light: 0.30,
    });
    ctx.restore();
  }

  /** The raised machined boss + rubber gasket the bell jar seats on. */
  _drawSeat(ctx, E) {
    const g = this.g;
    const { cx, plateY } = g;
    const sRx = g.seatRx, sRy = g.seatRy, sH = g.seatH;
    const topY = plateY - sH;

    // boss side wall
    ctx.beginPath();
    ctx.ellipse(cx, plateY, sRx, sRy, 0, 0, Math.PI);
    ctx.lineTo(cx - sRx, topY);
    ctx.ellipse(cx, topY, sRx, sRy, 0, Math.PI, 0, true);
    ctx.closePath();
    const sw = ctx.createLinearGradient(cx - sRx, 0, cx + sRx, 0);
    sw.addColorStop(0, '#14171b');
    sw.addColorStop(0.26, '#454c56');
    sw.addColorStop(0.44, '#666e79');
    sw.addColorStop(0.66, '#2c3037');
    sw.addColorStop(1, '#101317');
    ctx.fillStyle = sw;
    ctx.fill();
    // the boss occludes the plate right at its foot
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, plateY, sRx * 1.22, sRy * 1.22, 0, 0, TAU);
    ctx.ellipse(cx, plateY, sRx, sRy, 0, 0, TAU);
    ctx.clip('evenodd');
    contactShadow(ctx, cx, plateY + g.u * 0.15, sRx * 1.16, sRy * 1.5, { strength: 0.72 * E });
    ctx.restore();

    // boss top face
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, topY, sRx, sRy, 0, 0, TAU);
    ctx.clip();
    const tg = ctx.createLinearGradient(cx - sRx, topY - sRy, cx + sRx, topY + sRy);
    tg.addColorStop(0, '#3a4048');
    tg.addColorStop(0.32, '#69717c');
    tg.addColorStop(0.5, '#828b96');
    tg.addColorStop(0.72, '#454b54');
    tg.addColorStop(1, '#23272c');
    ctx.fillStyle = tg;
    ctx.fillRect(cx - sRx, topY - sRy, sRx * 2, sRy * 2);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = `rgba(255,246,226,${0.55 * E})`;
    ctx.lineWidth = Math.max(1, g.u * 0.13);
    ctx.beginPath();
    ctx.ellipse(cx, topY, sRx - 0.5, sRy - 0.5, 0, Math.PI * 1.04, Math.PI * 1.96);
    ctx.stroke();
    ctx.restore();

    // --- gasket: black rubber ring between boss and glass ---
    const gy = topY - g.gasketTh * (1 - this.gasketSquash * 0.55);
    const gRx = g.flangeOut * 0.995;
    ctx.beginPath();
    ctx.ellipse(cx, topY, gRx, gRx * g.K, 0, 0, Math.PI);
    ctx.lineTo(cx - gRx, gy);
    ctx.ellipse(cx, gy, gRx, gRx * g.K, 0, Math.PI, 0, true);
    ctx.closePath();
    const rg = ctx.createLinearGradient(cx - gRx, 0, cx + gRx, 0);
    rg.addColorStop(0, '#08090b');
    rg.addColorStop(0.28, '#232529');
    rg.addColorStop(0.44, '#33363b');
    rg.addColorStop(0.7, '#141619');
    rg.addColorStop(1, '#07080a');
    ctx.fillStyle = rg;
    ctx.fill();
  }

  // ---------- screws ----------
  _drawScrews(ctx, front) {
    const g = this.g;
    for (const s of this.screws) {
      const isFront = Math.sin(s.angle) > 0;
      if (isFront !== front) continue;
      if (s.free) continue;
      const lift = s.lift * g.u * 1.6;
      const wob = s.wobble * Math.sin(this.t * 46) * g.u * 0.13;
      const x = s.x + wob, y = s.y - lift;

      // thread hole shadow deepens as it backs out
      ctx.save();
      ctx.globalAlpha = 0.5 + s.lift * 0.4;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + g.u * 0.2, s.r * 0.72, s.r * 0.4, 0, 0, TAU);
      ctx.fill();
      ctx.restore();

      // exposed thread shank
      if (s.lift > 0.02) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - s.r * 0.42, y, s.r * 0.84, lift + s.r * 0.4);
        ctx.clip();
        const tg = ctx.createLinearGradient(x - s.r * 0.42, 0, x + s.r * 0.42, 0);
        tg.addColorStop(0, '#2a2620'); tg.addColorStop(0.4, '#8a7448');
        tg.addColorStop(0.6, '#c2a469'); tg.addColorStop(1, '#3a3226');
        ctx.fillStyle = tg;
        ctx.fillRect(x - s.r * 0.42, y, s.r * 0.84, lift + s.r * 0.4);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 0.9;
        for (let k = 0; k < lift + s.r; k += Math.max(1.6, g.u * 0.32)) {
          ctx.beginPath();
          ctx.moveTo(x - s.r * 0.42, y + k);
          ctx.lineTo(x + s.r * 0.42, y + k + g.u * 0.16);
          ctx.stroke();
        }
        ctx.restore();
      }

      const seat = 1 - s.lift * 0.8;
      const hp = s.hintPulse;
      const hintGlow = hp.active ? Math.sin(hp.k * Math.PI) : 0;
      screwHead(ctx, x, y, s.r, s.spin, {
        type: 'hex', palette: PALETTES.brass, seated: seat,
        glowSeat: Math.max(s.glow * 0.8, hintGlow * 0.55),
      });

      // progress arc while being turned
      if (s.glow > 0.02) {
        ctx.save();
        ctx.globalAlpha = s.glow;
        ctx.strokeStyle = 'rgba(255,214,150,0.22)';
        ctx.lineWidth = Math.max(1.4, g.u * 0.28);
        ctx.setLineDash([g.u * 0.5, g.u * 0.8]);
        ctx.beginPath(); ctx.arc(x, y, s.r * 2.3, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,226,180,0.85)';
        ctx.lineWidth = Math.max(1.6, g.u * 0.32);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(x, y, s.r * 2.3, -Math.PI / 2, -Math.PI / 2 + TAU * (s.turned / s.target));
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  _drawDebris(ctx) {
    const g = this.g;
    for (const d of this.debris) {
      contactShadow(ctx, d.x, d.floorY + g.u * 0.3, g.u * 2.2, g.u * 0.7, { strength: 0.5 });
      ctx.save();
      d.path(ctx);
      ctx.save(); ctx.clip();
      metalFill(ctx, d.x - g.u * 2, d.y - g.u * 2, d.x + g.u * 2, d.y + g.u * 2, PALETTES.brass);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,236,196,0.35)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawShards(ctx, glow) {
    const g = this.g;
    for (const d of this.shards) {
      ctx.save();
      contactShadow(ctx, d.x, d.floorY + 1, d.data.size * 1.4, d.data.size * 0.5, { strength: 0.4 });
      d.path(ctx);
      const gg = ctx.createLinearGradient(d.x - d.data.size, d.y - d.data.size, d.x + d.data.size, d.y + d.data.size);
      gg.addColorStop(0, 'rgba(206,228,244,0.30)');
      gg.addColorStop(0.45, 'rgba(255,255,255,0.62)');
      gg.addColorStop(1, 'rgba(150,186,214,0.24)');
      ctx.fillStyle = gg;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.restore();
      // sparkle
      if (glow && d.rest && ((d.x * 7 + d.y * 3) | 0) % 3 === 0) {
        glow.save();
        glow.globalCompositeOperation = 'lighter';
        const s = d.data.size * 0.9;
        const a = 0.25 + 0.25 * Math.sin(this.t * 2 + d.x * 0.1);
        const rg = glow.createRadialGradient(d.x, d.y, 0, d.x, d.y, s * 2);
        rg.addColorStop(0, `rgba(220,240,255,${a})`);
        rg.addColorStop(1, 'rgba(220,240,255,0)');
        glow.fillStyle = rg;
        glow.beginPath(); glow.arc(d.x, d.y, s * 2, 0, TAU); glow.fill();
        glow.restore();
      }
    }
  }

  // ---------- the bell jar ----------
  /**
   * Outline of the glass shell. `inset` shrinks it by the wall thickness so
   * the same profile can draw the inner surface — the double line is what
   * makes it read as a hollow vessel rather than a grey blob.
   */
  _jarPath(ctx, cx, baseY, R, straight, dome, lipRx, inset = 0) {
    const g = this.g;
    const r = R - inset;
    const lip = lipRx - inset * 0.4;
    const sh = baseY - straight;                       // shoulder
    const topY = sh - dome + inset * 1.15;
    const footY = baseY - inset * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - lip, footY);
    ctx.lineTo(cx - lip, footY - g.u * 0.55);
    ctx.lineTo(cx - r, footY - g.u * 2.2);
    ctx.lineTo(cx - r, sh);
    ctx.bezierCurveTo(cx - r, sh - dome * 0.60, cx - r * 0.615, topY, cx, topY);
    ctx.bezierCurveTo(cx + r * 0.615, topY, cx + r, sh - dome * 0.60, cx + r, sh);
    ctx.lineTo(cx + r, footY - g.u * 2.2);
    ctx.lineTo(cx + lip, footY - g.u * 0.55);
    ctx.lineTo(cx + lip, footY);
    ctx.closePath();
  }

  /**
   * Real refraction. The centre of a thin-walled vessel deflects almost
   * nothing (two near-parallel surfaces), but toward the silhouette the wall
   * turns edge-on and the background compresses violently into a bright band.
   * So we grab the two edge bands of what is already on the canvas and
   * re-blit them as displaced vertical strips. That's the whole trick, and it
   * is what makes the engraving bend as it passes behind the glass.
   */
  /**
   * Bend the scene behind the glass.
   *
   * A curved wall compresses what you see through it toward the
   * silhouette — that squeeze, not the highlights, is what makes a
   * drawn shape read as a solid transparent object. We do it by
   * re-sampling the already-composited frame in vertical strips whose
   * source offset grows with a Fresnel-ish curve.
   *
   * PERFORMANCE: the naive version copies through a full-canvas scratch,
   * which makes every one of the 22 strip reads snapshot a 786x1704
   * surface — about 80ms a frame. We instead keep one buffer sized to
   * the band we actually sample, so the readback and every strip read
   * are ~15x smaller. Same image, ~0.6ms.
   */
  _refractEdges(ctx, cx, baseY, R, straight, dome) {
    const r = this.r;
    const cw = r.canvas.width, chh = r.canvas.height;
    if (cw < 8) return;
    const M = ctx.getTransform();
    const dx = (x, y) => M.a * x + M.c * y + M.e;
    const dy = (x, y) => M.b * x + M.d * y + M.f;

    const DCX = dx(cx, baseY);
    const RD = Math.abs(dx(cx + R, baseY) - DCX);
    if (RD < 12) return;
    const yTop = dy(cx, baseY - straight - dome) - RD * 0.06;
    const yBot = dy(cx, baseY) + RD * 0.10;
    const sy = Math.max(0, Math.floor(yTop));
    const sh = Math.min(chh, Math.ceil(yBot)) - sy;
    if (sh < 8) return;

    const Q0 = 0.40;                       // inside this, glass is a window
    const AMT = 0.30;                      // strength of the edge squeeze
    const MAXD = RD * 0.34;
    const bend = (u) => Math.min(1.9, Math.pow(u, 2.6) / Math.sqrt(Math.max(0.012, 1 - u * u)));

    // the band wide enough to include everything the strips reach for
    let gx0 = clamp(Math.floor(DCX - RD - MAXD - 2), 0, cw);
    let gx1 = clamp(Math.ceil(DCX + RD + MAXD + 2), 0, cw);
    const bw = gx1 - gx0;
    if (bw < 8) return;

    const SR = this._sceneRect;
    if (!SR || !this._scene) return;
    if (!this._bandA) { this._bandA = new Layer(bw, sh); this._bandB = new Layer(bw, sh); }
    const A = this._bandA.size(bw, sh), B = this._bandB.size(bw, sh);
    const ax = A.ctx, bx = B.ctx;
    ax.setTransform(1, 0, 0, 1, 0, 0);
    ax.clearRect(0, 0, bw, sh);
    // source is the interior layer, in ITS coordinates
    ax.drawImage(this._scene.canvas, gx0 - SR.x0, sy - SR.y0, bw, sh, 0, 0, bw, sh);

    // Assemble the bent image OFF-CLIP. Each strip blit is cheap on its
    // own but ruinous when masked by the bell-jar path, so we build the
    // whole band flat and pay for the clip exactly once.
    bx.setTransform(1, 0, 0, 1, 0, 0);
    bx.globalCompositeOperation = 'copy';
    bx.drawImage(A.canvas, 0, 0);          // untouched centre
    bx.globalCompositeOperation = 'source-over';
    bx.imageSmoothingEnabled = true;
    const N = 11;                          // strips per side
    const w = (1 - Q0) * RD / N;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < N; i++) {
        const q = Q0 + (i + 0.5) / N * (1 - Q0);
        const d = side * bend(q) * AMT * RD;
        const x0 = DCX + side * (Q0 * RD + i * w) - (side < 0 ? w : 0) - gx0;
        const src = x0 + d;                // band-local
        if (src + w < 0 || src > bw) continue;
        bx.drawImage(A.canvas, src, 0, w, sh, x0, 0, w + 0.6, sh);
      }
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(B.canvas, 0, 0, bw, sh, gx0, sy, bw, sh);
    ctx.restore();
  }

  /** Shadow + caustic the jar throws down onto the plate. Unrotated. */
  _drawJarContact(ctx) {
    const g = this.g, j = this.jar;
    const cx = g.cx + j.x;
    const seatTop = g.plateY - g.seatH;
    const h = clamp01(j.lift / (g.u * 24));
    contactShadow(ctx, cx, seatTop + g.u * 0.2, g.flangeOut * 0.98, g.flangeOut * g.K * 1.05,
      { strength: 0.62 * this.game.set.lit, height: h });
    if (j.lift < g.u * 14) {
      ctx.save();
      ctx.globalAlpha = clamp01(1 - j.lift / (g.u * 14)) * this.game.set.lit;
      caustic(ctx, cx, seatTop - g.u * 0.15, g.flangeOut * 0.86, this.t, { alpha: 0.30 });
      ctx.restore();
    }
  }

  _drawJar(ctx, glow) {
    const g = this.g;
    const j = this.jar;
    const cx = g.cx + j.x;
    const baseY = g.jarBaseY - j.lift;
    const R = g.jarR, straight = g.jarStraight, dome = g.jarDome;
    const lip = g.flangeOut;
    const wall = g.jarWall;
    const shoulder = baseY - straight;
    const topY = shoulder - dome;
    const E = this.game.set.lit;

    ctx.save();
    ctx.translate(cx, baseY);
    ctx.rotate(j.tilt);
    ctx.translate(-cx, -baseY);

    // ---- 1. the scene, bent by the wall ----
    ctx.save();
    this._jarPath(ctx, cx, baseY, R, straight, dome, lip);
    ctx.clip();
    this._refractEdges(ctx, cx, baseY, R, straight, dome);

    // ---- 2. what the glass itself does to transmitted light ----
    // Path length through the wall grows toward the silhouette, so the
    // edges absorb (cool + dark) while the middle is essentially a window.
    const gx = (a) => ctx.createLinearGradient(cx - R, 0, cx + R, 0);
    const ab = gx();
    ab.addColorStop(0.00, 'rgba(20,40,46,0.62)');
    ab.addColorStop(0.045, 'rgba(28,52,58,0.30)');
    ab.addColorStop(0.13, 'rgba(46,74,80,0.10)');
    ab.addColorStop(0.32, 'rgba(120,160,170,0.020)');
    ab.addColorStop(0.55, 'rgba(160,190,200,0.012)');
    ab.addColorStop(0.74, 'rgba(90,124,136,0.030)');
    ab.addColorStop(0.90, 'rgba(40,66,74,0.14)');
    ab.addColorStop(0.965, 'rgba(24,46,54,0.34)');
    ab.addColorStop(1.00, 'rgba(16,34,40,0.60)');
    ctx.fillStyle = ab;
    ctx.fillRect(cx - R * 1.3, topY - g.u * 2, R * 2.6, straight + dome + g.u * 6);

    // a whisper of green-blue in the mass, like real soda-lime glass
    const mass = ctx.createLinearGradient(0, topY, 0, baseY);
    mass.addColorStop(0, 'rgba(150,190,196,0.020)');
    mass.addColorStop(0.7, 'rgba(120,168,180,0.035)');
    mass.addColorStop(1, 'rgba(96,140,156,0.075)');
    ctx.fillStyle = mass;
    ctx.fillRect(cx - R * 1.3, topY - g.u * 2, R * 2.6, straight + dome + g.u * 6);

    ctx.globalCompositeOperation = 'lighter';
    // the warm plate pool leaks up into the glass near its foot
    const foot = ctx.createLinearGradient(0, baseY, 0, baseY - straight * 0.7);
    foot.addColorStop(0, `rgba(255,206,150,${0.16 * E})`);
    foot.addColorStop(1, 'rgba(255,206,150,0)');
    ctx.fillStyle = foot;
    ctx.fillRect(cx - R * 1.3, baseY - straight, R * 2.6, straight + g.u * 4);
    // the switch's own light glowing inside the vessel
    const ig = ctx.createRadialGradient(cx, baseY - g.u * 3, 0, cx, baseY - g.u * 3, R * 1.5);
    ig.addColorStop(0, `rgba(255,140,96,${0.14 * this.btn.glow})`);
    ig.addColorStop(1, 'rgba(255,140,96,0)');
    ctx.fillStyle = ig;
    ctx.fillRect(cx - R * 1.3, baseY - straight - dome, R * 2.6, straight + dome + g.u * 4);
    // cool bounce off the floor, lower right
    const bnc = ctx.createRadialGradient(cx + R * 0.66, shoulder + straight * 0.42, 0,
                                         cx + R * 0.66, shoulder + straight * 0.42, R * 0.95);
    bnc.addColorStop(0, 'rgba(126,170,235,0.085)');
    bnc.addColorStop(1, 'rgba(126,170,235,0)');
    ctx.fillStyle = bnc;
    ctx.fillRect(cx - R * 1.3, topY, R * 2.6, straight + dome + g.u * 4);
    ctx.restore();

    // ---- 3. the inner surface: a second, dimmer outline inside the first.
    // Two lines a wall's thickness apart is the entire read of "hollow". ----
    ctx.save();
    this._jarPath(ctx, cx, baseY, R, straight, dome, lip);
    ctx.clip();
    const inner = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
    inner.addColorStop(0, 'rgba(214,240,255,0.30)');
    inner.addColorStop(0.14, 'rgba(190,222,240,0.10)');
    inner.addColorStop(0.5, 'rgba(255,255,255,0.03)');
    inner.addColorStop(0.86, 'rgba(180,210,232,0.12)');
    inner.addColorStop(1, 'rgba(206,234,252,0.34)');
    ctx.strokeStyle = inner;
    ctx.lineWidth = Math.max(1, g.u * 0.20);
    this._jarPath(ctx, cx, baseY, R, straight, dome, lip, wall);
    ctx.stroke();
    // and the thin dark line where the two surfaces sandwich the glass
    ctx.strokeStyle = 'rgba(10,24,30,0.34)';
    ctx.lineWidth = Math.max(1, g.u * 0.14);
    this._jarPath(ctx, cx, baseY, R, straight, dome, lip, wall * 0.42);
    ctx.stroke();
    ctx.restore();

    // ---- 4. speculars. Soft, long, following the form. Built from stacked
    // strokes rather than blobs, because a blob is a lightbulb. ----
    ctx.save();
    this._jarPath(ctx, cx, baseY, R, straight, dome, lip);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    // key: down the left shoulder, hugging the profile
    const keyPath = (o) => {
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.62 + o, topY + dome * 0.60);
      ctx.bezierCurveTo(cx - R * 0.86 + o, shoulder - dome * 0.34,
                        cx - R * 0.90 + o, shoulder + straight * 0.10,
                        cx - R * 0.885 + o, shoulder + straight * 0.72);
    };
    const keyGrad = () => {
      const lg = ctx.createLinearGradient(0, topY + dome * 0.5, 0, shoulder + straight * 0.8);
      lg.addColorStop(0, 'rgba(255,252,244,0)');
      lg.addColorStop(0.16, 'rgba(255,250,240,0.85)');
      lg.addColorStop(0.62, 'rgba(255,248,238,0.55)');
      lg.addColorStop(1, 'rgba(255,246,236,0)');
      return lg;
    };
    for (const [wm, a] of [[5.2, 0.055], [2.6, 0.10], [1.15, 0.30]]) {
      ctx.globalAlpha = a;
      ctx.strokeStyle = keyGrad();
      ctx.lineWidth = Math.max(1, g.u * 0.30 * wm);
      keyPath(0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // the crown catches the lamp: a soft arc, not a dot
    for (const [wm, a] of [[4.0, 0.06], [1.8, 0.12], [0.8, 0.26]]) {
      ctx.strokeStyle = `rgba(255,250,238,${a})`;
      ctx.lineWidth = Math.max(1, g.u * 0.30 * wm);
      ctx.beginPath();
      ctx.ellipse(cx, shoulder - dome * 0.12, R * 0.70, dome * 0.80, 0,
                  Math.PI * 1.14, Math.PI * 1.54);
      ctx.stroke();
    }

    // a second, cold reflection on the right — every real glass photo has two
    for (const [wm, a] of [[3.4, 0.030], [1.4, 0.065]]) {
      ctx.strokeStyle = `rgba(196,224,255,${a})`;
      ctx.lineWidth = Math.max(1, g.u * 0.30 * wm);
      ctx.beginPath();
      ctx.moveTo(cx + R * 0.80, shoulder - dome * 0.16);
      ctx.bezierCurveTo(cx + R * 0.93, shoulder + straight * 0.06,
                        cx + R * 0.93, shoulder + straight * 0.30,
                        cx + R * 0.90, shoulder + straight * 0.80);
      ctx.stroke();
    }
    ctx.restore();

    // ---- 5. Fresnel rim: thin, bright, strongest where we see the wall
    // edge-on; nearly gone across the top where we look straight through. ----
    this._jarPath(ctx, cx, baseY, R, straight, dome, lip);
    const rim = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
    rim.addColorStop(0, 'rgba(255,253,246,0.90)');
    rim.addColorStop(0.10, 'rgba(226,242,255,0.44)');
    rim.addColorStop(0.34, 'rgba(200,224,244,0.10)');
    rim.addColorStop(0.62, 'rgba(190,216,240,0.10)');
    rim.addColorStop(0.90, 'rgba(206,228,250,0.42)');
    rim.addColorStop(1, 'rgba(240,250,255,0.80)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1, g.u * 0.19);
    ctx.stroke();

    // ringing shimmer when struck
    if (j.ringT > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = j.ringT * 0.42;
      for (let i = 0; i < 3; i++) {
        const k = (this.t * 2.4 + i / 3) % 1;
        ctx.strokeStyle = `rgba(200,235,255,${(1 - k) * 0.5})`;
        ctx.lineWidth = Math.max(1, g.u * 0.14);
        this._jarPath(ctx, cx, baseY, R * (1 + k * 0.035), straight * (1 + k * 0.022),
          dome * (1 + k * 0.03), lip * (1 + k * 0.03));
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();

    // a modest halo where the crown burns — bloom, not a headlight
    if (glow) {
      glow.save();
      glow.globalCompositeOperation = 'lighter';
      const hx = cx - R * 0.42, hy = shoulder - dome * 0.62;
      const hg = glow.createRadialGradient(hx, hy, 0, hx, hy, R * 0.5);
      hg.addColorStop(0, 'rgba(255,250,240,0.30)');
      hg.addColorStop(1, 'rgba(255,250,240,0)');
      glow.fillStyle = hg;
      glow.beginPath(); glow.arc(hx, hy, R * 0.5, 0, TAU); glow.fill();
      glow.restore();
    }
  }

  /**
   * The brass flange. Drawn in two halves: the far half sits BEHIND the
   * glass (you look through the vessel to see it) and the near half in
   * front. That, plus the gasket seam, is what bolts the jar to the plate.
   */
  _drawFlange(ctx, front) {
    const g = this.g, j = this.jar;
    if (j.gone && !j.resting) return;
    const cx = g.cx + j.x;
    const baseY = g.jarBaseY - j.lift;
    const E = this.game.set.lit;
    const oRx = g.flangeOut, oRy = g.flangeOut * g.K;
    const iRx = g.flangeIn, iRy = g.flangeIn * g.K;
    const th = g.flangeTh;
    const a0 = front ? 0 : Math.PI;
    const a1 = front ? Math.PI : TAU;

    ctx.save();
    ctx.translate(cx, baseY);
    ctx.rotate(j.tilt);
    ctx.translate(-cx, -baseY);

    if (front) {
      // outer side wall of the ring — this is what gives it height
      ctx.beginPath();
      ctx.ellipse(cx, baseY + th, oRx, oRy, 0, 0, Math.PI);
      ctx.lineTo(cx - oRx, baseY);
      ctx.ellipse(cx, baseY, oRx, oRy, 0, Math.PI, 0, true);
      ctx.closePath();
      ctx.save(); ctx.clip();
      metalFill(ctx, cx - oRx, 0, cx + oRx, 0, PALETTES.brass);
      const dk = ctx.createLinearGradient(0, baseY, 0, baseY + th + oRy);
      dk.addColorStop(0, 'rgba(0,0,0,0)');
      dk.addColorStop(1, 'rgba(0,0,0,0.66)');
      ctx.fillStyle = dk;
      ctx.fillRect(cx - oRx, baseY - oRy, oRx * 2, th + oRy * 2);
      ctx.restore();
      // the seam: glass flange meeting the black gasket
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = Math.max(1, g.u * 0.16);
      ctx.beginPath();
      ctx.ellipse(cx, baseY + th, oRx, oRy, 0, 0.06, Math.PI - 0.06);
      ctx.stroke();
    }

    // the top face of the annulus
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, baseY, oRx, oRy, 0, a0, a1);
    ctx.ellipse(cx, baseY, iRx, iRy, 0, a1, a0, true);
    ctx.closePath();
    ctx.save(); ctx.clip();
    metalFill(ctx, cx - oRx, baseY - oRy, cx + oRx, baseY + oRy, PALETTES.brass);
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createRadialGradient(cx - oRx * 0.22, baseY - oRy * 1.1, 0, cx, baseY, oRx * 1.2);
    fg.addColorStop(0, `rgba(255,228,172,${0.34 * E})`);
    fg.addColorStop(1, 'rgba(255,228,172,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(cx - oRx, baseY - oRy * 1.4, oRx * 2, oRy * 2.8);
    ctx.restore();
    ctx.restore();

    // lit outer lip / shadowed inner lip
    ctx.lineWidth = Math.max(1, g.u * 0.12);
    if (front) {
      ctx.strokeStyle = `rgba(255,242,206,${0.34 * E})`;
      ctx.beginPath(); ctx.ellipse(cx, baseY, oRx, oRy, 0, 0.1, Math.PI - 0.1); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.ellipse(cx, baseY, iRx, iRy, 0, 0.08, Math.PI - 0.08); ctx.stroke();
    } else {
      ctx.strokeStyle = `rgba(255,246,216,${0.72 * E})`;
      ctx.beginPath(); ctx.ellipse(cx, baseY, oRx, oRy, 0, Math.PI + 0.06, TAU - 0.06); ctx.stroke();
      ctx.strokeStyle = `rgba(255,238,198,${0.30 * E})`;
      ctx.beginPath(); ctx.ellipse(cx, baseY, iRx, iRy, 0, Math.PI + 0.1, TAU - 0.1); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- the switch ----------
  // An industrial mushroom switch, built the way one actually is:
  // chrome bezel ring bolted to the plate, a knurled steel collar, and a
  // lacquered cap that travels inside it. The warm indicator light lives
  // in the GAP between cap skirt and collar — so pressing the switch
  // closes that gap and extinguishes the light with the travel itself,
  // rather than on a timer. That coupling is the whole reason the press
  // reads as mechanical.
  _drawButton(ctx, glow) {
    const g = this.g, b = this.btn;
    const E = this.game.set.lit;
    const K = g.K;
    const cx = g.cx;
    const baseY = g.btnBaseY;

    const bezelTop = baseY - g.bezelH;
    const collarTop = bezelTop - g.collarH;
    const gap = g.travel * (1 - b.press);              // shrinks to nothing
    const capY = collarTop - gap;
    // the cap widens very slightly as it bottoms out, like real rubber
    const sq = 1 + b.press * 0.05;
    const capRx = g.capRx * sq, capRy = g.capRy * sq;
    const bulge = g.capBulge * (1 - b.press * 0.16);
    const bezelRy = g.bezelRx * K, collarRy = g.collarRx * K;

    // ---- the whole switch's shadow on the plate ----
    contactShadow(ctx, cx, baseY + g.u * 0.4, g.bezelRx * 1.22, bezelRy * 1.5,
      { strength: 0.6 * E });

    // ---- bezel: chromed ring bolted through the plate ----
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, baseY, g.bezelRx, bezelRy, 0, 0, Math.PI);
    ctx.lineTo(cx - g.bezelRx, bezelTop);
    ctx.ellipse(cx, bezelTop, g.bezelRx, bezelRy, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.save(); ctx.clip();
    const bz = ctx.createLinearGradient(cx - g.bezelRx, 0, cx + g.bezelRx, 0);
    bz.addColorStop(0, '#14161a');
    bz.addColorStop(0.20, '#59616c');
    bz.addColorStop(0.34, '#aeb7c2');
    bz.addColorStop(0.46, '#e8eef5');
    bz.addColorStop(0.60, '#727a86');
    bz.addColorStop(0.82, '#22262c');
    bz.addColorStop(1, '#0e1013');
    ctx.fillStyle = bz;
    ctx.fillRect(cx - g.bezelRx, bezelTop - bezelRy, g.bezelRx * 2, g.bezelH + bezelRy * 3);
    ctx.restore();
    ctx.restore();

    // bezel top face — an annulus, so the collar reads as sunk into it
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, bezelTop, g.bezelRx, bezelRy, 0, 0, TAU);
    ctx.ellipse(cx, bezelTop, g.collarRx * 1.04, collarRy * 1.04, 0, 0, TAU);
    ctx.clip('evenodd');
    const bt = ctx.createLinearGradient(cx - g.bezelRx, bezelTop - bezelRy, cx + g.bezelRx, bezelTop + bezelRy);
    bt.addColorStop(0, '#666e79');
    bt.addColorStop(0.20, '#c6cfd9');
    bt.addColorStop(0.34, '#f4f8fc');
    bt.addColorStop(0.52, '#8b939e');
    bt.addColorStop(0.74, '#464d56');
    bt.addColorStop(1, '#272b31');
    ctx.fillStyle = bt;
    ctx.fillRect(cx - g.bezelRx, bezelTop - bezelRy * 1.2, g.bezelRx * 2, bezelRy * 2.4);
    ctx.restore();

    // ---- collar: knurled steel barrel the cap slides in ----
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - g.collarRx, bezelTop);
    ctx.lineTo(cx - g.collarRx, collarTop);
    ctx.ellipse(cx, collarTop, g.collarRx, collarRy, 0, Math.PI, 0);
    ctx.lineTo(cx + g.collarRx, bezelTop);
    ctx.ellipse(cx, bezelTop, g.collarRx, collarRy, 0, 0, Math.PI);
    ctx.closePath();
    ctx.save(); ctx.clip();
    const cl = ctx.createLinearGradient(cx - g.collarRx, 0, cx + g.collarRx, 0);
    cl.addColorStop(0, '#0f1114');
    cl.addColorStop(0.18, '#363c44');
    cl.addColorStop(0.36, '#79828e');
    cl.addColorStop(0.50, '#a7b0bb');
    cl.addColorStop(0.66, '#4a515a');
    cl.addColorStop(0.86, '#1a1d21');
    cl.addColorStop(1, '#0b0d0f');
    ctx.fillStyle = cl;
    ctx.fillRect(cx - g.collarRx, collarTop - collarRy, g.collarRx * 2, g.collarH + collarRy * 3);
    knurl(ctx, cx - g.collarRx, collarTop, g.collarRx * 2, g.collarH + collarRy,
      Math.max(3, g.u * 0.62), 0.17);
    // occlusion where the collar meets the bezel
    const ov = ctx.createLinearGradient(0, bezelTop - g.collarH * 0.5, 0, bezelTop + collarRy);
    ov.addColorStop(0, 'rgba(0,0,0,0)');
    ov.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = ov;
    ctx.fillRect(cx - g.collarRx, bezelTop - g.collarH, g.collarRx * 2, g.collarH + collarRy * 2);
    ctx.restore();
    ctx.restore();

    // collar mouth — a dark recess the cap sits in
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, collarTop, g.collarRx, collarRy, 0, 0, TAU);
    ctx.fillStyle = '#0c0e11';
    ctx.fill();
    ctx.strokeStyle = `rgba(226,236,248,${0.44 * E})`;
    ctx.lineWidth = Math.max(1, g.u * 0.16);
    ctx.stroke();
    ctx.restore();

    // ---- the indicator light escaping from the gap ----
    // Bright when the switch is armed, snuffed out as the cap seats.
    const armed = b.committed ? 0 : (this.exposed ? 1 : 0.5);
    const pulse = 0.62 + 0.38 * Math.sin(this.t * 1.7);
    const lightK = armed * pulse * clamp01(gap / Math.max(1e-3, g.travel));
    if (lightK > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const lg = ctx.createLinearGradient(0, capY - g.u * 0.4, 0, collarTop + collarRy);
      lg.addColorStop(0, `rgba(255,150,86,${0.5 * lightK})`);
      lg.addColorStop(1, 'rgba(255,110,60,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.ellipse(cx, capY + gap * 0.5, g.collarRx * 1.02, collarRy + gap * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      if (glow) {
        glow.save();
        glow.globalCompositeOperation = 'lighter';
        const rg = glow.createRadialGradient(cx, capY, 0, cx, capY, g.collarRx * 3.2);
        rg.addColorStop(0, `rgba(255,124,66,${0.40 * lightK})`);
        rg.addColorStop(0.5, `rgba(255,104,54,${0.12 * lightK})`);
        rg.addColorStop(1, 'rgba(255,100,50,0)');
        glow.fillStyle = rg;
        glow.beginPath(); glow.arc(cx, capY, g.collarRx * 3.2, 0, TAU); glow.fill();
        glow.restore();
      }
    }

    // ---- the cap ----
    // skirt shadow thrown down into the collar mouth
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, collarTop, g.collarRx * 0.99, collarRy * 0.99, 0, 0, TAU);
    ctx.clip();
    ctx.fillStyle = `rgba(0,0,0,${0.35 + b.press * 0.45})`;
    ctx.fillRect(cx - g.collarRx, collarTop - g.u * 4, g.collarRx * 2, g.u * 8);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - capRx, capY);
    ctx.bezierCurveTo(cx - capRx, capY - bulge * 1.34, cx + capRx, capY - bulge * 1.34, cx + capRx, capY);
    ctx.ellipse(cx, capY, capRx, capRy, 0, 0, Math.PI);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    // lacquer over metal: a deep body, a hot shoulder, a dark skirt
    const dead = b.committed ? 0.34 : 1;               // it goes dull once thrown
    const mix = (a, bb) => Math.round(a * dead + bb * (1 - dead));
    const cg = ctx.createRadialGradient(
      cx - capRx * 0.34, capY - bulge * 0.94, capRx * 0.03,
      cx, capY - bulge * 0.18, capRx * 1.62);
    cg.addColorStop(0.00, `rgb(${mix(255,96)},${mix(146,44)},${mix(120,40)})`);
    cg.addColorStop(0.20, `rgb(${mix(238,80)},${mix(64,30)},${mix(48,28)})`);
    cg.addColorStop(0.56, `rgb(${mix(166,54)},${mix(28,18)},${mix(24,18)})`);
    cg.addColorStop(1.00, `rgb(${mix(58,24)},${mix(10,8)},${mix(10,8)})`);
    ctx.fillStyle = cg;
    ctx.fillRect(cx - capRx * 1.3, capY - bulge * 2, capRx * 2.6, bulge * 2 + capRy * 2);

    ctx.globalCompositeOperation = 'lighter';
    // broad gloss sweep — moves down the dome as the cap travels, which is
    // what makes the press read as motion rather than a colour change
    const glX = cx - capRx * 0.30, glY = capY - bulge * (0.86 - b.press * 0.22);
    const gl = ctx.createRadialGradient(glX, glY, 0, glX, glY, capRx * 0.52);
    gl.addColorStop(0, `rgba(255,255,255,${0.62 * dead + 0.06})`);
    gl.addColorStop(0.38, `rgba(255,226,214,${0.16 * dead})`);
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.ellipse(glX, glY, capRx * 0.52, bulge * 0.40, -0.42, 0, TAU);
    ctx.fill();
    // rim light from the cool bounce on the right
    const rl = ctx.createLinearGradient(cx + capRx * 0.24, 0, cx + capRx, 0);
    rl.addColorStop(0, 'rgba(255,150,120,0)');
    rl.addColorStop(1, `rgba(255,176,148,${0.34 * dead})`);
    ctx.fillStyle = rl;
    ctx.fillRect(cx, capY - bulge * 2, capRx * 1.3, bulge * 2 + capRy * 2);
    ctx.restore();

    // tight hotspot, sharp enough to read as lacquer rather than plastic
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const hx = cx - capRx * 0.36, hy = capY - bulge * (0.98 - b.press * 0.2);
    const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, capRx * 0.20);
    hg.addColorStop(0, `rgba(255,255,255,${0.92 * dead})`);
    hg.addColorStop(0.45, `rgba(255,242,236,${0.20 * dead})`);
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.ellipse(hx, hy, capRx * 0.20, bulge * 0.15, -0.4, 0, TAU); ctx.fill();
    ctx.restore();

    // the skirt's own dark underside, so the cap sits ON something
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, capY, capRx, capRy, 0, 0, Math.PI);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(1, g.u * 0.2);
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // ---- the detent fighting back ----
    if (b.resist > 0.02 && !b.committed) {
      const a = b.resist;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,${(200 - a * 132) | 0},${(140 - a * 112) | 0},${0.22 + a * 0.5})`;
      ctx.lineWidth = Math.max(1.4, g.u * (0.18 + a * 0.42));
      const rr = g.bezelRx * (1.06 + a * 0.42);
      ctx.beginPath();
      ctx.ellipse(cx, baseY - g.u * 0.2, rr, rr * K, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
      if (glow) {
        glow.save();
        glow.globalCompositeOperation = 'lighter';
        const r2 = g.collarRx * (1.6 + a * 2.2);
        const rg = glow.createRadialGradient(cx, capY, 0, cx, capY, r2);
        rg.addColorStop(0, `rgba(255,${(168 - a * 120) | 0},104,${0.18 + a * 0.5})`);
        rg.addColorStop(1, 'rgba(255,120,90,0)');
        glow.fillStyle = rg;
        glow.beginPath(); glow.arc(cx, capY, r2, 0, TAU); glow.fill();
        glow.restore();
      }
    }
  }
}

// ---------------------------------------------------------
// small poly helpers
// ---------------------------------------------------------
function screwPoly(r, h) {
  const p = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + 0.2;
    p.push(Math.cos(a) * r, Math.sin(a) * r * 0.72);
  }
  return p;
}
function shardPoly(s, rng) {
  const n = 3 + ((rng() * 3) | 0);
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + rng() * 0.5;
    const rr = s * (0.5 + rng() * 0.8);
    p.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return p;
}
