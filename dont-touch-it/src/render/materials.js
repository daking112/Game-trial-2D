// ============================================================
// materials.js — painterly material system for Canvas2D
// ------------------------------------------------------------
// Everything here assumes one consistent lighting model:
//   key light from the upper-left (-0.55, -0.8), a cool bounce from the
//   lower-right, and a warm rim from behind. Materials are built from
//   stacked gradients + procedural detail, cached into offscreen tiles
//   where the detail is expensive.
// ============================================================

import { TAU, clamp, clamp01, lerp, rand, makeRng, withAlpha, hexToRgb } from '../core/math.js';

export const LIGHT = { x: -0.55, y: -0.8, z: 0.62 };

/**
 * Canvas throws on a non-finite gradient coordinate, and a throw inside a
 * draw helper aborts the whole level's draw() — one bad number from a
 * physics body blanked an entire chapter's hero object for the rest of
 * the session. These helpers take caller-computed geometry, so they check
 * it and skip instead of taking the frame down with them.
 */
const ok = (...v) => v.every(Number.isFinite);

// ---------------------------------------------------------------
// Contact shadow: the single biggest "is this real" cue.
// Draws an elliptical, distance-falloff shadow under an object.
// ---------------------------------------------------------------
export function contactShadow(ctx, x, y, rx, ry, opts = {}) {
  const { strength = 0.62, height = 0, tint = '0,0,0', spread = 1 } = opts;
  if (!ok(x, y, rx, ry, strength, height, spread) || rx <= 0 || ry <= 0) return;
  // Lifting an object widens + softens + fades its shadow.
  const lift = clamp01(height);
  const w = rx * (1 + lift * 0.55) * spread;
  const h = ry * (1 + lift * 0.65) * spread;
  const a = strength * (1 - lift * 0.55);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, h / w);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
  g.addColorStop(0, `rgba(${tint},${a})`);
  g.addColorStop(0.38, `rgba(${tint},${a * 0.72})`);
  g.addColorStop(0.72, `rgba(${tint},${a * 0.22})`);
  g.addColorStop(1, `rgba(${tint},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, w, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** True soft shadow: blurs whatever `draw` paints, offset along the light. */
export function castShadow(renderer, ctx, draw, opts = {}) {
  const { blur = 14, dx = 10, dy = 16, alpha = 0.5, scale = 1.02 } = opts;
  const l = renderer.shadow;
  const sc = 0.5;
  l.size(renderer.w * sc, renderer.h * sc);
  const lc = l.ctx;
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.clearRect(0, 0, l.canvas.width, l.canvas.height);
  lc.setTransform(sc, 0, 0, sc, 0, 0);
  lc.save();
  draw(lc);
  lc.restore();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.filter = `blur(${blur}px) brightness(0)`;
  ctx.drawImage(l.canvas, dx, dy, renderer.w * scale, renderer.h * scale);
  ctx.filter = 'none';
  ctx.restore();
}

// ---------------------------------------------------------------
// Metals
// ---------------------------------------------------------------

/**
 * Brushed / anodised metal fill for an already-defined path.
 * Call inside a ctx.save() with the path set as clip.
 */
export function metalFill(ctx, x0, y0, x1, y1, palette) {
  if (!ok(x0, y0, x1, y1)) return;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c] of palette) g.addColorStop(t, c);
  ctx.fillStyle = g;
  ctx.fill();
}

export const PALETTES = {
  brass: [[0, '#4a3413'], [0.14, '#8f6a25'], [0.3, '#e8c877'], [0.42, '#fff2c4'],
          [0.55, '#c39a44'], [0.72, '#6d4e1c'], [0.86, '#a97f30'], [1, '#3a2a10']],
  steel: [[0, '#2c3138'], [0.16, '#565e69'], [0.32, '#9aa5b1'], [0.45, '#e6ecf2'],
          [0.56, '#8b95a1'], [0.74, '#3d444d'], [0.88, '#6a727d'], [1, '#23272d']],
  gunmetal: [[0, '#15181d'], [0.2, '#2b3038'], [0.38, '#4a515c'], [0.5, '#6d757f'],
             [0.62, '#3a4049'], [0.8, '#1d2127'], [1, '#101216']],
  copper: [[0, '#3d1c0e'], [0.18, '#8a4423'], [0.34, '#d97a45'], [0.46, '#ffc79a'],
           [0.6, '#b0552b'], [0.8, '#5a2a14'], [1, '#2e150a']],
  aluminium: [[0, '#5b6068'], [0.2, '#878d95'], [0.36, '#c3c9d1'], [0.48, '#f0f3f7'],
              [0.6, '#a3a9b2'], [0.8, '#5e636b'], [1, '#42464d']],
};

/** Anisotropic brushed streaks. Path must already be clipped. */
export function brushedStreaks(ctx, x, y, w, h, seed = 7, opts = {}) {
  const { count = 46, alpha = 0.05, angle = 0 } = opts;
  const r = makeRng(seed);
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(angle);
  ctx.translate(-w / 2, -h / 2);
  ctx.globalCompositeOperation = 'overlay';
  for (let i = 0; i < count; i++) {
    const yy = r() * h;
    const a = alpha * (0.35 + r() * 0.65);
    ctx.strokeStyle = r() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.1})`;
    ctx.lineWidth = 0.4 + r() * 1.5;
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, yy);
    ctx.lineTo(w * 1.1, yy + (r() - 0.5) * 2.5);
    ctx.stroke();
  }
  ctx.restore();
}

