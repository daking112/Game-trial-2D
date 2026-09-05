// ============================================================
// verlet.js — position-based dynamics
// ------------------------------------------------------------
// One solver serves ropes, cloth, hair, soft bodies and elastic wires.
// Substepping + constraint iteration counts are tuned so a 300-point
// cloth still solves inside 2ms on a mid-tier phone.
// ============================================================

import { clamp, clamp01, TAU } from '../core/math.js';

export class Point {
  constructor(x, y, mass = 1) {
    this.x = x; this.y = y;
    this.ox = x; this.oy = y;      // previous position
    this.ax = 0; this.ay = 0;      // accumulated acceleration
    this.invMass = mass > 0 ? 1 / mass : 0;
    this.pinned = mass <= 0;
    this.px = x; this.py = y;      // pin anchor
    this.grabbed = false;
    this.data = null;
  }
  pin(x = this.x, y = this.y) { this.pinned = true; this.invMass = 0; this.px = x; this.py = y; this.x = x; this.y = y; this.ox = x; this.oy = y; return this; }
  unpin(mass = 1) { this.pinned = false; this.invMass = 1 / mass; return this; }
  addForce(fx, fy) { this.ax += fx; this.ay += fy; }
  setPos(x, y) { this.x = x; this.y = y; }
  teleport(x, y) { this.x = this.ox = x; this.y = this.oy = y; }
  get vx() { return this.x - this.ox; }
  get vy() { return this.y - this.oy; }
}

export class Constraint {
  constructor(a, b, rest = null, stiffness = 1) {
    this.a = a; this.b = b;
    this.rest = rest == null ? Math.hypot(b.x - a.x, b.y - a.y) : rest;
    this.k = stiffness;
    this.broken = false;
    this.breakStrain = Infinity;  // ratio at which it snaps
    this.maxStretch = Infinity;   // hard clamp ratio
    this.strain = 1;
  }
  solve() {
    if (this.broken) return;
    const a = this.a, b = this.b;
    let dx = b.x - a.x, dy = b.y - a.y;
    let d = Math.hypot(dx, dy);
    if (d < 1e-7) return;
    this.strain = d / this.rest;
    if (this.strain > this.breakStrain) { this.broken = true; return; }
    const w = a.invMass + b.invMass;
    if (w === 0) return;
    const diff = (d - this.rest) / d * this.k;
    const ax = dx * diff * (a.invMass / w);
    const ay = dy * diff * (a.invMass / w);
    const bx = dx * diff * (b.invMass / w);
    const by = dy * diff * (b.invMass / w);
    a.x += ax; a.y += ay;
    b.x -= bx; b.y -= by;
  }
}

/** Keeps three points from folding — gives cloth and rope stiffness. */
export class BendConstraint {
  constructor(a, b, c, k = 0.12) {
    this.a = a; this.b = b; this.c = c; this.k = k;
    this.rest = Math.hypot(c.x - a.x, c.y - a.y);
    this.broken = false;
  }
  solve() {
    if (this.broken) return;
    const a = this.a, c = this.c;
    const dx = c.x - a.x, dy = c.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-7) return;
    const w = a.invMass + c.invMass;
    if (w === 0) return;
    const diff = (d - this.rest) / d * this.k;
    a.x += dx * diff * (a.invMass / w);
    a.y += dy * diff * (a.invMass / w);
    c.x -= dx * diff * (c.invMass / w);
    c.y -= dy * diff * (c.invMass / w);
  }
}

