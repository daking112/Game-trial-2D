// ============================================================
// particles.js — pooled particle system + debris rigid bodies
// ============================================================
import { TAU, clamp01, lerp, rand, rrange } from '../core/math.js';

export class Particles {
  constructor(max = 900) {
    this.max = max;
    this.n = 0;
    // struct-of-arrays for cache friendliness
    this.x = new Float32Array(max); this.y = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max);
    this.life = new Float32Array(max); this.max_life = new Float32Array(max);
    this.size = new Float32Array(max); this.rot = new Float32Array(max);
    this.vrot = new Float32Array(max); this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.kind = new Uint8Array(max);      // 0 spark 1 dust 2 shard 3 glow 4 smoke
    this.r = new Uint8Array(max); this.g = new Uint8Array(max); this.b = new Uint8Array(max);
    this.a0 = new Float32Array(max);
    this.floor = Infinity;
    this.bounce = 0.4;
  }

  emit(o) {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    this.x[i] = o.x; this.y[i] = o.y;
    this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0;
    this.max_life[i] = this.life[i] = o.life || 0.6;
    this.size[i] = o.size || 2;
    this.rot[i] = o.rot || 0; this.vrot[i] = o.vrot || 0;
    this.drag[i] = o.drag ?? 1.6;
    this.grav[i] = o.grav ?? 900;
    this.kind[i] = o.kind ?? 0;
    const c = o.color || [255, 220, 170];
    this.r[i] = c[0]; this.g[i] = c[1]; this.b[i] = c[2];
    this.a0[i] = o.alpha ?? 1;
    return i;
  }

  burst(x, y, count, o = {}) {
    const { speed = 300, spread = TAU, dir = -Math.PI / 2, ...rest } = o;
    for (let k = 0; k < count; k++) {
      const a = dir + (rand() - 0.5) * spread;
      const s = speed * (0.35 + rand() * 0.9);
      this.emit({
        x: x + (rand() - .5) * (o.jitter || 0), y: y + (rand() - .5) * (o.jitter || 0),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        rot: rand() * TAU, vrot: (rand() - .5) * 14,
        ...rest,
        life: (rest.life || 0.7) * (0.6 + rand() * 0.8),
        size: (rest.size || 3) * (0.5 + rand() * 1.1),
      });
    }
  }

  update(dt) {
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._swap(i); continue; }
      const d = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= d; this.vy[i] *= d;
      this.vy[i] += this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.vrot[i] * dt;
      this.vrot[i] *= d;
      if (this.y[i] > this.floor) {
        this.y[i] = this.floor;
        this.vy[i] *= -this.bounce;
        this.vx[i] *= 0.7;
        this.vrot[i] *= 0.6;
        if (Math.abs(this.vy[i]) < 24) { this.vy[i] = 0; this.grav[i] = 0; this.vx[i] *= 0.5; }
      }
    }
  }

  _swap(i) {
    const j = --this.n;
    if (i === j) return;
    const A = ['x','y','vx','vy','life','max_life','size','rot','vrot','drag','grav','kind','r','g','b','a0'];
    for (const k of A) this[k][i] = this[k][j];
  }

  draw(ctx, glowCtx = null) {
    for (let i = 0; i < this.n; i++) {
      const t = clamp01(this.life[i] / this.max_life[i]);
      const k = this.kind[i];
      const col = `${this.r[i]},${this.g[i]},${this.b[i]}`;
      const s = this.size[i];
      const x = this.x[i], y = this.y[i];
      if (k === 0) {           // spark — additive streak along velocity
        const target = glowCtx || ctx;
        const sp = Math.hypot(this.vx[i], this.vy[i]);
        const len = Math.min(26, sp * 0.014) * t;
        target.save();
        target.globalCompositeOperation = 'lighter';
        target.strokeStyle = `rgba(${col},${this.a0[i] * t})`;
        target.lineWidth = s * t;
        target.lineCap = 'round';
        target.beginPath();
        target.moveTo(x, y);
        target.lineTo(x - this.vx[i] * 0.012 * len * 0.2, y - this.vy[i] * 0.012 * len * 0.2);
        target.stroke();
        target.restore();
      } else if (k === 1) {    // dust
        ctx.save();
        ctx.globalAlpha = this.a0[i] * t * 0.75;
        ctx.fillStyle = `rgb(${col})`;
        ctx.beginPath(); ctx.arc(x, y, s * (1.1 - t * 0.25), 0, TAU); ctx.fill();
        ctx.restore();
      } else if (k === 2) {    // shard — small lit triangle
        ctx.save();
        ctx.translate(x, y); ctx.rotate(this.rot[i]);
        ctx.globalAlpha = this.a0[i] * Math.min(1, t * 2.2);
        ctx.fillStyle = `rgba(${col},0.9)`;
        ctx.beginPath();
        ctx.moveTo(-s, s * 0.6); ctx.lineTo(s * 1.2, 0); ctx.lineTo(-s * 0.6, -s);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.6; ctx.stroke();
        ctx.restore();
      } else if (k === 3) {    // soft glow blob
        const target = glowCtx || ctx;
        target.save();
        target.globalCompositeOperation = 'lighter';
        const g = target.createRadialGradient(x, y, 0, x, y, s * 3);
        g.addColorStop(0, `rgba(${col},${this.a0[i] * t * 0.9})`);
        g.addColorStop(1, `rgba(${col},0)`);
        target.fillStyle = g;
        target.beginPath(); target.arc(x, y, s * 3, 0, TAU); target.fill();
        target.restore();
      } else {                 // smoke
        ctx.save();
        const grow = 1 + (1 - t) * 2.4;
        ctx.globalAlpha = this.a0[i] * t * 0.22;
        const g = ctx.createRadialGradient(x, y, 0, x, y, s * grow);
        g.addColorStop(0, `rgba(${col},0.6)`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, s * grow, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }
  }
  clear() { this.n = 0; }
}

// ---------------------------------------------------------------
// Debris — small convex rigid bodies that tumble, land and pile.
// ---------------------------------------------------------------
export class Debris {
  constructor(x, y, poly, opts = {}) {
    this.x = x; this.y = y;
    this.vx = opts.vx || 0; this.vy = opts.vy || 0;
    this.a = opts.a || 0; this.va = opts.va || 0;
    this.poly = poly;                       // [x,y,...] local coords
    this.restitution = opts.restitution ?? 0.22;
    this.friction = opts.friction ?? 0.86;
    this.grav = opts.grav ?? 2100;
    this.rest = false;
    this.life = opts.life ?? Infinity;
    this.data = opts.data || null;
    let r = 0;
    for (let i = 0; i < poly.length; i += 2) r = Math.max(r, Math.hypot(poly[i], poly[i + 1]));
    this.radius = r;
  }
  step(dt, floorY, bounds) {
    if (this.rest) return;
    this.vy += this.grav * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.a += this.va * dt;
    if (bounds) {
      if (this.x < bounds.x + this.radius * 0.4) { this.x = bounds.x + this.radius * 0.4; this.vx *= -0.4; this.va *= 0.7; }
      if (this.x > bounds.x + bounds.w - this.radius * 0.4) { this.x = bounds.x + bounds.w - this.radius * 0.4; this.vx *= -0.4; this.va *= 0.7; }
    }
    // lowest vertex vs floor
    let lowest = -Infinity, lx = 0;
    const c = Math.cos(this.a), s = Math.sin(this.a);
    for (let i = 0; i < this.poly.length; i += 2) {
      const px = this.poly[i], py = this.poly[i + 1];
      const wy = this.y + px * s + py * c;
      if (wy > lowest) { lowest = wy; lx = this.x + px * c - py * s; }
    }
    if (lowest > floorY) {
      const pen = lowest - floorY;
      this.y -= pen;
      if (this.vy > 0) {
        this.vy *= -this.restitution;
        this.vx *= this.friction;
        // torque from off-centre contact
        this.va += (lx - this.x) * 0.0016 * Math.abs(this.vy);
        this.va *= 0.72;
      }
      if (Math.abs(this.vy) < 22 && Math.abs(this.va) < 0.6) {
        this.vy = 0; this.vx *= 0.82; this.va *= 0.6;
        if (Math.abs(this.vx) < 4 && Math.abs(this.va) < 0.12) { this.rest = true; this.vx = 0; this.va = 0; }
      }
    }
  }
  path(ctx) {
    const c = Math.cos(this.a), s = Math.sin(this.a);
    ctx.beginPath();
    for (let i = 0; i < this.poly.length; i += 2) {
      const px = this.x + this.poly[i] * c - this.poly[i + 1] * s;
      const py = this.y + this.poly[i] * s + this.poly[i + 1] * c;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
}
