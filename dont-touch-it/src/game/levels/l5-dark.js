// ============================================================
// l5-dark.js — THE LAST CHAPTER · DO NOT TURN IT OFF
// ------------------------------------------------------------
// For four chapters the player has looked DOWN at a plinth. Here they
// look UP: the gallery's own lamp, and a brass pull-chain hanging into
// reach. The narrator asks for one last thing.
//
// Pull it and the game goes black. Properly black — no vignette-dark, no
// "dim". Then, when they touch the screen, their fingertip turns out to
// be the only light left, and they feel their way across a plinth
// covered in everything they have broken so far.
//
// And in the dark there is one thing that was never there in the light:
// a small brass bell, with a card tied to it.
// ============================================================

import { Level } from '../level.js';
import {
  TAU, clamp, clamp01, lerp, damp, smoothstep, rand, rrange, makeRng, noise1,
} from '../../core/math.js';
import {
  PALETTES, metalFill, radialBrush, knurl, engrave, contactShadow, roundRectPath,
} from '../../render/materials.js';
import { Layer } from '../../render/renderer.js';
import { VerletWorld, makeRope } from '../../physics/verlet.js';
import { Audio, SFX } from '../../core/audio.js';
import Haptics from '../../core/haptics.js';
import { Pulse, Smooth } from '../../core/tween.js';

export class L5Dark extends Level {
  static id = 'l5';
  static chapter = 'IV';
  static rule = 'Do not turn it off';
  static label = {
    title: 'The Light',
    medium: ['Brass, enamel, ball chain.', 'Lit continuously since 1974.'],
  };

  // ---------------------------------------------------------
  layout(w, h, u) {
    const G = this.game.set.geom;
    const R = G.heroR;
    this.g = {
      w, h, u, cx: G.cx, topY: G.topY, topRx: G.topRx, topRy: G.topRy, R,
      shadeY: h * 0.085,
      shadeRx: R * 0.62,
      shadeH: R * 0.44,
      chainX: G.cx + R * 0.30,
      chainLen: h * 0.34,
      bellX: G.cx + G.topRx * 0.42,
      bellY: G.topY - u * 1.2,
      bellH: R * 0.30,
    };
    this.g.shadeBot = this.g.shadeY + this.g.shadeH;
    if (this.chain) this._buildChain();
  }

  // ---------------------------------------------------------
  enter() {
    const g = this.g;
    this.ownsWreckage = true;           // we light the room; we reveal the mess
    this.ownsLighting = true;           // ...so the shell must not dim us
    this.phase = 'lit';                 // lit | dying | dark | found | ringing | restored
    this.darkT = 0;
    this.lamp = { on: 1, filament: 1, swing: 0, vswing: 0, flicker: 0 };
    this.pull = 0;                      // 0..1 chain travel
    this.pulled = false;
    this.torch = { x: g.cx, y: g.h * 0.42, r: 0, on: 0, seen: 0, armed: false };
    this.bell = { a: 0, va: 0, rung: 0, found: 0, ringT: 0, tagA: 0 };
    this.reveal = 0;
    this.plinths = [];
    this.memory = new Layer();
    this._memReady = false;

    this.world = new VerletWorld({ gravity: 2600, damping: 0.985, iterations: 8, substeps: 2 });
    this._buildChain();

    // If a player jumps straight here, seed the mess so the reveal has
    // something to find. A real playthrough arrives with its own.
    if (this.game.wreck.items.length === 0) this._seedWreckage();

  }

  _buildChain() {
    if (!this.world) return;
    const g = this.g;
    this.world.points.length = 0;
    this.world.constraints.length = 0;
    const segs = 16;
    this.chain = makeRope(this.world, g.chainX, g.shadeBot, g.chainX, g.shadeBot + g.chainLen,
      segs, { mass: 1, stiffness: 1, pinStart: true, bend: 0.06 });
    this.acorn = this.chain.points[segs];
    this.restY = this.acorn.y;
  }

