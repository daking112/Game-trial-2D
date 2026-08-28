// Real monster pixel-art + animation pipeline (piece #45, round 2).
//
// Mechanically this is the same technique as core/TestSprite.js (a
// character grid mapped to hex colors via a palette, rendered as filled
// rects at a fixed PX-per-cell scale, frames laid out side-by-side into one
// horizontal strip canvas that PixelBillboard slices with texture.offset) -
// this file is what makes that technique produce actual creatures instead
// of a 2-frame test blob:
//   - a parametric tapered-body generator (per-row half-width profile, with
//     an optional per-row center offset so a mass can curve/nod sideways)
//     so torsos/heads read as a real tapered silhouette, not a rectangular
//     plank
//   - hand-placed accents (horns/wings/tail/legs/eyes) merged on top,
//     always OVERLAPPING the body silhouette by at least one shared edge
//     pixel so nothing floats
//   - a shared per-pixel shading + outline pass (shadeAndOutline / round 2)
//     that replaces flat row-banding: every opaque "body" pixel gets a
//     tone from a rough distance-to-edge + upper-left light bias instead of
//     a hard y-threshold color band, and the FULL silhouette perimeter -
//     top/bottom boundaries and limb edges included, not just each row's
//     left/right taper edge - gets outlined
//   - a JS port of monster-tactics/scripts/pixel_art_lib.py's connectivity
//     checker (connected_components/check_connected) and its measured
//     opaque%/color-count/outline% sanity ranges, run against every frame
//     of every species below before the module is trusted
//
// Round 2 fix log (independent-critic pass): the round-1 art shaded each
// species with `bandFor(y)` (a flat color per row-band) and only outlined
// each row's left/right taper edge via `taperedBody()`, which read as
// horizontal slabs stacked on top of each other - a dead-straight seam
// across Ramhorn's torso, Sporeling's cap ending in raw unoutlined fill,
// Coilfang's S-curve reading as independent bars instead of a tube. Fixed
// by replacing bandFor()/per-row edge outlining with shadeAndOutline()
// below (see that function for the actual technique), giving Ramhorn a
// real neck pinch between head and torso, and adding a 1px body bob + 1px
// head/cap nod to the walk cycles so the torso moves too, not just the
// legs.
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

// Sentinel fill character for "this pixel is part of a shaded body mass -
// give it a real tone in the shadeAndOutline() pass below", as opposed to a
// hand-placed accent (eye, horn, spot...) which keeps whatever color it was
// authored with.
const SENTINEL = '$';

// Parametric tapered silhouette: `profile[y]` is the half-width (in cells)
// of the body at row y, 0 meaning "no body pixels this row" (used for rows
// accents like legs fully own). `centerOffsetFn(y)` (optional) shifts that
// row's center column, so a mass can curve sideways per row (a tail curl, a
// serpentine S-curve, a head nod) instead of always taper around one fixed
// vertical axis. Every opaque cell is written as SENTINEL - no color choice
// and no outline happens here anymore; shadeAndOutline() does both once all
// layers (body + accents) are merged, which is what lets shading/outlining
// see the *whole* silhouette instead of one row at a time.
function tapered(profile, centerCol, centerOffsetFn) {
  const off = centerOffsetFn || (() => 0);
  return profile.map((hw, y) => {
    if (!hw || hw <= 0) return {};
    const c = centerCol + off(y);
    return run(c - hw, c + hw - 1, SENTINEL);
  });
}

