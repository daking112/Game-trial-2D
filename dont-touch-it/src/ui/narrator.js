// ============================================================
// narrator.js — the voice that tells you not to
// ------------------------------------------------------------
// Word-by-word reveal with a blur/rise, queued so levels can fire
// lines without stepping on each other. Tone escalates: the narrator
// gets terser and more rattled the more you disobey.
// ============================================================

import { SFX } from '../core/audio.js';

export class Narrator {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.id = 'narrator';
    root.appendChild(this.el);
    this.queue = [];
    this.current = null;
    this.t = 0;
    this.holdUntil = 0;
    this.line = null;
    this.muted = false;
  }

  /**
   * say(text, {hold, agitated, delay, voice})
   *  hold      — seconds to stay on screen after the last word lands
   *  agitated  — colour shift + faster cadence
   */
  say(text, opts = {}) {
    this.queue.push({ text, hold: opts.hold ?? 2.1, agitated: !!opts.agitated,
                      delay: opts.delay ?? 0, speed: opts.speed ?? 1, quiet: !!opts.quiet });
    return this;
  }
  /** Drop anything queued and show this immediately. */
  interrupt(text, opts = {}) {
    this.queue.length = 0;
    this._clear(true);
    this.holdUntil = 0;
    return this.say(text, { ...opts, delay: 0 });
  }
  clear() { this.queue.length = 0; this._clear(); this.holdUntil = 0; }

  _clear(instant = false) {
    if (!this.line) return;
    const line = this.line;
    this.line = null;
    if (instant) { line.remove(); return; }
    const words = line.querySelectorAll('.word');
    words.forEach((w, i) => {
      w.classList.remove('in');
      w.style.animationDelay = `${i * 0.018}s`;
      w.classList.add('out');
    });
    setTimeout(() => line.remove(), 500 + words.length * 20);
  }

  _show(item) {
    const line = document.createElement('div');
    line.className = 'line' + (item.agitated ? ' agitated' : '');
    line.style.opacity = '1';
    const parts = item.text.split(/(\s+)/);
    let i = 0;
    for (const p of parts) {
      if (!p) continue;
      const w = document.createElement('span');
      w.className = 'word';
      w.textContent = p;
      const stagger = (item.agitated ? 0.038 : 0.058) / item.speed;
      w.style.animationDelay = `${i * stagger}s`;
      requestAnimationFrame(() => w.classList.add('in'));
      line.appendChild(w);
      if (p.trim()) i++;
    }
    this.el.appendChild(line);
    this.line = line;
    this.wordCount = i;
    if (!item.quiet) SFX.uiSoft(item.agitated ? 1.25 : 1);
    const reveal = i * ((item.agitated ? 0.038 : 0.058) / item.speed) + 0.6;
    this.holdUntil = this.t + reveal + item.hold;
  }

  update(dt) {
    this.t += dt;
    if (this.t < this.holdUntil) return;
    if (this.line) { this._clear(); this.holdUntil = this.t + 0.34; return; }
    if (!this.queue.length) return;
    const it = this.queue[0];
    if (it.delay > 0) { it.delay -= dt; return; }
    this.queue.shift();
    this._show(it);
  }

  get busy() { return !!this.line || this.queue.length > 0; }
}
