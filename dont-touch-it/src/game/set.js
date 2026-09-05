// ============================================================
// set.js — the shared room every chapter is exhibited in
// ------------------------------------------------------------
// One gallery. One plinth. One overhead light. Levels swap the object
// on the plinth; keeping the room identical is what makes five very
// different toys read as one product.
//
// PERFORMANCE: the room is static geometry lit by a static lamp, so it
// is rendered ONCE into cached layers at device resolution and blitted
// each frame. Exposure / warmth / tint are applied at blit time (alpha
// plus at most one grade pass) rather than by re-rasterising gradients.
// ============================================================

import { TAU, clamp, clamp01, lerp, rand, rrange, makeRng, smoothstep } from '../core/math.js';
import { Layer } from '../render/renderer.js';
import { contactShadow } from '../render/materials.js';

export class Set {
  constructor(renderer) {
    this.r = renderer;
    this.motes = [];
    this.t = 0;
    this.exposure = 1;        // 0..1 master room brightness
    this.warmth = 1;          // 1 = tungsten key, 0 = cold emergency
    this.coneStrength = 1;
    this.plinthOpacity = 1;
    this.tint = null;         // css colour graded additively over the room
    this.tintAmount = 0.12;
    this.flicker = 0;
    this.geom = null;

    this.wall = new Layer();
    this.cone = new Layer();
    this.plinth = new Layer();
  }

  build(w, h, u) {
    const topY = Math.round(h * 0.705);
    const heroR = Math.min(w * 0.300, h * 0.147);
    const plinthW = Math.min(w * 0.80, heroR * 2 * 1.62);
    this.geom = {
      w, h, u,
      cx: Math.round(w * 0.5),
      topY,
      topRx: plinthW * 0.5,
      topRy: plinthW * 0.5 * 0.185,
      plinthW,
      heroR,
      heroTop: topY - heroR * 2.35,
    };
    if (!this.motes.length) this._makeMotes();
    this._render();
    return this.geom;
  }

  _makeMotes() {
    const rng = makeRng(4242);
    this.motes = [];
    for (let i = 0; i < 46; i++) {
      this.motes.push({
        x: rng(), y: rng(),
        r: 0.4 + rng() * 1.5,
        sp: 0.05 + rng() * 0.22,
        ph: rng() * TAU,
        amp: 4 + rng() * 20,
        a: 0.1 + rng() * 0.35,
      });
    }
  }

  // ---------------------------------------------------------
  // cached rasterisation
  // ---------------------------------------------------------
  _render() {
    const G = this.geom, dpr = this.r.dpr;
    const W = Math.round(G.w * dpr), H = Math.round(G.h * dpr);
    this._renderWall(W, H, dpr);
    this._renderCone();
    this._renderPlinth(W, H, dpr);
  }

  _renderWall(W, H, dpr) {
    const G = this.geom;
    const { w, h, cx, topY } = G;
    const c = this.wall.size(W, H).ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    // base grade — ceiling dark, mid warm, floor cool
    const base = c.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#090909');
    base.addColorStop(0.40, '#101015');
    base.addColorStop(0.76, '#0d0d12');
    base.addColorStop(1, '#08080c');
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);

