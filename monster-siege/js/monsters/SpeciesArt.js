// Real monster pixel-art + animation pipeline (piece #45).
//
// Mechanically this is the same technique as core/TestSprite.js (a
// character grid mapped to hex colors via a palette, rendered as filled
// rects at a fixed PX-per-cell scale, frames laid out side-by-side into one
// horizontal strip canvas that PixelBillboard slices with texture.offset) -
// this file is what makes that technique produce actual creatures instead
// of a 2-frame test blob:
//   - a parametric tapered-body generator (per-row half-width profile) so
//     torsos/heads read as a real tapered silhouette, not a rectangular
//     plank
//   - hand-placed accents (horns/wings/tail/legs/eyes) merged on top,
//     always OVERLAPPING the body silhouette by at least one shared edge
//     pixel so nothing floats
//   - richer per-part color banding (3-4 body tones by row-band, not one
//     flat fill color)
//   - a JS port of monster-tactics/scripts/pixel_art_lib.py's connectivity
//     checker (connected_components/check_connected) and its measured
//     opaque%/color-count/outline% sanity ranges, run against every frame
//     of every species below before the module is trusted
//
// Dual-mode file: the species/geometry/validation logic below never touches
// `document`/`window` at module-eval time, only inside the canvas-building
// functions at the bottom - so this same file can be `require()`d from
// plain Node (see js/monsters/validate.js) to run the connectivity/range
// checks with no browser at all, and is also loaded as a classic script in
// index.html for the real game (attaches to `window.SpeciesArt`).

// ---------------------------------------------------------------------
// grid helpers - build a row of {col: char} sparse specs into a dense
// '.'-padded row string, the same convention TestSprite.js/pixel_art_lib.py
// use ('.' = transparent, any other char = a palette key).
// ---------------------------------------------------------------------

function run(x0, x1, ch) {
  const o = {};
  for (let x = x0; x <= x1; x++) o[x] = ch;
  return o;
}

function mergeRow(...specs) {
  return Object.assign({}, ...specs);
}

function rowsFromSpecs(specs, width) {
  return specs.map(spec => {
    const r = new Array(width).fill('.');
    for (const [idx, ch] of Object.entries(spec)) r[Number(idx)] = ch;
    return r.join('');
  });
}

// Parametric tapered silhouette: `profile[y]` is the half-width (in cells)
// of the body at row y, 0 meaning "no body pixels this row" (used for rows
// accents like legs fully own). `bandFor(y)` picks the fill color for that
// row (so a torso can band light-at-top / dark-at-bottom, or head vs body
// tones, instead of one flat color) and `edgeCh` outlines the silhouette's
// left/right boundary each row - this is what keeps a round body reading as
// a tapered creature instead of a flat rectangle, per the prior project's
// "rectangular plank" failure mode.
function taperedBody(profile, bandFor, edgeCh, centerCol) {
  return profile.map((hw, y) => {
    if (!hw || hw <= 0) return {};
    const x0 = centerCol - hw;
    const x1 = centerCol + hw - 1;
    const spec = run(x0, x1, bandFor(y));
    spec[x0] = edgeCh;
    spec[x1] = edgeCh;
    return spec;
  });
}

// Merge N frame-shaped row-spec arrays (all same length = height) into one,
// later arrays override earlier ones per-cell (so accents drawn after the
// body silhouette correctly paint over/alongside it).
function mergeFrame(...frameSpecArrays) {
  const height = frameSpecArrays[0].length;
  const out = [];
  for (let y = 0; y < height; y++) {
    out.push(mergeRow(...frameSpecArrays.map(f => f[y] || {})));
  }
  return out;
}

// ---------------------------------------------------------------------
// connectivity + sprite-range validation - JS port of
// monster-tactics/scripts/pixel_art_lib.py. Ported deliberately close to
// the original so the same lessons (4-connectivity only; diagonal-only
// touches read as visually pinched/disconnected) apply unchanged.
// ---------------------------------------------------------------------