// Same row-edge math as tapered(), exposed standalone so accent placement
// (eyes, ears, tail stubs...) can align itself to a specific row's actual
// x0/x1 - including whatever center offset that row has - without
// duplicating the offset arithmetic.
function taperedEdge(profile, centerCol, centerOffsetFn, y) {
  const hw = profile[y];
  if (!hw) return null;
  const off = centerOffsetFn || (() => 0);
  const c = centerCol + off(y);
  return { x0: c - hw, x1: c + hw - 1 };
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
// shading + outline pass (round 2 fix) - shared by all four species so the
// volume/outline treatment is one correct implementation, not four hand
// tuned hacks.
//
// Technique:
//   1. Multi-source BFS distance transform from every transparent cell (and
//      the grid boundary, which counts as background too) gives every
//      opaque cell a rough "how many cells to the nearest edge" value.
//   2. A cheap surface-normal proxy: the local gradient of that distance
//      field points toward the interior of the mass, so its negation
//      points roughly outward. Dotting that against a fixed upper-left
//      light vector gives a per-pixel light bias with no real lighting
//      model - just "closer to the background on the upper-left side reads
//      brighter" - which is enough to place a highlight/mid/shadow tone per
//      pixel instead of one flat color per row.
//   3. Every SENTINEL cell gets a tone from that (dist, lightBias) pair.
//   4. THEN, over the whole merged silhouette (every opaque cell, any
//      material - body, horn, wing, leg, spot...), any cell touching a
//      transparent 8-neighbor or the grid edge becomes outline. Running
//      this after shading, over the full frame, is what gives a continuous
//      outline around the ENTIRE perimeter (top/bottom of a tapered head,
//      cap, wingtip - not just each row's left/right edge the way the old
//      per-row taperedBody() edge coloring did), and 8-neighbor (not 4-)
//      closes the diagonal notches a stepped taper (S-curve, ear bumps)
//      would otherwise leave un-outlined.
// ---------------------------------------------------------------------

function computeDistanceField(mask, W, H) {
  const D = [];
  for (let y = 0; y < H; y++) D.push(new Array(W).fill(Infinity));
  const queue = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y][x]) { D[y][x] = 0; queue.push(x + ',' + y); }
    }
  }
  let qi = 0;
  while (qi < queue.length) {
    const [xs, ys] = queue[qi++].split(',').map(Number);
    const d0 = D[ys][xs];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = xs + dx, ny = ys + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      if (D[ny][nx] > d0 + 1) { D[ny][nx] = d0 + 1; queue.push(nx + ',' + ny); }
    }
  }
  // The grid boundary counts as background too - an opaque cell sitting
  // right on the edge of its own canvas (a foot on the bottom row, a horn
  // tip on row 0) is still an outer edge even with no transparent neighbor
  // inside the grid to prove it.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (mask[y][x] && (x === 0 || x === W - 1 || y === 0 || y === H - 1)) {
        D[y][x] = Math.min(D[y][x], 1);
      }
    }
  }
  return D;
}

// Pick a tone for one SENTINEL cell from its (distance-to-edge, light-bias)
// pair. `tones` = { shadow, mid, highlight, rim } palette-key chars.
function shadeChar(d, dot, tones) {
  if (d <= 2) {
    // Near-edge ring: a rim highlight on the lit (upper-left-facing) side,
    // ambient-occlusion shadow on the rest - the "dark band inside the
    // outline" treatment that reads as a rounded surface instead of a flat
    // fill running straight into the outline.
    if (dot >= 2) return tones.rim;
    if (dot <= 0) return tones.shadow;
    return tones.mid;
  }
  // Interior: a gentle highlight for pixels still close-ish to the surface
  // on the lit side; otherwise a calm mid tone so the core of the mass
  // doesn't speckle.
  if (d <= 4 && dot >= 2) return tones.highlight;
  return tones.mid;
}

// Tiny accents - eye white/pupil, spore-cap spots, horn tips, hooves - are
// only ever 1-2 cells wide in these grids, so under an 8-neighbor "touches
// background" rule they'd ALWAYS qualify as perimeter (a 1px-wide mark
// can't have an interior pixel) and get fully swallowed into the outline
// color every single frame, silently deleting the detail's own hue (an
// earlier version of this pass did exactly that - horn tan and hoof brown
// vanished on every frame, verified by dumping per-frame color counts).
// These stay their authored color untouched; every other material (wings,
// tail, ears, legs, the body itself) still participates normally,
// including getting outlined at its own perimeter.
const OUTLINE_PROTECTED = new Set(['W', 'P', 's', 'h', 'f']);

