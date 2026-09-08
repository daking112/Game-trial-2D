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

import { TAU, clamp, clamp01, damp, lerp, rand, rrange, makeRng, smoothstep } from '../core/math.js';
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
    this.vignette = 0;              // extra corner falloff a chapter can pull in
    this.label = null; this._labelL = null; this.labelBox = null;
    this._noteText = null; this._noteL = null; this.noteA = 0;
    this.tint = null;         // css colour graded additively over the room
    this.tintAmount = 0.12;
    // The emergency luminaire. Not a grade — a light, with a place on the
    // wall, so when the gallery's own lamp dies the room is lit by
    // something the player can point at. See `drawEmergency`.
    this.emergency = 0;       // 0..1, tweenable
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

    // The downlight pool landing on the floor around the plinth.
    //
    // Centred on the BASE LINE, not two thirds down the floor. A scan of
    // the old build across the floor either side of the plinth read 6 to 11
    // out of 255 — the plinth stood in a void, and the contact shadow the
    // set carefully draws at its base landed on black and did nothing. The
    // plinth needs a plane to stand on before it can throw anything onto
    // one; this is that plane, and it stays a pool rather than becoming
    // room light because it is tight and steep.
    const py = G.baseY;
    const pool = c.createRadialGradient(cx, py, 0, cx, py, w * 0.80);
    pool.addColorStop(0, 'rgba(255,224,182,0.56)');
    pool.addColorStop(0.26, 'rgba(252,212,170,0.30)');
    pool.addColorStop(0.58, 'rgba(230,190,150,0.105)');
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
  // ---------------------------------------------------------
  // The wall label
  // ---------------------------------------------------------
  /**
   * A chapter used to arrive as a full-screen black slide with its rule
   * set in 800-weight caps: a title card from a different genre of game,
   * and a two-second wipe in a room whose entire conceit is that the room
   * IS the transition.
   *
   * The rule now lives where a rule lives in a gallery — printed on a card
   * on the plinth, hung before the lamp comes up on the object, and still
   * there afterwards when the player wants to check what they were told.
   * A label is also the only place a museum ever admits what a thing is
   * made of, which is a free excuse to name the materials.
   */
  setLabel(l) {
    this.label = l || null;
    this._labelL = null;
  }

  _renderLabel(dpr) {
    const G = this.geom, L = this.label;
    if (!G || !L) return null;
    const u = G.u;
    const w = u * 15.0, h = u * 10.7;
    const lay = (this._labelL = new Layer())
      .size(Math.max(1, Math.ceil(w * dpr)), Math.max(1, Math.ceil(h * dpr)));
    const c = lay.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    // the card: matte board, warm white, very slightly uneven
    const bg = c.createLinearGradient(0, 0, w * 0.3, h);
    bg.addColorStop(0, '#efeade');
    bg.addColorStop(0.55, '#e6e0d2');
    bg.addColorStop(1, '#d9d2c2');
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    // print is never quite at the edge of the board
    const pad = u * 1.15;
    let y = u * 1.95;

    c.fillStyle = 'rgba(66,60,50,0.62)';
    c.font = `600 ${u * 0.84}px Inter, sans-serif`;
    c.letterSpacing = `${u * 0.22}px`;
    c.textBaseline = 'alphabetic';
    c.fillText(L.numeral, pad, y);
    c.letterSpacing = '0px';

    // Set copy is written by hand, so any of it can overrun the board on a
    // narrow phone. Squeeze the line rather than let it run off the card.
    const inner = w - pad * 2;
    const fit = (text, size, weight, family) => {
      let px = size;
      for (let i = 0; i < 6; i++) {
        c.font = `${weight} ${px}px ${family}`;
        if (c.measureText(text).width <= inner) break;
        px *= 0.94;
      }
      c.fillText(text, pad, y);
    };

    y += u * 2.05;
    c.fillStyle = '#221f19';
    fit(L.title, u * 1.86, 'italic', `'Instrument Serif', Georgia, serif`);

    y += u * 1.40;
    c.fillStyle = 'rgba(74,68,58,0.86)';
    for (const line of L.medium) { fit(line, u * 0.86, '400', 'Inter, sans-serif'); y += u * 1.12; }

    // a hairline rule, then the instruction — the only thing on the card
    // set in caps, because it is the only thing that is an instruction
    y += u * 0.46;
    c.strokeStyle = 'rgba(90,84,72,0.42)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(pad, Math.round(y) + 0.5);
    c.lineTo(w - pad, Math.round(y) + 0.5);
    c.stroke();

    y += u * 1.62;
    c.fillStyle = '#1b1814';
    c.letterSpacing = `${u * 0.13}px`;
    fit(L.rule.toUpperCase(), u * 0.94, '700', 'Inter, sans-serif');
    c.letterSpacing = '0px';

    // the board is printed, not glowing: a little paper tooth over it
    c.save();
    c.globalCompositeOperation = 'multiply';
    c.globalAlpha = 0.5;
    c.drawImage(this._stoneTile(), 0, 0, w, h);
    c.restore();

    lay.w = w; lay.h = h;
    return lay;
  }

  /**
   * Blitted onto the plinth's front face, top left, where a gallery puts
   * the label for a work that stands on a plinth. It is the one bright
   * rectangle on the largest dark surface in the frame, so it also gives
   * that surface something to be lit against.
   */
  drawLabel(ctx) {
    const G = this.geom;
    if (!G || !this.label) return;
    const a = clamp01(0.06 + this.lit * 0.94) * this.plinthOpacity;
    if (a <= 0.01) return;
    const lay = this._labelL || this._renderLabel(this.r.dpr);
    if (!lay) return;
    const u = G.u, P = G.plinth;
    const x = G.cx - P.halfW + u * 2.4;
    const y = P.yTop + u * 3.4;
    ctx.save();
    ctx.globalAlpha = a;
    // the card stands a millimetre off the board it is stuck to
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(x + u * 0.16, y + u * 0.22, lay.w, lay.h);
    ctx.drawImage(lay.canvas, x, y, lay.w, lay.h);
    this.labelBox = { x, y, w: lay.w, h: lay.h };
    // and the same downlight falls across it as everything else
    const g2 = ctx.createLinearGradient(x, y, x + lay.w * 0.7, y + lay.h);
    g2.addColorStop(0, `rgba(255,238,208,${0.16 * this.lit})`);
    g2.addColorStop(1, 'rgba(10,10,14,0.14)');
    ctx.fillStyle = g2;
    ctx.fillRect(x, y, lay.w, lay.h);
    ctx.restore();
  }

  /**
   * The conservator's note.
   *
   * Hints used to arrive as a rounded pill chip floating at the top of the
   * screen in letterspaced caps — Material vocabulary in a museum. A
   * gallery that wants to tell you one more thing pins a second, smaller
   * card under the first one, and whoever pinned it was in a hurry, so it
   * is never quite straight.
   */
  setNote(text) {
    const t = text || null;
    if (t === this._noteText) return;
    this._noteText = t;
    this._noteL = null;
  }

  _renderNote(dpr) {
    const G = this.geom, txt = this._noteText;
    if (!G || !txt) return null;
    const u = G.u;
    const w = u * 11.4, pad = u * 0.95;
    // measure first: the card is as tall as the note needs
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = `italic ${u * 1.02}px 'Instrument Serif', Georgia, serif`;
    const words = String(txt).split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (probe.measureText(next).width > w - pad * 2 && line) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    const lh = u * 1.30;
    const h = pad * 2 + lines.length * lh;

    const lay = (this._noteL = new Layer())
      .size(Math.max(1, Math.ceil(w * dpr)), Math.max(1, Math.ceil(h * dpr)));
    const c = lay.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = c.createLinearGradient(0, 0, w * 0.4, h);
    bg.addColorStop(0, '#e8e3d6');
    bg.addColorStop(1, '#d5cec0');
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(52,46,38,0.88)';
    c.font = `italic ${u * 1.02}px 'Instrument Serif', Georgia, serif`;
    let y = pad + u * 1.0;
    for (const l of lines) { c.fillText(l, pad, y); y += lh; }
    c.save();
    c.globalCompositeOperation = 'multiply';
    c.globalAlpha = 0.45;
    c.drawImage(this._stoneTile(), 0, 0, w, h);
    c.restore();
    lay.w = w; lay.h = h;
    return lay;
  }

  drawNote(ctx) {
    const G = this.geom;
    const a = this.noteA * clamp01(0.06 + this.lit * 0.94) * this.plinthOpacity;
    if (!G || a <= 0.012) return;
    const lay = this._noteL || this._renderNote(this.r.dpr);
    if (!lay || !this.labelBox) return;
    const u = G.u, B = this.labelBox;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(B.x + u * 1.1, B.y + B.h + u * 1.5);
    ctx.rotate(-0.021);                       // nobody pins these straight
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fillRect(u * 0.16, u * 0.22, lay.w, lay.h);
    ctx.drawImage(lay.canvas, 0, 0, lay.w, lay.h);
    const g2 = ctx.createLinearGradient(0, 0, lay.w * 0.7, lay.h);
    g2.addColorStop(0, `rgba(255,238,208,${0.14 * this.lit})`);
    g2.addColorStop(1, 'rgba(10,10,14,0.16)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, lay.w, lay.h);
    ctx.restore();
  }

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
    // A near-vertical downlight throws a TIGHT shadow that hugs the base.
    // This used to be a disc of 70%-opaque black one and a half plinth-
    // widths across, which is most of the visible floor — so the strongest
    // light in the room landed on the object and the ground around it
    // measured L=16 against a wall of 27. The room had no floor.
    c.save();
    c.translate(cx + hw * 0.06, sc0 + (yBase - yBB) * 0.16);
    c.scale(1, (yBase - yBB) * 0.95 / (hw * 1.15));
    const sg = c.createRadialGradient(0, 0, 0, 0, 0, hw * 1.15);
    sg.addColorStop(0, 'rgba(0,0,0,0.58)');
    sg.addColorStop(0.46, 'rgba(0,0,0,0.36)');
    sg.addColorStop(0.78, 'rgba(0,0,0,0.10)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sg;
    c.beginPath(); c.arc(0, 0, hw * 1.15, 0, TAU); c.fill();
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
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    this._grain2(c, w, h, 0.62, 0.7);
    // Dust. Nobody wipes the back of a plinth top, and the thin pale band
    // that collects against the wall edge is worth more than any amount of
    // extra gradient.
    const dg = c.createLinearGradient(0, yB, 0, yB + (yT - yB) * 0.30);
    dg.addColorStop(0, 'rgba(198,190,176,0.11)');
    dg.addColorStop(1, 'rgba(198,190,176,0)');
    c.fillStyle = dg;
    c.fillRect(cx - hw, yB, hw * 2, (yT - yB) * 0.30);
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

    // Chips. That arris is the brightest line in the room, and an unbroken
    // one reads as a vector graphic. Three or four nicks in it are the
    // cheapest possible proof that the object has a history.
    {
      const rng = makeRng(4471);
      c.save();
      c.lineCap = 'butt';
      for (let i = 0; i < 5; i++) {
        const bx = cx - hw + (0.08 + rng() * 0.84) * hw * 2;
        const bl = aw * (1.2 + rng() * 3.4);
        c.strokeStyle = `rgba(14,13,16,${0.5 + rng() * 0.4})`;
        c.lineWidth = aw * (0.8 + rng() * 0.7);
        c.beginPath();
        c.moveTo(bx, yT - aw * 0.5);
        c.lineTo(bx + bl, yT - aw * 0.5);
        c.stroke();
        // the exposed board under the paint catches a little light
        c.strokeStyle = `rgba(196,178,150,${0.10 + rng() * 0.12})`;
        c.lineWidth = Math.max(0.6, aw * 0.4);
        c.beginPath();
        c.moveTo(bx, yT + aw * 0.35);
        c.lineTo(bx + bl, yT + aw * 0.35);
        c.stroke();
      }
      c.restore();
    }

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

  /**
   * The tooth of the paint itself — high frequency, one pixel across, and
   * the difference between a box that is dark grey and a box that is made
   * of something. The mottle tile below is the low-frequency half of the
   * same job; blurred blobs stretched over a whole face have no scale to
   * them, so at arm's length the plinth read as a gradient.
   */
  _grainTile() {
    if (this._grain) return this._grain;
    const N = 128;
    const cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    const x = cv.getContext('2d');
    const img = x.createImageData(N, N);
    const d = img.data;
    const rng = makeRng(8821);
    for (let i = 0; i < N * N; i++) {
      // two octaves: a per-pixel tooth over a coarser cloud, both centred
      // on 128 so an `overlay` pass leaves the average value alone
      const v = 128 + (rng() - 0.5) * 34 + (rng() - 0.5) * 16;
      const o = i * 4;
      d[o] = d[o + 1] = d[o + 2] = v;
      d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    this._grain = cv;
    return cv;
  }

  /** Lay the tooth over a face at its own scale rather than stretched. */
  _grain2(x, w, h, alpha, scale = 0.5) {
    const pat = x.createPattern(this._grainTile(), 'repeat');
    if (!pat) return;
    try { pat.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0])); } catch (_) {}
    x.save();
    x.globalCompositeOperation = 'overlay';
    x.globalAlpha = alpha;
    x.fillStyle = pat;
    x.fillRect(0, 0, w, h);
    x.restore();
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
    this._grain2(x, pw, ph, 0.80, 0.7);

    // Roller nap. Gallery plinths are rolled, not sprayed, and the faint
    // vertical banding that leaves is the single most recognisable thing
    // about a painted MDF box. Isotropic noise alone reads as film grain,
    // which is a property of the photograph, not of the object.
    x.save();
    const rn = makeRng(6607);
    x.globalCompositeOperation = 'overlay';
    for (let i = 0; i < 54; i++) {
      const bx = rn() * pw;
      const bw2 = pw * (0.006 + rn() * 0.026);
      const v = rn() > 0.5 ? 255 : 0;
      x.globalAlpha = 0.020 + rn() * 0.045;
      const gg = x.createLinearGradient(bx - bw2, 0, bx + bw2, 0);
      gg.addColorStop(0, `rgba(${v},${v},${v},0)`);
      gg.addColorStop(0.5, `rgba(${v},${v},${v},1)`);
      gg.addColorStop(1, `rgba(${v},${v},${v},0)`);
      x.fillStyle = gg;
      x.fillRect(bx - bw2, ph * (rn() * 0.2), bw2 * 2, ph * (0.55 + rn() * 0.45));
    }
    x.restore();

    // The lid joint. A gallery plinth is a box with a removable top, and
    // the hairline where the two meet is the one piece of evidence that
    // this is joinery and not a solid block of dark.
    const jy = Math.round(ph * 0.062) + 0.5;
    x.strokeStyle = 'rgba(0,0,0,0.44)';
    x.lineWidth = 1;
    x.beginPath(); x.moveTo(0, jy); x.lineTo(pw, jy); x.stroke();
    x.strokeStyle = 'rgba(226,220,208,0.10)';
    x.beginPath(); x.moveTo(0, jy + 1); x.lineTo(pw, jy + 1); x.stroke();

    // Satin, not matte: eggshell paint holds one very broad, very soft
    // highlight, and its softness is what tells you the surface is smooth.
    x.save();
    x.globalCompositeOperation = 'lighter';
    const sh = x.createLinearGradient(pw * 0.10, 0, pw * 0.72, ph);
    sh.addColorStop(0, 'rgba(255,246,228,0)');
    sh.addColorStop(0.34, 'rgba(255,246,228,0.055)');
    sh.addColorStop(0.62, 'rgba(255,246,228,0.012)');
    sh.addColorStop(1, 'rgba(255,246,228,0)');
    x.fillStyle = sh;
    x.fillRect(0, 0, pw, ph);
    x.restore();

    // Wear. This box has been dragged across a gallery floor more than
    // once, and the scuffs live where a box gets scuffed: along the bottom
    // and down the two arrises.
    const rng = makeRng(20114);
    x.save();
    for (let i = 0; i < 26; i++) {
      const edge = rng();
      const bx = edge < 0.55 ? rng() * pw
        : (edge < 0.78 ? rng() * ch * 2.2 : pw - rng() * ch * 2.2);
      const by = edge < 0.55 ? ph - rng() ** 1.6 * ph * 0.16 : rng() * ph;
      const l = (1.5 + rng() * 7) * (edge < 0.55 ? 1 : 0.5);
      const light = rng() > 0.55;
      x.strokeStyle = light
        ? `rgba(226,220,208,${0.05 + rng() * 0.09})`
        : `rgba(0,0,0,${0.10 + rng() * 0.16})`;
      x.lineWidth = 0.6 + rng() * 0.9;
      x.beginPath();
      x.moveTo(bx, by);
      x.lineTo(bx + (rng() - 0.5) * l * 2.4, by + (rng() - 0.5) * l * 0.5);
      x.stroke();
    }
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
  update(dt) {
    this.t += dt;
    this.noteA = damp(this.noteA, this._noteText ? 1 : 0, 7, dt);
  }

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
    if (this.emergency > 0.005) this._emergencyWall(ctx);
  }

  /** Where the emergency fitting is: high on the right wall, off-axis. */
  _emergencyAt() {
    const G = this.geom;
    return { x: G.w * 0.805, y: G.h * 0.185, r: G.h * 0.86 };
  }

  /**
   * The wall, lit by the emergency fitting.
   *
   * What used to happen when the gallery lost power was `tint = '#ff2d18'`
   * and a full-frame fillRect in `lighter` — a flat red added to every
   * pixel equally, which is a grade and not a light, and read as a beige
   * wash over a photograph rather than as a room in trouble. This has a
   * source: a falloff from a fitting on the right wall, so the far corner
   * stays black, the near wall is hot, and the frame gains a second light
   * direction opposite the dead downlight's.
   */
  _emergencyWall(ctx) {
    const G = this.geom, k = clamp01(this.emergency);
    const L = this._emergencyAt();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(L.x, L.y, L.r * 0.02, L.x, L.y, L.r);
    g.addColorStop(0, `rgba(255,116,78,${0.72 * k})`);
    g.addColorStop(0.14, `rgba(236,64,38,${0.40 * k})`);
    g.addColorStop(0.42, `rgba(168,30,22,${0.17 * k})`);
    g.addColorStop(1, 'rgba(96,10,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, G.w, G.h);
    ctx.restore();
  }

  /**
   * The fitting itself, and what it does to whatever is standing in front
   * of it. Drawn over the level, because a second light source that never
   * touches the objects is still a grade.
   */
  drawEmergency(ctx, glow) {
    const G = this.geom; if (!G || this.emergency <= 0.005) return;
    const k = clamp01(this.emergency);
    const L = this._emergencyAt();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // the objects, rimmed from the fitting's side
    const wash = ctx.createLinearGradient(G.w, 0, G.w * 0.18, G.h * 0.75);
    wash.addColorStop(0, `rgba(255,86,50,${0.40 * k})`);
    wash.addColorStop(0.45, `rgba(206,42,26,${0.15 * k})`);
    wash.addColorStop(1, 'rgba(140,18,14,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, G.w, G.h);
    // the halo
    const hr = G.h * 0.10;
    const hg = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, hr);
    hg.addColorStop(0, `rgba(255,214,190,${0.85 * k})`);
    hg.addColorStop(0.28, `rgba(255,110,70,${0.42 * k})`);
    hg.addColorStop(1, 'rgba(220,40,26,0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(L.x, L.y, hr, 0, TAU); ctx.fill();
    ctx.restore();
    // Into the bloom buffer as well, so the fitting reads as a source and
    // not as a decal: post is what makes a light look like a light, and
    // everything else in this room that emits already goes through it.
    if (glow) {
      glow.save();
      glow.globalCompositeOperation = 'lighter';
      const br = G.h * 0.16;
      const bg = glow.createRadialGradient(L.x, L.y, 0, L.x, L.y, br);
      bg.addColorStop(0, `rgba(255,180,140,${0.62 * k})`);
      bg.addColorStop(0.3, `rgba(255,96,56,${0.26 * k})`);
      bg.addColorStop(1, 'rgba(220,40,26,0)');
      glow.fillStyle = bg;
      glow.beginPath(); glow.arc(L.x, L.y, br, 0, TAU); glow.fill();
      glow.restore();
    }
    // the fitting: a bulkhead lamp in a wire guard, which is the one thing
    // in the frame that is only true of an emergency light
    const w = G.w * 0.072, h = w * 0.60;
    ctx.save();
    ctx.translate(L.x, L.y);
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.5, h * 0.5, 0, 0, TAU);
    const lens = ctx.createRadialGradient(-w * 0.10, -h * 0.14, 0, 0, 0, w * 0.62);
    lens.addColorStop(0, `rgba(255,250,242,${0.98 * k})`);
    lens.addColorStop(0.34, `rgba(255,204,150,${0.95 * k})`);
    lens.addColorStop(0.72, `rgba(255,116,64,${0.92 * k})`);
    lens.addColorStop(1, `rgba(176,32,18,${0.88 * k})`);
    ctx.fillStyle = lens;
    ctx.fill();
    ctx.strokeStyle = `rgba(18,10,8,${0.75 * k})`;
    ctx.lineWidth = Math.max(1, w * 0.055);
    ctx.stroke();
    // the guard, three bars across the lens
    ctx.strokeStyle = `rgba(14,8,6,${0.72 * k})`;
    ctx.lineWidth = Math.max(0.8, w * 0.04);
    for (let i = -1; i <= 1; i++) {
      const yy = i * h * 0.24;
      const hw = (w * 0.5) * Math.sqrt(Math.max(0, 1 - (yy / (h * 0.5)) ** 2));
      ctx.beginPath(); ctx.moveTo(-hw, yy); ctx.lineTo(hw, yy); ctx.stroke();
    }
    ctx.restore();
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

  /**
   * Clip to the plinth's top face — the actual trapezoid, not the ellipse
   * inscribed in it. Anything a hero throws onto the plinth has to be
   * bounded by this or it hangs off the side into the dark room, which is
   * a worse read than no shadow at all.
   */
  clipTop(ctx, inset = 0) {
    const G = this.geom, P = G.plinth;
    const hw = P.halfW * (1 - inset), bw = P.halfW * P.k * (1 - inset);
    ctx.beginPath();
    ctx.moveTo(G.cx - hw, P.yTop);
    ctx.lineTo(G.cx + hw, P.yTop);
    ctx.lineTo(G.cx + bw, P.yBack);
    ctx.lineTo(G.cx - bw, P.yBack);
    ctx.closePath();
    ctx.clip();
  }
}

function topYOf(yFront, yBack) { return (yFront + yBack) * 0.5; }
