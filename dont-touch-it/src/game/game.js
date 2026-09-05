// ============================================================
// game.js — shell: boot, loop, chapters, transitions
// ============================================================

import { Renderer, QualityGovernor } from '../render/renderer.js';
import { Input } from '../core/input.js';
import { Camera } from './camera.js';
import { Particles } from '../render/particles.js';
import { Set as StageSet } from './set.js';
import { Wreckage } from './wreckage.js';
import { Narrator } from '../ui/narrator.js';
import { Hud } from '../ui/hud.js';
import { Timeline } from '../core/tween.js';
import { Audio, SFX } from '../core/audio.js';
import Haptics from '../core/haptics.js';
import { clamp, clamp01, lerp } from '../core/math.js';

export class Game {
  constructor(canvas, overlay, levels) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.levelClasses = levels;
    this.r = new Renderer(canvas);
    this.gov = new QualityGovernor(this.r);
    this.input = new Input(canvas);
    this.cam = new Camera();
    this.particles = new Particles(1200);
    this.set = new StageSet(this.r);
    this.wreck = new Wreckage(this);
    this.hud = new Hud(overlay);
    this.narrator = new Narrator(overlay);
    this.tl = new Timeline();
    this.level = null;
    this.index = -1;
    this.t = 0;
    this.raw = 0;
    this.running = false;
    this.paused = false;
    this.state = 'boot';       // boot | title | playing | transition | end
    this.transgressions = 0;
    this.fade = 0;             // 0 clear, 1 black
    this.debug = false;
    this._acc = 0;
    this._last = 0;
    this._fps = 60;
    this._frames = 0;
    this._fpsT = 0;
    this.drawMs = 0;