/** Preserves enclosed area — this is what makes a soft body feel inflated. */
export class AreaConstraint {
  constructor(points, k = 0.5) {
    this.pts = points;
    this.k = k;
    this.rest = Math.abs(this.area());
    this.pressure = 1;
  }
  area() {
    const p = this.pts; let a = 0;
    for (let i = 0, n = p.length; i < n; i++) {
      const q = p[(i + 1) % n];
      a += p[i].x * q.y - q.x * p[i].y;
    }
    return a * 0.5;
  }
  solve() {
    const p = this.pts, n = p.length;
    const cur = Math.abs(this.area());
    const target = this.rest * this.pressure;
    const err = (target - cur) / Math.max(1, target);
    if (Math.abs(err) < 1e-4) return;
    // push each vertex along its outward normal
    let cx = 0, cy = 0;
    for (const q of p) { cx += q.x; cy += q.y; }
    cx /= n; cy /= n;
    const s = err * this.k * 0.5;
    for (const q of p) {
      if (q.invMass === 0) continue;
      let nx = q.x - cx, ny = q.y - cy;
      const d = Math.hypot(nx, ny) || 1;
      q.x += (nx / d) * s * Math.sqrt(Math.abs(target)) * 0.5;
      q.y += (ny / d) * s * Math.sqrt(Math.abs(target)) * 0.5;
    }
  }
}

export class VerletWorld {
  constructor(opts = {}) {
    this.points = [];
    this.constraints = [];
    this.gravity = opts.gravity ?? 2400;
    this.damping = opts.damping ?? 0.992;
    this.iterations = opts.iterations ?? 6;
    this.substeps = opts.substeps ?? 2;
    this.colliders = [];       // {type:'circle'|'aabb'|'floor', ...}
    this.bounds = null;        // {x,y,w,h}
    this.wind = 0;
    this.time = 0;
  }

  add(p) { this.points.push(p); return p; }
  link(a, b, rest = null, k = 1) {
    const c = new Constraint(a, b, rest, k);
    this.constraints.push(c);
    return c;
  }
  addConstraint(c) { this.constraints.push(c); return c; }

  step(dt) {
    dt = Math.min(dt, 1 / 45);
    const h = dt / this.substeps;
    for (let s = 0; s < this.substeps; s++) this._sub(h);
    this.time += dt;
  }

  _sub(dt) {
    const g = this.gravity, damp = Math.pow(this.damping, dt * 60);
    for (const p of this.points) {
      if (p.pinned) { p.x = p.px; p.y = p.py; p.ox = p.px; p.oy = p.py; continue; }
      if (p.grabbed) { p.ox = p.x - (p.x - p.ox) * 0.5; p.oy = p.y - (p.y - p.oy) * 0.5; continue; }
      const vx = (p.x - p.ox) * damp;
      const vy = (p.y - p.oy) * damp;
      p.ox = p.x; p.oy = p.y;
      p.x += vx + (p.ax + this.wind) * dt * dt;
      p.y += vy + (p.ay + g) * dt * dt;
      p.ax = 0; p.ay = 0;
    }
    for (let i = 0; i < this.iterations; i++) {
      for (const c of this.constraints) c.solve();
      this._collide();
    }
  }

  _collide() {
    const b = this.bounds;
    for (const p of this.points) {
      if (p.pinned) continue;
      for (const c of this.colliders) {
        if (c.type === 'circle') {
          const dx = p.x - c.x, dy = p.y - c.y;
          const d = Math.hypot(dx, dy);
          if (d < c.r && d > 1e-6) {
            const s = (c.r - d) / d;
            p.x += dx * s; p.y += dy * s;
            // friction
            const fx = (p.x - p.ox), fy = (p.y - p.oy);
            p.ox = p.x - fx * (c.friction ?? 0.8);
            p.oy = p.y - fy * (c.friction ?? 0.8);
          }
        } else if (c.type === 'floor') {
          if (p.y > c.y) {
            p.y = c.y;
            const fx = (p.x - p.ox);
            p.ox = p.x - fx * (c.friction ?? 0.72);
            p.oy = p.y + (p.oy - p.y) * -(c.bounce ?? 0.12);
          }
        } else if (c.type === 'aabb') {
          if (p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h) {
            // push out along the shallowest axis
            const dl = p.x - c.x, dr = c.x + c.w - p.x;
            const dt_ = p.y - c.y, db = c.y + c.h - p.y;
            const m = Math.min(dl, dr, dt_, db);
            if (m === dt_) p.y = c.y; else if (m === db) p.y = c.y + c.h;
            else if (m === dl) p.x = c.x; else p.x = c.x + c.w;
          }
        }
      }
      if (b) {
        if (p.x < b.x) { p.x = b.x; p.ox = p.x + (p.ox - p.x) * -0.3; }
        if (p.x > b.x + b.w) { p.x = b.x + b.w; p.ox = p.x + (p.ox - p.x) * -0.3; }
        if (p.y > b.y + b.h) {
          p.y = b.y + b.h;
          const fx = p.x - p.ox;
          p.ox = p.x - fx * 0.7;
          p.oy = p.y + (p.oy - p.y) * -0.15;
        }
      }
    }
  }