    // key light pool on the wall behind the plinth
    c.save();
    c.globalCompositeOperation = 'lighter';
    const gy = topY - h * 0.34;
    const g = c.createRadialGradient(cx, gy, 0, cx, gy, Math.max(w, h) * 0.66);
    g.addColorStop(0, 'rgba(255,222,178,0.21)');
    g.addColorStop(0.18, 'rgba(255,214,168,0.115)');
    g.addColorStop(0.44, 'rgba(240,196,152,0.040)');
    g.addColorStop(0.74, 'rgba(210,172,140,0.010)');
    g.addColorStop(1, 'rgba(200,164,132,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);

    // tighter pool right where the object sits
    const g2 = c.createRadialGradient(cx, topY - h * 0.09, 0, cx, topY - h * 0.09, w * 0.66);
    g2.addColorStop(0, 'rgba(255,228,190,0.10)');
    g2.addColorStop(0.5, 'rgba(255,214,170,0.026)');
    g2.addColorStop(1, 'rgba(255,214,170,0)');
    c.fillStyle = g2;
    c.fillRect(0, 0, w, h);

    // cool bounce off the floor
    const bg = c.createLinearGradient(0, h, 0, h * 0.52);
    bg.addColorStop(0, 'rgba(74,102,150,0.16)');
    bg.addColorStop(0.5, 'rgba(66,92,138,0.045)');
    bg.addColorStop(1, 'rgba(66,92,138,0)');
    c.fillStyle = bg;
    c.fillRect(0, h * 0.45, w, h * 0.55);
    c.restore();

    // wall/floor seam behind the plinth
    const hz = topY + (h - topY) * 0.40;
    const sg = c.createLinearGradient(0, hz - h * 0.11, 0, hz + h * 0.05);
    sg.addColorStop(0, 'rgba(0,0,0,0)');
    sg.addColorStop(1, 'rgba(0,0,0,0.52)');
    c.fillStyle = sg;
    c.fillRect(0, hz - h * 0.11, w, h * 0.16);

    // long, very soft unevenness.
    // Painted into a tiny buffer and upscaled: this content is pure
    // low-frequency, and a full-resolution blur costs 100x more for a
    // result nobody can tell apart.
    const soft = document.createElement('canvas');
    const SW = 96, SH = Math.round(96 * h / w);
    soft.width = SW; soft.height = SH;
    const sc = soft.getContext('2d');
    const rng = makeRng(913);
    sc.filter = 'blur(5px)';
    for (let i = 0; i < 24; i++) {
      const rr = SW * (0.10 + rng() * 0.26);
      const a = 0.012 + rng() * 0.03;
      sc.fillStyle = rng() > 0.5 ? `rgba(255,244,228,${a})` : `rgba(0,0,0,${a * 1.5})`;
      sc.beginPath();
      sc.ellipse(rng() * SW, rng() * SH, rr, rr * (0.45 + rng()), rng() * 3, 0, TAU);
      sc.fill();
    }
    sc.filter = 'none';
    c.save();
    c.globalCompositeOperation = 'overlay';
    c.imageSmoothingQuality = 'high';
    c.drawImage(soft, 0, 0, w, h);
    c.restore();

    // fine plaster tooth
    this._tooth(c, w, h);
  }

