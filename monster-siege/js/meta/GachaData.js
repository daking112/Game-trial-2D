// Monster Siege - gacha/collection DATA + RULES layer (piece: meta #1).
//
// Pure logic, no DOM: the rarity table, the roster definition, stat maths,
// the weighted pull + pity roller, dupe->level progression, and the
// localStorage save wrapper. Everything that decides *what* a pull gives
// lives here; GachaReveal.js decides how it is presented and GachaMeta.js
// owns the screens.
//
// Classic script (no import/export) - declares one top-level `GachaData`.
//
// Art dependency policy: this file talks to js/monsters/SpeciesArt.js ONLY
// through buildAllSpecies()/buildSpeciesCanvas() and the documented fields
// (id/width/height/frames/palette). It never reads a palette KEY by name and
// never assumes a grid size or frame count, because that file is being
// rewritten at higher resolution. Variant recolours are done by a
// key-agnostic circular-mean hue rotation over whatever hex values the
// palette happens to contain (see recolorPalette), so they keep working if
// the art changes underneath.

const GachaData = (function () {
  'use strict';

  // -------------------------------------------------------------------
  // rarity tiers
  // -------------------------------------------------------------------
  // weight = base pull share BEFORE pity floors are applied. They sum to 1.
  const RARITIES = {
    common:    { id: 'common',    name: 'Common',    stars: 2, weight: 0.60, color: '#93a6c4', glow: '#4a5d7a' },
    rare:      { id: 'rare',      name: 'Rare',      stars: 3, weight: 0.27, color: '#4fc9f8', glow: '#1a7fb5' },
    epic:      { id: 'epic',      name: 'Epic',      stars: 4, weight: 0.10, color: '#bb86f7', glow: '#6c3fb0' },
    legendary: { id: 'legendary', name: 'Legendary', stars: 5, weight: 0.03, color: '#ffc55c', glow: '#c98518' },
  };
  const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];
  const rarityRank = id => RARITY_ORDER.indexOf(id);

  // Stat/refund scaling per tier.
  const RARITY_MULT   = { common: 1.00, rare: 1.25, epic: 1.55, legendary: 1.95 };
  const DUPE_REFUND   = { common: 30, rare: 70, epic: 160, legendary: 400 };

  // -------------------------------------------------------------------
  // pity
  // -------------------------------------------------------------------
  const PITY = {
    rare: 10,        // <=10 pulls without rare+ -> guaranteed rare+
    epic: 30,        // <=30 pulls without epic+ -> guaranteed epic+
    legSoftStart: 60,// legendary rate starts climbing after this many pulls
    legSoftStep: 0.06,
    legHard: 80,     // guaranteed legendary
  };

  // -------------------------------------------------------------------
  // costs
  // -------------------------------------------------------------------
  const COST_SINGLE = 100;
  const COST_MULTI  = 900;
  const MULTI_SIZE  = 10;
  const START_SHARDS = 1600;

  // -------------------------------------------------------------------
  // levelling: copies owned -> level. Index i holds the total copies needed
  // to BE level i+1, so 1 copy = Lv.1 and 32 copies = Lv.10 (the cap).
  // Derived, never stored - a save can never drift out of sync with it.
  // -------------------------------------------------------------------
  const LEVEL_COPIES = [1, 2, 3, 5, 7, 10, 14, 19, 25, 32];
  const MAX_LEVEL = LEVEL_COPIES.length;

  function levelForCopies(copies) {
    let lv = 0;
    for (let i = 0; i < LEVEL_COPIES.length; i++) if (copies >= LEVEL_COPIES[i]) lv = i + 1;
    return lv;
  }
  function copiesForLevel(level) { return LEVEL_COPIES[Math.max(0, Math.min(MAX_LEVEL, level) - 1)] || 0; }
  function levelProgress(copies) {
    const lv = levelForCopies(copies);
    if (lv >= MAX_LEVEL) return { level: lv, max: true, have: copies, need: 0, frac: 1 };
    const floor = copiesForLevel(lv);
    const next  = copiesForLevel(lv + 1);
    return { level: lv, max: false, have: copies - floor, need: next - floor, frac: (copies - floor) / (next - floor) };
  }

  // -------------------------------------------------------------------
  // roster
  // -------------------------------------------------------------------
  // Every entry is a distinct collectible with its own name, tier, stats and
  // lore. `species` picks which SpeciesArt builder draws it; `tint` (optional)
  // rotates that species' palette to a target hue so a variant strain reads as
  // its own creature rather than the same sprite twice. Base stats come from
  // the species ARCHETYPE (a quadruped bruiser and a winged skirmisher want
  // genuinely different numbers), then the tier multiplier and the entry's own
  // bias are applied.
  const ARCHETYPE_STATS = {
    ramhorn:   { hp: 130, dmg: 19, rate: 0.85, rng: 2.2, role: 'Bulwark' },
    emberwing: { hp:  72, dmg: 15, rate: 1.45, rng: 5.4, role: 'Skirmisher' },
    coilfang:  { hp:  88, dmg: 31, rate: 0.60, rng: 3.1, role: 'Striker' },
    sporeling: { hp: 104, dmg: 12, rate: 1.10, rng: 4.2, role: 'Warden' },
  };

  const MONSTERS = [
    // --- ramhorn line -------------------------------------------------
    { id: 'ramhorn',   species: 'ramhorn',   name: 'Ramhorn',   rarity: 'common',
      element: 'Earth', flavor: 'Herd beast of the low passes. Puts its skull through a siege ladder and calls it a morning.' },
    { id: 'duskram',   species: 'ramhorn',   name: 'Duskram',   rarity: 'common', tint: { hue: 232, sat: 0.55, light: -0.04 },
      element: 'Shade', flavor: 'A ramhorn that wandered too long under the ash-clouds. Its coat went the colour of dusk and stayed there.' },
    { id: 'cragram',   species: 'ramhorn',   name: 'Cragram',   rarity: 'rare',   tint: { hue: 196, sat: 0.35, light: 0.05 },
      element: 'Stone', bias: { hp: 1.25, dmg: 0.9 },
      flavor: 'Mineral crust grown into the hide over decades. Arrows chip it. Nothing much else does.' },

    // --- emberwing line -----------------------------------------------
    { id: 'ashmoth',   species: 'emberwing', name: 'Ashmoth',   rarity: 'common', tint: { hue: 218, sat: 0.28, light: 0.02 },
      element: 'Ash', bias: { dmg: 0.85, rate: 1.15 },
      flavor: 'Burnt out and still flying. Circles a battlefield the way cinders circle a chimney.' },
    { id: 'emberwing', species: 'emberwing', name: 'Emberwing', rarity: 'rare',
      element: 'Fire', flavor: 'Nests in flue-stacks and chimney throats. Hunts by dropping a coal and following the scream.' },
    { id: 'voidwing',  species: 'emberwing', name: 'Voidwing',  rarity: 'epic',   tint: { hue: 276, sat: 0.95, light: -0.05 },
      element: 'Void', bias: { dmg: 1.2, rng: 1.15 },
      flavor: 'Whatever it was before, it flew through something on the far side of the sky and came back thinner.' },
    { id: 'solacrest', species: 'emberwing', name: 'Solacrest', rarity: 'legendary', tint: { hue: 44, sat: 1.15, light: 0.09 },
      element: 'Radiant', bias: { dmg: 1.15, rate: 1.1 },
      flavor: 'One of nine. The others are accounted for. Sieges have been abandoned on the strength of a shadow passing overhead.' },

    // --- coilfang line ------------------------------------------------
    { id: 'coilfang',  species: 'coilfang',  name: 'Coilfang',  rarity: 'common',
      element: 'Venom', flavor: 'Patient. Coils in the culvert under a gate and waits for the gate to matter.' },
    { id: 'frostcoil', species: 'coilfang',  name: 'Frostcoil', rarity: 'rare',   tint: { hue: 190, sat: 0.85, light: 0.08 },
      element: 'Frost', bias: { rate: 1.2, hp: 0.9 },
      flavor: 'Its bite does not bleed you. It simply stops the part of you it bit.' },
    { id: 'venomcoil', species: 'coilfang',  name: 'Venomcoil', rarity: 'epic',   tint: { hue: 84,  sat: 1.1,  light: 0.03 },
      element: 'Blight', bias: { dmg: 1.3 },
      flavor: 'Sheds a fang a week and leaves them where boots go. The fangs keep working after it has left.' },

    // --- sporeling line -----------------------------------------------
    { id: 'sporeling', species: 'sporeling', name: 'Sporeling', rarity: 'common',
      element: 'Spore', flavor: 'Toddles toward the loudest noise. Nobody has established why, and the ones who investigated stopped writing.' },
    { id: 'glowcap',   species: 'sporeling', name: 'Glowcap',   rarity: 'rare',   tint: { hue: 168, sat: 0.9,  light: 0.10 },
      element: 'Lumen', bias: { rng: 1.2, hp: 1.1 },
      flavor: 'Lights the ground it stands on. Sappers hate it; it is very hard to dig quietly under a lamp.' },
    { id: 'rotcrown',  species: 'sporeling', name: 'Rotcrown',  rarity: 'epic',   tint: { hue: 104, sat: 0.75, light: -0.06 },
      element: 'Rot', bias: { hp: 1.25, dmg: 1.1 },
      flavor: 'The cap is a fruiting body. The creature is the mile of thread underneath the field you are standing in.' },
    { id: 'mycelord',  species: 'sporeling', name: 'Mycelord',  rarity: 'legendary', tint: { hue: 38, sat: 1.0, light: 0.12 },
      element: 'Ancient', bias: { hp: 1.3, dmg: 1.15, rng: 1.1 },
      flavor: 'Older than the wall it is defending. It remembers the forest that the wall was cut from, and has opinions.' },
  ];

  const MONSTER_BY_ID = {};
  MONSTERS.forEach(m => { MONSTER_BY_ID[m.id] = m; });

  // Pull pool per rarity - every entry of a tier is equally likely once the
  // tier is chosen.
  const POOL = { common: [], rare: [], epic: [], legendary: [] };
  MONSTERS.forEach(m => POOL[m.rarity].push(m.id));

  // -------------------------------------------------------------------
  // stats
  // -------------------------------------------------------------------
  // Level scaling: +11%/level on hp+dmg, +2%/level on fire rate, range flat
  // (a range creep would quietly rewrite the tower-defence maths).
  function statsFor(monsterId, level) {
    const m = MONSTER_BY_ID[monsterId];
    if (!m) return null;
    const base = ARCHETYPE_STATS[m.species];
    const rm = RARITY_MULT[m.rarity];
    const bias = m.bias || {};
    const lv = Math.max(1, level || 1);
    const growth = 1 + 0.11 * (lv - 1);
    return {
      hp:   Math.round(base.hp  * rm * (bias.hp   || 1) * growth),
      dmg:  Math.round(base.dmg * rm * (bias.dmg  || 1) * growth),
      rate: Math.round(base.rate * (bias.rate || 1) * (1 + 0.02 * (lv - 1)) * 100) / 100,
      rng:  Math.round(base.rng  * (bias.rng  || 1) * 10) / 10,
      role: base.role,
    };
  }

  // -------------------------------------------------------------------
  // the roller
  // -------------------------------------------------------------------
  // Returns { rarity, monsterId, pityKind } where pityKind is null for a
  // natural roll or 'rare'/'epic'/'legendary'/'soft' when a floor fired -
  // the UI shows that honestly instead of pretending it was luck.
  function legendaryChance(pityLeg) {
    const n = pityLeg + 1; // this pull's index in the dry streak
    let c = RARITIES.legendary.weight;
    if (n > PITY.legSoftStart) c += PITY.legSoftStep * (n - PITY.legSoftStart);
    return Math.min(1, c);
  }

  function rollOne(state, rnd) {
    const rand = rnd || Math.random;
    const legC = legendaryChance(state.pityLeg);
    let rarity = null;
    let pityKind = null;

    if (state.pityLeg + 1 >= PITY.legHard) { rarity = 'legendary'; pityKind = 'legendary'; }
    else if (rand() < legC) { rarity = 'legendary'; if (state.pityLeg + 1 > PITY.legSoftStart) pityKind = 'soft'; }

    if (!rarity) {
      // renormalise the non-legendary tiers over the probability legendary
      // did not take, so the published weights still add up.
      const rest = 1 - RARITIES.legendary.weight;
      const scale = (1 - legC) / rest;
      const wC = RARITIES.common.weight * scale;
      const wR = RARITIES.rare.weight * scale;
      let r = rand() * (1 - legC);
      if (r < wC) rarity = 'common';
      else if (r < wC + wR) rarity = 'rare';
      else rarity = 'epic';
    }

    // floors
    if (rarityRank(rarity) < rarityRank('epic') && state.pityEpic + 1 >= PITY.epic) { rarity = 'epic'; pityKind = 'epic'; }
    if (rarityRank(rarity) < rarityRank('rare') && state.pityRare + 1 >= PITY.rare) { rarity = 'rare'; pityKind = 'rare'; }

    const pool = POOL[rarity];
    const monsterId = pool[Math.floor(rand() * pool.length) % pool.length];
    return { rarity, monsterId, pityKind };
  }

  function advancePity(state, rarity) {
    const rank = rarityRank(rarity);
    state.pityRare = rank >= rarityRank('rare') ? 0 : state.pityRare + 1;
    state.pityEpic = rank >= rarityRank('epic') ? 0 : state.pityEpic + 1;
    state.pityLeg  = rank >= rarityRank('legendary') ? 0 : state.pityLeg + 1;
    state.totalPulls = (state.totalPulls || 0) + 1;
  }

  function pityView(state) {
    return [
      { id: 'rare', label: 'Rare',      have: state.pityRare, cap: PITY.rare,     color: RARITIES.rare.color },
      { id: 'epic', label: 'Epic',      have: state.pityEpic, cap: PITY.epic,     color: RARITIES.epic.color },
      { id: 'leg',  label: 'Legendary', have: state.pityLeg,  cap: PITY.legHard,  color: RARITIES.legendary.color,
        note: state.pityLeg >= PITY.legSoftStart ? 'rate up ' + Math.round(legendaryChance(state.pityLeg) * 100) + '%' : null },
    ];
  }

  // -------------------------------------------------------------------
  // state / persistence
  // -------------------------------------------------------------------
  const SAVE_KEY = 'monster-siege.gacha.v1';

  function freshState() {
    return {
      v: 1,
      shards: START_SHARDS,
      owned: {},           // monsterId -> copies
      pityRare: 0, pityEpic: 0, pityLeg: 0,
      totalPulls: 0,
      fastMode: false,
      seen: {},            // monsterId -> true once revealed at least once
    };
  }

  // Both directions are wrapped: Safari private mode throws on the mere
  // ACCESS of window.localStorage, not just on setItem, so even the read has
  // to be defended and the whole layer has to work with storage absent.
  function load() {
    const s = freshState();
    let raw = null;
    try { raw = window.localStorage.getItem(SAVE_KEY); }
    catch (e) { return { state: s, storage: false }; }
    if (!raw) return { state: s, storage: true };
    let data = null;
    try { data = JSON.parse(raw); } catch (e) { return { state: s, storage: true }; }
    if (!data || typeof data !== 'object') return { state: s, storage: true };
    // Field-by-field merge: a save written by an older build (or hand-edited)
    // must never be able to produce NaN shards or an unknown monster id.
    if (typeof data.shards === 'number' && isFinite(data.shards)) s.shards = Math.max(0, Math.floor(data.shards));
    ['pityRare', 'pityEpic', 'pityLeg', 'totalPulls'].forEach(k => {
      if (typeof data[k] === 'number' && isFinite(data[k])) s[k] = Math.max(0, Math.floor(data[k]));
    });
    s.fastMode = !!data.fastMode;
    if (data.owned && typeof data.owned === 'object') {
      Object.keys(data.owned).forEach(id => {
        if (!MONSTER_BY_ID[id]) return;
        const n = data.owned[id];
        if (typeof n === 'number' && isFinite(n) && n > 0) s.owned[id] = Math.floor(n);
      });
    }
    if (data.seen && typeof data.seen === 'object') {
      Object.keys(data.seen).forEach(id => { if (MONSTER_BY_ID[id]) s.seen[id] = true; });
    }
    return { state: s, storage: true };
  }

  function save(state) {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false; // quota, private mode, storage disabled - play on regardless
    }
  }

  function clear() {
    try { window.localStorage.removeItem(SAVE_KEY); return true; } catch (e) { return false; }
  }

  // -------------------------------------------------------------------
  // resolving a pull against owned state (the dupe rule)
  // -------------------------------------------------------------------
  // A dupe is never a dead pull: it always advances copies, which derives the
  // level; at cap it converts to shards instead.
  function applyPull(state, roll) {
    const before = state.owned[roll.monsterId] || 0;
    const lvBefore = levelForCopies(before);
    let refund = 0;
    let after = before + 1;

    if (lvBefore >= MAX_LEVEL) {
      // capped: keep counting copies for the collection number, but the
      // meaningful reward becomes shards.
      refund = DUPE_REFUND[roll.rarity];
      state.shards += refund;
    }
    state.owned[roll.monsterId] = after;
    const lvAfter = levelForCopies(after);
    advancePity(state, roll.rarity);

    const result = {
      monsterId: roll.monsterId,
      rarity: roll.rarity,
      pityKind: roll.pityKind,
      isNew: before === 0,
      copiesBefore: before,
      copiesAfter: after,
      levelBefore: lvBefore,
      levelAfter: lvAfter,
      leveledUp: lvAfter > lvBefore && before > 0,
      maxed: lvAfter >= MAX_LEVEL,
      refund: refund,
      progress: levelProgress(after),
      progressBefore: levelProgress(before),
    };
    return result;
  }

  // -------------------------------------------------------------------
  // colour helpers for variant tints (key-agnostic, see file header)
  // -------------------------------------------------------------------
  function hexToRgb(hex) {
    let h = String(hex).trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    if (!isFinite(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h, s, l };
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) { const v = l * 255; return { r: v, g: v, b: v }; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = t => {
      t = (t + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255 };
  }

  // Rotate a whole palette so its DOMINANT hue lands on tint.hue, preserving
  // each colour's offset from that dominant hue (so a two-tone creature stays
  // two-tone). Near-black outline pixels and near-white eye pixels are left
  // alone - recolouring those is what makes a naive hue-shift look like a
  // filter instead of a different animal. No palette KEY is referenced, so
  // this survives the art rewrite.
  function recolorPalette(palette, tint) {
    if (!tint) return palette;
    const entries = Object.keys(palette).map(k => ({ k, hex: palette[k], rgb: hexToRgb(palette[k]) }));
    const usable = [];
    entries.forEach(e => {
      if (!e.rgb) return;
      const hsl = rgbToHsl(e.rgb.r, e.rgb.g, e.rgb.b);
      e.hsl = hsl;
      if (hsl.s > 0.14 && hsl.l > 0.10 && hsl.l < 0.90) usable.push(e);
    });
    if (!usable.length) return palette;
    // circular mean hue, weighted by saturation
    let sx = 0, sy = 0;
    usable.forEach(e => {
      const rad = e.hsl.h * Math.PI / 180;
      sx += Math.cos(rad) * e.hsl.s; sy += Math.sin(rad) * e.hsl.s;
    });
    const meanHue = (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;
    const delta = tint.hue - meanHue;
    const satMul = tint.sat === undefined ? 1 : tint.sat;
    const lightAdd = tint.light || 0;

    const out = {};
    entries.forEach(e => {
      if (!e.hsl || usable.indexOf(e) === -1) { out[e.k] = e.hex; return; }
      const h = e.hsl.h + delta;
      const s = Math.max(0, Math.min(1, e.hsl.s * satMul));
      const l = Math.max(0.04, Math.min(0.96, e.hsl.l + lightAdd));
      const rgb = hslToRgb(h, s, l);
      out[e.k] = rgbToHex(rgb.r, rgb.g, rgb.b);
    });
    return out;
  }

  return {
    RARITIES, RARITY_ORDER, rarityRank, RARITY_MULT, DUPE_REFUND,
    PITY, COST_SINGLE, COST_MULTI, MULTI_SIZE, START_SHARDS,
    LEVEL_COPIES, MAX_LEVEL, levelForCopies, copiesForLevel, levelProgress,
    MONSTERS, MONSTER_BY_ID, POOL, ARCHETYPE_STATS, statsFor,
    legendaryChance, rollOne, advancePity, pityView, applyPull,
    SAVE_KEY, freshState, load, save, clear,
    recolorPalette,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GachaData;
