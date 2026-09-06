// ============================================================
// wreckage.js — what you broke stays broken
// ------------------------------------------------------------
// The single cheapest way to make five separate toys feel like one
// exhibition: never clean up. Every chapter deposits what the player
// destroyed here, and the room keeps drawing it for the rest of the
// game. By Chapter V the plinth is a crime scene.
//
// Items are stored in plinth-relative coordinates so they survive
// resize and orientation changes:
//   rx  = (x - plinth.cx) / plinth.topRx     (-1 .. 1 across the top)
//   ry  = (y - plinth.topY) / u              (units below the top face)
//
// Levels only deposit *descriptors*. This file knows how to paint them,
// which keeps a dead chapter's rendering code from having to stay alive.
// ============================================================

import { TAU, clamp01, lerp, makeRng, rand, rrange } from '../core/math.js';
import {
  PALETTES, KEY, metalFill, contactShadow, litEdges, facetNormal,
} from '../render/materials.js';

const KINDS = new Set(['shard', 'screw', 'thread', 'crumb', 'ash', 'bead']);

export class Wreckage {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.max = 220;
    this._buf = [];                       // reused screen-space outline
  }

  /**
   * add({ kind, x, y, a, size, seed, hue })
   * x/y are in current screen space; they are converted to plinth-relative.
   */
  add(it) {
    const G = this.game.set.geom;
    if (!G || !KINDS.has(it.kind)) return null;
    const rec = {
      kind: it.kind,
      rx: (it.x - G.cx) / G.topRx,
      ry: (it.y - G.topY) / G.u,
      a: it.a || 0,
      size: (it.size || G.u) / G.u,        // in layout units
      seed: it.seed ?? (rand() * 1e6) | 0,
      hue: it.hue || null,
      chapter: this.game.index,
    };
    this.items.push(rec);
    if (this.items.length > this.max) this.items.shift();
    return rec;
  }

  /** Bulk deposit — pass an array of Debris bodies straight from a level. */
  addDebris(list, kind, sizeOf = (d) => d.radius) {
    for (const d of list) this.add({ kind, x: d.x, y: d.y, a: d.a, size: sizeOf(d) });
  }

  clear() { this.items.length = 0; }

  /** Screen position of an item under the current layout. */
  pos(it) {
    const G = this.game.set.geom;
    return [G.cx + it.rx * G.topRx, G.topY + it.ry * G.u];
  }

  /**
   * draw(ctx, { light, glow })
   *  light — optional (x, y, radius) pool; outside it items are unlit,
   *          which is how Chapter V's finger-lamp reveals the mess.
   */
  draw(ctx, opts = {}) {
    const G = this.game.set.geom;
    if (!G || !this.items.length) return;
    const u = G.u;
    const amb = opts.ambient ?? this.game.set.lit;
    const light = opts.light || null;

    // A movable light source casts movable shadows, and that — not the
    // brightness — is what makes a pool of light read as a light rather
    // than as a hole cut in a mask. Each piece throws a streak directly
    // away from the source, longer and fainter the further out it sits.
    if (light) {
      ctx.save();
      for (const it of this.items) {
        const [x, y] = this.pos(it);
        const dx = x - light.x, dy = y - light.y;
        const d = Math.hypot(dx, dy);
        if (d > light.r || d < 1e-3) continue;
        const k = 1 - d / light.r;                 // 1 at the source
        const len = it.size * u * (1.2 + (1 - k) * 7);
        const nx = dx / d, ny = dy / d;
        ctx.globalAlpha = clamp01(k * k * 0.38 * (light.strength ?? 1));
        ctx.fillStyle = '#000';
        ctx.beginPath();
        // long and narrow, foreshortened like everything else on this
        // surface — a round blob reads as a smudge, not as a shadow
        ctx.ellipse(x + nx * len * 0.5, y + ny * len * 0.5 * 0.34,
          len * 0.5 + it.size * u * 0.4, it.size * u * 0.28,
          Math.atan2(ny * 0.34, nx), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const it of this.items) {
      const [x, y] = this.pos(it);
      let l = amb;
      if (light) {
        // inverse-square-ish: bright and tight at the fingertip, gone
        // well before the edge of the pool, so sweeping it reveals things
        // one at a time instead of all at once
        const d = Math.hypot(x - light.x, y - light.y);
        const t = clamp01(1 - d / light.r);
        l = Math.max(amb, (t * t) / (1 + (1 - t) * 3) * 2.2 * (light.strength ?? 1));
      }
      if (l < 0.02) continue;
      const s = it.size * u;
      // Which way the light is coming from, from HERE. Normally that is
      // the gallery downlight, which is effectively at infinity. When a
      // chapter hands us a movable pool — Chapter IV's fingertip — the
      // direction is toward that pool, so a bead's highlight and a
      // shard's caustic swing round as the light passes them, which is
      // most of what sells a torch as a torch.
      let L = KEY;
      if (light) {
        const dx = light.x - x, dy = light.y - y;
        const d = Math.hypot(dx, dy) || 1;
        const lx = dx / d, ly = dy / d;
        const m = Math.hypot(lx, ly, 0.62);
        L = { x: lx / m, y: ly / m, z: 0.62 / m };
      }
      ctx.save();
      ctx.globalAlpha = clamp01(l);
      switch (it.kind) {
        case 'shard':  this._shard(ctx, x, y, s, it, l, L); break;
        case 'screw':  this._screw(ctx, x, y, s, it, l, L); break;
        case 'thread': this._thread(ctx, x, y, s, it, l, L); break;
        case 'bead':   this._bead(ctx, x, y, s, it, l, L); break;
        case 'ash':    this._ash(ctx, x, y, s, it, l, L); break;
        default:       this._crumb(ctx, x, y, s, it, l, L); break;
      }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------
  // Shading
  // ------------------------------------------------------------
  // Everything below used to be one screen-space linear gradient per
  // fragment, at a fixed 45 degrees, with a 1px white stroke all the way
  // around. Three consequences, all of them visible:
  //
  //   * every piece in the pile had the same value, because the gradient
  //     did not know which way the piece was facing, so a heap of glass
  //     read as a decal sheet rather than as a heap;
  //   * the all-round stroke is the exact tell that makes a polygon read
  //     as paper — real glass lights only the edges turned toward the
  //     lamp, and the far ones go darker than the ground;
  //   * clear glass filled at 0.55 white composited brighter than the
  //     plinth under it. In the blackout at the end of Chapter I the
  //     debris measured three and a half times brighter than the surface
  //     it was lying on and ten times brighter than the wall.
  //
  // So each piece now carries a facet normal, and every one of them is
  // lit by the same light the rest of the room is.

  /**
   * A resting fragment's facet normal.
   *
   * Nothing deposits one — the levels hand over a position and an angle —
   * so it is derived from the seed. Most pieces come to rest lying flat
   * and face the lamp squarely; a few caught on the ones beneath them and
   * are tilted. Deterministic, so it survives a resize, and cached,
   * because it never changes.
   */
  _normal(it) {
    return it._n || (it._n = facetNormal(it.seed ^ 0x5f3a));
  }

  /**
   * The outline, in local units, cached on the item.
   *
   * Glass does not break into squat random-radius stars. It breaks into
   * convex slivers: three or four near-straight edges and a long axis two
   * to four times the short one. Brass and crumbs are chunkier.
   */
  _shape(it) {
    if (it._p) return it._p;
    const rng = makeRng((it.seed + 991) >>> 0);
    const glassy = it.kind === 'shard';
    const n = glassy ? 3 + ((rng() * 2) | 0) : (it.kind === 'screw' ? 6 : 3 + ((rng() * 3) | 0));
    const ar = glassy ? 2.0 + rng() * 2.0 : 1.0 + rng() * 0.3;
    const k = Math.sqrt(ar);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + rng() * (glassy ? 0.20 : 0.5);
      const rr = glassy ? 0.80 + rng() * 0.26 : 0.55 + rng() * 0.7;
      pts.push(Math.cos(ang) * rr * k, Math.sin(ang) * rr / k);
    }
    // Which way round did that come out? Sign the area once so the edge
    // pass can trust its outward normals instead of guessing.
    let area = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const j = (i + 2) % pts.length;
      area += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
    }
    pts.ccw = area > 0;
    return (it._p = pts);
  }

  /** Screen-space outline of one item, reused by the fill and edge passes. */
  _screenPoly(it, x, y, s, out) {
    const pts = this._shape(it);
    const ca = Math.cos(it.a), sa = Math.sin(it.a);
    out.length = 0;
    for (let i = 0; i < pts.length; i += 2) {
      out.push(x + (pts[i] * ca - pts[i + 1] * sa) * s,
        y + (pts[i] * sa + pts[i + 1] * ca) * s * 0.72);
    }
    out.ccw = pts.ccw;
    return out;
  }

  _tracePoly(ctx, p) {
    ctx.beginPath();
    for (let i = 0; i < p.length; i += 2) i ? ctx.lineTo(p[i], p[i + 1]) : ctx.moveTo(p[i], p[i + 1]);
    ctx.closePath();
  }

  _edges(ctx, p, L, lit, dim, wid) { litEdges(ctx, p, L, lit, dim, wid); }

  _shard(ctx, x, y, s, it, l, L) {
    const n = this._normal(it);
    const diff = Math.max(0, n.x * L.x + n.y * L.y + n.z * L.z);
    // A propped piece throws a longer, softer shadow than a flat one, and
    // lands on it less squarely.
    contactShadow(ctx, x, y + s * (0.30 + n.tilt * 0.5), s * (1.4 + n.tilt * 1.3),
      s * (0.34 + n.tilt * 0.3), { strength: (0.62 - n.tilt * 0.2) * l });

    const p = this._screenPoly(it, x, y, s, this._buf);
    this._tracePoly(ctx, p);
    // Clear glass on a lit surface is DARKER than the surface, plus a
    // caustic. Filling it with half-opaque white is what made a pile of
    // it measure brighter than the plinth it was lying on.
    // Not a flat swatch: a ramp aligned with the light, so the far side of
    // each piece is the plinth seen through darkened glass and the near
    // side is picking the lamp up. Mostly you should see the plinth
    // through it — a chip of clear glass on a table is nearly invisible
    // until an edge catches something.
    const bg = ctx.createLinearGradient(
      x - L.x * s * 1.5, y - L.y * s * 1.5, x + L.x * s * 1.5, y + L.y * s * 1.5);
    bg.addColorStop(0, `rgba(8,12,18,${(0.34 - diff * 0.12) * l})`);
    bg.addColorStop(0.55, `rgba(58,76,92,${0.13 * l})`);
    bg.addColorStop(1, `rgba(186,216,236,${(0.10 + diff * 0.22) * l})`);
    ctx.fillStyle = bg;
    ctx.fill();
    // and one facet, on the pieces actually turned toward the lamp
    if (diff > 0.62) {
      ctx.save();
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      const k = (diff - 0.62) / 0.38;
      const gg = ctx.createLinearGradient(x - s * L.x * 1.4, y - s * L.y * 1.4,
        x + s * L.x * 1.4, y + s * L.y * 1.4);
      gg.addColorStop(0, `rgba(236,250,255,${0.55 * k * l})`);
      gg.addColorStop(0.6, `rgba(200,228,246,${0.10 * k * l})`);
      gg.addColorStop(1, 'rgba(180,210,232,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(x - s * 2.2, y - s * 2.2, s * 4.4, s * 4.4);
      ctx.restore();
    }
    this._edges(ctx, p, L,
      `rgba(244,254,255,${(0.30 + diff * 0.62) * l})`,
      `rgba(10,16,24,${0.42 * l})`,
      Math.max(0.7, s * 0.10));
  }

  _screw(ctx, x, y, s, it, l, L) {
    const n = this._normal(it);
    const diff = Math.max(0, n.x * L.x + n.y * L.y + n.z * L.z);
    contactShadow(ctx, x, y + s * (0.34 + n.tilt * 0.5), s * (1.3 + n.tilt * 1.1),
      s * (0.36 + n.tilt * 0.3), { strength: (0.66 - n.tilt * 0.2) * l });
    const p = this._screenPoly(it, x, y, s, this._buf);
    this._tracePoly(ctx, p);
    ctx.save();
    ctx.clip();
    metalFill(ctx, x - s, y - s, x + s, y + s, PALETTES.brass);
    // brass is opaque, so the facet's angle changes its VALUE, not its
    // transparency: a head lying face-up blazes, one on its side does not
    ctx.fillStyle = diff > 0.5
      ? `rgba(255,240,200,${(diff - 0.5) * 0.7 * l})`
      : `rgba(8,6,2,${(0.5 - diff) * 1.1 * l})`;
    ctx.fillRect(x - s * 2, y - s * 2, s * 4, s * 4);
    ctx.restore();
    this._edges(ctx, p, L,
      `rgba(255,244,206,${(0.20 + diff * 0.55) * l})`,
      `rgba(14,10,3,${0.5 * l})`,
      Math.max(0.7, s * 0.11));
  }

  _thread(ctx, x, y, s, it, l, L) {
    const rng = makeRng(it.seed);
    contactShadow(ctx, x + s * 0.6, y + s * 0.35, s * 2.0, s * 0.34, { strength: 0.34 * l });
    const pts = [x, y];
    let px = x, py = y;
    for (let i = 0; i < 5; i++) {
      px += (rng() - 0.5) * s * 3;
      py += (rng() - 0.5) * s * 1.0;
      pts.push(px, py);
    }
    const trace = () => {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) i ? ctx.lineTo(pts[i], pts[i + 1]) : ctx.moveTo(pts[i], pts[i + 1]);
    };
    ctx.lineCap = 'round';
    // a fibre lying on a surface is a dark line with a lit crown, never a
    // single flat stroke
    ctx.strokeStyle = `rgba(18,12,4,${0.45 * l})`;
    ctx.lineWidth = Math.max(1, s * 0.22);
    trace(); ctx.stroke();
    ctx.save();
    ctx.translate(L.x * s * 0.10, L.y * s * 0.10);
    ctx.strokeStyle = `rgba(${it.hue || '214,176,96'},${0.82 * l})`;
    ctx.lineWidth = Math.max(0.8, s * 0.13);
    trace(); ctx.stroke();
    ctx.restore();
  }

  _bead(ctx, x, y, s, it, l, L) {
    contactShadow(ctx, x - L.x * s * 0.5, y + s * 0.55, s * 1.25, s * 0.4, { strength: 0.6 * l });
    // The specular used to be nailed to the top left. In Chapter IV the
    // lamp is a visible object hanging above and to the right of these,
    // so every bead had its highlight pointing the wrong way.
    const hx = x + L.x * s * 0.45, hy = y + L.y * s * 0.45;
    const g = ctx.createRadialGradient(hx, hy, 0, x, y, s * 1.15);
    g.addColorStop(0, `rgba(255,252,244,${0.62 * l})`);
    g.addColorStop(0.30, `rgba(${it.hue || '210,120,140'},${0.9 * l})`);
    g.addColorStop(0.78, `rgba(${it.hue || '110,40,60'},${0.92 * l})`);
    g.addColorStop(1, `rgba(24,8,12,${0.9 * l})`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.78, 0, 0, TAU); ctx.fill();
    // the bounce off the plinth, on the side away from the lamp
    ctx.fillStyle = `rgba(255,236,206,${0.16 * l})`;
    ctx.beginPath();
    ctx.ellipse(x - L.x * s * 0.62, y - L.y * s * 0.5, s * 0.34, s * 0.22,
      Math.atan2(-L.x, L.y), 0, TAU);
    ctx.fill();
    // and the tight glint
    ctx.fillStyle = `rgba(255,255,255,${0.7 * l})`;
    ctx.beginPath(); ctx.ellipse(hx, hy, s * 0.20, s * 0.13, Math.atan2(L.y, L.x), 0, TAU); ctx.fill();
  }

  _ash(ctx, x, y, s, it, l) {
    contactShadow(ctx, x, y + s * 0.22, s * 1.1, s * 0.3, { strength: 0.30 * l });
    ctx.fillStyle = `rgba(120,116,112,${0.35 * l})`;
    ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.5, it.a, 0, TAU); ctx.fill();
  }

  _crumb(ctx, x, y, s, it, l, L) {
    const n = this._normal(it);
    const diff = Math.max(0, n.x * L.x + n.y * L.y + n.z * L.z);
    contactShadow(ctx, x, y + s * 0.3, s * 1.2, s * 0.32, { strength: 0.44 * l });
    const p = this._screenPoly(it, x, y, s, this._buf);
    this._tracePoly(ctx, p);
    const v = 0.42 + diff * 0.6;
    ctx.fillStyle = `rgba(${it.hue || '150,148,146'},${clamp01(v) * 0.85 * l})`;
    ctx.fill();
    this._edges(ctx, p, L,
      `rgba(236,232,226,${0.34 * l})`, `rgba(10,10,12,${0.42 * l})`,
      Math.max(0.6, s * 0.09));
  }
}