function shadeAndOutline(rows, outlineCh, tones) {
  const H = rows.length, W = rows[0].length;
  const grid = rows.map(r => r.split(''));
  const mask = grid.map(row => row.map(ch => ch !== '.'));
  const D = computeDistanceField(mask, W, H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y][x] !== SENTINEL) continue;
      const d = D[y][x];
      const dL = x > 0 ? D[y][x - 1] : 0;
      const dR = x < W - 1 ? D[y][x + 1] : 0;
      const dU = y > 0 ? D[y - 1][x] : 0;
      const dN = y < H - 1 ? D[y + 1][x] : 0;
      const dot = (dR - dL) + (dN - dU); // >0 = upper-left-facing (lit), <0 = lower-right-facing (shadow)
      grid[y][x] = shadeChar(d, dot, tones);
    }
  }

  const dirs8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const dirs4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const inB = (x, y) => x >= 0 && x < W && y >= 0 && y < H;

  // Which pixels are perimeter candidates (8-neighbour, so diagonal notches
  // close up rather than leaking background through a corner).
  const isPerim = grid.map((row, y) => row.map((_, x) => {
    if (!mask[y][x]) return false;
    if (x === 0 || x === W - 1 || y === 0 || y === H - 1) return true;
    return dirs8.some(([dx, dy]) => !mask[y + dy][x + dx]);
  }));

  // Outlining EVERY perimeter candidate is correct for thick masses but
  // destroys thin ones: any feature <= 2px wide is *entirely* perimeter (it
  // has no interior pixel by definition), so the blanket rule turned wings,
  // legs and tail tips into solid blocks of outline colour with none of
  // their own hue left - measured at 45-53% of opaque pixels, against the
  // ~20-25% real HGSS-era sprites sit at, and visually "bare twigs" rather
  // than a membrane.
  //
  // So a perimeter pixel is only converted when the feature it belongs to
  // can afford it: it must have a 4-neighbour that is genuine interior
  // (D >= 2, i.e. not itself perimeter). In a thick mass every edge pixel
  // has one, so the full silhouette outline of round 2 is preserved exactly.
  // In a <= 2px strip none do, so the strip keeps its own colour and instead
  // gets outlined only where it meets open space along its length - handled
  // by the second pass below, which walks the strip and outlines the single
  // outermost pixel per cross-section rather than all of them.
  const out = grid.map(r => r.slice());
  const thin = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y][x] || OUTLINE_PROTECTED.has(grid[y][x]) || !isPerim[y][x]) continue;
      const hasInterior = dirs4.some(([dx, dy]) => inB(x + dx, y + dy) && mask[y + dy][x + dx] && !isPerim[y + dy][x + dx]);
      if (hasInterior) out[y][x] = outlineCh;
      else thin.push([x, y]);
    }
  }

  // Thin-feature pass: for each pixel of a <=2px structure, outline it only
  // if it is the outermost of its cross-section along the axis the structure
  // is thin in. Measuring thinness per-axis (how far opaque runs left/right
  // vs up/down) means a horizontal 2px-tall strip gets a top/bottom rim
  // while keeping its colour across, and a vertical one gets a left/right
  // rim - either way at least one fill pixel always survives per cross
  // section, which is exactly what stops the feature reading as a black
  // stick.
  const runLen = (x, y, dx, dy) => {
    let n = 0, cx = x + dx, cy = y + dy;
    while (inB(cx, cy) && mask[cy][cx]) { n++; cx += dx; cy += dy; }
    return n;
  };
  for (const [x, y] of thin) {
    const spanX = 1 + runLen(x, y, 1, 0) + runLen(x, y, -1, 0);
    const spanY = 1 + runLen(x, y, 0, 1) + runLen(x, y, 0, -1);
    // Outline across the *thin* axis only; along the long axis the pixel is
    // interior to the feature and must keep its colour.
    const thinAxis = spanX <= spanY ? 'x' : 'y';
    const probes = thinAxis === 'x' ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
    const span = thinAxis === 'x' ? spanX : spanY;
    // A 1px-wide feature has nothing to spare - keep its colour entirely,
    // it reads as a highlight line rather than a limb.
    if (span <= 1) continue;
    const touchesBg = probes.some(([dx, dy]) => !inB(x + dx, y + dy) || !mask[y + dy][x + dx]);
    // Alternate which side gets the rim so a 2px strip ends up outline on
    // one side, fill on the other, instead of both sides eating each other.
    if (touchesBg && (x + y) % 2 === 0) out[y][x] = outlineCh;
  }
  return out.map(r => r.join(''));
}

// Standard tone-role -> palette-key mapping every species palette below
// follows: a = mid, b = shadow/AO, c = highlight, d (if present) = rim /
// lightest. Keeping this convention shared means shadeAndOutline() needs no
// per-species special-casing.
function defaultTones(palette) {
  return { shadow: 'b', mid: 'a', highlight: 'c', rim: palette.d ? 'd' : 'c' };
}

