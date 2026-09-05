// ============================================================
// game.js — shell: boot, loop, chapters, transitions
// ============================================================

import { Renderer, QualityGovernor } from '../render/renderer.js';
import { Input } from '../core/input.js';
import { Camera } from './camera.js';
import { Particles } from '../render/particles.js';
import { Set as StageSet } from './set.js';
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

  async goto(i, { card = true } = {}) {
    if (i >= this.levelClasses.length) return this.finish();
    this.state = 'transition';
    if (this.level) { this.level.exit(); this.level = null; }
    this.particles.clear();
    this.narrator.clear();
    this.hud.hideHint();
    this.index = i;
    const C = this.levelClasses[i];
    this.hud.setChapter(i + 1, this.levelClasses.length);
    if (card) await this.hud.card(`Chapter ${C.chapter}`, C.rule);
    const lv = new C(this);
    lv.layout(this.r.w, this.r.h, this.r.u);
    lv.enter();
    this.level = lv;
    this.hud.showBar(true);
    this.state = 'playing';
    return lv;
  }

  next() { return this.goto(this.index + 1); }

  onSolved(level, delay = 0) {
    this.transgressions++;
    this.tl.after(delay, () => {
      if (this.level === level) this.next();
    });
  }

  finish() {
    this.state = 'end';
    if (this.level) { this.level.exit(); this.level = null; }
    this.hud.showBar(false);
    this.narrator.clear();
    this.hud.end(
      `You were told.`,
      `${this.transgressions} rules broken`
    );
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
    this.gov.sample(dt);

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
    if (this.level) this.level.draw(ctx, g);
    this.particles.draw(ctx, g);
    if (this.level) this.level.drawFront(ctx, g);
    this.set.drawAtmosphere(ctx);

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