  _tooth(c, w, h) {
    const N = 256;
    const t = document.createElement('canvas');
    t.width = t.height = N;
    const tc = t.getContext('2d');
    const img = tc.createImageData(N, N);
    const d = img.data;
    const rng = makeRng(551);
    for (let i = 0; i < d.length; i += 4) {
      const v = 128 + (rng() - 0.5) * 40;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    tc.putImageData(img, 0, 0);
    c.save();
    c.globalCompositeOperation = 'overlay';
    c.globalAlpha = 0.30;
    c.fillStyle = c.createPattern(t, 'repeat');
    c.fillRect(0, 0, w, h);
    c.restore();
  }

  _renderCone() {
    const G = this.geom;
    const { w, h, cx, topY } = G;
    const S = 0.34;
    const c = this.cone.size(Math.round(w * S), Math.round(h * S)).ctx;
    c.setTransform(S, 0, 0, S, 0, 0);
    c.clearRect(0, 0, w, h);
    const topW = G.topRx * 0.15, botW = G.topRx * 1.55;
    const y0 = -h * 0.06, y1 = topY + (h - topY) * 0.34;
    c.beginPath();
    c.moveTo(cx - topW, y0);
    c.lineTo(cx + topW, y0);
    c.lineTo(cx + botW, y1);
    c.lineTo(cx - botW, y1);
    c.closePath();
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(255,232,196,0.20)');
    g.addColorStop(0.35, 'rgba(255,226,186,0.082)');
    g.addColorStop(0.72, 'rgba(255,220,180,0.026)');
    g.addColorStop(1, 'rgba(255,216,176,0)');
    c.fillStyle = g;
    c.filter = 'blur(7px)';
    c.fill();
    c.filter = 'none';
  }

  _renderPlinth(W, H, dpr) {
    const G = this.geom;
    const { w, h, u, cx, topY, topRx, topRy } = G;
    const c = this.plinth.size(W, H).ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    const halfW = topRx;
    const botY = h + u * 8;
    const taper = u * 0.9;

    // floor shadow under the plinth
    const fs = c.createLinearGradient(0, topY + (h - topY) * 0.3, 0, h);
    fs.addColorStop(0, 'rgba(0,0,0,0)');
    fs.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = fs;
    c.fillRect(0, topY, w, h - topY);

    // body
    c.beginPath();
    c.moveTo(cx - halfW, topY);
    c.lineTo(cx + halfW, topY);
    c.lineTo(cx + halfW + taper, botY);
    c.lineTo(cx - halfW - taper, botY);
    c.closePath();
    const bg = c.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
    bg.addColorStop(0, '#0e0f12');
    bg.addColorStop(0.10, '#1a1c21');
    bg.addColorStop(0.30, '#2e3138');
    bg.addColorStop(0.47, '#3a3e46');
    bg.addColorStop(0.62, '#2a2d34');
    bg.addColorStop(0.84, '#16181c');
    bg.addColorStop(1, '#0b0c0e');
    c.fillStyle = bg;
    c.fill();

    c.save();
    c.clip();
    const vg = c.createLinearGradient(0, topY, 0, botY);
    vg.addColorStop(0, 'rgba(255,236,208,0.10)');
    vg.addColorStop(0.10, 'rgba(0,0,0,0)');
    vg.addColorStop(0.55, 'rgba(0,0,0,0.42)');
    vg.addColorStop(1, 'rgba(0,0,0,0.92)');
    c.fillStyle = vg;
    c.fillRect(cx - halfW - taper, topY, G.plinthW + taper * 2, botY - topY);

    // stone veining — again painted small and upscaled
    const vein = document.createElement('canvas');
    const VW = 72, VH = 120;
    vein.width = VW; vein.height = VH;
    const vc = vein.getContext('2d');
    const rng = makeRng(1201);
    vc.filter = 'blur(1.6px)';
    for (let i = 0; i < 16; i++) {
      vc.strokeStyle = rng() > 0.5 ? `rgba(255,255,255,${0.03 + rng() * 0.05})` : `rgba(0,0,0,${0.04 + rng() * 0.07})`;
      vc.lineWidth = 0.5 + rng() * 2.2;
      vc.beginPath();
      let x = rng() * VW;
      vc.moveTo(x, 0);
      for (let k = 1; k <= 4; k++) { x += (rng() - 0.5) * 14; vc.lineTo(x, VH * (k / 4)); }
      vc.stroke();
    }
    vc.filter = 'none';
    c.globalCompositeOperation = 'overlay';
    c.drawImage(vein, cx - halfW - taper, topY, G.plinthW + taper * 2, botY - topY);
    c.restore();

    // top surface
    c.beginPath();
    c.ellipse(cx, topY, topRx, topRy, 0, 0, TAU);
    const tg = c.createRadialGradient(cx - topRx * 0.22, topY - topRy * 0.5, topRy * 0.06, cx, topY, topRx);
    tg.addColorStop(0, '#7d7c84');
    tg.addColorStop(0.42, '#5c5b63');
    tg.addColorStop(0.78, '#37373d');
    tg.addColorStop(1, '#212126');
    c.fillStyle = tg;
    c.fill();

    c.save();
    c.clip();
    c.globalCompositeOperation = 'lighter';
    const lp = c.createRadialGradient(cx, topY - topRy * 0.35, 0, cx, topY, topRx * 0.95);
    lp.addColorStop(0, 'rgba(255,226,184,0.20)');
    lp.addColorStop(0.55, 'rgba(255,214,170,0.05)');
    lp.addColorStop(1, 'rgba(255,214,170,0)');
    c.fillStyle = lp;
    c.fillRect(cx - topRx, topY - topRy, topRx * 2, topRy * 2);
    c.restore();

    c.beginPath();
    c.ellipse(cx, topY, topRx - 0.4, topRy - 0.4, 0, Math.PI * 1.02, Math.PI * 1.98);
    c.strokeStyle = 'rgba(255,238,212,0.42)';
    c.lineWidth = Math.max(1, u * 0.13);
    c.stroke();
    c.beginPath();
    c.ellipse(cx, topY, topRx - 0.4, topRy - 0.4, 0, 0.05, Math.PI * 0.95);
    c.strokeStyle = 'rgba(0,0,0,0.45)';
    c.lineWidth = Math.max(1, u * 0.11);
    c.stroke();
  }

  // ---------------------------------------------------------
  // per-frame
  // ---------------------------------------------------------
  update(dt) { this.t += dt; }

  get lit() {
    return this.exposure * (1 - this.flicker * (0.35 + 0.65 * Math.abs(Math.sin(this.t * 37))));
  }

  drawBackdrop(ctx) {
    const G = this.geom; if (!G) return;
    const e = this.lit;
    ctx.fillStyle = '#07070a';
    ctx.fillRect(0, 0, G.w, G.h);
    ctx.save();
    ctx.globalAlpha = clamp01(0.10 + e * 0.90);
    ctx.drawImage(this.wall.canvas, 0, 0, G.w, G.h);
    ctx.restore();
    if (this.warmth < 0.96 || this.tint) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (this.warmth < 0.96) {
        ctx.fillStyle = `rgba(52,84,148,${(1 - this.warmth) * 0.14 * (0.35 + e)})`;
        ctx.fillRect(0, 0, G.w, G.h);
      }
      if (this.tint) {
        ctx.fillStyle = this.tint;
        ctx.globalAlpha = this.tintAmount;
        ctx.fillRect(0, 0, G.w, G.h);
      }
      ctx.restore();
    }
  }

