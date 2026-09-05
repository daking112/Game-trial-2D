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
    const g = this.g;
    if (!this.exposed) return false;
    const dx = x - g.cx, dy = y - (g.plateY - g.collarH - g.capBulge * 0.5);
    return Math.hypot(dx / (g.capRx * 1.5), dy / (g.capRx * 1.1)) < 1;
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
    const g = this.g;
    this._drawPlate(ctx, glow);
    this._drawScrews(ctx, false);       // back screws
    this._drawButton(ctx, glow);
    this._drawShards(ctx, glow);
    this._drawDebris(ctx);
    if (!this.jar.gone || this.jar.resting) this._drawJar(ctx, glow);
    this._drawScrews(ctx, true);        // front screws
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
  _drawPlate(ctx, glow) {
    const g = this.g;
    const { cx, plateY, plateRx, plateRy } = g;

    // plate shadow on the plinth
    contactShadow(ctx, cx, plateY + g.u * 0.7, plateRx * 1.02, plateRy * 1.1,
      { strength: 0.6 * this.game.set.exposure });

    // side wall of the plate (it has thickness)
    const th = g.u * 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, plateY + th, plateRx, plateRy, 0, 0, Math.PI);
    ctx.lineTo(cx - plateRx, plateY);
    ctx.ellipse(cx, plateY, plateRx, plateRy, 0, Math.PI, 0, true);
    ctx.closePath();
    const sideG = ctx.createLinearGradient(cx - plateRx, 0, cx + plateRx, 0);
    sideG.addColorStop(0, '#16181c');
    sideG.addColorStop(0.3, '#33383f');
    sideG.addColorStop(0.52, '#454c55');
    sideG.addColorStop(0.75, '#23262b');
    sideG.addColorStop(1, '#101216');
    ctx.fillStyle = sideG;
    ctx.fill();

    // top face
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, plateY, plateRx, plateRy, 0, 0, TAU);
    ctx.clip();
    const topG = ctx.createLinearGradient(cx - plateRx, plateY - plateRy, cx + plateRx, plateY + plateRy);
    topG.addColorStop(0, '#22262c');
    topG.addColorStop(0.28, '#40464f');
    topG.addColorStop(0.46, '#5b636e');
    topG.addColorStop(0.62, '#3b414a');
    topG.addColorStop(1, '#1a1d22');
    ctx.fillStyle = topG;
    ctx.fillRect(cx - plateRx, plateY - plateRy, plateRx * 2, plateRy * 2);
    ctx.save();
    ctx.scale(1, plateRy / plateRx);
    radialBrush(ctx, cx, plateY * plateRx / plateRy, plateRx, 91, { count: 190, alpha: 0.05 });
    ctx.restore();
    // warm light pool from above
    ctx.globalCompositeOperation = 'lighter';
    const lp = ctx.createRadialGradient(cx, plateY - plateRy * 0.5, 0, cx, plateY, plateRx);
    lp.addColorStop(0, `rgba(255,226,182,${0.16 * this.game.set.exposure})`);
    lp.addColorStop(1, 'rgba(255,226,182,0)');
    ctx.fillStyle = lp;
    ctx.fillRect(cx - plateRx, plateY - plateRy, plateRx * 2, plateRy * 2);
    ctx.restore();

    // chamfer highlight
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, plateY, plateRx - 0.5, plateRy - 0.5, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.strokeStyle = `rgba(255,240,214,${0.45 * this.game.set.exposure})`;
    ctx.lineWidth = Math.max(1, g.u * 0.2);
    ctx.stroke();
    ctx.restore();

    // engraved plaque
    const py = plateY + plateRy * 0.56;
    ctx.save();
    ctx.globalAlpha = clamp01(this.game.set.exposure * 1.2);
    engrave(ctx, 'DO NOT PRESS', cx, py, {
      font: `700 ${g.u * 2.0}px Inter, sans-serif`,
      letterSpacing: `${g.u * 0.34}px`,
      depth: Math.max(1, g.u * 0.12), darkness: 0.8, light: 0.26,
    });
    ctx.restore();
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
  _jarPath(ctx, cx, baseY, R, straight, flangeRx, flangeRy) {
    ctx.beginPath();
    ctx.moveTo(cx - flangeRx, baseY);
    ctx.lineTo(cx - R, baseY - flangeRy * 0.9);
    ctx.lineTo(cx - R, baseY - straight);
    ctx.arc(cx, baseY - straight, R, Math.PI, 0);
    ctx.lineTo(cx + R, baseY - flangeRy * 0.9);
    ctx.lineTo(cx + flangeRx, baseY);
    ctx.closePath();
  }

  _drawJar(ctx, glow) {
    const g = this.g;
    const j = this.jar;
    const cx = g.cx + j.x;
    const baseY = g.jarBaseY - j.lift;

    ctx.save();
    ctx.translate(cx, baseY);
    ctx.rotate(j.tilt);
    ctx.translate(-cx, -baseY);

    // shadow the jar casts on the plate — shrinks and softens as it rises
    ctx.save();
    ctx.rotate(0);
    contactShadow(ctx, cx, g.jarBaseY + g.u * 0.4, g.flangeRx, g.flangeRy * 0.9,
      { strength: 0.55, height: clamp01(j.lift / (g.u * 22)) });
    ctx.restore();

    // caustic under the glass
    if (j.lift < g.u * 10) {
      ctx.save();
      ctx.globalAlpha = clamp01(1 - j.lift / (g.u * 10)) * 0.8 * this.game.set.exposure;
      caustic(ctx, cx, g.jarBaseY - g.u * 0.4, g.flangeRx * 0.8, this.t, { alpha: 0.22 });
      ctx.restore();
    }

    const R = g.jarR, straight = g.jarStraight;

    // --- refraction: the plate seen THROUGH the glass shifts slightly ---
    // (cheap fake: a darkened, scaled echo of the plate rim inside the jar)
    ctx.save();
    this._jarPath(ctx, cx, baseY, R, straight, g.flangeRx, g.flangeRy);
    ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    const inner = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
    inner.addColorStop(0, 'rgba(150,178,196,1)');
    inner.addColorStop(0.18, 'rgba(226,238,246,1)');
    inner.addColorStop(0.5, 'rgba(255,255,255,1)');
    inner.addColorStop(0.84, 'rgba(214,228,238,1)');
    inner.addColorStop(1, 'rgba(140,168,188,1)');
    ctx.fillStyle = inner;
    ctx.fillRect(cx - R * 1.2, baseY - straight - R * 1.2, R * 2.4, straight + R * 2.4);
    ctx.restore();

    // --- glass body ---
    ctx.save();
    this._jarPath(ctx, cx, baseY, R, straight, g.flangeRx, g.flangeRy);
    ctx.save();
    ctx.clip();
    // faint tint + vertical gradient
    const bodyG = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
    bodyG.addColorStop(0, 'rgba(178,206,222,0.30)');
    bodyG.addColorStop(0.14, 'rgba(200,224,238,0.10)');
    bodyG.addColorStop(0.42, 'rgba(255,255,255,0.03)');
    bodyG.addColorStop(0.68, 'rgba(190,214,230,0.07)');
    bodyG.addColorStop(0.88, 'rgba(168,196,214,0.20)');
    bodyG.addColorStop(1, 'rgba(150,180,200,0.34)');
    ctx.fillStyle = bodyG;
    ctx.fillRect(cx - R * 1.3, baseY - straight - R * 1.3, R * 2.6, straight + R * 2.6);

    // internal light bloom from the button's ring
    ctx.globalCompositeOperation = 'lighter';
    const ig = ctx.createRadialGradient(cx, g.plateY - baseY + baseY - g.u * 1, 0, cx, baseY - g.u * 2, R * 1.4);
    ig.addColorStop(0, `rgba(255,150,110,${0.13 * this.btn.glow})`);
    ig.addColorStop(1, 'rgba(255,150,110,0)');
    ctx.fillStyle = ig;
    ctx.fillRect(cx - R * 1.3, baseY - straight - R * 1.3, R * 2.6, straight + R * 2.6);

    // long vertical specular down the left shoulder — soft on every edge,
    // because a hard-edged highlight is the fastest way to look like plastic
    ctx.globalCompositeOperation = 'lighter';
    ctx.save();
    ctx.translate(cx - R * 0.50, baseY - straight * 0.52 - R * 0.34);
    ctx.rotate(-0.06);
    ctx.scale(1, 1);
    const spw = R * 0.115, sph = (straight + R * 0.5) * 0.48;
    const sp = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    sp.addColorStop(0, 'rgba(255,255,255,0.50)');
    sp.addColorStop(0.35, 'rgba(255,255,255,0.22)');
    sp.addColorStop(0.75, 'rgba(255,255,255,0.04)');
    sp.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.scale(spw, sph);
    ctx.fillStyle = sp;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
    ctx.restore();
    // a thinner, brighter core inside it
    ctx.save();
    ctx.translate(cx - R * 0.52, baseY - straight * 0.56 - R * 0.30);
    const cw = R * 0.030, ch = (straight + R * 0.4) * 0.36;
    const cs = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    cs.addColorStop(0, 'rgba(255,255,255,0.72)');
    cs.addColorStop(0.5, 'rgba(255,255,255,0.20)');
    cs.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.scale(cw, ch);
    ctx.fillStyle = cs;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
    ctx.restore();

    // tight highlight on the crown
    const cg = ctx.createRadialGradient(cx - R * 0.36, baseY - straight - R * 0.52, 0,
                                        cx - R * 0.36, baseY - straight - R * 0.52, R * 0.42);
    cg.addColorStop(0, 'rgba(255,255,255,0.85)');
    cg.addColorStop(0.45, 'rgba(255,255,255,0.18)');
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(cx - R * 1.2, baseY - straight - R * 1.2, R * 2.4, R * 1.6);

    // right-hand bounce
    const rg2 = ctx.createRadialGradient(cx + R * 0.62, baseY - straight * 0.55, 0,
                                         cx + R * 0.62, baseY - straight * 0.55, R * 0.7);
    rg2.addColorStop(0, 'rgba(150,190,255,0.16)');
    rg2.addColorStop(1, 'rgba(150,190,255,0)');
    ctx.fillStyle = rg2;
    ctx.fillRect(cx - R * 1.2, baseY - straight - R * 1.2, R * 2.4, straight + R * 2.4);
    ctx.restore();

    // rim / edge
    const rim = ctx.createLinearGradient(cx - R, baseY - straight - R, cx + R, baseY);
    rim.addColorStop(0, 'rgba(255,255,255,0.92)');
    rim.addColorStop(0.22, 'rgba(206,232,250,0.42)');
    rim.addColorStop(0.5, 'rgba(255,255,255,0.16)');
    rim.addColorStop(0.78, 'rgba(186,212,234,0.5)');
    rim.addColorStop(1, 'rgba(255,255,255,0.9)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1.2, g.u * 0.3);
    ctx.stroke();
    ctx.restore();

    // ringing shimmer when struck
    if (this.jar.ringT > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.jar.ringT * 0.5;
      const n = 3;
      for (let i = 0; i < n; i++) {
        const k = (this.t * 2.2 + i / n) % 1;
        ctx.strokeStyle = `rgba(200,235,255,${(1 - k) * 0.5})`;
        ctx.lineWidth = Math.max(1, g.u * 0.16);
        this._jarPath(ctx, cx, baseY, R * (1 + k * 0.05), straight * (1 + k * 0.03),
          g.flangeRx * (1 + k * 0.04), g.flangeRy);
        ctx.stroke();
      }
      ctx.restore();
    }

    // --- flange ring (the brass collar the screws bite into) ---
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, baseY, g.flangeRx, g.flangeRy, 0, 0, TAU);
    ctx.ellipse(cx, baseY, g.flangeRx * 0.845, g.flangeRy * 0.845, 0, 0, TAU);
    ctx.save();
    ctx.clip('evenodd');
    metalFill(ctx, cx - g.flangeRx, baseY - g.flangeRy, cx + g.flangeRx, baseY + g.flangeRy, PALETTES.brass);
    // warm pool from the overhead key
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createRadialGradient(cx, baseY - g.flangeRy * 0.6, 0, cx, baseY, g.flangeRx);
    fg.addColorStop(0, 'rgba(255,224,168,0.30)');
    fg.addColorStop(1, 'rgba(255,224,168,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(cx - g.flangeRx, baseY - g.flangeRy * 1.2, g.flangeRx * 2, g.flangeRy * 2.4);
    ctx.restore();
    // lit outer lip, shadowed inner lip
    ctx.lineWidth = Math.max(1, g.u * 0.12);
    ctx.strokeStyle = 'rgba(255,240,206,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, baseY, g.flangeRx, g.flangeRy, 0, Math.PI * 1.02, Math.PI * 1.98);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx, baseY, g.flangeRx * 0.845, g.flangeRy * 0.845, 0, 0.05, Math.PI * 0.95);
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // glow contribution
    if (glow) {
      glow.save();
      glow.globalCompositeOperation = 'lighter';
      glow.globalAlpha = 0.5;
      const hx = cx - R * 0.36, hy = baseY - straight - R * 0.52;
      const hg = glow.createRadialGradient(hx, hy, 0, hx, hy, R * 0.34);
      hg.addColorStop(0, 'rgba(255,250,240,0.65)');
      hg.addColorStop(1, 'rgba(255,250,240,0)');
      glow.fillStyle = hg;
      glow.beginPath(); glow.arc(hx, hy, R * 0.34, 0, TAU); glow.fill();
      glow.restore();
    }
  }

  // ---------- the switch ----------
  _drawButton(ctx, glow) {
    const g = this.g;
    const b = this.btn;
    const cx = g.cx;
    const baseY = g.plateY - g.u * 0.35;
    const press = b.press * g.travel;
    const reveal = this.exposed ? 1 : 0.82;

    // --- mounting ring on the plate ---
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, baseY, g.btnBaseRx, g.btnBaseRy, 0, 0, TAU);
    ctx.save(); ctx.clip();
    metalFill(ctx, cx - g.btnBaseRx, baseY - g.btnBaseRy, cx + g.btnBaseRx, baseY + g.btnBaseRy, PALETTES.gunmetal);
    ctx.restore();
    ctx.lineWidth = Math.max(1, g.u * 0.18);
    ctx.strokeStyle = 'rgba(200,210,225,0.28)';
    ctx.stroke();
    ctx.restore();

    // --- emissive ring at the base ---
    const gv = b.committed ? 0.15 : (0.55 + 0.45 * Math.sin(this.t * 1.6)) * (this.exposed ? 1 : 0.55);
    b.glow = gv;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,${b.committed ? 60 : 118},${b.committed ? 40 : 74},${0.5 * gv})`;
    ctx.lineWidth = Math.max(1.4, g.u * 0.3);
    ctx.beginPath();
    ctx.ellipse(cx, baseY - g.u * 0.15, g.collarRx * 1.16, g.collarRx * 1.16 * 0.3, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
    if (glow) {
      glow.save();
      glow.globalCompositeOperation = 'lighter';
      const rg = glow.createRadialGradient(cx, baseY, 0, cx, baseY, g.u * 12);
      rg.addColorStop(0, `rgba(255,110,70,${0.34 * gv})`);
      rg.addColorStop(1, 'rgba(255,110,70,0)');
      glow.fillStyle = rg;
      glow.beginPath(); glow.arc(cx, baseY, g.u * 12, 0, TAU); glow.fill();
      glow.restore();
    }

    // --- collar (knurled cylinder) ---
    const collarTop = baseY - g.collarH + press * 0.18;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - g.collarRx, baseY);
    ctx.lineTo(cx - g.collarRx, collarTop);
    ctx.ellipse(cx, collarTop, g.collarRx, g.collarRx * 0.3, 0, Math.PI, 0);
    ctx.lineTo(cx + g.collarRx, baseY);
    ctx.ellipse(cx, baseY, g.collarRx, g.collarRx * 0.3, 0, 0, Math.PI);
    ctx.closePath();
    ctx.save(); ctx.clip();
    metalFill(ctx, cx - g.collarRx, 0, cx + g.collarRx, 0, PALETTES.steel);
    knurl(ctx, cx - g.collarRx, collarTop, g.collarRx * 2, g.collarH, Math.max(3, g.u * 0.72), 0.20);
    // vertical shading
    const vg = ctx.createLinearGradient(0, collarTop, 0, baseY + g.u);
    vg.addColorStop(0, 'rgba(255,255,255,0.10)');
    vg.addColorStop(0.5, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(cx - g.collarRx, collarTop, g.collarRx * 2, g.collarH + g.u);
    ctx.restore();
    ctx.restore();

    // top rim of collar
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, collarTop, g.collarRx, g.collarRx * 0.3, 0, 0, TAU);
    ctx.fillStyle = '#20242a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(226,236,248,0.42)';
    ctx.lineWidth = Math.max(1, g.u * 0.16);
    ctx.stroke();
    ctx.restore();

    // --- the red cap ---
    const capY = collarTop - g.capBulge * 0.34 + press;
    const squash = 1 + b.press * 0.06;
    ctx.save();
    // cap shadow inside the collar
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, collarTop, g.collarRx * 0.98, g.collarRx * 0.29, 0, 0, TAU);
    ctx.clip();
    ctx.fillStyle = `rgba(0,0,0,${0.35 + b.press * 0.4})`;
    ctx.fillRect(cx - g.collarRx, collarTop - g.u * 3, g.collarRx * 2, g.u * 6);
    ctx.restore();

    // body of the cap: an ellipse with a bulged crown
    const capRx = g.capRx * squash, capRy = g.capRy * squash;
    const crown = g.capBulge * (1 - b.press * 0.25);
    ctx.beginPath();
    ctx.moveTo(cx - capRx, capY);
    ctx.bezierCurveTo(cx - capRx, capY - crown * 1.32, cx + capRx, capY - crown * 1.32, cx + capRx, capY);
    ctx.ellipse(cx, capY, capRx, capRy, 0, 0, Math.PI);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    const hot = b.committed ? 0.25 : 1;
    const cg = ctx.createRadialGradient(
      cx - capRx * 0.36, capY - crown * 0.9, capRx * 0.05,
      cx, capY - crown * 0.2, capRx * 1.5);
    cg.addColorStop(0, `rgb(${255 * hot + 40 | 0},${120 * hot + 20 | 0},${96 * hot + 16 | 0})`);
    cg.addColorStop(0.24, `rgb(${232 * hot + 26 | 0},${58 * hot + 14 | 0},${44 * hot + 12 | 0})`);
    cg.addColorStop(0.6, `rgb(${168 * hot + 18 | 0},${28 * hot + 10 | 0},${26 * hot + 9 | 0})`);
    cg.addColorStop(1, `rgb(${74 * hot + 12 | 0},${12 * hot + 6 | 0},${12 * hot + 6 | 0})`);
    ctx.fillStyle = cg;
    ctx.fillRect(cx - capRx * 1.2, capY - crown * 2, capRx * 2.4, crown * 2 + capRy * 2);

    // glossy sweep
    ctx.globalCompositeOperation = 'lighter';
    const sg = ctx.createLinearGradient(cx - capRx * 0.7, capY - crown, cx + capRx * 0.2, capY);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.45, 'rgba(255,236,226,0.42)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(cx - capRx * 0.28, capY - crown * 0.72, capRx * 0.44, crown * 0.42, -0.5, 0, TAU);
    ctx.fill();
    // rim light from the right
    const rl = ctx.createLinearGradient(cx + capRx * 0.3, 0, cx + capRx, 0);
    rl.addColorStop(0, 'rgba(255,140,110,0)');
    rl.addColorStop(1, 'rgba(255,170,140,0.30)');
    ctx.fillStyle = rl;
    ctx.fillRect(cx, capY - crown * 2, capRx * 1.2, crown * 2 + capRy * 2);
    ctx.restore();

    // tight hotspot
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const hx = cx - capRx * 0.34, hy = capY - crown * 0.86;
    const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, capRx * 0.3);
    hg.addColorStop(0, 'rgba(255,255,255,0.9)');
    hg.addColorStop(0.4, 'rgba(255,240,236,0.25)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.ellipse(hx, hy, capRx * 0.3, crown * 0.22, -0.4, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();

    // stress ring while fighting the detent
    if (b.resist > 0.02 && !b.committed) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const a = b.resist;
      ctx.strokeStyle = `rgba(255,${200 - a * 130 | 0},${140 - a * 110 | 0},${0.25 + a * 0.5})`;
      ctx.lineWidth = Math.max(1.4, g.u * (0.2 + a * 0.4));
      const rr = g.collarRx * (1.35 + a * 0.5);
      ctx.beginPath();
      ctx.ellipse(cx, baseY - g.u * 0.2, rr, rr * 0.3, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
      if (glow) {
        glow.save();
        glow.globalCompositeOperation = 'lighter';
        const rg = glow.createRadialGradient(cx, capY, 0, cx, capY, g.u * (8 + a * 12));
        rg.addColorStop(0, `rgba(255,${170 - a * 120 | 0},110,${0.2 + a * 0.5})`);
        rg.addColorStop(1, 'rgba(255,120,90,0)');
        glow.fillStyle = rg;
        glow.beginPath(); glow.arc(cx, capY, g.u * (8 + a * 12), 0, TAU); glow.fill();
        glow.restore();
      }
    }

    // the button flinches when you tap the glass
    if (this.flinch.active) {
      // handled by shifting cap — cheap but reads
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
