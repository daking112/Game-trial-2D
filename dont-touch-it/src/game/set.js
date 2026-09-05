// ============================================================
// set.js — the shared room every chapter is exhibited in
// ------------------------------------------------------------
// One gallery. One plinth. One overhead light. One floor. Levels swap
// the object on the plinth; keeping the room identical is what makes
// five very different toys read as one product.
//
// PERFORMANCE: the room is static geometry lit by a static lamp, so it
// is rendered ONCE into cached layers at device resolution and blitted
// each frame. Exposure / warmth / tint are applied at blit time (alpha
// plus at most one grade pass) rather than by re-rasterising gradients.
//
// ------------------------------------------------------------
// THE CAMERA — read this before you place anything in the room
// ------------------------------------------------------------
// The room is photographed dead-on with a longish lens (~135mm eq.):
// the camera sits on the plinth's vertical axis, a little above the
// plinth top, about four plinth-widths away. Two consequences you must
// respect or your chapter will read as a collage:
//
//   * Every horizontal circle in the room projects to an ellipse that
//     is SYMMETRIC about x = geom.cx. Do not draw turned/sheared
//     ellipses on the plinth top.
//   * You cannot see a side face of a box you are standing square in
//     front of. The plinth therefore shows a top face and a front face
//     only; the "turned" read comes from the chamfered vertical
//     arrises, which is what a real honed-stone plinth gives you.
//
// The foreshortening constant for anything lying on the plinth top is
// `geom.topRy / geom.topRx` (~0.29). Use it for every ellipse you put
// up there so your object shares the room's perspective.
//
// ------------------------------------------------------------
// geom — the contract levels build against
// ------------------------------------------------------------
//   w, h, u          viewport in CSS px; u = min(w,h)/100
//   cx               horizontal centre of the room (and of the plinth)
//   topY             y of the CENTRE of the plinth's top face
//   topRx, topRy     semi-axes of the largest ellipse that fits on the
//                    top face, centred at (cx, topY). Elliptical tops.
//   plinthW          full width of the plinth's FRONT edge
//   heroR            radius the room expects your hero to occupy
//   heroTop          y the room expects the top of your hero at
//   floorY           y of the wall/floor seam (the room's horizon)
//   baseY            y where the plinth meets the floor
//   plinth           the rectangular footprint, for levels that want to
//                    align to the box rather than to an ellipse:
//                      { halfW, k, yTop, yBack, yBase, yBaseBack,
//                        horizonY }
//                    `k` is the perspective ratio (back edge width /
//                    front edge width); the top face is the trapezoid
//                      (cx±halfW,   yTop)  front
//                      (cx±halfW*k, yBack) back
//                    and the front face is the exact rectangle
//                      (cx-halfW, yTop) .. (cx+halfW, yBase).
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
    // --- camera solve -------------------------------------------------
    // Everything below is derived from four numbers so the box, its
    // shadow, its reflection and the floor all share one projection.
    const topY = Math.round(h * 0.615);
    const heroR = Math.min(w * 0.268, h * 0.132);
    const plinthW = Math.min(w * 0.795, heroR * 2 * 1.485);
    const halfW = plinthW * 0.5;
    const K = 0.82;                                  // back width / front width
    const topRy = Math.max(4, Math.round(halfW * 0.268));
    const baseY = Math.round(h * 0.955);

    const yTop = topY + topRy;                       // front edge of the top face
    const yBack = topY - topRy;                      // back edge of the top face
    // horizon (eye level) that makes the trapezoid and the box agree
    const horizonY = yTop - (topRy * 2) / (1 - K);
    const yBaseBack = horizonY + K * (baseY - horizonY);
    const floorY = Math.round(h * 0.625);            // wall/floor seam

    this.geom = {
      w, h, u,
      cx: Math.round(w * 0.5),
      topY,
      // widest ellipse that fits the trapezoid, measured at y = topY
      topRx: halfW * (1 + K) * 0.5,
      topRy,
      plinthW,
      heroR,
      heroTop: topY - heroR * 2.35,
      floorY,
      baseY,
      plinth: { halfW, k: K, yTop, yBack, yBase: baseY, yBaseBack, horizonY },
    };
    if (!this.motes.length) this._makeMotes();
    this._render();
    return this.geom;
  }

  _makeMotes() {
    const rng = makeRng(4242);
    this.motes = [];
    for (let i = 0; i < 34; i++) {
      this.motes.push({
        x: rng(), y: rng(),
        r: 0.35 + rng() * 0.95,
        sp: 0.05 + rng() * 0.22,
        ph: rng() * TAU,
        amp: 4 + rng() * 20,
        a: 0.06 + rng() * 0.22,
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

    // base grade — neutral, cool, deliberately dark. All the warmth in
    // the room comes from the lamp, never from the paint.
    const base = c.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#08080b');
    base.addColorStop(0.40, '#101118');
    base.addColorStop(0.78, '#0c0d13');
    base.addColorStop(1, '#08080c');
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);

    // key light pool on the wall behind the plinth
    c.save();
    c.globalCompositeOperation = 'lighter';
    const gy = topY - h * 0.30;
    const g = c.createRadialGradient(cx, gy, 0, cx, gy, Math.max(w, h) * 0.60);
    g.addColorStop(0, 'rgba(255,220,174,0.20)');
    g.addColorStop(0.18, 'rgba(255,212,164,0.108)');
    g.addColorStop(0.44, 'rgba(238,192,148,0.036)');
    g.addColorStop(0.74, 'rgba(206,168,136,0.009)');
    g.addColorStop(1, 'rgba(196,160,128,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);

    // tighter pool right where the object sits
    const g2 = c.createRadialGradient(cx, topY - h * 0.13, 0, cx, topY - h * 0.13, w * 0.60);
    g2.addColorStop(0, 'rgba(255,228,190,0.095)');
    g2.addColorStop(0.5, 'rgba(255,214,170,0.024)');
    g2.addColorStop(1, 'rgba(255,214,170,0)');
    c.fillStyle = g2;
    c.fillRect(0, 0, w, h);

    // cool bounce off the floor, on to the lower wall
    const bg = c.createLinearGradient(0, G.floorY, 0, G.floorY - h * 0.26);
    bg.addColorStop(0, 'rgba(78,104,150,0.13)');
    bg.addColorStop(0.5, 'rgba(66,92,138,0.038)');
    bg.addColorStop(1, 'rgba(66,92,138,0)');
    c.fillStyle = bg;
    c.fillRect(0, G.floorY - h * 0.26, w, h * 0.26);
    c.restore();

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
      const a = 0.010 + rng() * 0.026;
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

    // the ground the whole room stands on
    this._renderFloor(c);

    // fine plaster tooth over everything
    this._tooth(c, w, h);
  }

  // ---------------------------------------------------------
  // Floor: honed dark concrete. Nearly matte, but wet-looking at
  // grazing angles near the seam, which is what sells "big room".
  // ---------------------------------------------------------
  _renderFloor(c) {
    const G = this.geom;
    const { w, h, cx } = G;
    const sy = G.floorY;
    const fh = h - sy;

    c.save();
    c.beginPath(); c.rect(0, sy, w, fh); c.clip();

    // the plane itself — cooler and darker than the wall
    const g = c.createLinearGradient(0, sy, 0, h);
    g.addColorStop(0, '#08090d');
    g.addColorStop(0.16, '#0d0e14');
    g.addColorStop(0.62, '#0b0c11');
    g.addColorStop(1, '#06060a');
    c.fillStyle = g;
    c.fillRect(0, sy, w, fh);

    c.globalCompositeOperation = 'lighter';

    // grazing sheen: the floor mirrors the lit wall in a vertical smear
    // that is strongest immediately below the seam.
    const sh = c.createLinearGradient(0, sy, 0, sy + fh * 0.62);
    sh.addColorStop(0, 'rgba(150,132,110,0.20)');
    sh.addColorStop(0.22, 'rgba(126,110,92,0.085)');
    sh.addColorStop(0.6, 'rgba(96,86,80,0.022)');
    sh.addColorStop(1, 'rgba(90,84,80,0)');
    const shMask = c.createRadialGradient(cx, sy, 0, cx, sy, w * 0.72);
    shMask.addColorStop(0, 'rgba(255,255,255,1)');
    shMask.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sh;
    c.fillRect(0, sy, w, fh * 0.62);

    // the downlight pool landing on the floor around the plinth
    const py = sy + fh * 0.70;
    const pool = c.createRadialGradient(cx, py, 0, cx, py, w * 0.80);
    pool.addColorStop(0, 'rgba(255,222,178,0.105)');
    pool.addColorStop(0.34, 'rgba(250,208,164,0.045)');
    pool.addColorStop(0.68, 'rgba(226,184,146,0.011)');
    pool.addColorStop(1, 'rgba(220,180,142,0)');
    c.save();
    c.translate(cx, py); c.scale(1, 0.52); c.translate(-cx, -py);
    c.fillStyle = pool;
    c.fillRect(cx - w, py - h, w * 2, h * 2);
    c.restore();

    c.globalCompositeOperation = 'source-over';

    // the seam: floor sits in the wall's own contact shadow
    const seam = c.createLinearGradient(0, sy - fh * 0.10, 0, sy + fh * 0.30);
    seam.addColorStop(0, 'rgba(0,0,0,0)');
    seam.addColorStop(0.42, 'rgba(0,0,0,0.55)');
    seam.addColorStop(0.52, 'rgba(0,0,0,0.62)');
    seam.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = seam;
    c.fillRect(0, sy - fh * 0.10, w, fh * 0.40);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(0, sy, w, Math.max(1, G.u * 0.16));

    // polish: a few very soft horizontal bands, painted small + upscaled
    const pol = document.createElement('canvas');
    pol.width = 64; pol.height = 64;
    const pc = pol.getContext('2d');
    const rng = makeRng(7717);
    pc.filter = 'blur(3px)';
    for (let i = 0; i < 14; i++) {
      const yy = rng() * 64;
      const a = 0.014 + rng() * 0.03;
      pc.fillStyle = rng() > 0.45 ? `rgba(255,246,232,${a})` : `rgba(0,0,0,${a * 1.4})`;
      pc.fillRect(-8, yy, 80, 0.8 + rng() * 4);
    }
    pc.filter = 'none';
    c.save();
    c.globalCompositeOperation = 'overlay';
    c.globalAlpha = 0.7;
    c.drawImage(pol, 0, sy, w, fh);
    c.restore();

    c.restore();
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
    c.globalAlpha = 0.26;
    c.fillStyle = c.createPattern(t, 'repeat');
    c.fillRect(0, 0, w, h);
    c.restore();
  }

  _renderCone() {
    const G = this.geom;
    const { w, h, cx } = G;
    const S = 0.34;
    const c = this.cone.size(Math.round(w * S), Math.round(h * S)).ctx;
    c.setTransform(S, 0, 0, S, 0, 0);
    c.clearRect(0, 0, w, h);
    const topW = G.topRx * 0.14, botW = G.topRx * 1.42;
    const y0 = -h * 0.06, y1 = G.baseY;
    c.beginPath();
    c.moveTo(cx - topW, y0);
    c.lineTo(cx + topW, y0);
    c.lineTo(cx + botW, y1);
    c.lineTo(cx - botW, y1);
    c.closePath();
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(255,232,196,0.19)');
    g.addColorStop(0.35, 'rgba(255,226,186,0.072)');
    g.addColorStop(0.72, 'rgba(255,220,180,0.020)');
    g.addColorStop(1, 'rgba(255,216,176,0)');
    c.fillStyle = g;
    c.filter = 'blur(7px)';
    c.fill();
    c.filter = 'none';
  }

  // ---------------------------------------------------------
  // The plinth: a rectangular box of painted stone, dead-on.
  // Layer contents, back to front:
  //   cast shadow on the floor → reflection in the floor →
  //   front face → top face → arrises.
  // ---------------------------------------------------------
  _renderPlinth(W, H, dpr) {
    const G = this.geom;
    const { w, h, u, cx } = G;
    const P = G.plinth;
    const c = this.plinth.size(W, H).ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    const hw = P.halfW, bw = hw * P.k;
    const yT = P.yTop, yB = P.yBack, yBase = P.yBase, yBB = P.yBaseBack;
    const faceH = yBase - yT;

    // ---- what the box does to the floor -------------------------
    // A museum downlight is nearly vertical, so the shadow is a soft
    // footprint hugging the base and spilling to the lower right.
    c.save();
    c.beginPath(); c.rect(0, G.floorY, w, h - G.floorY); c.clip();
    const sc0 = (yBase + yBB) * 0.5;
    // wide ambient pool
    c.save();
    c.translate(cx + hw * 0.07, sc0 + (yBase - yBB) * 0.18);
    c.scale(1, (yBase - yBB) * 0.95 / (hw * 1.6));
    const sg = c.createRadialGradient(0, 0, 0, 0, 0, hw * 1.6);
    sg.addColorStop(0, 'rgba(0,0,0,0.70)');
    sg.addColorStop(0.44, 'rgba(0,0,0,0.50)');
    sg.addColorStop(0.76, 'rgba(0,0,0,0.16)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sg;
    c.beginPath(); c.arc(0, 0, hw * 1.6, 0, TAU); c.fill();
    c.restore();
    // tight occlusion right at the base line
    c.save();
    c.translate(cx, yBase);
    c.scale(1, (yBase - yBB) * 0.42 / (hw * 1.06));
    const ao = c.createRadialGradient(0, 0, 0, 0, 0, hw * 1.06);
    ao.addColorStop(0, 'rgba(0,0,0,0.92)');
    ao.addColorStop(0.66, 'rgba(0,0,0,0.72)');
    ao.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = ao;
    c.beginPath(); c.arc(0, 0, hw * 1.06, 0, TAU); c.fill();
    c.restore();
    c.restore();

    // ---- the front face, painted once into a tile ----------------
    const face = this._facePaint(hw * 2, faceH, dpr);

    // ---- its reflection in the floor -----------------------------
    this._floorReflection(c, face, cx - hw, yBase, hw * 2, faceH, h);

    // ---- the box -------------------------------------------------
    c.drawImage(face, cx - hw, yT, hw * 2, faceH);

    // top face (trapezoid, narrower at the back)
    c.beginPath();
    c.moveTo(cx - hw, yT);
    c.lineTo(cx + hw, yT);
    c.lineTo(cx + bw, yB);
    c.lineTo(cx - bw, yB);
    c.closePath();
    const tg = c.createRadialGradient(
      cx - hw * 0.12, yB + (yT - yB) * 0.34, hw * 0.04,
      cx, yB + (yT - yB) * 0.5, hw * 1.22);
    tg.addColorStop(0, '#8f8b82');
    tg.addColorStop(0.34, '#787369');
    tg.addColorStop(0.66, '#565259');
    tg.addColorStop(0.88, '#3a383f');
    tg.addColorStop(1, '#2b2a30');
    c.fillStyle = tg;
    c.fill();

    c.save();
    c.clip();
    // warm pool from the lamp directly overhead
    c.globalCompositeOperation = 'lighter';
    const lp = c.createRadialGradient(cx, topYOf(yT, yB), 0, cx, topYOf(yT, yB), hw * 0.98);
    lp.addColorStop(0, 'rgba(255,222,176,0.22)');
    lp.addColorStop(0.5, 'rgba(255,210,164,0.075)');
    lp.addColorStop(1, 'rgba(255,206,160,0)');
    c.fillStyle = lp;
    c.fillRect(cx - hw, yB, hw * 2, yT - yB);
    // the back of the top face falls into the wall's shadow
    c.globalCompositeOperation = 'source-over';
    const bs = c.createLinearGradient(0, yB, 0, yB + (yT - yB) * 0.55);
    bs.addColorStop(0, 'rgba(6,6,10,0.42)');
    bs.addColorStop(1, 'rgba(6,6,10,0)');
    c.fillStyle = bs;
    c.fillRect(cx - hw, yB, hw * 2, (yT - yB) * 0.55);
    // stone mottle
    c.globalCompositeOperation = 'overlay';
    c.globalAlpha = 0.55;
    c.drawImage(this._stoneTile(), cx - hw, yB, hw * 2, yT - yB);
    c.restore();

    // ---- arrises -------------------------------------------------
    const aw = Math.max(1, u * 0.15);
    // front top edge: the brightest line in the room's geometry
    const fe = c.createLinearGradient(cx - hw, 0, cx + hw, 0);
    fe.addColorStop(0, 'rgba(255,240,214,0.20)');
    fe.addColorStop(0.16, 'rgba(255,244,222,0.78)');
    fe.addColorStop(0.55, 'rgba(255,238,212,0.52)');
    fe.addColorStop(0.90, 'rgba(255,232,206,0.20)');
    fe.addColorStop(1, 'rgba(255,232,206,0.06)');
    c.strokeStyle = fe;
    c.lineWidth = aw;
    c.beginPath();
    c.moveTo(cx - hw, yT - aw * 0.5);
    c.lineTo(cx + hw, yT - aw * 0.5);
    c.stroke();

    // back top edge: dark against the wall, with a hair of bounce
    c.strokeStyle = 'rgba(0,0,0,0.40)';
    c.lineWidth = Math.max(1, u * 0.11);
    c.beginPath(); c.moveTo(cx - bw, yB); c.lineTo(cx + bw, yB); c.stroke();
    c.strokeStyle = 'rgba(210,204,196,0.18)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx - bw, yB - 0.6); c.lineTo(cx + bw, yB - 0.6); c.stroke();

    // side edges of the top face
    c.lineWidth = Math.max(1, u * 0.10);
    c.strokeStyle = 'rgba(255,240,216,0.34)';
    c.beginPath(); c.moveTo(cx - hw, yT); c.lineTo(cx - bw, yB); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.34)';
    c.beginPath(); c.moveTo(cx + hw, yT); c.lineTo(cx + bw, yB); c.stroke();
  }

  /** The stone mottle tile — low frequency, painted small, reused. */
  _stoneTile() {
    if (this._stone) return this._stone;
    const cv = document.createElement('canvas');
    cv.width = 96; cv.height = 96;
    const x = cv.getContext('2d');
    x.fillStyle = '#808080'; x.fillRect(0, 0, 96, 96);
    const rng = makeRng(3307);
    x.filter = 'blur(2.4px)';
    for (let i = 0; i < 40; i++) {
      const a = 0.02 + rng() * 0.05;
      x.fillStyle = rng() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.2})`;
      x.beginPath();
      x.ellipse(rng() * 96, rng() * 96, 4 + rng() * 24, 4 + rng() * 20, rng() * 3, 0, TAU);
      x.fill();
    }
    x.filter = 'none';
    this._stone = cv;
    return cv;
  }

  /**
   * The plinth's front face as a standalone tile, so it can be blitted
   * once for the box and once, flipped, for the floor reflection.
   */
  _facePaint(pw, ph, dpr) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(pw * dpr));
    cv.height = Math.max(1, Math.round(ph * dpr));
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);

    // body: dark painted stone, top lit by the downlight spill
    const g = x.createLinearGradient(0, 0, 0, ph);
    g.addColorStop(0, '#4b4a4e');
    g.addColorStop(0.16, '#3d3d42');
    g.addColorStop(0.52, '#26262c');
    g.addColorStop(0.84, '#151519');
    g.addColorStop(1, '#0e0e12');
    x.fillStyle = g;
    x.fillRect(0, 0, pw, ph);

    // key from the upper left across the face
    const kx = x.createLinearGradient(0, 0, pw, ph * 0.35);
    kx.addColorStop(0, 'rgba(255,232,198,0.14)');
    kx.addColorStop(0.34, 'rgba(255,228,192,0.05)');
    kx.addColorStop(0.62, 'rgba(0,0,0,0.06)');
    kx.addColorStop(1, 'rgba(0,0,0,0.30)');
    x.fillStyle = kx;
    x.fillRect(0, 0, pw, ph);

    // cool bounce off the floor into the bottom of the face
    x.save();
    x.globalCompositeOperation = 'lighter';
    const bo = x.createLinearGradient(0, ph, 0, ph * 0.70);
    bo.addColorStop(0, 'rgba(84,112,164,0.10)');
    bo.addColorStop(1, 'rgba(84,112,164,0)');
    x.fillStyle = bo;
    x.fillRect(0, ph * 0.70, pw, ph * 0.30);
    x.restore();

    // chamfered vertical arrises — the only "side face" a dead-on box has
    const ch = Math.max(2, pw * 0.022);
    const lc = x.createLinearGradient(0, 0, ch, 0);
    lc.addColorStop(0, 'rgba(255,238,210,0.30)');
    lc.addColorStop(0.55, 'rgba(255,236,206,0.11)');
    lc.addColorStop(1, 'rgba(255,236,206,0)');
    x.fillStyle = lc;
    x.fillRect(0, 0, ch, ph);
    const rc = x.createLinearGradient(pw, 0, pw - ch * 1.5, 0);
    rc.addColorStop(0, 'rgba(0,0,0,0.46)');
    rc.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rc;
    x.fillRect(pw - ch * 1.5, 0, ch * 1.5, ph);
    x.fillStyle = 'rgba(198,196,192,0.13)';
    x.fillRect(pw - 1, 0, 1, ph);

    // shadow gap / toe kick at the very bottom
    const tk = Math.max(2, ph * 0.022);
    const tg = x.createLinearGradient(0, ph - tk * 2.4, 0, ph);
    tg.addColorStop(0, 'rgba(0,0,0,0)');
    tg.addColorStop(1, 'rgba(0,0,0,0.80)');
    x.fillStyle = tg;
    x.fillRect(0, ph - tk * 2.4, pw, tk * 2.4);

    // paint mottle
    x.save();
    x.globalCompositeOperation = 'overlay';
    x.globalAlpha = 0.42;
    x.drawImage(this._stoneTile(), 0, 0, pw, ph);
    x.restore();
    return cv;
  }

  /** Mirror the face into the floor: squashed, blurred, fading out. */
  _floorReflection(c, face, fx, fy, fw, fh, h) {
    const rh = Math.min(fh * 0.55, (h - fy) * 1.6);
    if (rh <= 2) return;
    const tmp = document.createElement('canvas');
    const dpr = this.r.dpr;
    tmp.width = Math.max(1, Math.round(fw * dpr));
    tmp.height = Math.max(1, Math.round(rh * dpr));
    const t = tmp.getContext('2d');
    t.setTransform(dpr, 0, 0, dpr, 0, 0);
    t.save();
    t.translate(0, rh);
    t.scale(1, -rh / fh);
    t.filter = `blur(${Math.max(1, fw * 0.012)}px)`;
    t.drawImage(face, 0, 0, fw, fh);
    t.filter = 'none';
    t.restore();
    // fade with distance from the base line
    t.globalCompositeOperation = 'destination-in';
    const m = t.createLinearGradient(0, 0, 0, rh);
    m.addColorStop(0, 'rgba(0,0,0,0.34)');
    m.addColorStop(0.35, 'rgba(0,0,0,0.13)');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    t.fillStyle = m;
    t.fillRect(0, 0, fw, rh);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.drawImage(tmp, fx, fy, fw, rh);
    c.restore();
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
    ctx.fillStyle = '#06060a';
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
      const a = m.a * e * (0.10 + inCone * 0.95);
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

function topYOf(yFront, yBack) { return (yFront + yBack) * 0.5; }