  nearest(x, y, maxDist = 40, filter = null) {
    let best = null, bd = maxDist * maxDist;
    for (const p of this.points) {
      if (filter && !filter(p)) continue;
      const dx = p.x - x, dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}

// ---------------------------------------------------------------
// Factories
// ---------------------------------------------------------------

/** A rope from (x0,y0) to (x1,y1). Returns {points, constraints}. */
export function makeRope(world, x0, y0, x1, y1, segs, opts = {}) {
  const { mass = 1, stiffness = 1, pinStart = true, pinEnd = false, bend = 0 } = opts;
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = world.add(new Point(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, mass));
    pts.push(p);
  }
  if (pinStart) pts[0].pin();
  if (pinEnd) pts[segs].pin();
  const cons = [];
  for (let i = 0; i < segs; i++) cons.push(world.link(pts[i], pts[i + 1], null, stiffness));
  if (bend > 0) for (let i = 0; i < segs - 1; i++) world.addConstraint(new BendConstraint(pts[i], pts[i + 1], pts[i + 2], bend));
  return { points: pts, constraints: cons };
}

/** A rectangular cloth grid. */
export function makeCloth(world, x, y, w, h, cols, rows, opts = {}) {
  const { mass = 1, stiffness = 0.9, shear = 0.6, bend = 0.1, pinTop = true } = opts;
  const grid = [];
  const dx = w / cols, dy = h / rows;
  for (let r = 0; r <= rows; r++) {
    const row = [];
    for (let c = 0; c <= cols; c++) {
      const p = world.add(new Point(x + c * dx, y + r * dy, mass));
      if (pinTop && r === 0) p.pin();
      row.push(p);
    }
    grid.push(row);
  }
  const struct = [], diag = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      if (c < cols) struct.push(world.link(grid[r][c], grid[r][c + 1], null, stiffness));
      if (r < rows) struct.push(world.link(grid[r][c], grid[r + 1][c], null, stiffness));
      if (shear > 0 && c < cols && r < rows) {
        diag.push(world.link(grid[r][c], grid[r + 1][c + 1], null, shear));
        diag.push(world.link(grid[r + 1][c], grid[r][c + 1], null, shear));
      }
    }
  }
  if (bend > 0) {
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols - 2; c++)
      world.addConstraint(new BendConstraint(grid[r][c], grid[r][c + 1], grid[r][c + 2], bend));
    for (let c = 0; c <= cols; c++) for (let r = 0; r <= rows - 2; r++)
      world.addConstraint(new BendConstraint(grid[r][c], grid[r + 1][c], grid[r + 2][c], bend));
  }
  return { grid, struct, diag, cols, rows };
}

/** A closed soft body ring with area preservation and internal spokes. */
export function makeSoftBody(world, cx, cy, r, n, opts = {}) {
  const { mass = 1, shell = 0.9, spoke = 0.14, pressure = 1, area = 0.6 } = opts;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI / 2;
    pts.push(world.add(new Point(cx + Math.cos(a) * r, cy + Math.sin(a) * r, mass)));
  }
  for (let i = 0; i < n; i++) world.link(pts[i], pts[(i + 1) % n], null, shell);
  // long-range spokes keep it from collapsing
  const skip = Math.max(2, (n / 2) | 0);
  for (let i = 0; i < n; i++) world.link(pts[i], pts[(i + skip) % n], null, spoke);
  const q = Math.max(2, (n / 4) | 0);
  for (let i = 0; i < n; i++) world.link(pts[i], pts[(i + q) % n], null, spoke * 0.7);
  const ac = new AreaConstraint(pts, area);
  ac.pressure = pressure;
  world.addConstraint(ac);
  return { points: pts, area: ac };
}
