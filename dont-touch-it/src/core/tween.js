// ============================================================
// tween.js — tiny time-based animation + scheduler
// ============================================================
import { Ease, clamp01, lerp } from './math.js';

export class Timeline {
  constructor() { this.items = []; this.timers = []; this.t = 0; }

  /** to(obj,'prop', value, dur, easeName, delay) */
  to(obj, key, to, dur, ease = 'outCubic', delay = 0) {
    const it = { obj, key, from: null, to, dur, ease: typeof ease === 'function' ? ease : Ease[ease] || Ease.outCubic, delay, t: 0, done: false, onEnd: null };
    this.items.push(it);
    return { then: (fn) => { it.onEnd = fn; return this; } };
  }
  from(obj, key, from, dur, ease = 'outCubic', delay = 0) {
    const to = obj[key];
    obj[key] = from;
    return this.to(obj, key, to, dur, ease, delay);
  }
  after(delay, fn) { this.timers.push({ t: 0, delay, fn }); return this; }
  every(interval, fn, count = Infinity) {
    this.timers.push({ t: 0, delay: interval, fn, interval, count });
    return this;
  }
  cancel(obj, key) {
    this.items = this.items.filter(i => !(i.obj === obj && (key == null || i.key === key)));
  }
  clear() { this.items.length = 0; this.timers.length = 0; }

  update(dt) {
    this.t += dt;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.delay > 0) { it.delay -= dt; if (it.delay > 0) continue; }
      if (it.from === null) it.from = it.obj[it.key];
      it.t += dt;
      const k = it.dur <= 0 ? 1 : clamp01(it.t / it.dur);
      it.obj[it.key] = lerp(it.from, it.to, it.ease(k));
      if (k >= 1) { this.items.splice(i, 1); if (it.onEnd) it.onEnd(); }
    }
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t += dt;
      if (tm.t >= tm.delay) {
        tm.fn();
        if (tm.interval && --tm.count > 0) { tm.t -= tm.delay; }
        else this.timers.splice(i, 1);
      }
    }
  }
}

/** A 0..1 value that eases toward a target every frame. */
export class Smooth {
  constructor(v = 0, rate = 10) { this.v = v; this.target = v; this.rate = rate; }
  set(t) { this.target = t; return this; }
  snap(t) { this.v = this.target = t; return this; }
  update(dt) { this.v += (this.target - this.v) * (1 - Math.exp(-this.rate * dt)); return this.v; }
}

/** A one-shot 0→1 ramp you can fire and read. */
export class Pulse {
  constructor(dur = 0.4, ease = Ease.outCubic) { this.dur = dur; this.ease = ease; this.t = Infinity; }
  fire(dur) { if (dur) this.dur = dur; this.t = 0; return this; }
  get active() { return this.t < this.dur; }
  get k() { return this.t >= this.dur ? 1 : this.ease(this.t / this.dur); }
  /** 1 at fire, decaying to 0. */
  get decay() { return this.t >= this.dur ? 0 : 1 - this.ease(this.t / this.dur); }
  update(dt) { if (this.t < this.dur) this.t += dt; return this; }
}