function opaquePixels(rows) {
  const pixels = new Set();
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '.') pixels.add(x + ',' + y);
    }
  }
  return pixels;
}

// 4-connectivity flood fill. Returns components (each a Set of "x,y" keys),
// largest first - the single most useful check from the prior project:
// catches a tail/claw/horn placed with a gap so it doesn't visually attach
// to the body, which that project's own history says was the single most
// common failure mode of hand- or parametrically-placed pixel art.
function connectedComponents(rows) {
  const pixels = opaquePixels(rows);
  const seen = new Set();
  const components = [];
  for (const start of pixels) {
    if (seen.has(start)) continue;
    const stack = [start];
    const comp = new Set();
    while (stack.length) {
      const p = stack.pop();
      if (comp.has(p)) continue;
      comp.add(p);
      const [x, y] = p.split(',').map(Number);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const key = nx + ',' + ny;
        if (pixels.has(key) && !comp.has(key)) stack.push(key);
      }
    }
    for (const p of comp) seen.add(p);
    components.push(comp);
  }
  components.sort((a, b) => b.size - a.size);
  return components;
}

function checkConnected(rows, label) {
  const comps = connectedComponents(rows);
  if (comps.length <= 1) {
    console.log(`[SpeciesArt] ${label}: OK single connected silhouette (${comps[0] ? comps[0].size : 0}px)`);
    return true;
  }
  console.warn(`[SpeciesArt] ${label}: FAIL ${comps.length} disconnected pieces`);
  console.warn(`  main body: ${comps[0].size}px`);
  for (let i = 1; i < comps.length; i++) {
    console.warn(`  stray piece (${comps[i].size}px):`, [...comps[i]].sort());
  }
  return false;
}

// Numeric sanity bar, adapted from check_sprite_ranges in pixel_art_lib.py.
// That function measured real target ranges off actual reference pixel art
// at 16px/32px; our grids are hand/parametrically authored at varying
// sizes, so rather than hard-code a resolution-specific color-count table
// we use the same *shape* of check (opaque fraction of the sprite, outline
// fraction of the opaque pixels, distinct non-outline color count) with
// ranges chosen to match that project's measured "final tier" creature
// bar (richly colored, mostly-filled silhouette, moderate outlining) since
// every species here is meant to be shippable roster art, not a base-tier
// sketch.
const SPRITE_RANGE = { opaque: [0.28, 0.75], outlineFrac: [0.12, 0.45], minColors: 5 };

function checkSpriteRanges(rows, outlineCh, label) {
  const width = rows[0].length;
  const total = width * rows.length;
  const colorCounts = new Map();
  let opaque = 0, outline = 0;
  for (const row of rows) {
    for (const ch of row) {
      if (ch === '.') continue;
      opaque++;
      if (ch === outlineCh) outline++;
      else colorCounts.set(ch, (colorCounts.get(ch) || 0) + 1);
    }
  }
  const opaqueFrac = opaque / total;
  const outlineFrac = opaque ? outline / opaque : 0;
  const colors = colorCounts.size;
  const problems = [];
  if (opaqueFrac < SPRITE_RANGE.opaque[0] || opaqueFrac > SPRITE_RANGE.opaque[1]) {
    problems.push(`${(opaqueFrac * 100).toFixed(0)}% opaque, want ${SPRITE_RANGE.opaque[0] * 100}-${SPRITE_RANGE.opaque[1] * 100}%`);
  }
  if (outlineFrac < SPRITE_RANGE.outlineFrac[0] || outlineFrac > SPRITE_RANGE.outlineFrac[1]) {
    problems.push(`${(outlineFrac * 100).toFixed(0)}% outline, want ${SPRITE_RANGE.outlineFrac[0] * 100}-${SPRITE_RANGE.outlineFrac[1] * 100}%`);
  }
  if (colors < SPRITE_RANGE.minColors) {
    problems.push(`${colors} non-outline colors, want >= ${SPRITE_RANGE.minColors}`);
  }
  const ok = problems.length === 0;
  console.log(`[SpeciesArt] ${label}: ${ok ? 'OK' : 'FAIL'} colors=${colors} opaque=${(opaqueFrac * 100).toFixed(0)}% outline=${(outlineFrac * 100).toFixed(0)}%` +
    (ok ? '' : '  -- ' + problems.join('; ')));
  return ok;
}

