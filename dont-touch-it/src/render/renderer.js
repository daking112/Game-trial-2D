// ============================================================
// renderer.js — canvas surface, layer pool, post FX
// ------------------------------------------------------------
// The world is drawn into a full-res buffer. Emissive elements are
// additionally drawn into a low-res "glow" buffer which is blurred and
// screen-composited to fake bloom. Finally we composite grain, vignette
// and a slight chromatic fringe. Everything is budgeted for 60fps on
// mid-tier phones; see quality tiers below.
// ============================================================

import { clamp, clamp01, lerp, rand } from '../core/math.js';

export class Layer {
  constructor(w = 1, h = 1) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.max(1, w | 0);
    this.canvas.height = Math.max(1, h | 0);
    this.ctx = this.canvas.getContext('2d');
  }
  size(w, h) {
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    return this;
  }
  clear() { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); return this; }
}

/**
 * `refract` gates effects that need an offscreen copy of the scene —
 * chiefly the glass in Chapter I. It is the first thing to go when a
 * device can't hold frame, because it is the only effect whose cost is
 * driven by surface bandwidth rather than by how much we draw.
 */
export const QUALITY = {
  high:   { bloom: true, bloomScale: 0.28, grain: true,  shadows: 'soft', dprCap: 2.6, aberration: true,  blurPasses: 2, refract: true },
  medium: { bloom: true, bloomScale: 0.22, grain: true,  shadows: 'soft', dprCap: 2.0, aberration: false, blurPasses: 1, refract: false },
  low:    { bloom: true, bloomScale: 0.18, grain: false, shadows: 'hard', dprCap: 1.5, aberration: false, blurPasses: 1, refract: false },
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    // NOTE: no `desynchronized` here. It shaves a frame of latency, but it
    // can put the canvas behind a swap chain, and levels that refract the
    // scene through glass read this surface back mid-frame — which on a
    // desynchronized context costs tens of milliseconds instead of one.
    this.ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });
    this.dpr = 1;
    this.w = 0; this.h = 0;          // CSS pixels
    this.u = 0;                       // layout unit = min(w,h)/100
    this.quality = QUALITY.high;
    this.qualityName = 'high';

    // buffers
    this.glow = new Layer();          // emissive accumulation (low res)
    this.blurA = new Layer();
    this.blurB = new Layer();
    this.shadow = new Layer();        // scratch for soft shadow casting
    this.scratch = new Layer();       // general-purpose full-res scratch
    this.grainTile = null;
    this.grainSeeds = [];
    this.grainIndex = 0;

    this._pool = [];
    this.frame = 0;
    this._makeGrain();
  }

  setQuality(name) {
    if (!QUALITY[name]) return;
    this.qualityName = name;
    this.quality = QUALITY[name];
    this.resize(true);
  }

  resize(force = false) {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || window.innerWidth));
    const h = Math.max(1, Math.round(rect.height || window.innerHeight));
    const dpr = clamp(window.devicePixelRatio || 1, 1, this.quality.dprCap);
    if (!force && w === this.w && h === this.h && dpr === this.dpr) return false;
    this.w = w; this.h = h; this.dpr = dpr;
    this.u = Math.min(w, h) / 100;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const gs = this.quality.bloomScale;
    this.glow.size(w * gs, h * gs);
    this.blurA.size(w * gs, h * gs);
    this.blurB.size(w * gs, h * gs);
    this.shadow.size(w * 0.5, h * 0.5);
    this.scratch.size(w * dpr, h * dpr);
    for (const l of this._pool) l.size(w * dpr, h * dpr);
    return true;
  }

  /** Acquire a full-res scratch layer (pooled, cleared). */
  acquire() {
    const l = this._pool.pop() || new Layer(this.canvas.width, this.canvas.height);
    l.size(this.canvas.width, this.canvas.height);
    l.clear();
    l.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return l;
  }
  release(l) { if (this._pool.length < 4) this._pool.push(l); }

  /** Begin a frame: reset transform to CSS-pixel space. */
  begin(clearColor = '#08080a') {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.filter = 'none';
    if (clearColor) { c.fillStyle = clearColor; c.fillRect(0, 0, this.w, this.h); }
    // reset the glow buffer for this frame
    const g = this.glow.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.glow.canvas.width, this.glow.canvas.height);
    const s = this.quality.bloomScale;
    g.setTransform(s, 0, 0, s, 0, 0);
    this.frame++;
  }

  /** Draw emissive shapes here (CSS px coords) — they bloom. */
  get glowCtx() { return this.glow.ctx; }

  /**
   * Composite bloom over the main buffer.
   * strength: 0..2
   */
  applyBloom(strength = 1) {
    if (!this.quality.bloom || strength <= 0) return;
    const gs = this.quality.bloomScale;
    const gw = this.glow.canvas.width, gh = this.glow.canvas.height;
    const a = this.blurA, b = this.blurB;
    a.size(gw, gh); b.size(gw, gh);

    a.ctx.setTransform(1, 0, 0, 1, 0, 0);
    a.ctx.clearRect(0, 0, gw, gh);
    a.ctx.filter = `blur(${Math.max(1.5, gw * 0.012)}px)`;
    a.ctx.drawImage(this.glow.canvas, 0, 0);
    a.ctx.filter = 'none';

    let src = a;
    if (this.quality.blurPasses > 1) {
      b.ctx.setTransform(1, 0, 0, 1, 0, 0);
      b.ctx.clearRect(0, 0, gw, gh);
      b.ctx.filter = `blur(${Math.max(3, gw * 0.03)}px)`;
      b.ctx.drawImage(a.canvas, 0, 0);
      b.ctx.filter = 'none';
      // combine tight + wide
      a.ctx.globalCompositeOperation = 'lighter';
      a.ctx.globalAlpha = 0.85;
      a.ctx.drawImage(b.canvas, 0, 0);
      a.ctx.globalAlpha = 1;
      a.ctx.globalCompositeOperation = 'source-over';
      src = a;
    }

    const c = this.ctx;
    c.save();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = clamp01(0.85 * strength);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(src.canvas, 0, 0, this.w, this.h);
    c.restore();
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  _makeGrain() {
    // Pre-render a few tiles of monochrome noise, cycled per frame so grain
    // animates without per-frame ImageData cost.
    const N = 96;
    const tiles = [];
    for (let t = 0; t < 3; t++) {
      const l = new Layer(N, N);
      const img = l.ctx.createImageData(N, N);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = 128 + (rand() - 0.5) * 255;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      l.ctx.putImageData(img, 0, 0);
      tiles.push(l.canvas);
    }
    this.grainTiles = tiles;
  }

  applyGrain(amount = 0.035) {
    if (!this.quality.grain || amount <= 0) return;
    const c = this.ctx;
    const idx = this.frame % this.grainTiles.length;
    const tile = this.grainTiles[idx];
    if (!this._grainPats) this._grainPats = [];
    if (!this._grainPats[idx]) this._grainPats[idx] = c.createPattern(tile, 'repeat');
    const pat = this._grainPats[idx];
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'overlay';
    c.globalAlpha = amount;
    // jitter the pattern so grain never appears static
    const ox = (this.frame * 37) % 96, oy = (this.frame * 53) % 96;
    c.translate(-ox, -oy);
    c.fillStyle = pat;
    c.fillRect(0, 0, this.canvas.width + 96, this.canvas.height + 96);
    c.restore();
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  applyVignette(strength = 0.55, warmth = 0) {
    const c = this.ctx;
    c.save();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const cx = this.w * 0.5, cy = this.h * 0.5;
    const r = Math.hypot(cx, cy);
    const g = c.createRadialGradient(cx, cy * 0.94, r * 0.30, cx, cy, r * 1.02);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.58, `rgba(0,0,0,${strength * 0.16})`);
    g.addColorStop(0.84, `rgba(4,3,8,${strength * 0.55})`);
    g.addColorStop(1, `rgba(${warmth ? 12 : 2},0,${warmth ? 4 : 8},${strength})`);
    c.fillStyle = g;
    c.fillRect(0, 0, this.w, this.h);
    // faint cool fringe in the extreme corners — reads as lens, costs one fill
    const cg = c.createRadialGradient(cx, cy, r * 0.72, cx, cy, r * 1.05);
    cg.addColorStop(0, 'rgba(90,120,190,0)');
    cg.addColorStop(1, `rgba(90,120,190,${strength * 0.10})`);
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = cg;
    c.fillRect(0, 0, this.w, this.h);
    c.restore();
  }

  /** Cheap edge chromatic fringe — sells "lens" without a shader. */
  applyAberration(amount = 1) {
    if (!this.quality.aberration || amount <= 0) return;
    const c = this.canvas, ctx = this.ctx;
    const s = this.scratch;
    s.size(c.width, c.height);
    s.ctx.setTransform(1, 0, 0, 1, 0, 0);
    s.ctx.clearRect(0, 0, c.width, c.height);
    s.ctx.drawImage(c, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.07 * amount;
    const d = 1.4 * amount * this.dpr;
    // red pushed out, blue pulled in — only visible at the frame edges thanks
    // to the mask-ish falloff of the vignette drawn afterwards
    ctx.drawImage(s.canvas, -d, 0, c.width + d * 2, c.height);
    ctx.globalAlpha = 0.05 * amount;
    ctx.drawImage(s.canvas, d * 0.6, 0, c.width - d * 1.2, c.height);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

/**
 * Auto quality.
 *
 * Two signals, because they fail differently:
 *  - `drawMs` is our own JS render time. It is what we control, and it is
 *    the only signal that is meaningful on a machine whose compositor is
 *    slow for reasons unrelated to us (a software rasteriser, a busy tab).
 *  - frame delta catches everything else: compositing, GC, thermal
 *    throttling, another app stealing the GPU.
 *
 * Stepping DOWN is fast (about three quarters of a second) because a
 * player feels a bad frame immediately. Stepping UP is slow and requires
 * a lot of headroom, because oscillating between tiers is worse than
 * simply running one tier lower.
 */
export class QualityGovernor {
  constructor(renderer) {
    this.r = renderer;
    this.order = ['high', 'medium', 'low'];
    this.dt = [];
    this.draw = [];
    this.cooldown = 1.2;         // seconds to settle after load before judging
    this.window = 0;             // seconds accumulated in the current sample
    this.locked = false;
    this.upStreak = 0;
  }

  /**
   * Call once per frame with the real frame delta and our draw time.
   * Windows are measured in SECONDS, not frames: a device that is
   * struggling produces fewer frames, and counting frames would make the
   * governor slowest to react exactly when it is needed most.
   */
  sample(dt, drawMs = 0) {
    if (this.locked) return;
    if (this.cooldown > 0) { this.cooldown -= dt; this.dt.length = 0; this.draw.length = 0; return; }
    this.dt.push(dt);
    this.draw.push(drawMs);
    this.window += dt;
    if (this.window < 0.75) return;
    this.window = 0;

    const p = (arr, q) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, (a.length * q) | 0)]; };
    const dtP90 = p(this.dt, 0.9);
    const drawP90 = p(this.draw, 0.9);
    this.dt.length = 0; this.draw.length = 0;

    const i = this.order.indexOf(this.r.qualityName);
    // 16.7ms is the budget; 8ms of it is ours at most
    const struggling = drawP90 > 8 || dtP90 > 0.0245;
    if (struggling && i < this.order.length - 1) {
      this.r.setQuality(this.order[i + 1]);
      this.cooldown = 0.8;
      this.upStreak = 0;
      return;
    }
    // plenty of room, and it has stayed that way for a while
    if (!struggling && drawP90 < 3.2 && dtP90 < 0.019 && i > 0) {
      if (++this.upStreak >= 6) {
        this.r.setQuality(this.order[i - 1]);
        this.cooldown = 2.0;
        this.upStreak = 0;
      }
    } else {
      this.upStreak = 0;
    }
  }
}