/** Radial brushing (turned metal) for discs. Path must already be clipped. */
export function radialBrush(ctx, cx, cy, r, seed = 11, opts = {}) {
  const { count = 220, alpha = 0.045 } = opts;
  if (!ok(cx, cy, r) || r <= 0) return;
  const rng = makeRng(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.lineWidth = 0.7;
  for (let i = 0; i < count; i++) {
    const a0 = rng() * TAU;
    const rr = r * (0.12 + rng() * 0.9);
    const span = 0.06 + rng() * 0.5;
    const al = alpha * (0.3 + rng() * 0.7);
    ctx.strokeStyle = rng() > 0.5 ? `rgba(255,255,255,${al})` : `rgba(0,0,0,${al})`;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, a0, a0 + span);
    ctx.stroke();
  }
  ctx.restore();
}

/** Knurled grip band around a cylinder side (x..x+w, y..y+h). */
export function knurl(ctx, x, y, w, h, pitch = 7, alpha = 0.22) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.lineWidth = 1;
  for (let i = -h; i < w + h; i += pitch) {
    ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i + h, y + h); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.55})`;
    ctx.beginPath(); ctx.moveTo(x + i + 1, y); ctx.lineTo(x + i + h + 1, y + h); ctx.stroke();
    ctx.strokeStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath(); ctx.moveTo(x + i + h, y); ctx.lineTo(x + i, y + h); ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------
// Bevels & edges — the "machined" read
// ---------------------------------------------------------------

/** Inner bevel: bright along the lit edge, dark opposite. Path already clipped. */
export function innerBevel(ctx, path, w, h, x = 0, y = 0, opts = {}) {
  const { light = 0.5, dark = 0.55, width = 3 } = opts;
  ctx.save();
  ctx.clip(path);
  ctx.lineWidth = width * 2;
  ctx.strokeStyle = `rgba(255,255,255,${light})`;
  ctx.save(); ctx.translate(-width * 0.7, -width * 0.9); ctx.stroke(path); ctx.restore();
  ctx.strokeStyle = `rgba(0,0,0,${dark})`;
  ctx.save(); ctx.translate(width * 0.7, width * 0.9); ctx.stroke(path); ctx.restore();
  ctx.restore();
}

/** Crisp outer highlight following the top of a rounded shape. */
export function specularArc(ctx, cx, cy, r, a0, a1, opts = {}) {
  const { width = 2, color = 'rgba(255,255,255,0.9)', blur = 0 } = opts;
  ctx.save();
  if (blur) ctx.filter = `blur(${blur}px)`;
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.35, color);
  g.addColorStop(0.65, color);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = g;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a1);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------
// Glass
// ---------------------------------------------------------------

/**
 * Draws a convex glass dome / lens over the region defined by `path`.
 * Layers: body tint → refracted rim → Fresnel edge → two specular
 * highlights → caustic kiss. `t` lets you fade the whole thing.
 */
export function glassDome(ctx, cx, cy, r, opts = {}) {
  const { alpha = 1, tint = '190,214,225', frost = 0, warp = 0 } = opts;
  if (!ok(cx, cy, r, alpha) || r <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  // body — very faint, glass is mostly what's behind it
  const body = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.42, r * 0.05, cx, cy, r);
  body.addColorStop(0, `rgba(${tint},${0.05 + frost * 0.35})`);
  body.addColorStop(0.62, `rgba(${tint},${0.03 + frost * 0.22})`);
  body.addColorStop(0.9, `rgba(${tint},${0.14 + frost * 0.2})`);
  body.addColorStop(1, `rgba(${tint},${0.30 + frost * 0.18})`);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();

  // Fresnel rim: thin, bright, strongest at grazing angles
  ctx.lineWidth = Math.max(1, r * 0.022);
  const rim = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.7, cy + r);
  rim.addColorStop(0, 'rgba(255,255,255,0.85)');
  rim.addColorStop(0.28, 'rgba(210,235,255,0.35)');
  rim.addColorStop(0.55, 'rgba(255,255,255,0.10)');
  rim.addColorStop(0.82, 'rgba(180,205,230,0.42)');
  rim.addColorStop(1, 'rgba(255,255,255,0.78)');
  ctx.strokeStyle = rim;
  ctx.beginPath(); ctx.arc(cx, cy, r - ctx.lineWidth * 0.5, 0, TAU); ctx.stroke();

  // inner refraction ring (light bending at the shell)
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.strokeStyle = 'rgba(255,255,255,0.055)';
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.955, 0, TAU); ctx.stroke();

  // primary specular — long soft streak upper-left
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-0.62);
  const sw = r * 0.30, sh = r * 0.74;
  const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  sg.addColorStop(0, 'rgba(255,255,255,0.62)');
  sg.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.translate(-r * 0.30, -r * 0.34);
  ctx.scale(sw, sh);
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
  ctx.restore();

  // secondary tight hotspot
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
  const hx = cx - r * 0.44, hy = cy - r * 0.52;
  const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.16);
  hg.addColorStop(0, 'rgba(255,255,255,0.95)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(hx, hy, r * 0.16, 0, TAU); ctx.fill();
  ctx.restore();

  // bounce light from lower-right
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
  const bx = cx + r * 0.42, by = cy + r * 0.5;
  const bg = ctx.createRadialGradient(bx, by, 0, bx, by, r * 0.55);
  bg.addColorStop(0, 'rgba(150,190,255,0.16)');
  bg.addColorStop(1, 'rgba(150,190,255,0)');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(bx, by, r * 0.55, 0, TAU); ctx.fill();
  ctx.restore();

  ctx.restore();
}

/** Caustic pool a glass object throws on the surface beneath it. */
export function caustic(ctx, cx, cy, r, t, opts = {}) {
  const { alpha = 0.35, color = '255,244,214' } = opts;
  if (!ok(cx, cy, r, t) || r <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(cx, cy);
  ctx.scale(1, 0.36);
  for (let i = 0; i < 3; i++) {
    const ph = t * (0.5 + i * 0.24) + i * 2.1;
    const rr = r * (0.5 + i * 0.16) * (1 + Math.sin(ph) * 0.05);
    const g = ctx.createRadialGradient(0, 0, rr * 0.25, 0, 0, rr);
    g.addColorStop(0, `rgba(${color},${alpha * 0.5})`);
    g.addColorStop(0.6, `rgba(${color},${alpha * 0.18})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------