// Validate every frame of a built species (all poses) and return true only
// if every single frame is both a single connected silhouette AND in the
// numeric sanity range. Called for every species at module load (in Node
// via validate.js, and in-browser at startup) rather than trusting the
// grids by eye.
function validateSpecies(species) {
  let ok = true;
  species.frames.forEach((rows, i) => {
    const label = `${species.id} frame${i}`;
    ok = checkConnected(rows, label) && ok;
    ok = checkSpriteRanges(rows, species.outline, label) && ok;
  });
  return ok;
}

// ---------------------------------------------------------------------
// Species 1: RAMHORN - chunky quadruped (grass/earth beast). Front-facing
// with a pseudo-3D leg stance (front legs centered/inner, back legs
// peeking wider at the sides) so a 3-frame diagonal-gait walk cycle
// (front-left+back-right vs front-right+back-left) reads clearly as
// motion instead of a body bob.
// ---------------------------------------------------------------------

function buildRamhorn() {
  const W = 24, H = 18, CENTER = 12;
  const K = 'K'; // outline
  // body tones: c = light highlight (top/head), a = mid (main coat),
  // b = dark shade (lower body/shadow side), h = horn, e = belly/muzzle,
  // wE = eye white, pE = pupil
  const palette = {
    K: '#141018', a: '#6a9944', b: '#446b2a', c: '#8fc45f',
    h: '#e8dcb0', e: '#e3d9a8', f: '#3a2c18',
    W: '#f4f7ee', P: '#161418'
  };
  const outline = 'K';

  // half-width per row, head (rows1-5) then body (rows6-12), legs own rows13-17
  const profile = [0, 2, 4, 5, 5, 6, 7, 8, 9, 9, 9, 8, 7, 0, 0, 0, 0, 0];
  const bandFor = y => (y <= 5 ? 'c' : y <= 9 ? 'a' : 'b'); // light head -> mid coat -> dark lower flank
  const body = taperedBody(profile, bandFor, outline, CENTER);

  // Precompute row edges we need (x0/x1) from profile for accent alignment.
  const edge = y => {
    const hw = profile[y];
    if (!hw) return null;
    return { x0: CENTER - hw, x1: CENTER + hw - 1 };
  };

  function accents(legPhase) {
    const acc = new Array(H).fill(null).map(() => ({}));
    // horns (touch head row2's edge, which is x0=8,x1=15 since hw=4)
    acc[0][9] = 'h'; acc[0][14] = 'h';
    acc[1][9] = 'h'; acc[1][10] = 'h'; acc[1][13] = 'h'; acc[1][14] = 'h';
    // eyes on head row4 (hw=5 -> x0=7,x1=16), same row = symmetric
    acc[4][9] = 'W'; acc[4][9 + 1] = 'P';
    acc[4][15] = 'W'; acc[4][15 - 1] = 'P';
    // muzzle/belly patch, rows5-9 center strip
    for (let y = 5; y <= 9; y++) { acc[y][CENTER - 1] = 'e'; acc[y][CENTER] = 'e'; }
    // ears: 2px bumps just outside row3 edge (hw=5 -> x0=7,x1=16)
    const e3 = edge(3);
    acc[2][e3.x0] = 'a'; acc[3][e3.x0 - 1] = 'a';
    acc[2][e3.x1] = 'a'; acc[3][e3.x1 + 1] = 'a';
    // tail stub off the back, row9-11 near right edge (hw=9 at row9 -> x1=20)
    const e9 = edge(9);
    acc[9][e9.x1 + 1] = 'b'; acc[10][e9.x1 + 1] = 'b'; acc[10][e9.x1 + 2] = 'b'; acc[11][e9.x1 + 1] = 'f';

    // legs: attach at row12 (hw=7 -> x0=5,x1=18), front legs inner
    // (cols 10-11 / 14-15), back legs outer (cols 6-7 / 17-18). legPhase
    // shifts which diagonal pair is "forward" (extended, 1 row longer) vs
    // "back" (retracted, 1 row shorter) - the actual walk-cycle motion.
    const legRows = { fwd: [13, 14, 15, 16], back: [13, 14, 15] };
    const frontL = [10, 11], frontR = [14, 15], backL = [6, 7], backR = [17, 18];
    const pairA = legPhase === 'A'; // front-left+back-right forward
    const drawLeg = (cols, forward) => {
      const rows = forward ? legRows.fwd : legRows.back;
      const lastRow = rows[rows.length - 1];
      for (const y of rows) {
        // outline the leg's leading (first) column like the body edges are
        // outlined, hoof color on the last row - keeps legs reading as
        // crisp 2px-wide limbs instead of a flat color block, and lifts
        // the sprite's outline-pixel fraction into the sane range.
        acc[y][cols[0]] = (y === lastRow) ? 'f' : 'K';
        acc[y][cols[1]] = (y === lastRow) ? 'f' : 'b';
      }
    };
    if (legPhase === 'N') {
      // neutral/passing pose: all four legs same (short) length
      drawLeg(frontL, false); drawLeg(frontR, false); drawLeg(backL, false); drawLeg(backR, false);
    } else {
      drawLeg(frontL, pairA); drawLeg(frontR, !pairA);
      drawLeg(backL, !pairA); drawLeg(backR, pairA);
    }
    return acc;
  }

  function frame(legPhase) {
    return rowsFromSpecs(mergeFrame(body, accents(legPhase)), W);
  }

  const frames = [frame('A'), frame('N'), frame('B')];
  return { id: 'ramhorn', archetype: 'quadruped', width: W, height: H, palette, outline, frames };
}