  _seedWreckage() {
    const rng = makeRng(31337);
    // scatter across the plinth's top FACE, which is an ellipse in this
    // projection — a uniform band reads as a shelf, not a surface
    const put = (kind, n, spread, opts) => {
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU, rr = Math.sqrt(rng()) * spread;
        this.leave(kind,
          this.g.cx + Math.cos(a) * rr * this.g.topRx * 0.88,
          this.g.topY + Math.sin(a) * rr * this.g.topRy * 0.82,
          { size: this.g.u * (0.7 + rng() * 1.6), a: rng() * TAU, ...opts });
      }
    };
    put('shard', 34, 0.86);
    put('screw', 4, 0.6);
    put('bead', 9, 0.5, { hue: '196,58,74' });
    put('thread', 5, 0.7, { hue: '214,176,96' });
  }

  exit() {
    const set = this.game.set;
    set.exposure = 1; set.coneStrength = 1; set.plinthOpacity = 1;
    set.warmth = 1; set.flicker = 0; set.tint = null;
    this.hideHint();
  }

  intro() {
    this.say('This is the last one.', { hold: 1.6 });
    this.say('The light. Do not turn off the light.', { hold: 2.6 });
  }

  probe() {
    return {
      phase: this.phase,
      pull: +this.pull.toFixed(2),
      lampOn: +this.lamp.on.toFixed(2),
      darkT: +this.darkT.toFixed(1),
      torchOn: +this.torch.on.toFixed(2),
      explored: +this.torch.seen.toFixed(2),
      bellFound: +this.bell.found.toFixed(2),
      bellRung: this.bell.rung,
      reveal: +this.reveal.toFixed(2),
      solved: this.solved,
    };
  }

  // =========================================================
  // UPDATE
  // =========================================================
  update(dt) {
    const g = this.g, set = this.game.set;
    this.world.step(dt);
    this._updateChain(dt);

    if (this.phase === 'lit') {
      // the lamp breathes very slightly, like a real filament on mains
      this.lamp.filament = 1 + Math.sin(this.t * 2.1) * 0.012 + noise1(this.t * 3.4) * 0.02;
      if (this.pull > 0.98) this._killTheLight();
      if (this.input.idle() > 8) this.hint('Pull the chain'); else this.hideHint();
    } else if (this.phase === 'dying') {
      this.darkT += dt;
      if (this.darkT > 1.0) { this.phase = 'dark'; this.darkT = 0; }
    } else if (this.phase === 'dark') {
      this.darkT += dt;
      this._updateTorch(dt);
      if (this.darkT > 3.4 && !this._spoke) {
        this._spoke = true;
        this.say('…', { hold: 1.4, quiet: true });
        this.say('Well.', { hold: 1.8 });
        this.say('You may as well feel around.', { hold: 2.6 });
      }
      if (this.torch.seen > 0.16 && !this._bellHinted) {
        this._bellHinted = true;
        this.say('There is something on the plinth that was not there before.',
          { hold: 3.0, agitated: true, delay: 1.2 });
      }
      if (this.bell.found > 0.5 && this.phase === 'dark') this.phase = 'found';
    } else if (this.phase === 'found') {
      this.darkT += dt;
      this._updateTorch(dt);
      this._updateBell(dt);
      if (this.input.idle() > 7) this.hint('Ring it'); else this.hideHint();
    } else if (this.phase === 'ringing') {
      this._updateBell(dt);
      this.reveal = damp(this.reveal, 1, 1.4, dt);
      set.exposure = this.reveal;
      set.coneStrength = smoothstep(this.reveal * 1.15);
      set.plinthOpacity = clamp01(this.reveal * 1.6);
      this.lamp.on = damp(this.lamp.on, 1, 2.2, dt);
      this.torch.on = damp(this.torch.on, 0, 2.0, dt);
    }
  }

  // ---------------- the chain ----------------
  _updateChain(dt) {
    const g = this.g;
    // grab: anywhere along the lower half of the chain
    for (const p of this.input.list) {
      if (p.claimedBy && p.claimedBy !== this.tag) continue;
      if (!p.data.chainPt) {
        if (p.claimedBy) continue;
        if (this.phase !== 'lit') continue;
        let best = null, bd = g.u * 9;
        for (let i = 6; i < this.chain.points.length; i++) {
          const q = this.chain.points[i];
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < bd) { bd = d; best = q; }
        }
        if (!best) continue;
        p.claimedBy = this.tag;
        p.data.chainPt = best;
        best.grabbed = true;
        SFX.chainPull(0);
        Haptics.tap();
        continue;
      }
      const q = p.data.chainPt;
      q.x = p.x; q.y = p.y;
      // chain rattles as it runs through the fitting
      if (Math.abs(p.dy) + Math.abs(p.dx) > 3 && rand() < 0.22) SFX.chainPull(1);
      if (rand() < 0.3) Haptics.tick();
    }
    for (const p of this.input.releases) {
      if (p.data && p.data.chainPt) {
        p.data.chainPt.grabbed = false;
        p.data.chainPt = null;
        p.claimedBy = null;
      }
    }

    // travel is how far the acorn has been dragged below its rest point
    if (this.phase === 'lit') {
      const travel = Math.max(0, this.acorn.y - this.restY);
      const target = clamp01(travel / (this.g.u * 13));
      if (target > this.pull) {
        // one detent as the switch approaches its break point
        if (this.pull < 0.72 && target >= 0.72) { SFX.uiTick(0.7); Haptics.detent(); }
      }
      this.pull = target;
    }
    // the whole lamp sways from the pull
    const sway = (this.chain.points[3].x - this.g.chainX) * 0.010;
    this.lamp.vswing += (sway - this.lamp.swing) * 26 * dt;
    this.lamp.vswing *= Math.exp(-2.4 * dt);
    this.lamp.swing += this.lamp.vswing * dt;
  }

  _killTheLight() {
    const set = this.game.set;
    this.phase = 'dying';
    this.pulled = true;
    this.transgressed = true;
    this.hideHint();
    SFX.lampClick();
    Haptics.bottom();
    this.shake(0.28);
    // the chain snaps back up
    for (const p of this.chain.points) { p.ox = p.x; p.oy = p.y + this.g.u * 2.4; }

    // filament dies faster than the room: a real bulb goes orange, then out
    this.tl.to(this.lamp, 'filament', 0.34, 0.10, 'outQuad');
    this.tl.to(this.lamp, 'on', 0, 0.55, 'inQuart');
    this.tl.to(set, 'exposure', 0, 0.62, 'inQuart');
    this.tl.to(set, 'coneStrength', 0, 0.34, 'inQuart');
    this.tl.to(set, 'plinthOpacity', 0, 0.7, 'inQuart');
    this.tl.after(0.06, () => { SFX.powerDown(); });
    if (this.game.ambience) this.game.ambience.set(0.008, 1.4);
    Audio.setRoom(3.4, 3.0, 0.5);          // the room sounds bigger in the dark
    this.game.hud.showBar(false);
    this.interrupt('Oh.', { hold: 2.2, agitated: true, delay: 0.9 });
  }

  // ---------------- the fingertip ----------------
  _updateTorch(dt) {
    const g = this.g, T = this.torch;
    // The finger that pulled the chain is usually still on the screen when
    // the room goes dark. If that finger lights the torch, the player
    // never gets the few seconds of nothing — which is the best beat in
    // the game. So the light needs a FRESH touch: lift, sit in the black
    // for a moment, then reach out again.
    if (!T.armed) {
      if (this.input.presses.length) T.armed = true;
      else { T.on = damp(T.on, 0, 3, dt); return; }
    }
    const p = this.input.list[0];
    if (p) {
      T.x = damp(T.x, p.x, 34, dt);
      T.y = damp(T.y, p.y, 34, dt);
      T.on = damp(T.on, 1, 5.5, dt);
      T.r = damp(T.r, g.R * 0.92, 4.5, dt);
      this._remember(T.x, T.y, T.r);
      // finding the bell
      const d = Math.hypot(p.x - g.bellX, p.y - (g.bellY - g.bellH * 0.5));
      // Only count it as FOUND once the player is genuinely searching:
      // the torch is up, the dark has settled, and they lingered here.
      // Otherwise the chain-pull's own finger position discovers the bell
      // for them and the best moment in the game is given away.
      if (d < g.R * 0.55 && T.on > 0.5 && this.darkT > 2.4 && T.seen > 0.02) {
        const was = this.bell.found;
        this.bell.found = clamp01(this.bell.found + dt * 1.6);
        if (was < 0.5 && this.bell.found >= 0.5) {
          SFX.glassRing(2400, 0.12);
          Haptics.select();
          this.interrupt('Ah. You found it.', { hold: 2.4 });
          this.tl.to(this.bell, 'tagA', 1, 0.9, 'outCubic');
        }
      }
    } else {
      // Fade OUT, don't settle on a floor. Damping toward 0.42 meant the
      // light rose to that value on its own the moment the room went
      // dark, so the blackout was never actually black and the best beat
      // in the game was given away before the player touched anything.
      T.on = damp(T.on, 0, 0.6, dt);
      T.r = damp(T.r, g.R * 0.72, 2.0, dt);
      // brushing past the bell shouldn't bank progress toward finding it
      if (this.bell.found < 1) this.bell.found = Math.max(0, this.bell.found - dt * 0.9);
    }
  }

  /** A slowly-decaying record of where the player has already looked. */
  _remember(x, y, r) {
    const g = this.g;
    const S = 0.16;
    const L = this.memory.size(Math.max(1, (g.w * S) | 0), Math.max(1, (g.h * S) | 0));
    const c = L.ctx;
    if (!this._memReady) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, L.canvas.width, L.canvas.height);
      this._memReady = true;
      this._seenPx = 0;
    }
    c.setTransform(S, 0, 0, S, 0, 0);
    // Very small per-frame contribution: this is used as an alpha mask,
    // and 'lighter' saturates within a few frames of dwelling, which is
    // what turned a record of where you had looked into a flat grey pool
    // with visible stamp edges.
    c.globalCompositeOperation = 'lighter';
    const grd = c.createRadialGradient(x, y, 0, x, y, r * 0.80);
    grd.addColorStop(0, 'rgba(255,222,182,0.030)');
    grd.addColorStop(0.55, 'rgba(255,214,168,0.013)');
    grd.addColorStop(1, 'rgba(255,214,168,0)');
    c.fillStyle = grd;
    c.beginPath(); c.arc(x, y, r * 0.80, 0, TAU); c.fill();
    // and it forgets, slowly, so exploring feels like a light sweeping
    // rather than like painting a wall
    c.globalCompositeOperation = 'destination-out';
    c.globalAlpha = 0.004;
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.g.w, this.g.h);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    // rough coverage estimate, for pacing the narrator
    this.torch.seen = clamp01(this.torch.seen + 0.00035 * (r / g.R));
  }

  // ---------------- the bell ----------------
  _updateBell(dt) {
    const g = this.g, B = this.bell;
    const near = (x, y, k = 1.6) =>
      Math.hypot(x - g.bellX, y - (g.bellY - g.bellH * 0.55)) < g.bellH * k;

    // A tap is what anyone does to a bell, so a tap must ring it. Swinging
    // is the richer version, not the required one.
    for (const p of this.input.taps) {
      if (near(p.x, p.y)) {
        B.va += (p.x < g.bellX ? 1 : -1) * 2.6;
        this._ring(0.85);
      }
    }
    for (const p of this.input.list) {
      if (p.claimedBy && p.claimedBy !== this.tag) continue;
      if (!near(p.x, p.y)) continue;
      B.va += p.dx * 0.055;              // dragging across it swings it
      p.claimedBy = this.tag;
    }
    // pendulum
    B.va += -Math.sin(B.a) * 26 * dt;
    B.va *= Math.exp(-1.4 * dt);
    const prev = B.a;
    B.a += B.va * dt;
    B.ringT = Math.max(0, B.ringT - dt);
    // the clapper strikes as the bell passes through the bottom of its arc
    if (Math.sign(prev) !== Math.sign(B.a) && Math.abs(B.va) > 0.5 && B.ringT <= 0) {
      this._ring(clamp01(Math.abs(B.va) / 4));
    }
  }

  _ring(power) {
    const B = this.bell;
    B.ringT = 0.14;
    B.rung++;
    // a real handbell: a strong hum note, an inharmonic tierce and quint
    Audio.modal(524, [
      [0.5, 0.10 * power, 3.4],           // hum
      [1.0, 0.16 * power, 2.8],           // prime
      [1.19, 0.09 * power, 2.0],          // minor tierce
      [1.51, 0.06 * power, 1.6],          // quint
      [2.0, 0.05 * power, 1.2],
      [2.64, 0.03 * power, 0.7],
    ], { gain: 0.6, send: 0.8 });
    Audio.click({ f: 3200, gain: 0.05 * power, dur: 0.012, q: 4 });
    Haptics.select();
    this.shake(0.05 * power);
    this.flash('255,226,180', 0.05 * power, 0.3);
    if (B.rung === 1) {
      this.interrupt('…', { hold: 1.0, quiet: true });
      this.tl.after(0.9, () => this._restore());
    }
  }

  _restore() {
    if (this.phase === 'ringing') return;
    this.phase = 'ringing';
    this.hideHint();
    const set = this.game.set;
    SFX.powerUp();
    Audio.setRoom(1.9, 2.6, 0.26);
    if (this.game.ambience) this.game.ambience.set(0.035, 1.6);
    this.tl.to(this.lamp, 'filament', 1, 1.4, 'outCubic');
    // The gallery turns out to be much larger than one plinth. They have
    // to RECEDE — converging toward the room's own horizon and shrinking —
    // or the line lands as a couple of slivers cropped off the edges of
    // the screen, which is what it did before.
    const G = this.game.set.geom;
    const horizon = (G.plinth && G.plinth.horizonY) || this.g.h * 0.12;
    // A phone is 393px wide and the near plinth is most of that, so there
    // is no room for neighbours AT this depth — flanking them just crops
    // slivers off the edges. They have to sit further back: higher up the
    // frame, smaller, converging toward the room's horizon. Each gets its
    // own little pool of light, because that is the thing that actually
    // reads as another room rather than another box.
    const rng = makeRng(8181);
    const RANKS = 5;
    for (let i = 0; i < RANKS * 2; i++) {
      const side = i % 2 ? 1 : -1;
      const rank = Math.floor(i / 2);
      const t = (rank + 1) / RANKS;                   // 0.2 … 1 = deeper
      const jitter = 0.92 + rng() * 0.18;
      this.plinths.push({
        x: this.g.cx + side * this.g.topRx * (0.52 + (1 - t) * 0.95) * jitter,
        y: this.g.topY - (this.g.topY - horizon) * (0.16 + t * 0.62),
        s: 0.44 * (1 - t * 0.62),
        a: 0,
        delay: 0.5 + t * 1.7 + (side > 0 ? 0.11 : 0),
      });
    }
    for (const pl of this.plinths) this.tl.to(pl, 'a', 1, 1.5, 'outCubic', pl.delay);
    this.say('There are one hundred and forty rooms.', { hold: 2.6, delay: 1.4 });
    this.say('Please do not touch anything.', { hold: 3.0 });
    this.solve(7.0);
  }

  // =========================================================
  // DRAW
  // =========================================================
  drawBack(ctx, glow) {
    // the deeper gallery, revealed at the very end
    if (this.reveal <= 0.01) return;
    const g = this.g;
    // farthest first, so nearer plinths occlude the ones behind them
    const order = this.plinths.slice().sort((a, b) => a.s - b.s);
    for (const pl of order) {
      if (pl.a <= 0.01) continue;
      ctx.save();
      // haze with distance: the far end of the room is barely there
      const fade = 0.24 + pl.s * 0.76;
      ctx.globalAlpha = pl.a * fade * this.reveal;
      const hw = g.topRx * pl.s, hh = (g.h - pl.y) * 0.9;
      const grd = ctx.createLinearGradient(pl.x - hw, 0, pl.x + hw, 0);
      grd.addColorStop(0, '#0d0e12');
      grd.addColorStop(0.42, '#282b32');
      grd.addColorStop(0.62, '#1c1e24');
      grd.addColorStop(1, '#0a0b0e');
      ctx.fillStyle = grd;
      ctx.fillRect(pl.x - hw, pl.y, hw * 2, hh);
      // lit top face, and a hint of a light pool above each one
      const tg = ctx.createRadialGradient(pl.x, pl.y, 0, pl.x, pl.y, hw);
      tg.addColorStop(0, `rgba(186,180,172,${0.62 * pl.a})`);
      tg.addColorStop(1, `rgba(96,94,98,${0.34 * pl.a})`);
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.ellipse(pl.x, pl.y, hw, hw * 0.19, 0, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      const lp = ctx.createRadialGradient(pl.x, pl.y - hw * 0.9, 0, pl.x, pl.y - hw * 0.9, hw * 2.1);
      lp.addColorStop(0, `rgba(255,222,178,${0.10 * pl.a * fade})`);
      lp.addColorStop(1, 'rgba(255,222,178,0)');
      ctx.fillStyle = lp;
      ctx.fillRect(pl.x - hw * 2.2, pl.y - hw * 3, hw * 4.4, hw * 4);
      ctx.restore();
    }
  }

  draw(ctx, glow) {
    const g = this.g;
    const dark = this.phase === 'dark' || this.phase === 'found';

    if (dark) {
      // Total black, then only what the fingertip touches. Painting the
      // blackout here (rather than dimming the room) is what makes it
      // read as the light being GONE instead of merely turned down.
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(-g.w, -g.h, g.w * 3, g.h * 3);
      ctx.restore();
      // The lamp and its chain go UNDER the mask with everything else.
      // A dead lamp you can still see clearly is the tell that the
      // darkness is a costume rather than the actual state of the room —
      // and finding the chain again by touch is worth having.
      this._drawDarkWorld(ctx, glow);
    } else {
      this.game.wreck.draw(ctx, { ambient: this.game.set.lit });
      this._drawBell(ctx, glow, this.reveal > 0 ? 1 : 0);
      this._drawLamp(ctx, glow);
      this._drawChain(ctx, glow);
    }
  }

  /**
   * The dark, and the one light left in it.
   *
   * Built as a MASK rather than as a stencil. The world is drawn normally
   * and then a full-screen sheet of darkness is laid over it, with holes
   * punched where the fingertip is and — much more faintly — everywhere
   * the fingertip has already been. That gives soft edges everywhere for
   * free, and it means the memory of where you have looked *reveals real
   * geometry* instead of being an additive smear of light sitting on top
   * of nothing, which is what it was before.
   */
  _drawDarkWorld(ctx, glow) {
    const g = this.g, T = this.torch;
    const set = this.game.set;
    const R = T.r;

    // --- 1. the world, drawn as if it were lit ---
    ctx.save();
    ctx.drawImage(set.plinth.canvas, 0, 0, g.w, g.h);
    ctx.restore();
    // Items stay fully lit — the mask decides what is visible — but the
    // torch is still handed over so each piece throws a shadow away from
    // it. Movable shadows are what make a pool of light read as a light
    // rather than as a hole cut in a mask.
    this.game.wreck.draw(ctx, {
      ambient: 1,
      light: { x: T.x, y: T.y, r: R * 1.6, strength: Math.max(0.25, T.on) },
    });
    this._drawBell(ctx, null, 1);
    this._drawLamp(ctx, null);
    this._drawChain(ctx, null);

    // --- 2. the darkness, with holes where light has fallen ---
    const S = 0.34;
    const M = this._mask || (this._mask = new Layer());
    M.size(Math.max(1, Math.round(g.w * S)), Math.max(1, Math.round(g.h * S)));
    const mc = M.ctx;
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.globalCompositeOperation = 'source-over';
    mc.globalAlpha = 1;
    mc.fillStyle = '#040406';
    mc.fillRect(0, 0, M.canvas.width, M.canvas.height);
    mc.setTransform(S, 0, 0, S, 0, 0);
    mc.globalCompositeOperation = 'destination-out';

    // everywhere already explored stays just barely readable
    if (this._memReady) {
      mc.globalAlpha = 0.26;
      mc.drawImage(this.memory.canvas, 0, 0, g.w, g.h);
    }
    // the fingertip itself
    if (T.on > 0.01) {
      mc.globalAlpha = clamp01(T.on);
      const tg = mc.createRadialGradient(T.x, T.y, 0, T.x, T.y, R * 1.18);
      tg.addColorStop(0, 'rgba(0,0,0,1)');
      tg.addColorStop(0.30, 'rgba(0,0,0,0.96)');
      tg.addColorStop(0.62, 'rgba(0,0,0,0.60)');
      tg.addColorStop(0.86, 'rgba(0,0,0,0.16)');
      tg.addColorStop(1, 'rgba(0,0,0,0)');
      mc.fillStyle = tg;
      mc.beginPath(); mc.arc(T.x, T.y, R * 1.18, 0, TAU); mc.fill();
    }
    mc.globalAlpha = 1;
    mc.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(M.canvas, 0, 0, g.w, g.h);
    ctx.restore();

    if (T.on <= 0.02) return;

    // The bell throws a glint before it is close enough to be seen. It is
    // the only specular thing in the dark, so it is what tells the player
    // there is something over there worth reaching for.
    const bd = Math.hypot(g.bellX - T.x, (g.bellY - g.bellH * 0.6) - T.y);
    if (bd < R * 2.4) {
      const gk = clamp01(1 - bd / (R * 2.4)) ** 1.4 * T.on;
      const gx = g.bellX - g.bellH * 0.22, gy = g.bellY - g.bellH * 0.72;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gs = ctx.createRadialGradient(gx, gy, 0, gx, gy, g.bellH * 0.55);
      gs.addColorStop(0, `rgba(255,240,200,${0.80 * gk})`);
      gs.addColorStop(0.35, `rgba(255,220,150,${0.20 * gk})`);
      gs.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = gs;
      ctx.beginPath(); ctx.arc(gx, gy, g.bellH * 0.55, 0, TAU); ctx.fill();
      ctx.restore();
      if (glow) {
        glow.save();
        glow.globalCompositeOperation = 'lighter';
        const g3 = glow.createRadialGradient(gx, gy, 0, gx, gy, g.bellH * 1.6);
        g3.addColorStop(0, `rgba(255,226,164,${0.40 * gk})`);
        g3.addColorStop(1, 'rgba(255,226,164,0)');
        glow.fillStyle = g3;
        glow.beginPath(); glow.arc(gx, gy, g.bellH * 1.6, 0, TAU); glow.fill();
        glow.restore();
      }
    }

    // --- 3. the warmth of the light itself, over the top ---
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pg = ctx.createRadialGradient(T.x, T.y, 0, T.x, T.y, R * 1.1);
    pg.addColorStop(0, `rgba(255,204,142,${0.17 * T.on})`);
    pg.addColorStop(0.4, `rgba(255,186,126,${0.06 * T.on})`);
    pg.addColorStop(1, 'rgba(255,180,120,0)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(T.x, T.y, R * 1.1, 0, TAU); ctx.fill();
    ctx.restore();
    if (glow) {
      glow.save();
      glow.globalCompositeOperation = 'lighter';
      const gg = glow.createRadialGradient(T.x, T.y, 0, T.x, T.y, R * 0.45);
      gg.addColorStop(0, `rgba(255,196,132,${0.22 * T.on})`);
      gg.addColorStop(1, 'rgba(255,196,132,0)');
      glow.fillStyle = gg;
      glow.beginPath(); glow.arc(T.x, T.y, R * 0.45, 0, TAU); glow.fill();
      glow.restore();
    }
  }

  // ---------------- the lamp ----------------
  _drawLamp(ctx, glow) {
    const g = this.g;
    const on = this.lamp.on * this.lamp.filament;
    ctx.save();
    ctx.translate(g.cx, g.shadeY - g.shadeH);
    ctx.rotate(this.lamp.swing);
    ctx.translate(-g.cx, -(g.shadeY - g.shadeH));

    // flex + ceiling rose
    ctx.strokeStyle = '#16161a';
    ctx.lineWidth = Math.max(1.5, g.u * 0.42);
    ctx.beginPath();
    ctx.moveTo(g.cx, -g.h * 0.1);
    ctx.lineTo(g.cx, g.shadeY - g.shadeH * 0.2);
    ctx.stroke();

    // the shade: a brass cone
    const rx = g.shadeRx, bot = g.shadeBot, top = g.shadeY - g.shadeH * 0.2;
    ctx.beginPath();
    ctx.moveTo(g.cx - rx, bot);
    ctx.lineTo(g.cx - rx * 0.16, top);
    ctx.lineTo(g.cx + rx * 0.16, top);
    ctx.lineTo(g.cx + rx, bot);
    ctx.ellipse(g.cx, bot, rx, rx * 0.24, 0, 0, Math.PI);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    metalFill(ctx, g.cx - rx, 0, g.cx + rx, 0, PALETTES.brass);
    // An enamelled shade is OPAQUE. It does not glow — it is a dark shape
    // with light escaping under it. Lighting the whole cone was turning a
    // brass fitting into a paper lantern.
    ctx.fillStyle = `rgba(14,12,14,${0.62 - 0.10 * on})`;
    ctx.fillRect(g.cx - rx, top, rx * 2, bot - top + rx);
    ctx.globalCompositeOperation = 'lighter';
    const ig = ctx.createLinearGradient(0, bot - (bot - top) * 0.42, 0, bot);
    ig.addColorStop(0, 'rgba(255,190,110,0)');
    ig.addColorStop(1, `rgba(255,204,138,${0.16 * on})`);
    ctx.fillStyle = ig;
    ctx.fillRect(g.cx - rx, top, rx * 2, bot - top + rx);
    ctx.restore();
    ctx.strokeStyle = `rgba(255,236,190,${0.3 + 0.3 * on})`;
    ctx.lineWidth = Math.max(1, g.u * 0.14);
    ctx.stroke();

    // the mouth: hot when lit, a dark hole when not
    ctx.beginPath();
    ctx.ellipse(g.cx, bot, rx * 0.92, rx * 0.22, 0, 0, TAU);
    const mg = ctx.createRadialGradient(g.cx, bot, 0, g.cx, bot, rx * 0.92);
    mg.addColorStop(0, `rgba(255,${180 + 60 * on | 0},${120 + 90 * on | 0},${0.20 + 0.8 * on})`);
    mg.addColorStop(0.6, `rgba(120,80,50,${0.3 + 0.5 * on})`);
    mg.addColorStop(1, `rgba(26,20,16,${0.9 - 0.2 * on})`);
    ctx.fillStyle = mg;
    ctx.fill();

    // the filament
    if (on > 0.005) {
      const fy = bot + rx * 0.10;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,${200 * on + 40 | 0},${110 * on + 20 | 0},${Math.min(1, on * 1.4)})`;
      ctx.lineWidth = Math.max(1, g.u * 0.22);
      ctx.beginPath();
      for (let i = 0; i <= 14; i++) {
        const tt = i / 14;
        const px = g.cx + (tt - 0.5) * rx * 0.42;
        const py = fy + Math.sin(tt * Math.PI * 5) * rx * 0.05;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
      if (glow) {
        glow.save();
        glow.globalCompositeOperation = 'lighter';
        const r2 = rx * (1.4 + on * 1.6);
        const fg = glow.createRadialGradient(g.cx, fy, 0, g.cx, fy, r2);
        fg.addColorStop(0, `rgba(255,214,150,${0.75 * on})`);
        fg.addColorStop(0.35, `rgba(255,190,120,${0.22 * on})`);
        fg.addColorStop(1, 'rgba(255,180,110,0)');
        glow.fillStyle = fg;
        glow.beginPath(); glow.arc(g.cx, fy, r2, 0, TAU); glow.fill();
        glow.restore();
      }
    }
    ctx.restore();
  }

  // ---------------- the chain ----------------
  _drawChain(ctx, glow) {
    const g = this.g;
    const pts = this.chain.points;
    if (pts.length < 2) return;
    const u = g.u;
    const r = u * 0.34;                 // bead radius
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // The old chain was beads with gaps between them, which at this size
    // reads as a dotted line. Real ball chain is beads TOUCHING: the body
    // of it is continuous and the articulation is a rhythm of dark pinches.
    // Three strokes down one path, instead of a radial gradient per bead.
    const path = new Path2D();
    path.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);

    ctx.strokeStyle = '#9c7a34';
    ctx.lineWidth = r * 2;
    ctx.stroke(path);
    // the specular running down the lit side of every bead
    ctx.save();
    ctx.translate(-r * 0.34, -r * 0.30);
    ctx.strokeStyle = 'rgba(255,236,178,0.72)';
    ctx.lineWidth = r * 0.72;
    ctx.stroke(path);
    ctx.restore();
    ctx.save();
    ctx.translate(r * 0.42, r * 0.36);
    ctx.strokeStyle = 'rgba(52,36,10,0.55)';
    ctx.lineWidth = r * 0.6;
    ctx.stroke(path);
    ctx.restore();

    // the pinches: one every bead-diameter, walked at constant arc length
    // so they stay evenly spaced however the rope happens to hang
    ctx.strokeStyle = 'rgba(44,30,8,0.62)';
    ctx.lineWidth = Math.max(0.8, r * 0.34);
    ctx.beginPath();
    const step = r * 1.92;
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const a2 = pts[i - 1], b2 = pts[i];
      const dx = b2.x - a2.x, dy = b2.y - a2.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) continue;
      const nx = -dy / len, ny = dx / len;
      for (let d = step - carry; d < len; d += step) {
        const px = a2.x + dx * (d / len), py = a2.y + dy * (d / len);
        ctx.moveTo(px - nx * r * 0.86, py - ny * r * 0.86);
        ctx.lineTo(px + nx * r * 0.86, py + ny * r * 0.86);
      }
      carry = (carry + len) % step;
    }
    ctx.stroke();

    // The acorn on the end — the thing the player actually takes hold of,
    // so it is turned rather than blobbed: a collar, a shoulder, a point.
    const a = this.acorn;
    const ar = u * 0.92;
    ctx.save();
    ctx.translate(a.x, a.y);
    // the collar where the chain enters it
    ctx.fillStyle = '#8a6b2c';
    ctx.beginPath();
    ctx.ellipse(0, -ar * 1.02, ar * 0.44, ar * 0.20, 0, 0, TAU);
    ctx.fill();
    // the body
    ctx.beginPath();
    ctx.moveTo(0, ar * 1.62);
    ctx.bezierCurveTo(-ar * 0.94, ar * 0.66, -ar * 0.86, -ar * 0.52, -ar * 0.40, -ar * 0.86);
    ctx.quadraticCurveTo(0, -ar * 1.06, ar * 0.40, -ar * 0.86);
    ctx.bezierCurveTo(ar * 0.86, -ar * 0.52, ar * 0.94, ar * 0.66, 0, ar * 1.62);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    metalFill(ctx, -ar, 0, ar, 0, PALETTES.brass);
    const agl = ctx.createLinearGradient(-ar, 0, ar, 0);
    agl.addColorStop(0, 'rgba(30,20,6,0.55)');
    agl.addColorStop(0.30, 'rgba(255,244,200,0.42)');
    agl.addColorStop(0.62, 'rgba(255,236,180,0.04)');
    agl.addColorStop(1, 'rgba(24,16,4,0.62)');
    ctx.fillStyle = agl;
    ctx.fillRect(-ar, -ar * 1.2, ar * 2, ar * 3);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,238,190,0.34)';
    ctx.lineWidth = Math.max(0.8, u * 0.09);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    ctx.restore();
  }

  // ---------------- the bell ----------------
  /**
   * A cast-brass hand bell, built from its turned profile rather than from
   * a triangle. The silhouette is the whole thing: crown, shoulder, waist,
   * and the thickened sound bow at the lip — the part that actually makes
   * the note, and the part whose absence let the old shape read as a party
   * hat. Two incised mouldings above the bow, a lit inner far wall inside
   * the mouth, and a clapper that lags the body it hangs in.
   *
   * It is the last object in the game and the only one the player has to
   * find by feel, so it gets the profile it deserves.
   */

  /** Half-profile of the casting, outer edge, mouth at y = 0. */
  _bellProfile(h) {
    return [
      [0.720, 0.000],   // lip, outer
      [0.734, -0.070],  // the bulge of the sound bow
      [0.664, -0.148],  // above the bow it tucks in fast
      [0.556, -0.240],
      [0.470, -0.356],
      [0.420, -0.492],  // waist — a bell is nearly vertical through here
      [0.396, -0.618],
      [0.336, -0.752],  // the shoulder turns over
      [0.212, -0.878],
      [0.104, -0.958],
      [0.058, -0.992],  // crown
    ].map(([px, py]) => [px * h, py * h]);
  }

  _bellPath(ctx, h) {
    const pr = this._bellProfile(h);
    const n = pr.length;
    ctx.beginPath();
    ctx.moveTo(pr[0][0], pr[0][1]);
    for (let i = 1; i < n - 1; i++) {
      const [ax, ay] = pr[i], [bx, by] = pr[i + 1];
      ctx.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2);
    }
    ctx.lineTo(pr[n - 1][0], pr[n - 1][1]);
    ctx.bezierCurveTo(h * 0.04, -h * 1.012, -h * 0.04, -h * 1.012,
      -pr[n - 1][0], pr[n - 1][1]);
    for (let i = n - 2; i >= 1; i--) {
      const [ax, ay] = pr[i], [bx, by] = pr[i - 1];
      ctx.quadraticCurveTo(-ax, ay, -(ax + bx) / 2, (ay + by) / 2);
    }
    ctx.lineTo(-pr[0][0], pr[0][1]);
    // the front half of the mouth ellipse closes the silhouette
    ctx.ellipse(0, 0, h * 0.72, h * 0.205, 0, Math.PI, 0, true);
    ctx.closePath();
  }

  /** Radius of the casting at a given height, for the mouldings. */
  _bellRx(h, y) {
    const pr = this._bellProfile(h);
    for (let i = 0; i < pr.length - 1; i++) {
      if (y <= pr[i][1] && y >= pr[i + 1][1]) {
        const t = (y - pr[i][1]) / ((pr[i + 1][1] - pr[i][1]) || 1);
        return lerp(pr[i][0], pr[i + 1][0], t);
      }
    }
    return pr[0][0];
  }

  _drawBell(ctx, glow, vis) {
    if (vis <= 0.02) return;
    const g = this.g, B = this.bell;
    const h = g.bellH, x = g.bellX, y = g.bellY;
    ctx.save();
    ctx.globalAlpha = clamp01(vis);
    contactShadow(ctx, x, y + g.u * 0.3, h * 0.95, h * 0.28, { strength: 0.6 * vis });
    // it swings about the hand, up at the top of the grip
    ctx.translate(x, y - h * 1.05);
    ctx.rotate(B.a * 0.5);
    ctx.translate(0, h * 1.05);

    // ---- the handle: a turned grip, a collar, a ferrule
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-h * 0.088, -h * 0.96);
    ctx.bezierCurveTo(-h * 0.098, -h * 1.12, -h * 0.112, -h * 1.24, -h * 0.100, -h * 1.34);
    ctx.lineTo(h * 0.100, -h * 1.34);
    ctx.bezierCurveTo(h * 0.112, -h * 1.24, h * 0.098, -h * 1.12, h * 0.088, -h * 0.96);
    ctx.closePath();
    ctx.save(); ctx.clip();
    metalFill(ctx, -h * 0.09, 0, h * 0.09, 0, PALETTES.brass);
    ctx.restore();
    // the grip bulb
    ctx.beginPath();
    ctx.ellipse(0, -h * 1.42, h * 0.176, h * 0.150, 0, 0, TAU);
    ctx.save(); ctx.clip();
    metalFill(ctx, -h * 0.18, 0, h * 0.18, 0, PALETTES.brass);
    const bl = ctx.createRadialGradient(-h * 0.06, -h * 1.472, 0, 0, -h * 1.42, h * 0.22);
    bl.addColorStop(0, 'rgba(255,246,214,0.55)');
    bl.addColorStop(1, 'rgba(255,246,214,0)');
    ctx.fillStyle = bl;
    ctx.fillRect(-h * 0.2, -h * 1.72, h * 0.4, h * 0.42);
    ctx.restore();
    // collar under the bulb, ferrule where the shaft enters the crown
    ctx.strokeStyle = 'rgba(58,42,16,0.75)';
    ctx.lineWidth = Math.max(1, g.u * 0.10);
    ctx.beginPath();
    ctx.ellipse(0, -h * 1.294, h * 0.112, h * 0.034, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.995, h * 0.126, h * 0.040, 0, 0, TAU);
    const fg = ctx.createLinearGradient(-h * 0.1, 0, h * 0.1, 0);
    fg.addColorStop(0, '#6b5220'); fg.addColorStop(0.45, '#d8b56e'); fg.addColorStop(1, '#5a4419');
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // ---- the casting
    this._bellPath(ctx, h);
    ctx.save();
    ctx.clip();
    metalFill(ctx, -h * 0.72, -h, h * 0.72, h * 0.2, PALETTES.brass);
    radialBrush(ctx, 0, -h * 0.4, h, 17, { count: 60, alpha: 0.05 });
    // a bell is a body of revolution: one bright band left of centre, and
    // both edges falling away into the dark
    const rd = ctx.createLinearGradient(-h * 0.72, 0, h * 0.72, 0);
    rd.addColorStop(0, 'rgba(24,16,4,0.72)');
    rd.addColorStop(0.20, 'rgba(24,16,4,0.10)');
    rd.addColorStop(0.34, 'rgba(255,244,206,0.32)');
    rd.addColorStop(0.52, 'rgba(255,236,186,0.05)');
    rd.addColorStop(0.78, 'rgba(30,20,6,0.30)');
    rd.addColorStop(1, 'rgba(20,13,3,0.76)');
    ctx.fillStyle = rd;
    ctx.fillRect(-h * 0.8, -h * 1.1, h * 1.6, h * 1.4);
    // tarnish settles in the concave waist, where no cloth reaches
    const tz = ctx.createLinearGradient(0, -h * 0.62, 0, -h * 0.24);
    tz.addColorStop(0, 'rgba(46,58,30,0)');
    tz.addColorStop(0.5, 'rgba(46,58,30,0.20)');
    tz.addColorStop(1, 'rgba(46,58,30,0)');
    ctx.fillStyle = tz;
    ctx.fillRect(-h * 0.8, -h * 0.62, h * 1.6, h * 0.4);
    ctx.restore();

    // ---- the mouldings above the sound bow
    ctx.save();
    for (const [my, dark] of [[-h * 0.148, 0.72], [-h * 0.206, 0.58]]) {
      const rx = this._bellRx(h, my);
      const ry = rx * 0.285;
      ctx.strokeStyle = `rgba(30,20,6,${dark})`;
      ctx.lineWidth = Math.max(1.1, g.u * 0.14);
      ctx.beginPath(); ctx.ellipse(0, my, rx, ry, 0, 0.06, Math.PI - 0.06); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,196,0.30)';
      ctx.lineWidth = Math.max(0.8, g.u * 0.07);
      ctx.beginPath();
      ctx.ellipse(0, my + g.u * 0.11, rx, ry, 0, 0.10, Math.PI - 0.10);
      ctx.stroke();
    }
    ctx.restore();

    // ---- the mouth: the far inner wall is lit, the near one is not
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, h * 0.72, h * 0.205, 0, 0, TAU);
    ctx.fillStyle = 'rgba(14,9,3,0.94)';
    ctx.fill();
    ctx.clip();
    const iw = ctx.createLinearGradient(0, -h * 0.205, 0, h * 0.06);
    iw.addColorStop(0, 'rgba(186,142,64,0.62)');
    iw.addColorStop(0.55, 'rgba(90,66,26,0.14)');
    iw.addColorStop(1, 'rgba(20,14,4,0)');
    ctx.fillStyle = iw;
    ctx.fillRect(-h * 0.72, -h * 0.205, h * 1.44, h * 0.41);
    // the clapper, hanging inside and lagging the body it hangs in
    ctx.save();
    ctx.rotate(-B.a * 0.9);
    ctx.strokeStyle = 'rgba(40,28,10,0.9)';
    ctx.lineWidth = Math.max(1, g.u * 0.13);
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.30);
    ctx.lineTo(0, -h * 0.04);
    ctx.stroke();
    const cg = ctx.createRadialGradient(-h * 0.03, -h * 0.055, 0, 0, -h * 0.03, h * 0.13);
    cg.addColorStop(0, 'rgba(236,206,140,0.95)');
    cg.addColorStop(0.6, 'rgba(140,104,44,0.95)');
    cg.addColorStop(1, 'rgba(40,28,10,0.95)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(0, -h * 0.03, h * 0.105, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();

    // ---- the lip: the brightest line on the object, and the one that
    // says the wall has thickness instead of being a paper cone
    ctx.strokeStyle = `rgba(255,242,202,${0.78 * vis})`;
    ctx.lineWidth = Math.max(1.2, g.u * 0.17);
    ctx.beginPath();
    ctx.ellipse(0, 0, h * 0.72, h * 0.205, 0, Math.PI * 0.06, Math.PI * 0.94);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,238,190,${0.30 * vis})`;
    ctx.lineWidth = Math.max(1, g.u * 0.10);
    this._bellPath(ctx, h);
    ctx.stroke();

    // the card, tied on with thread
    if (B.tagA > 0.01) {
      ctx.save();
      ctx.globalAlpha = B.tagA * vis;
      // hung to the side and slightly low, so the whole card clears both
      // the casting and the mess the player has already made on the plinth
      ctx.rotate(0.15 + B.a * 0.3);
      const tw = h * 0.86, th = h * 0.5;
      const tx = h * 0.80, ty = -h * 0.26;
      ctx.strokeStyle = 'rgba(200,180,140,0.7)';
      ctx.lineWidth = Math.max(1, g.u * 0.1);
      ctx.beginPath();
      ctx.moveTo(h * 0.06, -h * 1.02);
      ctx.quadraticCurveTo(h * 0.66, -h * 0.80, tx + tw * 0.16, ty);
      ctx.stroke();
      ctx.save();
      ctx.translate(tx, ty);
      roundRectPath(ctx, 0, 0, tw, th, g.u * 0.4);
      ctx.fillStyle = '#ded4bd';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,108,86,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
      engrave(ctx, 'DO NOT RING', tw / 2, th / 2, {
        font: `700 ${g.u * 1.15}px Inter, sans-serif`,
        letterSpacing: `${g.u * 0.1}px`,
        depth: 0.6, darkness: 0.75, light: 0.1,
      });
      ctx.restore();
      ctx.restore();
    }

    if (glow && B.ringT > 0) {
      glow.save();
      glow.globalCompositeOperation = 'lighter';
      const gg = glow.createRadialGradient(x, y - h * 0.5, 0, x, y - h * 0.5, h * 3);
      gg.addColorStop(0, `rgba(255,226,170,${0.4 * (B.ringT / 0.14)})`);
      gg.addColorStop(1, 'rgba(255,226,170,0)');
      glow.fillStyle = gg;
      glow.beginPath(); glow.arc(x, y - h * 0.5, h * 3, 0, TAU); glow.fill();
      glow.restore();
    }
    ctx.restore();
  }
}
