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
import { PALETTES, metalFill, contactShadow } from '../render/materials.js';

const KINDS = new Set(['shard', 'screw', 'thread', 'crumb', 'ash', 'bead']);

export class Wreckage {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.max = 220;
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
    for (const it of this.items) {
      const [x, y] = this.pos(it);
      let l = amb;
      if (light) {
        const d = Math.hypot(x - light.x, y - light.y);
        l = Math.max(amb, clamp01(1 - d / light.r) ** 1.6 * (light.strength ?? 1));
      }
      if (l < 0.02) continue;
      const s = it.size * u;
      ctx.save();
      ctx.globalAlpha = clamp01(l);
      switch (it.kind) {
        case 'shard':  this._shard(ctx, x, y, s, it, l); break;
        case 'screw':  this._screw(ctx, x, y, s, it, l); break;
        case 'thread': this._thread(ctx, x, y, s, it, l); break;
        case 'bead':   this._bead(ctx, x, y, s, it, l); break;
        case 'ash':    this._ash(ctx, x, y, s, it, l); break;
        default:       this._crumb(ctx, x, y, s, it, l); break;
      }
      ctx.restore();
    }
  }

  _poly(ctx, x, y, s, a, seed, n) {
    const rng = makeRng(seed);
    const k = n || 3 + ((rng() * 3) | 0);
    ctx.beginPath();
    for (let i = 0; i < k; i++) {
      const ang = i / k * TAU + a + rng() * 0.5;
      const rr = s * (0.5 + rng() * 0.8);
      const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr * 0.72;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  _shard(ctx, x, y, s, it, l) {
    contactShadow(ctx, x, y + s * 0.35, s * 1.5, s * 0.45, { strength: 0.45 * l });
    this._poly(ctx, x, y, s, it.a, it.seed);
    const g = ctx.createLinearGradient(x - s, y - s, x + s, y + s);
    g.addColorStop(0, `rgba(198,224,242,${0.26 * l})`);
    g.addColorStop(0.45, `rgba(255,255,255,${0.55 * l})`);
    g.addColorStop(1, `rgba(146,182,212,${0.22 * l})`);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.72 * l})`;
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }

  _screw(ctx, x, y, s, it, l) {
    contactShadow(ctx, x, y + s * 0.4, s * 1.4, s * 0.45, { strength: 0.5 * l });
    this._poly(ctx, x, y, s, it.a, it.seed, 6);
    ctx.save();
    ctx.clip();
    metalFill(ctx, x - s, y - s, x + s, y + s, PALETTES.brass);
    ctx.restore();
    ctx.strokeStyle = `rgba(255,238,198,${0.4 * l})`;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  _thread(ctx, x, y, s, it, l) {
    const rng = makeRng(it.seed);
    ctx.strokeStyle = `rgba(${it.hue || '214,176,96'},${0.7 * l})`;
    ctx.lineWidth = Math.max(0.8, s * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    let px = x, py = y;
    ctx.moveTo(px, py);
    for (let i = 0; i < 5; i++) {
      px += (rng() - 0.5) * s * 3;
      py += (rng() - 0.5) * s * 1.0;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  _bead(ctx, x, y, s, it, l) {
    contactShadow(ctx, x, y + s * 0.5, s * 1.2, s * 0.4, { strength: 0.45 * l });
    const g = ctx.createRadialGradient(x - s * 0.3, y - s * 0.4, 0, x, y, s);
    g.addColorStop(0, `rgba(255,255,255,${0.5 * l})`);
    g.addColorStop(0.4, `rgba(${it.hue || '210,120,140'},${0.85 * l})`);
    g.addColorStop(1, `rgba(${it.hue || '110,40,60'},${0.9 * l})`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.78, 0, 0, TAU); ctx.fill();
  }

  _ash(ctx, x, y, s, it, l) {
    ctx.fillStyle = `rgba(120,116,112,${0.35 * l})`;
    ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.5, it.a, 0, TAU); ctx.fill();
  }

  _crumb(ctx, x, y, s, it, l) {
    this._poly(ctx, x, y, s, it.a, it.seed);
    ctx.fillStyle = `rgba(${it.hue || '150,148,146'},${0.6 * l})`;
    ctx.fill();
  }
}