// ---------------------------------------------------------------------
// Species 2: EMBERWING - small winged wyvern. Body+head silhouette is
// slim/upright (very different mass distribution than the quadruped), with
// a pair of wings that are the actual animated part (up / level / down)
// instead of legs - reads as a flap cycle, not a walk cycle.
// ---------------------------------------------------------------------

function buildEmberwing() {
  const W = 26, H = 20, CENTER = 13;
  const outline = 'K';
  const palette = {
    K: '#1c0e12', a: '#c95a2e', b: '#8f3a1c', c: '#ef8a48', d: '#f7c26a',
    m: '#3a1a12', // wing membrane (dark, translucent-read)
    W: '#fff3dc', P: '#241016'
  };

  // slim upright body: narrow head, chest slightly wider, tail tapers away
  // below (drawn as part of the profile itself, curving to one side via a
  // per-row center offset so it isn't just a straight rectangle down).
  const profile = [0, 2, 3, 4, 4, 5, 5, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0];
  const centerOffset = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4]; // tail curls right
  const bandFor = y => (y <= 6 ? 'd' : y <= 12 ? 'c' : 'a');
  // taperedBody() doesn't support a per-row center offset (needed for the
  // tail curl below), so build the tapered rows directly instead:
  const bodyRows = profile.map((hw, y) => {
    if (!hw) return {};
    const c = CENTER + centerOffset[y];
    const x0 = c - hw, x1 = c + hw - 1;
    const spec = run(x0, x1, bandFor(y));
    spec[x0] = outline; spec[x1] = outline;
    return spec;
  });
  const edge = y => {
    const hw = profile[y];
    if (!hw) return null;
    const c = CENTER + centerOffset[y];
    return { x0: c - hw, x1: c + hw - 1 };
  };

  function accents(wingPhase) {
    const acc = new Array(H).fill(null).map(() => ({}));
    // horn/crest spikes on head (row1, hw=2 -> around col12/14)
    acc[0][12] = 'b'; acc[0][14] = 'b';
    acc[1][12] = 'b'; acc[1][14] = 'b';
    // eyes row3 (hw=4 -> x0=9,x1=16), symmetric
    acc[3][11] = 'W'; acc[3][12] = 'P';
    acc[3][15] = 'W'; acc[3][14] = 'P';
    // chest marking
    for (let y = 6; y <= 9; y++) { acc[y][CENTER - 1] = 'd'; acc[y][CENTER] = 'd'; }
    // legs: short stubby pair at bottom of torso, row9-10 area (hw=5 -> x0=8,x1=12 at row9... recompute)
    const e9 = edge(9);
    acc[10][e9.x0 + 1] = 'a'; acc[11][e9.x0 + 1] = 'a'; acc[11][e9.x0] = 'b';
    acc[10][e9.x1 - 1] = 'a'; acc[11][e9.x1 - 1] = 'a'; acc[11][e9.x1] = 'b';

    // wings: attach at row6/7 shoulder (hw=5-6, widest point). Wing root
    // always touches the body edge; the flap animation swings the tip
    // through three positions (up-swept / level-spread / down-swept) by
    // moving the OUTER tip pixels while the root pixels (which guarantee
    // connectivity) never move.
    const rootY = 6, rootEdge = edge(rootY);
    const rootL = rootEdge.x0, rootR = rootEdge.x1;
    const wingSpan = 7; // how far the tip reaches from the root
    const drawWing = (side, tipDy) => {
      // side: -1 left, +1 right. tipDy: row offset of the tip relative to root (negative = up)
      const rootX = side < 0 ? rootL : rootR;
      const dir = side;
      let prevX = rootX, prevY = rootY;
      for (let i = 0; i <= wingSpan; i++) {
        const x = rootX + dir * i;
        const y = rootY + Math.round((tipDy * i) / wingSpan);
        if (y < 0 || y >= H) { prevX = x; prevY = y; continue; }
        const col = i === wingSpan ? 'm' : (i % 2 === 0 ? 'b' : 'm');
        acc[y][x] = col;
        // The ray steps diagonally whenever both x and y change between
        // consecutive i (found by the connectivity checker: this produced
        // a chain of diagonal-only touches - "pinched"/disconnected in
        // 4-connectivity terms, exactly the floating-limb failure mode the
        // checker exists to catch). Bridge every such step with the corner
        // pixel (x, prevY): it shares a row with the previous point and a
        // column with the current one, so it's 4-adjacent to both.
        if (i > 0 && x !== prevX && y !== prevY) acc[y][prevX] = col;
        // thicken near the root so it reads chunky, not a 1px line -
        // tapering to thin at the tip like a real membrane.
        if (i <= 3) { const y2 = y + 1; if (y2 < H) acc[y2][x] = 'b'; }
        prevX = x; prevY = y;
      }
    };
    if (wingPhase === 'up') { drawWing(-1, -6); drawWing(1, -6); }
    else if (wingPhase === 'down') { drawWing(-1, 5); drawWing(1, 5); }
    else { drawWing(-1, -1); drawWing(1, -1); } // level/spread mid pose
    return acc;
  }

  function frame(wingPhase) {
    return rowsFromSpecs(mergeFrame(bodyRows, accents(wingPhase)), W);
  }

  const frames = [frame('up'), frame('level'), frame('down')];
  return { id: 'emberwing', archetype: 'winged flyer', width: W, height: H, palette, outline, frames };
}

