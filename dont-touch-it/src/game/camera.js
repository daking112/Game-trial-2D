// ============================================================
// camera.js — trauma-based shake, push-in, roll, flash, time dilation
// ------------------------------------------------------------
// Shake uses a "trauma" scalar that decays; displacement is trauma^2 so
// small hits stay subtle and big ones are violent. Noise (not random)
// keeps the motion continuous instead of jittery, which is the
// difference between "juicy" and "broken".
// ============================================================

import { clamp, clamp01, lerp, fbm1, noise1, TAU } from '../core/math.js';

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.zoom = 1; this.rot = 0;
    this.tx = 0; this.ty = 0; this.tzoom = 1; this.trot = 0;
    this.trauma = 0;
    this.traumaDecay = 1.5;
    this.shakeAmp = 26;
    this.shakeRot = 0.045;
    this.t = 0;
    this.flashes = [];
    this.timeScale = 1;
    this._tsTarget = 1;
    this._tsTimer = 0;
    this.ox = 0; this.oy = 0; this.orot = 0; this.ozoom = 1;
    this.parallax = { x: 0, y: 0 };   // subtle device-tilt / pointer parallax
  }

  shake(amount = 0.4) { this.trauma = clamp01(this.trauma + amount); }
  kick(x, y, amount = 8) { this.tx += x * amount; this.ty += y * amount; }
  push(zoom, dur = 0.5) { this.tzoom = zoom; }
  slowmo(scale = 0.25, dur = 0.5) { this._tsTarget = scale; this._tsTimer = dur; }
  flash(color = '255,255,255', alpha = 0.5, dur = 0.28) {
    this.flashes.push({ color, alpha, t: 0, dur });
  }

  update(dt) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - this.traumaDecay * dt);
    const s = this.trauma * this.trauma;
    const f = this.t * 26;
    const sx = fbm1(f) * this.shakeAmp * s;
    const sy = fbm1(f + 91.3) * this.shakeAmp * s;
    const sr = noise1(f * 0.7 + 41.7) * this.shakeRot * s;

    this.x = lerp(this.x, this.tx, 1 - Math.exp(-9 * dt));
    this.y = lerp(this.y, this.ty, 1 - Math.exp(-9 * dt));
    this.zoom = lerp(this.zoom, this.tzoom, 1 - Math.exp(-6 * dt));
    this.rot = lerp(this.rot, this.trot, 1 - Math.exp(-7 * dt));
    this.tx = lerp(this.tx, 0, 1 - Math.exp(-4 * dt));
    this.ty = lerp(this.ty, 0, 1 - Math.exp(-4 * dt));

    this.ox = this.x + sx + this.parallax.x;
    this.oy = this.y + sy + this.parallax.y;
    this.orot = this.rot + sr;
    this.ozoom = this.zoom;

    if (this._tsTimer > 0) {
      this._tsTimer -= dt;
      this.timeScale = lerp(this.timeScale, this._tsTarget, 1 - Math.exp(-24 * dt));
      if (this._tsTimer <= 0) this._tsTarget = 1;
    } else {
      this.timeScale = lerp(this.timeScale, 1, 1 - Math.exp(-6 * dt));
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i];
      fl.t += dt;
      if (fl.t >= fl.dur) this.flashes.splice(i, 1);
    }
  }

  apply(ctx, w, h) {
    ctx.translate(w / 2, h / 2);
    ctx.rotate(this.orot);
    ctx.scale(this.ozoom, this.ozoom);
    ctx.translate(-w / 2 + this.ox, -h / 2 + this.oy);
  }

  drawFlashes(ctx, w, h) {
    for (const fl of this.flashes) {
      const k = 1 - fl.t / fl.dur;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${fl.color},${fl.alpha * k * k})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
}
