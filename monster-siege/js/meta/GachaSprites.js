// Monster Siege - gacha sprite rendering (meta #2).
//
// Turns a SpeciesArt frame-strip canvas into an animated DOM element with the
// pixel grid intact. The technique:
//   - build the strip at px = 1 (one canvas pixel per art cell) so the source
//     is the true pixel grid with no pre-baked scale,
//   - set it as a background-image on a div with image-rendering: pixelated
//     and a background-size that is an INTEGER multiple of the strip's natural
//     size, so every art cell lands on an exact NxN block of screen pixels,
//   - step background-position-x by exactly frameWidth * scale to play the
//     walk cycle.
// A non-integer scale (the classic 2.5x) makes nearest-neighbour emit uneven
// 2px/3px columns, which is the single most common way pixel art gets ruined
// in a DOM overlay, so every scale here goes through Math.floor.
//
// One shared ticker drives every live sprite; elements that fall out of the
// document are dropped from it automatically, so opening/closing the overlay
// hundreds of times cannot leak timers.

const GachaSprites = (function () {
  'use strict';

  const cache = Object.create(null);   // cacheKey -> { url, w, h, frames }
  let speciesCache = null;

  function allSpecies() {
    if (!speciesCache) speciesCache = window.SpeciesArt.buildAllSpecies();
    return speciesCache;
  }

  // Build (once) the data-URL strip for a roster entry, applying its variant
  // tint to a CLONE of the species - SpeciesArt's own object is never mutated.
  function stripFor(monsterId) {
    if (cache[monsterId]) return cache[monsterId];
    const entry = GachaData.MONSTER_BY_ID[monsterId];
    const base = allSpecies()[entry.species];
    const species = entry.tint
      ? { id: base.id, width: base.width, height: base.height, frames: base.frames,
          palette: GachaData.recolorPalette(base.palette, entry.tint) }
      : base;
    const cvs = window.SpeciesArt.buildSpeciesCanvas(species, 1);
    const rec = {
      url: cvs.toDataURL(),
      w: base.width,
      h: base.height,
      frames: base.frames.length,
    };
    cache[monsterId] = rec;
    return rec;
  }

  // Largest integer scale that fits the art inside boxPx (measured on the
  // TALLER of the two axes so a wide serpent and a tall biped both fit).
  function fitScale(monsterId, boxW, boxH) {
    const s = stripFor(monsterId);
    const byW = Math.floor(boxW / s.w);
    const byH = Math.floor(boxH / s.h);
    return Math.max(1, Math.min(byW, byH));
  }

  const live = [];
  let ticking = false;

  function tick() {
    const now = performance.now();
    for (let i = live.length - 1; i >= 0; i--) {
      const sp = live[i];
      if (!sp.el.isConnected) { live.splice(i, 1); continue; }
      if (sp.paused) continue;
      const f = Math.floor((now + sp.phase) / sp.ms) % sp.frames;
      if (f !== sp.frame) {
        sp.frame = f;
        sp.el.style.backgroundPositionX = (-f * sp.w * sp.scale) + 'px';
      }
    }
    if (live.length) requestAnimationFrame(tick);
    else ticking = false;
  }

  function register(sp) {
    live.push(sp);
    if (!ticking) { ticking = true; requestAnimationFrame(tick); }
  }

  // opts: { scale } exact integer scale, or { boxW, boxH } to fit;
  //       { animate } default true, { ms } frame duration, { className }.
  function create(monsterId, opts) {
    const o = opts || {};
    const s = stripFor(monsterId);
    const scale = Math.max(1, Math.floor(o.scale || fitScale(monsterId, o.boxW || 64, o.boxH || 64)));
    const el = document.createElement('div');
    el.className = 'gm-sprite' + (o.className ? ' ' + o.className : '');
    el.style.width = (s.w * scale) + 'px';
    el.style.height = (s.h * scale) + 'px';
    el.style.backgroundImage = 'url(' + s.url + ')';
    el.style.backgroundSize = (s.w * s.frames * scale) + 'px ' + (s.h * scale) + 'px';
    el.style.backgroundPosition = '0px 0px';
    el.dataset.monster = monsterId;
    if (o.animate !== false && s.frames > 1) {
      register({
        el, w: s.w, scale, frames: s.frames, frame: -1,
        ms: o.ms || 190,
        // per-sprite phase so a grid of sprites does not step in lockstep,
        // which reads as one flickering block rather than a row of creatures
        phase: Math.random() * 4000,
        paused: false,
      });
    }
    return el;
  }

  function info(monsterId) { return stripFor(monsterId); }

  return { create, info, fitScale, stripFor };
})();