// ---------------------------------------------------------------------
// Species 3: COILFANG - serpentine body drawn as a genuine S-curve (each
// row's center column shifts left/right across the height, not a straight
// vertical column), with the curve's phase shifting between frames for a
// sidewinding-undulation animation - visually nothing like the other two
// archetypes' silhouettes.
// ---------------------------------------------------------------------

function buildCoilfang() {
  const W = 22, H = 20, CENTER = 11;
  const outline = 'K';
  const palette = {
    K: '#0e1512', a: '#2f8f6e', b: '#1d6249', c: '#57c79a', d: '#bfe9c9',
    r: '#e0483a', // belly/throat accent
    W: '#f2fff6', P: '#101410'
  };

  // half-width per row: wide "hood/head" at top tapering smoothly down the
  // whole body length to a thin tail tip - genuine per-row tapering across
  // the ENTIRE body (not just head vs a flat-width torso).
  const profile = [4, 5, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1];
  const bandFor = y => (y <= 3 ? 'd' : y <= 9 ? 'c' : y <= 14 ? 'a' : 'b');

  function sCurve(phase) {
    // sine-based center offset per row -> S-curve; phase shifts the wave
    // so consecutive frames read as the body sliding through the curve
    // (sidewinding), not just sliding sideways as a rigid shape.
    const out = [];
    for (let y = 0; y < H; y++) out.push(Math.round(3.4 * Math.sin(y / 3.1 + phase)));
    return out;
  }

  function bodyForPhase(phase) {
    const offs = sCurve(phase);
    return profile.map((hw, y) => {
      const c = CENTER + offs[y];
      const x0 = c - hw, x1 = c + hw - 1;
      const spec = run(x0, x1, bandFor(y));
      spec[x0] = outline; spec[x1] = outline;
      return spec;
    });
  }

  function accents(offs) {
    const acc = new Array(H).fill(null).map(() => ({}));
    const c0 = CENTER + offs[0];
    // eyes on the head row (row1, hw=4 -> symmetric about c0)
    const c1 = CENTER + offs[1];
    acc[1][c1 - 2] = 'W'; acc[1][c1 - 1] = 'P';
    acc[1][c1 + 1] = 'W'; acc[1][c1 + 0] = 'P';
    // forked tongue flicking out past the head silhouette top-front
    acc[0][c0] = 'r';
    // throat/belly accent stripe running down the underside
    for (let y = 4; y <= 18; y++) {
      const cy = CENTER + offs[y];
      acc[y][cy] = 'r';
    }
    // small rattle/tail tip flourish at the very bottom, touching last body row
    const cLast = CENTER + offs[19];
    acc[19][cLast] = 'd';
    return acc;
  }

  function frame(phase) {
    const offs = sCurve(phase);
    return rowsFromSpecs(mergeFrame(bodyForPhase(phase), accents(offs)), W);
  }

  const frames = [frame(0), frame(0.9), frame(1.8)];
  return { id: 'coilfang', archetype: 'serpentine', width: W, height: H, palette, outline, frames };
}