// Soft / organic
// ---------------------------------------------------------------

/** Rubber / silicone: matte body, wide soft specular, slight SSS at the rim. */
export function rubberFill(ctx, cx, cy, r, base, opts = {}) {
  const { sss = '255,120,120', hot = 0.34 } = opts;
  if (!ok(cx, cy, r) || r <= 0) return;
  const [br, bg, bb] = hexToRgb(base);
  const g = ctx.createRadialGradient(
    cx - r * 0.34, cy - r * 0.42, r * 0.04,
    cx, cy, r * 1.05
  );
  g.addColorStop(0, `rgb(${Math.min(255,br*1.5)|0},${Math.min(255,bg*1.5)|0},${Math.min(255,bb*1.5)|0})`);
  g.addColorStop(0.32, base);
  g.addColorStop(0.78, `rgb(${br*0.52|0},${bg*0.52|0},${bb*0.52|0})`);
  g.addColorStop(1, `rgb(${br*0.3|0},${bg*0.3|0},${bb*0.3|0})`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();

  // subsurface glow at the lower rim
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  const s = ctx.createRadialGradient(cx + r * 0.3, cy + r * 0.55, 0, cx + r * 0.3, cy + r * 0.55, r * 0.8);
  s.addColorStop(0, `rgba(${sss},0.20)`);
  s.addColorStop(1, `rgba(${sss},0)`);
  ctx.fillStyle = s;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  // broad soft highlight
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
  const hx = cx - r * 0.36, hy = cy - r * 0.46;
  const h = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.62);
  h.addColorStop(0, `rgba(255,255,255,${hot})`);
  h.addColorStop(0.5, `rgba(255,255,255,${hot * 0.22})`);
  h.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = h;
  ctx.beginPath(); ctx.arc(hx, hy, r * 0.62, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------

/** Felt / velvet pedestal top — soft, absorbs light, fibrous edge. */
export function feltTile(w, h, base = '#1b1216', seed = 3) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  const r = makeRng(seed);
  const img = x.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 26;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n * 0.9, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n * 1.05, 0, 255);
  }
  x.putImageData(img, 0, 0);
  return c;
}

