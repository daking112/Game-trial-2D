// ============================================================
// main.js — boot, title, level registry, test seam
// ============================================================

import { Game } from './game/game.js';
import { Audio, SFX } from './core/audio.js';
import Haptics from './core/haptics.js';
import { loadLevels } from './game/levels/index.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('world');
const overlay = document.getElementById('overlay');

const LEVELS = await loadLevels();
const game = new Game(canvas, overlay, LEVELS);
game.debug = params.has('debug');
if (game.debug) document.body.classList.add('debug');
if (params.has('quality')) game.r.setQuality(params.get('quality'));

// ------------------------------------------------------------
// Boot / title
// ------------------------------------------------------------
overlay.insertAdjacentHTML('afterbegin', `
  <div id="title">
    <div class="mark">
      <span><i>Don't</i></span>
      <span><i>Touch</i></span>
      <span><i>It</i></span>
    </div>
    <div class="sub">An exhibition of poor impulse control</div>
    <div class="prompt">Tap to enter</div>
  </div>
  <div id="boot"><div class="dot"></div></div>
`);
const titleEl = document.getElementById('title');
const bootEl = document.getElementById('boot');

async function boot() {
  try { await document.fonts.ready; } catch (_) {}
  game.set.exposure = 0.16;
  game.set.coneStrength = 0.35;
  game.start();
  bootEl.classList.add('gone');
  // title choreography
  const items = titleEl.querySelectorAll('.mark span i');
  items.forEach((el, i) => {
    el.style.transition = 'transform 1.05s cubic-bezier(.16,1,.3,1)';
    el.style.transitionDelay = `${0.12 + i * 0.09}s`;
    requestAnimationFrame(() => { el.style.transform = 'translate3d(0,0,0)'; });
  });
  const sub = titleEl.querySelector('.sub');
  sub.style.transition = 'opacity 1.2s cubic-bezier(.16,1,.3,1)';
  sub.style.transitionDelay = '.5s';
  requestAnimationFrame(() => { sub.style.opacity = '1'; });
  const prompt = titleEl.querySelector('.prompt');
  setTimeout(() => { prompt.style.opacity = '1'; prompt.classList.add('on'); }, 1500);
  game.state = 'title';
  if (params.has('level')) {
    // deep-link straight into a chapter (used by the test harness)
    setTimeout(() => enter(true), 60);
  }
}

let entered = false;
async function enter(skipCard = false) {
  if (entered) return;
  entered = true;
  Audio.init().resume();
  Haptics.select();
  titleEl.classList.add('gone');
  titleEl.style.transition = 'opacity .7s cubic-bezier(.65,0,.35,1), transform 1.2s cubic-bezier(.16,1,.3,1)';
  titleEl.style.opacity = '0';
  titleEl.style.transform = 'scale(1.04)';
  setTimeout(() => titleEl.remove(), 1400);

  // room tone, quietly, under everything for the rest of the session
  game.ambience = Audio.drone({
    f: 46, gain: 0.035, send: 0.7, lfoRate: 0.07, lfoDepth: 0.9, attack: 4, filter: 240,
  });

  // goto() owns the lights-up; don't fight it
  const idx = params.has('level') ? Math.max(0, (parseInt(params.get('level'), 10) || 1) - 1) : 0;
  await new Promise(r => setTimeout(r, skipCard ? 120 : 700));
  await game.goto(idx, { card: !skipCard, instant: skipCard });
}

canvas.addEventListener('pointerdown', () => { if (!entered) enter(); }, { once: false });
titleEl.addEventListener('pointerdown', () => enter());

boot();

// ------------------------------------------------------------
// Test seam — lets an automated critic drive the real build
// ------------------------------------------------------------
window.__DTI__ = {
  game,
  get ready() { return game.running; },
  get state() { return game.state; },
  get level() { return game.level ? game.level.tag : null; },
  enter: () => enter(),
  goto: (n) => game.goto(n - 1, { card: false }),
  probe: () => game.level && game.level.probe ? game.level.probe() : null,
  fps: () => game._fps,
  quality: (q) => game.r.setQuality(q),
  mute: (m) => Audio.setMuted(m),
  /** Freeze the loop so a capture tool gets a stable, cheap-to-grab frame. */
  pause: () => { game.paused = true; },
  resume: () => { if (game.paused) { game.paused = false; game._last = performance.now() / 1000; } },
  /** Advance exactly one frame while paused (deterministic filmstrips). */
  step: (dt = 1 / 60) => { game.stepOnce(dt); },
};