// ---------------------------------------------------------------------
// Species 4: SPORELING - stout biped (mushroom/toad-like). Big rounded
// head-cap, short thick body, two legs that alternate stepping (unlike the
// quadruped's diagonal gait, a biped step is a simple left/right
// alternation) - a fourth distinct mass distribution (top-heavy, wide cap)
// so the roster isn't four variations on one silhouette.
// ---------------------------------------------------------------------

function buildSporeling() {
  const W = 18, H = 18, CENTER = 9;
  const outline = 'K';
  const palette = {
    K: '#1a1420', a: '#8a4fae', b: '#5f3380', c: '#c184e0', d: '#e9c6f5',
    s: '#f4e6a8', // spore-cap spots
    e: '#dfe8d8', // pale underbelly
    W: '#fbf7ff', P: '#191420'
  };

  // wide mushroom-cap head, narrow stalk-like body, stubby legs
  const profile = [0, 4, 6, 7, 7, 6, 4, 4, 4, 5, 5, 5, 5, 0, 0, 0, 0, 0];
  const bandFor = y => (y <= 5 ? 'c' : y <= 8 ? 'b' : 'a');
  const body = taperedBody(profile, bandFor, outline, CENTER);
  const edge = y => {
    const hw = profile[y];
    if (!hw) return null;
    return { x0: CENTER - hw, x1: CENTER + hw - 1 };
  };

  function accents(legPhase) {
    const acc = new Array(H).fill(null).map(() => ({}));
    // cap spots (row2/3, hw=6/7)
    acc[2][5] = 's'; acc[2][13] = 's'; acc[3][9] = 's';
    // eyes row6 (hw=4 -> x0=5,x1=12), symmetric
    acc[6][6] = 'W'; acc[6][7] = 'P';
    acc[6][11] = 'W'; acc[6][10] = 'P';
    // pale belly stripe on stalk rows7-12
    for (let y = 7; y <= 12; y++) { acc[y][CENTER - 1] = 'e'; acc[y][CENTER] = 'e'; }
    // stubby arms poking from stalk sides, row8 (hw=4 -> x0=5,x1=8... recompute)
    const e8 = edge(8);
    acc[8][e8.x0 - 1] = 'b'; acc[9][e8.x0 - 1] = 'b';
    acc[8][e8.x1 + 1] = 'b'; acc[9][e8.x1 + 1] = 'b';

    // legs attach at row12 (hw=5 -> x0=4,x1=13). Biped alternation: one leg
    // extended (longer/forward-read), the other retracted, swapping which
    // side is which across the 3 frames (extended/neutral/extended-other).
    const legL = [6, 7], legR = [10, 11];
    const drawLeg = (cols, extended) => {
      const rows = extended ? [13, 14, 15, 16] : [13, 14, 15];
      for (const y of rows) for (const x of cols) acc[y][x] = (y === rows[rows.length - 1]) ? 'b' : 'a';
    };
    if (legPhase === 'L') { drawLeg(legL, true); drawLeg(legR, false); }
    else if (legPhase === 'R') { drawLeg(legL, false); drawLeg(legR, true); }
    else { drawLeg(legL, false); drawLeg(legR, false); }
    return acc;
  }

  function frame(legPhase) {
    return rowsFromSpecs(mergeFrame(body, accents(legPhase)), W);
  }

  const frames = [frame('L'), frame('N'), frame('R')];
  return { id: 'sporeling', archetype: 'biped', width: W, height: H, palette, outline, frames };
}

