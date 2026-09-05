// ============================================================
// input.js — multi-touch pointer tracking + gesture primitives
// ------------------------------------------------------------
// Design goals:
//  * zero perceptible latency — we consume coalesced events and never
//    defer position updates to the next frame
//  * everything a level needs to feel physical: velocity, travel,
//    hold duration, per-pointer angular delta about an arbitrary pivot
//  * pointer capture so a drag never "falls off" the element
// ============================================================

import { clamp, TAU, wrapAngle } from './math.js';

let _uid = 0;

export class Pointer {
  constructor(id, x, y, e) {
    this.id = id;
    this.uid = ++_uid;
    this.x = x; this.y = y;
    this.px = x; this.py = y;      // previous frame
    this.sx = x; this.sy = y;      // start
    this.lx = x; this.ly = y;      // last event (for velocity)
    this.vx = 0; this.vy = 0;      // px/s, smoothed
    this.down = true;
    this.t0 = performance.now() / 1000;
    this.tLast = this.t0;
    this.travel = 0;               // total path length
    this.maxTravel = 0;            // max distance from start
    this.pressure = e && e.pressure ? e.pressure : 0.5;
    this.type = e ? e.pointerType : 'touch';
    this.claimedBy = null;         // levels tag pointers to avoid double-handling
    this.data = {};                // scratch for whatever claimed it
    this._angle = 0;               // running angle about a pivot
    this._hasAngle = false;
  }
  get age() { return performance.now() / 1000 - this.t0; }
  get dx() { return this.x - this.px; }
  get dy() { return this.y - this.py; }
  get sdx() { return this.x - this.sx; }
  get sdy() { return this.y - this.sy; }
  get speed() { return Math.hypot(this.vx, this.vy); }
  get fromStart() { return Math.hypot(this.x - this.sx, this.y - this.sy); }

  /** Accumulated rotation (radians, signed) about a pivot since last call. */
  angleAbout(cx, cy) {
    const a = Math.atan2(this.y - cy, this.x - cx);
    if (!this._hasAngle) { this._angle = a; this._hasAngle = true; return 0; }
    const d = wrapAngle(a - this._angle);
    this._angle = a;
    return d;
  }
  resetAngle() { this._hasAngle = false; }
}

export class Input {
  constructor(el) {
    this.el = el;
    this.map = new Map();
    this.list = [];
    this.taps = [];          // consumed once per frame by the level
    this.releases = [];
    this.presses = [];
    this.enabled = true;
    this.lastActivity = performance.now() / 1000;
    this._bind();
  }

  _bind() {
    const opt = { passive: false };
    this.el.addEventListener('pointerdown', this._down = (e) => this.onDown(e), opt);
    window.addEventListener('pointermove', this._move = (e) => this.onMove(e), opt);
    window.addEventListener('pointerup', this._up = (e) => this.onUp(e), opt);
    window.addEventListener('pointercancel', this._up, opt);
    this.el.addEventListener('contextmenu', e => e.preventDefault());
    this.el.addEventListener('touchstart', e => e.preventDefault(), opt);
    this.el.addEventListener('gesturestart', e => e.preventDefault(), opt);
    window.addEventListener('blur', () => this.clear());
  }

  destroy() {
    this.el.removeEventListener('pointerdown', this._down);
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up);
    window.removeEventListener('pointercancel', this._up);
  }

  _pos(e) {
    const r = this.el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  onDown(e) {
    if (!this.enabled) return;
    e.preventDefault();
    const [x, y] = this._pos(e);
    const p = new Pointer(e.pointerId, x, y, e);
    this.map.set(e.pointerId, p);
    this._sync();
    this.presses.push(p);
    this.lastActivity = performance.now() / 1000;
    try { this.el.setPointerCapture(e.pointerId); } catch (_) {}
  }

  onMove(e) {
    const p = this.map.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const now = performance.now() / 1000;
    // consume coalesced samples so fast flicks keep full fidelity
    const evts = (e.getCoalescedEvents && e.getCoalescedEvents()) || [e];
    for (const ev of evts) {
      const [x, y] = this._pos(ev);
      const dt = Math.max(1 / 480, now - p.tLast);
      const dx = x - p.lx, dy = y - p.ly;
      const k = 1 - Math.exp(-22 * dt);
      p.vx += ((dx / dt) - p.vx) * k;
      p.vy += ((dy / dt) - p.vy) * k;
      p.travel += Math.hypot(dx, dy);
      p.lx = x; p.ly = y;
      p.x = x; p.y = y;
      p.tLast = now;
    }
    p.pressure = e.pressure || p.pressure;
    p.maxTravel = Math.max(p.maxTravel, p.fromStart);
    this.lastActivity = now;
  }

  onUp(e) {
    const p = this.map.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    p.down = false;
    // decay stale velocity: a finger resting before lift should not fling
    const now = performance.now() / 1000;
    if (now - p.tLast > 0.09) { p.vx = 0; p.vy = 0; }
    this.map.delete(e.pointerId);
    this._sync();
    this.releases.push(p);
    if (p.maxTravel < 12 && p.age < 0.45) this.taps.push(p);
    try { this.el.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  clear() {
    for (const p of this.map.values()) { p.down = false; this.releases.push(p); }
    this.map.clear();
    this._sync();
  }

  _sync() { this.list = [...this.map.values()]; }

  get count() { return this.list.length; }
  get primary() { return this.list[0] || null; }

  /** First unclaimed pointer whose current position satisfies `test`. */
  find(test, tag = null) {
    for (const p of this.list) {
      if (p.claimedBy && p.claimedBy !== tag) continue;
      if (test(p)) return p;
    }
    return null;
  }
  /** All pointers claimed by `tag`. */
  claimed(tag) { return this.list.filter(p => p.claimedBy === tag); }

  /** Call at the end of every frame. */
  endFrame() {
    for (const p of this.list) { p.px = p.x; p.py = p.y; }
    this.taps.length = 0;
    this.releases.length = 0;
    this.presses.length = 0;
  }

  /** Idle seconds since last input — used to surface hints. */
  idle() { return performance.now() / 1000 - this.lastActivity; }
}

/** Pinch state between two pointers. */
export function pinch(a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const d0 = Math.hypot(b.sx - a.sx, b.sy - a.sy);
  return {
    dist: d,
    start: d0,
    scale: d0 > 0 ? d / d0 : 1,
    cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}