    addEventListener('resize', () => this.onResize());
    addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 60));
    if (window.visualViewport) visualViewport.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { Haptics.stop(); }
      else { this._last = performance.now() / 1000; Audio.resume(); }
    });
  }

  onResize() {
    if (this.r.resize()) {
      this.set.build(this.r.w, this.r.h, this.r.u);
      if (this.level) this.level.layout(this.r.w, this.r.h, this.r.u);
      this.particles.floor = this.r.h + 40;
    }
  }

  start() {
    this.r.resize(true);
    this.set.build(this.r.w, this.r.h, this.r.u);
    this.particles.floor = this.r.h + 40;
    this.running = true;
    this._last = performance.now() / 1000;
    requestAnimationFrame(this._frame = (ts) => this.frame(ts));
  }

  // -------------------- chapters --------------------

  /** Promise-returning tween on the shell's own timeline. */
  tween(obj, key, to, dur, ease = 'inOutCubic') {
    return new Promise(res => { this.tl.to(obj, key, to, dur, ease).then(res); });
  }
  wait(sec) { return new Promise(res => this.tl.after(sec, res)); }

  /**
   * Chapter change. The gallery does this the way a gallery would: the
   * lights go down on the old exhibit, the new one is installed in the
   * dark, and the lights come back up. No cross-fades, no wipes — the
   * room itself is the transition.
   */
  /**
   * Chapter changes QUEUE rather than drop. A transition takes a couple of
   * seconds, and silently ignoring a request that arrives during one means
   * a caller can skip a chapter without ever being told.
   */
  async goto(i, opts = {}) {
    if (this._changing) { try { await this._changing; } catch (_) {} }
    const p = this._goto(i, opts);
    this._changing = p;
    try { return await p; } finally { if (this._changing === p) this._changing = null; }
  }

  async _goto(i, { card = true, instant = false } = {}) {
    if (i >= this.levelClasses.length) return this.finish();
    this.state = 'transition';
    this.hud.hideHint();

    if (this.level && !instant) {
      // lights down on the old exhibit
      this.cam.push(1.045);
      await Promise.all([
        this.tween(this.set, 'coneStrength', 0, 0.75, 'inQuad'),
        this.tween(this.set, 'exposure', 0, 0.95, 'inQuad'),
      ]);
    }
    if (this.level) { this.level.exit(); this.level = null; }
    this.particles.clear();
    this.narrator.clear();
    this.set.tint = null;
    this.set.warmth = 1;
    this.set.flicker = 0;
    this.set.plinthOpacity = 1;
    this.cam.tzoom = 1;

    this.index = i;
    const C = this.levelClasses[i];
    this.hud.setChapter(i + 1, this.levelClasses.length);
    this.hud.showBar(false);

    if (card) await this.hud.card(`Chapter ${C.chapter}`, C.rule);

    const lv = this.previewed && this.previewed.constructor === C ? this.previewed : this._build(C);
    this.previewed = null;
    this.level = lv;
    this.state = 'playing';

    if (!instant) {
      // lights up on the new one — cone first, so the object arrives out
      // of the dark rather than simply appearing
      this.set.exposure = 0;
      this.set.coneStrength = 0;
      SFX.powerUp();
      this.tween(this.set, 'coneStrength', 1, 1.5, 'outCubic');
      await this.tween(this.set, 'exposure', 1, 1.25, 'outCubic');
    } else {
      this.set.exposure = 1;
      this.set.coneStrength = 1;
    }
    this.hud.showBar(true);
    lv.intro();
    return lv;
  }

  _build(C) {
    const lv = new C(this);
    lv.layout(this.r.w, this.r.h, this.r.u);
    lv.enter();
    return lv;
  }

  /**
   * Build a chapter but do not start it: the title screen shows the first
   * object sitting in half-light, so the game's opening move is the room
   * coming up on something that is already there.
   */
  preview(i) {
    const C = this.levelClasses[i];
    if (!C) return null;
    const lv = this._build(C);
    this.previewed = lv;
    this.level = lv;
    this.index = i;
    this.narrator.clear();
    return lv;
  }

  next() { return this.goto(this.index + 1); }

  onSolved(level, delay = 0) {
    this.transgressions++;
    this.tl.after(delay, () => {
      if (this.level === level) this.next();
    });
  }

  async finish() {
    this.state = 'end';
    await Promise.all([
      this.tween(this.set, 'coneStrength', 0.42, 1.4, 'inQuad'),
      this.tween(this.set, 'exposure', 0.52, 1.8, 'inQuad'),
    ]);
    if (this.level) { this.level.exit(); this.level = null; }
    // exit() restores the room's lighting for the next chapter, and there
    // isn't one — re-assert the closing state after it, or the gallery
    // snaps back to full brightness under the end card.
    this.set.exposure = 0.52;
    this.set.coneStrength = 0.42;
    this.set.warmth = 1;
    this.set.tint = null;
    this.hud.showBar(false);
    this.narrator.clear();
    const n = this.levelClasses.length;
    const debris = this.wreck.items.length;
    const glass = this.wreck.items.filter(i => i.kind === 'shard').length;
    this.hud.end('You were told.', [
      `${this.transgressions} of ${n} rules broken`,
      debris ? `${debris} pieces left where they fell` : 'Nothing left behind',
      glass > 20 ? 'Most of it was glass' : 'Room 1 of 140',
    ], () => location.reload());
  }

  // -------------------- loop --------------------

  frame(ts) {
    if (!this.running) return;
    requestAnimationFrame(this._frame);
    if (this.paused) { this._last = ts / 1000; return; }
    const now = ts / 1000;
    let dt = now - this._last;
    this._last = now;
    if (dt > 0.25) dt = 1 / 60;        // returned from background
    this.raw += dt;
    this.gov.sample(dt, this.drawMs);

    this._frames++; this._fpsT += dt;
    if (this._fpsT >= 0.5) { this._fps = this._frames / this._fpsT; this._frames = 0; this._fpsT = 0; }

    this.cam.update(dt);
    const sdt = dt * this.cam.timeScale;
    this.t += sdt;

    this.tl.update(dt);
    this.narrator.update(dt);
    this.set.update(sdt);
    this.particles.update(sdt);
    if (this.level && this.state === 'playing') this.level._tick(sdt);

    this.render();
    this.input.endFrame();

    if (this.debug) {
      this.hud.perfEl.textContent =
        `${this._fps.toFixed(0)}fps  ${this.r.qualityName}  dpr${this.r.dpr.toFixed(1)}\n` +
        `draw ${this.drawMs.toFixed(1)}ms  p${this.particles.n} ptr${this.input.count}`;
    }
  }

  /** One simulate+draw at a fixed dt, ignoring wall clock. Test-only. */
  stepOnce(dt) {
    this.cam.update(dt);
    const sdt = dt * this.cam.timeScale;
    this.t += sdt;
    this.tl.update(dt);
    this.narrator.update(dt);
    this.set.update(sdt);
    this.particles.update(sdt);
    if (this.level && this.state === 'playing') this.level._tick(sdt);
    this.render();
    this.input.endFrame();
  }

  render() {
    const t0 = performance.now();
    const r = this.r, ctx = r.ctx;
    r.begin('#08080a');
    const g = r.glowCtx;

    ctx.save();
    this.cam.apply(ctx, r.w, r.h);
    g.save();
    this.cam.apply(g, r.w, r.h);

    this.set.drawBackdrop(ctx);
    if (this.level) this.level.drawBack(ctx, g);
    this.set.drawLightCone(ctx);
    this.set.drawPlinth(ctx);
    // Everything previous chapters destroyed, still lying where it fell.
    // A chapter that lights the room itself (Chapter V) paints it instead.
    if (!this.level || !this.level.ownsWreckage) this.wreck.draw(ctx);
    if (this.level) this.level.draw(ctx, g);
    this.particles.draw(ctx, g);
    if (this.level) this.level.drawFront(ctx, g);
    this.set.drawAtmosphere(ctx);

    // The room's exposure dims the ROOM (its layers are blitted with
    // alpha) but not the object on it. This scrim closes that gap, which
    // is what lets the title screen show the first exhibit in half-light
    // and makes "tap to enter" an act of turning the lights on.
    if (!this.level || !this.level.ownsLighting) {
      const scrim = clamp01(0.95 - this.set.lit * 1.02);
      if (scrim > 0.004) {
        ctx.fillStyle = `rgba(5,5,8,${scrim})`;
        ctx.fillRect(-r.w, -r.h, r.w * 3, r.h * 3);
      }
    }

    g.restore();
    ctx.restore();

    r.applyBloom(1);
    r.applyVignette(0.66);
    r.applyGrain(0.028);

    this.cam.drawFlashes(ctx, r.w, r.h);

    if (this.level) this.level.drawUi(ctx);

    if (this.fade > 0.001) {
      ctx.save();
      ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
      ctx.fillStyle = `rgba(6,6,8,${clamp01(this.fade)})`;
      ctx.fillRect(0, 0, r.w, r.h);
      ctx.restore();
    }
    this.drawMs += (performance.now() - t0 - this.drawMs) * 0.08;
  }
}
