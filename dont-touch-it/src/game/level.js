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
  static hint = '';

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
  }

  // -------- lifecycle (override) --------
  enter() {}
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
  hint(text) { this.game.hud.hint(text); }
  hideHint() { this.game.hud.hideHint(); }
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