/** Concrete / plaster wall tile with subtle mottling. */
export function plasterTile(w, h, base = '#141418', seed = 21) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  const r = makeRng(seed);
  for (let i = 0; i < 700; i++) {
    const rr = 2 + r() * 26;
    const a = 0.012 + r() * 0.03;
    x.fillStyle = r() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.3})`;
    x.beginPath(); x.arc(r() * w, r() * h, rr, 0, TAU); x.fill();
  }
  return c;
}

// ---------------------------------------------------------------
// Hardware
// ---------------------------------------------------------------

/**
 * A machined hex/slotted screw head, lit consistently and rotatable.
 * type: 'hex' | 'slot' | 'phillips' | 'torx'
 */
export function screwHead(ctx, cx, cy, r, angle, opts = {}) {
  const { type = 'hex', palette = PALETTES.steel, seated = 1, glowSeat = 0 } = opts;
  if (!ok(cx, cy, r, angle) || r <= 0) return;
  ctx.save();
  // recess shadow around the head
  const rec = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.5);
  rec.addColorStop(0, `rgba(0,0,0,${0.5 * seated})`);
  rec.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rec;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.5, 0, TAU); ctx.fill();

  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // head body
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.save(); ctx.clip();
  metalFill(ctx, -r, -r, r, r, palette);
  radialBrush(ctx, 0, 0, r, 31, { count: 70, alpha: 0.05 });
  ctx.restore();

  // chamfer
  ctx.lineWidth = Math.max(1, r * 0.14);
  const ch = ctx.createLinearGradient(-r, -r, r, r);
  ch.addColorStop(0, 'rgba(255,255,255,0.75)');
  ch.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  ch.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.strokeStyle = ch;
  ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth * 0.5, 0, TAU); ctx.stroke();

  // drive recess
  ctx.save();
  const dr = r * 0.52;
  ctx.beginPath();
  if (type === 'hex') {
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      const px = Math.cos(a) * dr, py = Math.sin(a) * dr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  } else if (type === 'slot') {
    ctx.rect(-r * 0.78, -r * 0.11, r * 1.56, r * 0.22);
  } else if (type === 'phillips') {
    ctx.rect(-r * 0.72, -r * 0.11, r * 1.44, r * 0.22);
    ctx.rect(-r * 0.11, -r * 0.72, r * 0.22, r * 1.44);
  } else { // torx
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      const rr = i % 2 ? dr * 0.58 : dr;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fill();
  ctx.clip();
  // recess inner lighting
  const ig = ctx.createLinearGradient(-dr, -dr, dr, dr);
  ig.addColorStop(0, 'rgba(0,0,0,0.9)');
  ig.addColorStop(0.75, 'rgba(120,130,145,0.28)');
  ig.addColorStop(1, 'rgba(190,205,220,0.42)');
  ctx.fillStyle = ig;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();

  if (glowSeat > 0) {
    ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
    gg.addColorStop(0, `rgba(255,206,140,${0.42 * glowSeat})`);
    gg.addColorStop(1, 'rgba(255,206,140,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/** Engraved text — cut into the surface, lit from the same key. */
export function engrave(ctx, text, x, y, opts = {}) {
  const {
    font = '600 14px Inter', align = 'center', baseline = 'middle',
    depth = 1, tint = '255,255,255', darkness = 0.72, light = 0.30,
    letterSpacing = '0.24em',
  } = opts;
  ctx.save();
  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = letterSpacing;
  ctx.textAlign = align; ctx.textBaseline = baseline;
  ctx.fillStyle = `rgba(0,0,0,${darkness})`;
  ctx.fillText(text, x, y);
  ctx.fillStyle = `rgba(${tint},${light})`;
  ctx.fillText(text, x + depth * 0.7, y + depth);
  ctx.restore();
}

/** Raised/embossed text. */
export function emboss(ctx, text, x, y, opts = {}) {
  const {
    font = '700 14px Inter', align = 'center', baseline = 'middle',
    depth = 1, color = '#d8d2c6', letterSpacing = '0.2em',
  } = opts;
  ctx.save();
  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = letterSpacing;
  ctx.textAlign = align; ctx.textBaseline = baseline;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(text, x + depth, y + depth * 1.2);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillText(text, x - depth * 0.5, y - depth * 0.6);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ---------------------------------------------------------------
// Paths
// ---------------------------------------------------------------
export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
export function ellipsePath(ctx, cx, cy, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rot, 0, TAU);
}