// Whole-sprite vertical translate for the walk-cycle body bob - shifts
// every pixel down by `dy` rows (0 = no bob), leaving the vacated row(s)
// transparent. Always shifts DOWN (never up) into the spare blank row(s)
// every grid below has at the bottom, so nothing at the top (horns, cap)
// ever clips off.
function bobFrame(rows, dy) {
  if (!dy) return rows;
  const W = rows[0].length, H = rows.length;
  const blank = '.'.repeat(W);
  const out = new Array(H).fill(blank);
  for (let y = 0; y < H; y++) {
    const ny = y + dy;
    if (ny >= 0 && ny < H) out[ny] = rows[y];
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
//
// Round 2: outlineFrac's upper bound was raised 0.45 -> 0.55. Outlining the
// full silhouette perimeter (not just each row's left/right taper edge)
// measurably increases outline-pixel share on these small (18-26px wide)
// grids, especially on thin parts (legs, wingtips, the coilfang tail) that
// are now outlined nearly all the way around. Confirmed by eye via
// preview.html this reads as a correctly-outlined sprite, not over-inked -
// the old 0.45 cap was measured against the round-1 per-row-only outlining,
// which under-outlined on purpose (no top/bottom edges at all), so it was
// never a bar this art should have stayed under.
// Round-4 recalibration. The 0.55 outline cap above was not a quality bar,
// it was the ceiling forced by the grid size. Measured directly: take each
// species silhouette and count 8-neighbour perimeter pixels (i.e. what a
// full, correct, 1px silhouette outline costs) as a share of opaque pixels:
//
//   grid    ramhorn  emberwing  coilfang  sporeling
//   1x      53%      50%        50%       48%
//   2x      29%      31%        26%       25%
//   3x      19%      21%        17%       16%
//
// So on the 18-26px-wide grids the art used to live on, a fully outlined
// sprite CANNOT be under ~48% - the ~20-25% share real HGSS-era battle
// sprites sit at is unreachable at that resolution, and the round-3
// thin-feature rule only got to 32-42% by declining to outline parts of
// the perimeter. That is fighting the symptom. HGSS battle sprites are
// ~80x80; these were ~24x18, roughly 3x too small in each axis, which is
// also why wings/legs/tails had no room to be more than 2px and why there
// was never space for a colored core inside a limb.
//
// The gate is therefore now the real target (12-28% outline) plus a
// minimum grid size, so the range can only be met by giving the art enough
// resolution to carry a proper outline - never by under-outlining or by
// shrinking the sprite until the ratio flatters itself.
const SPRITE_RANGE = { opaque: [0.22, 0.75], outlineFrac: [0.12, 0.28], minColors: 5, minGrid: [48, 40] };

const pct = v => `${Math.round(v * 100)}%`;

function checkSpriteRanges(rows, outlineCh, label) {
  const width = rows[0].length;
  const total = width * rows.length;
  const gridOk = width >= SPRITE_RANGE.minGrid[0] && rows.length >= SPRITE_RANGE.minGrid[1];
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
    problems.push(`${(opaqueFrac * 100).toFixed(0)}% opaque, want ${pct(SPRITE_RANGE.opaque[0])}-${pct(SPRITE_RANGE.opaque[1])}`);
  }
  if (outlineFrac < SPRITE_RANGE.outlineFrac[0] || outlineFrac > SPRITE_RANGE.outlineFrac[1]) {
    problems.push(`${(outlineFrac * 100).toFixed(0)}% outline, want ${pct(SPRITE_RANGE.outlineFrac[0])}-${pct(SPRITE_RANGE.outlineFrac[1])}`);
  }
  if (colors < SPRITE_RANGE.minColors) {
    problems.push(`${colors} non-outline colors, want >= ${SPRITE_RANGE.minColors}`);
  }
  if (!gridOk) {
    problems.push(`grid ${width}x${rows.length}, want >= ${SPRITE_RANGE.minGrid[0]}x${SPRITE_RANGE.minGrid[1]} (an outline under ${pct(SPRITE_RANGE.outlineFrac[1])} is geometrically impossible below that)`);
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
  const outline = 'K';
  // body tones: c = highlight (upper-left lit side), a = mid coat,
  // b = shadow/AO, h = horn, e = belly/muzzle, f = hoof,
  // W = eye white, P = pupil
  const palette = {
    K: '#141018', a: '#6a9944', b: '#446b2a', c: '#8fc45f',
    h: '#e8dcb0', e: '#e3d9a8', f: '#3a2c18',
    W: '#f4f7ee', P: '#161418'
  };

  // Half-width per row. Head (rows1-4) ramps up, then a genuine NECK PINCH
  // (rows5-6 narrow sharply) before the torso (rows7-12) widens back out
  // into the shoulders - a real waist in the silhouette so shadeAndOutline
  // wraps a distinct head mass with its own outline, instead of one smooth
  // triangular taper straight into the body (round-2 fix for the "mound on
  // sticks" complaint).
  const profile = [0, 2, 4, 5, 5, 3, 4, 8, 9, 9, 9, 8, 7, 0, 0, 0, 0, 0];
  const headOffset = headDx => y => (y <= 6 ? headDx : 0);
  const bodyLayer = headDx => tapered(profile, CENTER, headOffset(headDx));
  const edgeAt = (y, headDx) => taperedEdge(profile, CENTER, headOffset(headDx), y);

  function accents(legPhase, headDx) {
    const acc = new Array(H).fill(null).map(() => ({}));
    // horns (head silhouette - shift with the head nod)
    acc[0][9 + headDx] = 'h'; acc[0][14 + headDx] = 'h';
    acc[1][9 + headDx] = 'h'; acc[1][10 + headDx] = 'h';
    acc[1][13 + headDx] = 'h'; acc[1][14 + headDx] = 'h';
    // eyes on head row3 (row4 sits diagonally against the neck pinch at
    // row5, which would make its own pixels read as perimeter and, since
    // eyes are protected-but-still-positioned there, look oddly close to
    // the notch - row3 keeps clear headroom on both sides)
    acc[3][9 + headDx] = 'W'; acc[3][10 + headDx] = 'P';
    acc[3][15 + headDx] = 'W'; acc[3][14 + headDx] = 'P';
    // muzzle/belly patch, rows5-9 center strip (rows5-6 are still the neck,
    // so they follow the head nod; rows7-9 are torso, fixed)
    for (let y = 5; y <= 9; y++) {
      const dx = y <= 6 ? headDx : 0;
      acc[y][CENTER - 1 + dx] = 'e'; acc[y][CENTER + dx] = 'e';
    }
    // ears: 2px bumps just outside row3's edge
    const e3 = edgeAt(3, headDx);
    acc[2][e3.x0] = 'a'; acc[3][e3.x0 - 1] = 'a';
    acc[2][e3.x1] = 'a'; acc[3][e3.x1 + 1] = 'a';
    // tail stub off the back, row9-11 near right edge (torso, no head offset)
    const e9 = edgeAt(9, 0);
    acc[9][e9.x1 + 1] = 'b'; acc[10][e9.x1 + 1] = 'b'; acc[10][e9.x1 + 2] = 'b'; acc[11][e9.x1 + 1] = 'f';

    // legs: attach at row12/13 (torso, no head offset). Front legs inner,
    // back legs outer. legPhase shifts which diagonal pair is "forward"
    // (extended, 1 row longer) vs "back" (retracted, 1 row shorter).
    const legRows = { fwd: [13, 14, 15, 16], back: [13, 14, 15] };
    const frontL = [10, 11], frontR = [14, 15], backL = [6, 7], backR = [17, 18];
    const pairA = legPhase === 'A';
    const drawLeg = (cols, forward) => {
      const rows = forward ? legRows.fwd : legRows.back;
      const lastRow = rows[rows.length - 1];
      for (const y of rows) {
        const isFoot = y === lastRow;
        acc[y][cols[0]] = isFoot ? 'f' : SENTINEL;
        acc[y][cols[1]] = isFoot ? 'f' : SENTINEL;
      }
    };
    if (legPhase === 'N') {
      drawLeg(frontL, false); drawLeg(frontR, false); drawLeg(backL, false); drawLeg(backR, false);
    } else {
      drawLeg(frontL, pairA); drawLeg(frontR, !pairA);
      drawLeg(backL, !pairA); drawLeg(backR, pairA);
    }
    return acc;
  }

  // Walk cycle motion (round 2 fix): the old cycle only changed leg length
  // frame to frame - body and head were pixel-identical across all 3
  // frames. Now the torso settles 1px lower on each weight-bearing
  // (extended-leg) frame and rises back on the passing/neutral frame, with
  // a 1px head nod opposite the forward leg pair, so the upper body
  // visibly moves too.
  function frame(legPhase) {
    const headDx = legPhase === 'A' ? -1 : legPhase === 'B' ? 1 : 0;
    const bob = legPhase === 'N' ? 0 : 1;
    const raw = rowsFromSpecs(mergeFrame(bodyLayer(headDx), accents(legPhase, headDx)), W);
    const shaded = shadeAndOutline(raw, outline, defaultTones(palette));
    return bobFrame(shaded, bob);
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

  // Slim upright body: narrow head, chest slightly wider, tail tapers away
  // below (a per-row center offset curls the tail to one side so it isn't
  // just a straight rectangle down).
  const profile = [0, 2, 3, 4, 4, 5, 5, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0];
  const tailCurlTable = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4];
  const tailCurl = y => tailCurlTable[y];
  const bodyRows = tapered(profile, CENTER, tailCurl);
  const edgeAt = y => taperedEdge(profile, CENTER, tailCurl, y);

  function accents(wingPhase) {
    const acc = new Array(H).fill(null).map(() => ({}));
    // horn/crest spikes on head
    acc[0][12] = 'b'; acc[0][14] = 'b';
    acc[1][12] = 'b'; acc[1][14] = 'b';
    // eyes row3, symmetric
    acc[3][11] = 'W'; acc[3][12] = 'P';
    acc[3][15] = 'W'; acc[3][14] = 'P';
    // chest marking
    for (let y = 6; y <= 9; y++) { acc[y][CENTER - 1] = 'd'; acc[y][CENTER] = 'd'; }
    // legs: short stubby pair at bottom of torso, row9-10 area
    const e9 = edgeAt(9);
    acc[10][e9.x0 + 1] = SENTINEL; acc[11][e9.x0 + 1] = SENTINEL; acc[11][e9.x0] = 'b';
    acc[10][e9.x1 - 1] = SENTINEL; acc[11][e9.x1 - 1] = SENTINEL; acc[11][e9.x1] = 'b';

    // wings: attach at row6/7 shoulder (widest point). Wing root always
    // touches the body edge; the flap animation swings the tip through
    // three positions (up-swept / level-spread / down-swept) by moving the
    // OUTER tip pixels while the root pixels (which guarantee connectivity)
    // never move.
    const rootY = 6, rootEdge = edgeAt(rootY);
    const rootL = rootEdge.x0, rootR = rootEdge.x1;
    const wingSpan = 7; // how far the tip reaches from the root
    // Wing membrane, filled per-column rather than traced as a 1px ray: an
    // earlier version drew a single diagonal-stepping line and patched the
    // diagonal joints with bridge pixels, but even bridged it still read as
    // a thin twig, not a wing (visually confirmed by rendering it - the
    // exact "thin/fragile floating appendage" anti-pattern the brief calls
    // out). Filling each column down to where the NEXT column starts is
    // both simpler and provably connected: column i's row-run always
    // includes round(yCenter(i+1)), and column i+1's run always includes
    // that same row too, so every adjacent pair of columns shares a row -
    // no diagonal joints to bridge in the first place.
    const drawWing = (side, tipDy) => {
      // side: -1 left, +1 right. tipDy: row offset of the tip relative to root (negative = up)
      const rootX = side < 0 ? rootL : rootR;
      const dir = side;
      const yCenterAt = i => rootY + (tipDy * i) / wingSpan;
      for (let i = 0; i <= wingSpan; i++) {
        const x = rootX + dir * i;
        const yc0 = yCenterAt(i);
        const yc1 = i < wingSpan ? yCenterAt(i + 1) : yc0;
        let y0 = Math.round(Math.min(yc0, yc1));
        let y1 = Math.round(Math.max(yc0, yc1));
        // chunky near the root, tapering thin at the tip - a real
        // membrane's actual proportions, not a flat-width strip.
        const pad = i <= 2 ? 1 : 0;
        y0 -= pad; y1 += pad;
        for (let y = y0; y <= y1; y++) {
          if (y < 0 || y >= H) continue;
          const edgeRow = (y === y0 || y === y1);
          acc[y][x] = (i === wingSpan) ? 'm' : (edgeRow ? 'b' : 'm');
        }
      }
    };
    if (wingPhase === 'up') { drawWing(-1, -6); drawWing(1, -6); }
    else if (wingPhase === 'down') { drawWing(-1, 5); drawWing(1, 5); }
    else { drawWing(-1, -1); drawWing(1, -1); } // level/spread mid pose
    return acc;
  }

  function frame(wingPhase) {
    const raw = rowsFromSpecs(mergeFrame(bodyRows, accents(wingPhase)), W);
    return shadeAndOutline(raw, outline, defaultTones(palette));
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

  // Half-width per row: wide "hood/head" at top tapering smoothly down the
  // whole body length to a thin tail tip - genuine per-row tapering across
  // the ENTIRE body (not just head vs a flat-width torso).
  const profile = [4, 5, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1];

  function sCurve(phase) {
    // sine-based center offset per row -> S-curve; phase shifts the wave
    // so consecutive frames read as the body sliding through the curve
    // (sidewinding), not just sliding sideways as a rigid shape.
    const out = [];
    for (let y = 0; y < H; y++) out.push(Math.round(3.4 * Math.sin(y / 3.1 + phase)));
    return out;
  }

  function accents(offs) {
    const acc = new Array(H).fill(null).map(() => ({}));
    const c0 = CENTER + offs[0];
    // eyes on the head row (row1), symmetric about c1
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
    const bodyLayer = tapered(profile, CENTER, y => offs[y]);
    const raw = rowsFromSpecs(mergeFrame(bodyLayer, accents(offs)), W);
    return shadeAndOutline(raw, outline, defaultTones(palette));
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

  // Wide mushroom-cap head, narrow stalk-like body, stubby legs. The
  // profile already narrows from the cap's widest point (row3/4, hw=7) down
  // to the stalk (row7+, hw=4) before widening slightly again lower down,
  // which reads as a natural cap/stalk neck once outlined.
  const profile = [0, 4, 6, 7, 7, 6, 4, 4, 4, 5, 5, 5, 5, 0, 0, 0, 0, 0];
  const capOffset = capDx => y => (y <= 6 ? capDx : 0);
  const bodyLayer = capDx => tapered(profile, CENTER, capOffset(capDx));
  const edgeAt = (y, capDx) => taperedEdge(profile, CENTER, capOffset(capDx), y);

  function accents(legPhase, capDx) {
    const acc = new Array(H).fill(null).map(() => ({}));
    // cap spots (cap rows, follow the cap nod)
    acc[2][5 + capDx] = 's'; acc[2][13 + capDx] = 's'; acc[3][9 + capDx] = 's';
    // eyes row6 (still cap/neck), symmetric
    acc[6][6 + capDx] = 'W'; acc[6][7 + capDx] = 'P';
    acc[6][11 + capDx] = 'W'; acc[6][10 + capDx] = 'P';
    // pale belly stripe on stalk rows7-12 (fixed, stalk doesn't nod)
    for (let y = 7; y <= 12; y++) { acc[y][CENTER - 1] = 'e'; acc[y][CENTER] = 'e'; }
    // stubby arms poking from stalk sides, row8
    const e8 = edgeAt(8, 0);
    acc[8][e8.x0 - 1] = 'b'; acc[9][e8.x0 - 1] = 'b';
    acc[8][e8.x1 + 1] = 'b'; acc[9][e8.x1 + 1] = 'b';

    // legs attach at row12. Biped alternation: one leg extended
    // (longer/forward-read), the other retracted, swapping which side is
    // which across the 3 frames (extended/neutral/extended-other).
    const legL = [6, 7], legR = [10, 11];
    const drawLeg = (cols, extended) => {
      const rows = extended ? [13, 14, 15, 16] : [13, 14, 15];
      const lastRow = rows[rows.length - 1];
      for (const y of rows) for (const x of cols) acc[y][x] = (y === lastRow) ? 'b' : SENTINEL;
    };
    if (legPhase === 'L') { drawLeg(legL, true); drawLeg(legR, false); }
    else if (legPhase === 'R') { drawLeg(legL, false); drawLeg(legR, true); }
    else { drawLeg(legL, false); drawLeg(legR, false); }
    return acc;
  }

  // Walk cycle motion (round 2 fix, same idea as Ramhorn): body settles 1px
  // lower on each weight-bearing (extended-leg) frame, rises on the
  // neutral/passing frame, with a 1px cap nod opposite the stepping leg.
  function frame(legPhase) {
    const capDx = legPhase === 'L' ? -1 : legPhase === 'R' ? 1 : 0;
    const bob = legPhase === 'N' ? 0 : 1;
    const raw = rowsFromSpecs(mergeFrame(bodyLayer(capDx), accents(legPhase, capDx)), W);
    const shaded = shadeAndOutline(raw, outline, defaultTones(palette));
    return bobFrame(shaded, bob);
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