  drawLightCone(ctx) {
    const G = this.geom; if (!G) return;
    const a = this.coneStrength * this.lit;
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp01(a);
    ctx.drawImage(this.cone.canvas, 0, 0, G.w, G.h);
    ctx.restore();
  }

  drawPlinth(ctx) {
    const G = this.geom; if (!G) return;
    const a = this.plinthOpacity * clamp01(0.10 + this.lit * 0.9);
    if (a <= 0.005) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.drawImage(this.plinth.canvas, 0, 0, G.w, G.h);
    ctx.restore();
  }

  drawAtmosphere(ctx) {
    const G = this.geom; if (!G) return;
    const { w, h } = G;
    const e = this.lit;
    if (e <= 0.03) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const drift = (this.t * m.sp * 0.05) % 1;
      const yy = (((m.y - drift) % 1) + 1) % 1 * h;
      const x = m.x * w + Math.sin(this.t * m.sp * 0.7 + m.ph * 1.7) * m.amp;
      const inCone = 1 - clamp01(Math.abs(x - G.cx) / (G.topRx * 2.0));
      const a = m.a * e * (0.16 + inCone * 0.95);
      if (a < 0.02) continue;
      ctx.fillStyle = `rgba(255,238,210,${a})`;
      ctx.beginPath(); ctx.arc(x, yy, m.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  shadow(ctx, x, y, rx, ry, opts) {
    contactShadow(ctx, x, y, rx, ry, { strength: 0.66 * this.lit, ...opts });
  }
}