// ---------------------------------------------------------------------
// canvas rendering (browser-only - uses document.createElement)
// ---------------------------------------------------------------------

function drawGrid(ctx, rows, palette, offsetX, px) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      ctx.fillStyle = palette[ch];
      ctx.fillRect(offsetX + x * px, y * px, px, px);
    }
  }
}

// Build a horizontal frame-strip canvas from a species def, matching the
// exact convention PixelBillboard expects (frameCount frames side by side,
// each canvas.width/frameCount wide, same height) - same mechanism as
// TestSprite.js's makeTestSlimeCanvas.
function buildSpeciesCanvas(species, px = 4) {
  const cvs = document.createElement('canvas');
  cvs.width = species.width * px * species.frames.length;
  cvs.height = species.height * px;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  species.frames.forEach((rows, i) => drawGrid(ctx, rows, species.palette, i * species.width * px, px));
  return cvs;
}

const SPECIES_BUILDERS = {
  ramhorn: buildRamhorn,
  emberwing: buildEmberwing,
  coilfang: buildCoilfang,
  sporeling: buildSporeling,
};

function buildAllSpecies() {
  const out = {};
  for (const [id, fn] of Object.entries(SPECIES_BUILDERS)) out[id] = fn();
  return out;
}

function validateAllSpecies(species) {
  let ok = true;
  for (const s of Object.values(species)) ok = validateSpecies(s) && ok;
  return ok;
}

const SpeciesArtAPI = {
  // geometry / data (pure, no DOM - usable from Node)
  buildRamhorn, buildEmberwing, buildCoilfang, buildSporeling,
  buildAllSpecies,
  // validation (pure, no DOM)
  connectedComponents, checkConnected, checkSpriteRanges, validateSpecies, validateAllSpecies,
  // rendering (browser-only, needs document)
  buildSpeciesCanvas,
};

if (typeof window !== 'undefined') window.SpeciesArt = SpeciesArtAPI;
if (typeof module !== 'undefined' && module.exports) module.exports = SpeciesArtAPI;
