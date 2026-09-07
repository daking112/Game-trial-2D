// ============================================================
// level.js — the contract every chapter implements
// ------------------------------------------------------------
// A level owns: its object, its rules, its choreography. It does NOT own
// the room, the camera, the post FX or the narrator — those are shared so
// that five very different objects still feel like one exhibition.
//
//   enter()          build state (layout() has already run once)
//   layout(w,h,u)    (re)compute geometry; called on every resize
//   update(dt)       simulate. dt is already time-dilated.
//   drawBack(ctx)    behind the pedestal (rare)
//   draw(ctx)        the object itself, in world space
//   drawFront(ctx)   above everything, still in world space
//   drawUi(ctx)      screen space, above post FX (rare)
//   exit()           tear down
//
// Levels signal success with this.solve(). The shell handles the
// transition, the chapter card, and the next level.
// ============================================================

import { Timeline, Smooth, Pulse } from '../core/tween.js';

export class Level {
  static id = 'level';
  static chapter = 'I';
  static rule = 'DO NOT TOUCH';
  /**
   * What the gallery prints on the card beside your object: a title, and
   * the medium line every museum label carries. The rule above is set
   * underneath it. Naming what a thing is made of is most of what makes a
   * label read as a label rather than as a caption.
   */
  static label = { title: 'Untitled', medium: ['Mixed media.'] };
  static hint = '';
  /**
   * Camera push for this chapter, applied by the shell on entry. Only
   * values >= 1 are safe: the room is rasterised to exactly the viewport,
   * so pulling back would reveal its edges. Exists because four chapters
   * framed identically start to read as one room with the props swapped.
   */
  static push = 1;

  constructor(game) {
    this.game = game;
    this.r = game.r;
    this.input = game.input;
    this.cam = game.cam;
    this.p = game.particles;
    this.tl = new Timeline();
    this.t = 0;
    this.solved = false;
    this.tag = this.constructor.id;
    /** Set true once the player has done the forbidden thing. */
    this.transgressed = false;
    /**
     * Set true if this chapter draws `game.wreck` itself — e.g. because it
     * controls the room's lighting and must reveal debris under its own
     * light source instead of the gallery's.
     */
    this.ownsWreckage = false;
    /**
     * Set true if this chapter lights the scene itself. The shell dims the
     * world to match the room's exposure; a chapter whose only light
     * source is drawn INSIDE its own draw() must opt out, or the shell
     * will dim the very light it is drawing.
     */
    this.ownsLighting = false;
  }

  // -------- lifecycle (override) --------
  enter() {}
  /**
   * Opening narration, separated from enter() so the shell can build a
   * chapter without it speaking — the title screen shows Chapter I's
   * object in half-light before the game has started.
   */
  intro() {}
  layout(w, h, u) {}
  update(dt) {}
  drawBack(ctx) {}
  draw(ctx) {}
  drawFront(ctx) {}
  drawUi(ctx) {}
  exit() {}

  /** Ambient light this level contributes to the shared room, 0..1. */
  roomLight() { return 1; }

  // -------- helpers --------
  say(text, opts) { this.game.narrator.say(text, opts); return this; }
  interrupt(text, opts) { this.game.narrator.interrupt(text, opts); return this; }
  /**
   * The moment the rule breaks.
   *
   * Every chapter's climax used to be a held still frame: three captures
   * spanning the three most dramatic seconds in Chapter I came back
   * pixel-identical apart from the narrator's line. The shell has owned a
   * camera with trauma, push, slowmo and flash the whole time and none of
   * it was legible at the payoff.
   *
   * Three phases, about nine hundred milliseconds:
   *
   *   overdrive   a warm flash and a kick, on the frame it happens;
   *   the look    time drops to a quarter and the camera pushes in and
   *               LEANS toward the event — a drift, not a recentre, so
   *               the player watches the thing rather than being carried
   *               to it;
   *   release     back out, on a slower ease than it went in, because a
   *               camera that snaps home undoes the beat it just made.
   *
   * (x, y) is the world point that just happened.
   */
  transgress(x, y, opts = {}) {
    const {
      zoom = 1.12, flash = '255,226,180', flashA = 0.28,
      slow = 0.26, hold = 0.34, release = 0.52, shake = 0.5, lean = 0.34,
    } = opts;
    const cam = this.game.cam, r = this.r;
    const base = Math.max(1, this.constructor.push || 1);
    if (flashA > 0) this.flash(flash, flashA, 0.3);
    if (shake > 0) this.shake(shake);
    if (slow < 1) this.slowmo(slow, hold);
    if (r && r.w) {
      cam.focus((r.w / 2 - x) * lean, (r.h / 2 - y) * lean, base * zoom, 2.4);
      this.tl.after(hold + release, () => cam.focus(0, 0, base, 1.05));
    }
  }

  // A hint is a second card pinned under the wall label, not a chip
  // floating over the room. See Set.setNote.
  hint(text) { this.game.set.setNote(text); }
  hideHint() { this.game.set.setNote(null); }
  shake(a) { this.cam.shake(a); }
  slowmo(s, d) { this.cam.slowmo(s, d); }
  flash(c, a, d) { this.cam.flash(c, a, d); }

  /**
   * Leave something behind. Deposited debris persists for the rest of the
   * game in plinth-relative coordinates.
   *   this.leave('shard', x, y, { size, a, hue })
   * Kinds: shard | screw | thread | crumb | ash | bead
   */
  leave(kind, x, y, opts = {}) {
    return this.game.wreck.add({ kind, x, y, ...opts });
  }
  /** Deposit a whole array of Debris bodies at once. */
  leaveDebris(list, kind, sizeOf) {
    this.game.wreck.addDebris(list, kind, sizeOf);
  }

  /**
   * Deposit the BIGGEST pieces of a debris field, and only those.
   *
   * A chapter that hands over everything it broke buries the plinth: two
   * glass chapters at sixty-odd pieces each, plus a mirror, is two hundred
   * overlapping translucent quads by the finale, which is the
   * transparency-accumulates trap under a different name. The large pieces
   * are what the eye reads as "this was smashed" anyway; the fines are
   * noise at plinth scale.
   */
  leaveBiggest(list, kind, max = 22, sizeOf = (d) => (d.data && (d.data.size ?? d.data.r)) || 1) {
    const G = this.game.set.geom;
    if (!G) return 0;
    // A piece has to be plausible AS DEBRIS, not at the size it was when
    // it was part of something. Chapter III's mirror comes apart into
    // wedges a third of the pane across on purpose — deposited at that
    // size they lie on the plinth like sheets of glass, wider than the
    // bell and hanging off both edges. Nothing in the pile gets to be
    // bigger than a fragment.
    const cap = G.topRx * 0.085;
    const settled = list.filter(d => d.rest !== false);
    const src = settled.length ? settled : list;
    const keep = src.slice().sort((a, b) => sizeOf(b) - sizeOf(a)).slice(0, max);
    for (const d of keep) {
      this.leave(kind, d.x, d.y, { size: Math.min(sizeOf(d), cap), a: d.a || 0 });
    }
    return keep.length;
  }

  solve(delay = 0) {
    if (this.solved) return;
    this.solved = true;
    this.game.onSolved(this, delay);
  }

  _tick(dt) {
    this.t += dt;
    this.tl.update(dt);
    this.update(dt);
  }
}
