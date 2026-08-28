// Real monster pixel-art + animation pipeline (piece #45, round 4).
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
//   - a shared per-pixel shading + outline pass (shadeAndOutline) that
//     replaces flat row-banding: every opaque "body" pixel gets a tone from
//     a rough distance-to-edge + upper-left light bias instead of a hard
//     y-threshold color band, and the FULL silhouette perimeter -
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
// real neck pinch between head and torso, and adding a body bob + head/cap
// nod to the walk cycles so the torso moves too, not just the legs.
//
// Round 3 fix log: outlining every perimeter pixel destroyed features <= 2px
// wide (they are ENTIRELY perimeter, so they became solid outline-colored
// twigs). A "thin feature" special case outlined only the outermost pixel
// of such a feature's cross-section.
//
// Round 4 fix log (THIS round) - resolution. The round-3 thin-feature hack
// was treating a symptom. Measured directly: count 8-neighbour perimeter
// pixels (what a full, correct, 1px silhouette outline costs) as a share of
// opaque pixels, per grid scale:
//
//   grid    ramhorn  emberwing  coilfang  sporeling
//   1x      53%      50%        50%       48%
//   2x      29%      31%        26%       25%
//   3x      19%      21%        17%       16%
//
// Real HGSS-era battle sprites sit at ~20-25% and are ~80x80. The old grids
// were 18-26px wide, so a fully outlined sprite there could not physically
// be under ~48% - and no wing, leg or tail could be more than 2px, so no
// limb could ever hold a lit core, a shadow side AND an outline at once.
// Every species below is therefore rebuilt at ~3x (48-80 cells per axis),
// and:
//   - the thin-feature special case is DELETED. At this resolution every
//     appendage is drawn >= 3px thick, so every perimeter pixel has a
//     genuine interior 4-neighbour and the plain full-perimeter rule of
//     round 2 is correct again on its own. (Verified empirically: zero
//     pixels in any frame of any species now fail that test.) The
//     OUTLINE_PROTECTED accent list is gone with it - eyes/spots are placed
//     well inside their host mass, so they are never perimeter and never
//     needed protecting.
//   - shading is per-MATERIAL, not just per-body. shadeAndOutline() takes a
//     map of sentinel char -> tone quad, so a wing membrane, a horn, a
//     hoof and a pale belly each get their own distance-field-shaded
//     highlight/mid/shadow/rim ramp instead of being a flat hand-colored
//     slab pasted on the body. That is what makes limbs at this size read
//     as round volumes rather than colored cutouts.
//   - profiles are built by lerping between a handful of control points
//     (profileFrom) so tapers step by 1-2 cells per row instead of the
//     whole-cell jumps a hand-typed 18-entry array produced at 1x.
//   - drawing primitives (disc / ellipseFill / stroke / fillPoly) let the
//     appendages be authored as real shapes - a ram's curled horn, a bat
//     wing with an arm bone plus four finger bones and a scalloped
//     trailing edge, three-lobed feet - instead of per-row runs.
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
    for (const [idx, ch] of Object.entries(spec)) {
      const x = Number(idx);
      if (x >= 0 && x < width) r[x] = ch;
    }
    return r.join('');
  });
}

// Sentinel fill characters for "this pixel is part of a shaded mass of
// material M - give it a real tone in the shadeAndOutline() pass below", as
// opposed to a hand-placed flat accent (pupil, glint, gill line) which keeps
// whatever color it was authored with. Round 4: one sentinel per material,
// so a horn/wing/hoof gets its own shading ramp rather than one flat color.
const SENTINEL = '$';   // primary body material (coat / scale / cap)
const MAT_B = '#';      // secondary (wing membrane, gill mass...)
const MAT_C = '%';      // keratin (horn, crest, claw)
const MAT_D = '&';      // pale underside (belly, muzzle, throat)
const MAT_E = '@';      // dark extremity (hoof, foot pad)
const MAT_F = '^';      // "behind" material - far legs, tail tuft
const MAT_G = '*';      // markings (spore-cap spots)
const SENTINELS = [SENTINEL, MAT_B, MAT_C, MAT_D, MAT_E, MAT_F, MAT_G];

// ---------------------------------------------------------------------
// drawing primitives. Everything writes into a "frame spec" - an array of
// H sparse {x: char} row objects - which mergeFrame() then layers.
// ---------------------------------------------------------------------

function makeSpec(H) {
  const a = [];
  for (let y = 0; y < H; y++) a.push({});
  return a;
}

function put(spec, x, y, ch, W, H) {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi >= 0 && xi < W && yi >= 0 && yi < H) spec[yi][xi] = ch;
}

function box(spec, x0, y0, x1, y1, ch, W, H) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(spec, x, y, ch, W, H);
}

function ellipseFill(spec, cx, cy, rx, ry, ch, W, H) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1.02) put(spec, x, y, ch, W, H);
    }
  }
}

function disc(spec, cx, cy, r, ch, W, H) {
  ellipseFill(spec, cx, cy, r, r, ch, W, H);
}

// Tapered thick stroke along a polyline: stamps overlapping discs whose
// radius lerps r0 -> r1 across the whole path length. Overlapping stamps
// (step 0.4 cells) mean the result is always 4-connected along its length,
// which is what lets a limb be authored as a curve instead of as per-row
// runs that have to be checked for gaps by hand.
function stroke(spec, path, r0, r1, ch, W, H) {
  const seg = [];
  let total = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const d = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    seg.push(d); total += d;
  }
  if (total <= 0) { disc(spec, path[0][0], path[0][1], r0, ch, W, H); return; }
  let done = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const n = Math.max(1, Math.ceil(seg[i] / 0.4));
    for (let k = 0; k <= n; k++) {
      const f = k / n;
      const t = (done + seg[i] * f) / total;
      const x = path[i][0] + (path[i + 1][0] - path[i][0]) * f;
      const y = path[i][1] + (path[i + 1][1] - path[i][1]) * f;
      disc(spec, x, y, r0 + (r1 - r0) * t, ch, W, H);
    }
    done += seg[i];
  }
}

// Even-odd scanline polygon fill, plus a 1-cell stroke around the boundary
// so a sliver-thin scanline can never leave a hole that would split the
// silhouette. Used for the wing membranes.
function fillPoly(spec, pts, ch, W, H) {
  const ys = pts.map(p => p[1]);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
        xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) put(spec, x, y, ch, W, H);
    }
  }
  const loop = pts.concat([pts[0]]);
  stroke(spec, loop, 0.9, 0.9, ch, W, H);
}

// Build a length-H half-width profile by linearly interpolating between
// [row, halfWidth] control points; rows outside the control range stay 0
// ("no body pixels here"). Round 4: authoring a 56-72 row profile as ~15
// control points is both readable and produces 1-2 cell taper steps, which
// is the whole visual point of the extra resolution - a hand-typed array at
// 1x could only ever step by whole cells.
function profileFrom(points, H) {
  const p = new Array(H).fill(0);
  for (let i = 0; i + 1 < points.length; i++) {
    const [ya, wa] = points[i], [yb, wb] = points[i + 1];
    for (let y = ya; y <= yb; y++) {
      const t = yb === ya ? 0 : (y - ya) / (yb - ya);
      if (y >= 0 && y < H) p[y] = Math.round(wa + (wb - wa) * t);
    }
  }
  return p;
}

// Parametric tapered silhouette: `profile[y]` is the half-width (in cells)
// of the body at row y, 0 meaning "no body pixels this row" (used for rows
// accents like legs fully own). `centerOffsetFn(y)` (optional) shifts that
// row's center column, so a mass can curve sideways per row (a tail curl, a
// serpentine S-curve, a head nod) instead of always taper around one fixed
// vertical axis. Every opaque cell is written as a material sentinel - no
// color choice and no outline happens here; shadeAndOutline() does both
// once all layers (body + accents) are merged, which is what lets
// shading/outlining see the *whole* silhouette instead of one row at a time.
function tapered(profile, centerCol, centerOffsetFn, ch) {
  const off = centerOffsetFn || (() => 0);
  const mat = ch || SENTINEL;
  return profile.map((hw, y) => {
    if (!hw || hw <= 0) return {};
    const c = centerCol + off(y);
    return run(c - hw, c + hw - 1, mat);
  });
}

// Same row-edge math as tapered(), exposed standalone so accent placement
// (eyes, ears, wing roots, tail stubs...) can align itself to a specific
// row's actual x0/x1 - including whatever center offset that row has -
// without duplicating the offset arithmetic.
function taperedEdge(profile, centerCol, centerOffsetFn, y) {
  const hw = profile[y];
  if (!hw) return null;
  const off = centerOffsetFn || (() => 0);
  const c = centerCol + off(y);
  return { x0: c - hw, x1: c + hw - 1 };
}

// Head/cap nod: `dx` at row <= fullY, ramping linearly back to 0 by row
// zeroY. Round 4: at 3x a hard step between the nodding head rows and the
// static torso rows is a visible 2px shear in the silhouette, so the offset
// is feathered across the neck instead of cut.
function nodOffset(dx, fullY, zeroY) {
  return y => {
    if (!dx) return 0;
    if (y <= fullY) return dx;
    if (y >= zeroY) return 0;
    return Math.round(dx * (zeroY - y) / (zeroY - fullY));
  };
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
// shading + outline pass - shared by all four species so the volume/outline
// treatment is one correct implementation, not four hand-tuned hacks.
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
//   3. Every sentinel cell gets a tone from that (dist, lightBias) pair,
//      using the tone quad registered for ITS material - so the wing
//      membrane shades through membrane tones while the body beside it
//      shades through coat tones, off the same shared distance field.
//   4. THEN, over the whole merged silhouette (every opaque cell, any
//      material - body, horn, wing, leg, spot...), any cell touching a
//      transparent 8-neighbor or the grid edge becomes outline. Running
//      this after shading, over the full frame, is what gives a continuous
//      outline around the ENTIRE perimeter (top/bottom of a tapered head,
//      cap, wingtip - not just each row's left/right edge), and 8-neighbor
//      (not 4-) closes the diagonal notches a stepped taper (S-curve, ear
//      bumps) would otherwise leave un-outlined.
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

// Pick a tone for one sentinel cell from its (distance-to-edge, light-bias)
// pair. `tones` = { shadow, mid, highlight, rim } palette-key chars.
//
// Round 4: at 3x the masses actually HAVE interiors (distances up to ~12
// instead of ~4), so the ramp is spread over a real range: a 1px rim just
// inside the outline on the lit side, a lit slope behind it, a calm mid
// core, and an ambient-occlusion shadow band hugging the lower-right edge.
// At 1x these bands all collapsed into each other, which is part of why the
// old sprites read as flat.
function shadeChar(d, dot, tones) {
  if (d <= 1) {
    if (dot >= 3) return tones.rim;        // brightest sliver on the lit edge
    if (dot >= 0) return tones.highlight;
    return tones.shadow;                   // dark edge on the shadow side
  }
  if (d <= 3) {
    if (dot >= 2) return tones.highlight;
    if (dot <= -1) return tones.shadow;    // AO band inside the lower-right edge
    return tones.mid;
  }
  if (d <= 6 && dot >= 3) return tones.highlight; // broad lit slope on big masses
  return tones.mid;
}

// `tones` is either one tone quad (applies to SENTINEL only) or a map of
// sentinel char -> tone quad.
function shadeAndOutline(rows, outlineCh, tones) {
  const materials = tones && tones.mid ? { [SENTINEL]: tones } : tones;
  const H = rows.length, W = rows[0].length;
  const grid = rows.map(r => r.split(''));
  const mask = grid.map(row => row.map(ch => ch !== '.'));
  const D = computeDistanceField(mask, W, H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const mat = materials[grid[y][x]];
      if (!mat) continue;
      const d = D[y][x];
      const dL = x > 0 ? D[y][x - 1] : 0;
      const dR = x < W - 1 ? D[y][x + 1] : 0;
      const dU = y > 0 ? D[y - 1][x] : 0;
      const dN = y < H - 1 ? D[y + 1][x] : 0;
      const dot = (dR - dL) + (dN - dU); // >0 = upper-left-facing (lit), <0 = lower-right-facing (shadow)
      grid[y][x] = shadeChar(d, dot, mat);
    }
  }

  // Full-perimeter outline. Round 4 deleted the round-3 "thin feature"
  // carve-out: with every appendage authored >= 3 cells thick, every
  // perimeter pixel has a genuine interior 4-neighbour to fall back on, so
  // the blanket rule no longer eats any feature's own color - which is
  // exactly the condition round 3 was hacking around at 1x.
  const dirs8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const out = grid.map(r => r.slice());
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y][x]) continue;
      const edge = x === 0 || x === W - 1 || y === 0 || y === H - 1 ||
        dirs8.some(([dx, dy]) => !mask[y + dy][x + dx]);
      if (edge) out[y][x] = outlineCh;
    }
  }
  return out.map(r => r.join(''));
}

// Standard tone-role -> palette-key mapping the primary body material of
// every species palette below follows: a = mid, b = shadow/AO, c =
// highlight, d = rim/lightest.
function defaultTones(palette) {
  return { shadow: 'b', mid: 'a', highlight: 'c', rim: palette.d ? 'd' : 'c' };
}

// Whole-sprite vertical translate for the walk-cycle body bob - shifts
// every pixel down by `dy` rows (0 = no bob), leaving the vacated row(s)
// transparent. Always shifts DOWN (never up) into the spare blank row(s)
// every walking grid below keeps at the bottom, so nothing at the top
// (horns, cap) ever clips off.
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
//
// Round-4 calibration (see the header fix log for the measurements): the
// outline share is the REAL target of ~12-28% that HGSS-era battle sprites
// sit at, plus a minimum grid size, so the range can only be met by giving
// the art enough resolution to carry a proper full-perimeter outline -
// never by under-outlining, and never by shrinking the sprite until the
// ratio flatters itself.
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

// Round 4: with several material sentinels in play, a sentinel that never
// got a tone registered would silently reach the renderer as an undefined
// fillStyle (invisible in-game, but still counted as a "color" by the range
// check). Prove every char in every frame is a real palette key.
function checkPaletteCoverage(rows, palette, label) {
  const bad = new Set();
  for (const row of rows) for (const ch of row) {
    if (ch !== '.' && !palette[ch]) bad.add(ch);
  }
  if (!bad.size) return true;
  console.warn(`[SpeciesArt] ${label}: FAIL unmapped chars ${[...bad].join(' ')} (unshaded sentinel or typo)`);
  return false;
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
    ok = checkPaletteCoverage(rows, species.palette, label) && ok;
    ok = checkSpriteRanges(rows, species.outline, label) && ok;
  });
  return ok;
}

// ---------------------------------------------------------------------
// Species 1: RAMHORN - chunky quadruped (grass/earth beast), 72x56.
// Front-facing with a pseudo-3D leg stance (front legs centered/inner, back
// legs peeking wider at the sides and painted in a darker "behind"
// material) so a 3-frame diagonal-gait walk cycle (front-left+back-right vs
// front-right+back-left) reads clearly as motion instead of a body bob.
// ---------------------------------------------------------------------

function buildRamhorn() {
  const W = 72, H = 56, CENTER = 36, GROUND = 52;
  const outline = 'K';
  const palette = {
    K: '#141018',
    a: '#6a9944', b: '#446b2a', c: '#8fc45f', d: '#b7e389',   // coat
    n: '#2f4a1c',                                             // deepest coat (far legs)
    h: '#e8dcb0', i: '#ab9c70', j: '#f8f3d8',                 // horn keratin
    e: '#e3d9a8', o: '#ada173', p: '#f6f0cd',                 // muzzle / belly
    f: '#3a2c18', g: '#241a0e', q: '#5c4426',                 // hoof
    W: '#f4f7ee', P: '#161418', L: '#ffffff'                  // eye
  };
  // Per-material tone quads (shadow / mid / highlight / rim).
  const tones = {
    [SENTINEL]: defaultTones(palette),
    [MAT_F]: { shadow: 'n', mid: 'b', highlight: 'a', rim: 'a' },
    [MAT_C]: { shadow: 'i', mid: 'h', highlight: 'j', rim: 'j' },
    [MAT_D]: { shadow: 'o', mid: 'e', highlight: 'p', rim: 'p' },
    [MAT_E]: { shadow: 'g', mid: 'f', highlight: 'q', rim: 'q' },
  };

  // Head rows 5-22 (widest at the cheeks, narrowing into the muzzle), a
  // genuine NECK PINCH at rows 23-26, then the barrel torso rows 27-44 - a
  // real waist in the silhouette so shadeAndOutline wraps a distinct head
  // mass with its own outline, instead of one smooth triangular taper.
  // Proportions are deliberately head ~1/3, barrel ~1/3, legs ~1/4 of the
  // height: the first 3x draft gave the head 20 of 56 rows AND put the leg
  // tops at row 42, which left the legs as 6-row stubs under a giant head.
  const profile = profileFrom([
    [5, 5], [7, 9], [9, 12], [11, 14], [14, 15], [17, 15], [19, 14], [21, 12],
    [22, 10], [24, 8], [26, 9], [28, 14], [30, 19], [33, 23], [36, 25], [39, 25],
    [41, 23], [43, 20], [44, 16]
  ], H);
  const headOff = headDx => nodOffset(headDx, 21, 27);

  function accents(legPhase, headDx, bob) {
    const off = headOff(headDx);
    const acc = makeSpec(H);
    const edgeAt = y => taperedEdge(profile, CENTER, off, y);
    const hx = y => off(y); // head-follow offset for hand-placed face parts

    // --- far (back) legs first, so the near pair overlaps them ---
    const drawLeg = (x, topY, state, mat) => {
      const lift = state === 'plant' ? 0 : state === 'mid' ? 3 : 6;
      const bottom = GROUND - bob - lift;
      const swing = state === 'plant' ? 0 : state === 'mid' ? 1.5 : 3;
      stroke(acc, [
        [x, topY],
        [x + swing * 0.4, (topY + bottom) / 2],
        [x + swing, bottom - 3]
      ], 4.3, 3.3, mat, W, H);
      ellipseFill(acc, x + swing, bottom - 1.4, 4.6, 2.7, MAT_E, W, H);
    };
    const phase = {
      // diagonal gait: FL+BR vs FR+BL
      A: { fl: 'plant', br: 'plant', fr: 'lift', bl: 'lift' },
      N: { fl: 'mid', br: 'mid', fr: 'mid', bl: 'mid' },
      B: { fl: 'lift', br: 'lift', fr: 'plant', bl: 'plant' },
    }[legPhase];
    drawLeg(CENTER - 20, 36, phase.bl, MAT_F);
    drawLeg(CENTER + 20, 36, phase.br, MAT_F);

    // --- tail: a short perky goat tail off the top of the rump, kept ABOVE
    // the leg band so it can never merge with the back-right leg into one
    // ambiguous blob (the first 3x draft hung it down beside that leg and
    // it read as a fifth limb). ---
    const eTail = edgeAt(31);
    stroke(acc, [[eTail.x1 - 2, 31], [eTail.x1 + 3, 28], [eTail.x1 + 4, 24]], 3.6, 2.6, SENTINEL, W, H);
    disc(acc, eTail.x1 + 4, 22.5, 3.0, MAT_F, W, H);

    // --- near (front) legs ---
    drawLeg(CENTER - 11, 39, phase.fl, SENTINEL);
    drawLeg(CENTER + 11, 39, phase.fr, SENTINEL);

    // --- belly patch ---
    ellipseFill(acc, CENTER, 40, 9.5, 5.5, MAT_D, W, H);

    // --- ears: short leaf shapes angled down, tucked under the horn curl ---
    const eEar = edgeAt(16);
    stroke(acc, [[eEar.x0 + 2, 16], [eEar.x0 - 4, 17], [eEar.x0 - 8, 20]], 3.4, 1.9, SENTINEL, W, H);
    stroke(acc, [[eEar.x1 - 2, 16], [eEar.x1 + 4, 17], [eEar.x1 + 8, 20]], 3.4, 1.9, SENTINEL, W, H);

    // --- horns: a real ram curl (up, back, around, forward) with ridging ---
    const eHorn = edgeAt(7);
    const hornPath = (rootX, s) => [
      [rootX, 7], [rootX + s * 4, 3], [rootX + s * 10, 2], [rootX + s * 15, 5], [rootX + s * 12, 10]
    ];
    for (const [rootX, s] of [[eHorn.x0 + 2, -1], [eHorn.x1 - 2, 1]]) {
      const path = hornPath(rootX, s);
      stroke(acc, path, 4.4, 2.0, MAT_C, W, H);
      // ridge bands: short darker ticks across the horn every few cells,
      // sampled along the same polyline so they follow the curl.
      for (let t = 0.18; t < 0.92; t += 0.16) {
        const seg = t * (path.length - 1);
        const i = Math.min(path.length - 2, Math.floor(seg));
        const f = seg - i;
        const px = path[i][0] + (path[i + 1][0] - path[i][0]) * f;
        const py = path[i][1] + (path[i + 1][1] - path[i][1]) * f;
        const dx = path[i + 1][0] - path[i][0], dy = path[i + 1][1] - path[i][1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const r = 3.4 - 2.1 * t;
        for (let k = -r; k <= r; k += 0.5) put(acc, px + nx * k, py + ny * k, 'i', W, H);
      }
    }

    // --- muzzle + nostrils + mouth ---
    ellipseFill(acc, CENTER + hx(20), 20, 7.5, 5, MAT_D, W, H);
    ellipseFill(acc, CENTER + hx(18) - 3, 18, 1.5, 1.1, 'g', W, H);
    ellipseFill(acc, CENTER + hx(18) + 3, 18, 1.5, 1.1, 'g', W, H);
    box(acc, CENTER + hx(23) - 4, 23, CENTER + hx(23) + 3, 23, 'g', W, H);

    // --- brow ridge, then eyes (dark rim / sclera / pupil / glint) ---
    for (const s of [-1, 1]) {
      const ex = CENTER + hx(14) + s * 9;
      ellipseFill(acc, ex, 11.5, 4.2, 1.5, 'b', W, H);
      ellipseFill(acc, ex, 14.3, 4.1, 3.6, 'P', W, H);
      ellipseFill(acc, ex, 14.5, 3.2, 2.8, 'W', W, H);
      ellipseFill(acc, ex + s * 0.6, 15.2, 2.0, 2.2, 'P', W, H);
      box(acc, ex - 1.5, 12.9, ex - 0.6, 13.8, 'L', W, H);
    }
    return acc;
  }

  // Walk cycle motion: the torso settles lower on each weight-bearing frame
  // and rises back on the passing/neutral frame, with a head nod opposite
  // the forward leg pair, so the upper body visibly moves too. Leg lengths
  // are measured DOWN FROM a fixed ground row (GROUND - bob), so planted
  // feet stay planted while the body bobs over them and lifted feet clear
  // the ground - rather than the whole foot sliding with the bob.
  function frame(legPhase) {
    const headDx = legPhase === 'A' ? -2 : legPhase === 'B' ? 2 : 0;
    const bob = legPhase === 'N' ? 0 : 2;
    const off = headOff(headDx);
    const raw = rowsFromSpecs(mergeFrame(tapered(profile, CENTER, off), accents(legPhase, headDx, bob)), W);
    return bobFrame(shadeAndOutline(raw, outline, tones), bob);
  }

  const frames = [frame('A'), frame('N'), frame('B')];
  return { id: 'ramhorn', archetype: 'quadruped', width: W, height: H, palette, outline, frames };
}

// ---------------------------------------------------------------------
// Species 2: EMBERWING - small winged wyvern, 80x64. Body+head silhouette
// is slim/upright (very different mass distribution than the quadruped),
// with a pair of bat-structured wings that are the actual animated part
// (up / level / down) instead of legs - reads as a flap cycle, not a walk
// cycle.
// ---------------------------------------------------------------------

function buildEmberwing() {
  const W = 80, H = 64, CENTER = 40;
  const outline = 'K';
  const palette = {
    K: '#1c0e12',
    a: '#c95a2e', b: '#8f3a1c', c: '#ef8a48', d: '#ffb877',   // scale hide
    m: '#3a1a12', u: '#24100a', v: '#6d3620',                 // wing membrane
    y: '#f7c26a', z: '#bf8b3c', x: '#ffe6b0',                 // chest / throat gold
    h: '#f0d7a6', i: '#ab9067', j: '#fff4d8',                 // crest keratin
    W: '#fff3dc', P: '#241016', L: '#ffffff'
  };
  const tones = {
    [SENTINEL]: defaultTones(palette),
    [MAT_B]: { shadow: 'u', mid: 'm', highlight: 'v', rim: 'v' },
    [MAT_C]: { shadow: 'i', mid: 'h', highlight: 'j', rim: 'j' },
    [MAT_D]: { shadow: 'z', mid: 'y', highlight: 'x', rim: 'x' },
    [MAT_F]: { shadow: 'b', mid: 'b', highlight: 'a', rim: 'a' },
  };

  // Slim upright body: narrow snouted head, a neck, a broad chest at the
  // shoulders (where the wings root), then a long tail tapering away below.
  const profile = profileFrom([
    [4, 4], [6, 8], [8, 10], [11, 12], [14, 12], [16, 11], [18, 9], [20, 7],
    [21, 6], [23, 7], [25, 11], [28, 16], [31, 16], [34, 14], [37, 11], [40, 9],
    [43, 8], [46, 7], [49, 6], [52, 5], [55, 4], [58, 4]
  ], H);
  // Tail curl: the lower body slides right as it descends so the tail reads
  // as a sweeping curve rather than a straight plank.
  const tailCurl = y => (y <= 38 ? 0 : Math.round((y - 38) * 0.62));
  const bodyRows = tapered(profile, CENTER, tailCurl);
  const edgeAt = y => taperedEdge(profile, CENTER, tailCurl, y);

  // One wing, authored in local coordinates (origin = shoulder root, +x
  // outward, +y down) then rotated by the flap angle and mirrored per side.
  // Real bat-wing structure: arm bone root->elbow->wrist, four finger bones
  // fanning from the wrist, and a scalloped trailing edge between them.
  const WING = {
    elbow: [7, -4], wrist: [15, -6], tip: [23, -2],
    fingers: [[19, 7], [12, 12], [5, 13]],
    trail: [[21, 3], [16, 10], [9, 13.5]], // scallop control points
    back: [0, 10],
  };

  function drawWing(acc, rootX, rootY, side, angle) {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const P = ([lx, ly]) => [rootX + side * (lx * ca - ly * sa), rootY + (lx * sa + ly * ca)];
    const S = [rootX, rootY];
    const E = P(WING.elbow), Wr = P(WING.wrist), T = P(WING.tip);
    const F = WING.fingers.map(P);
    const Tr = WING.trail.map(P);
    const B = P(WING.back);
    // membrane panel: leading edge S-E-Wr-T, then scalloped trailing edge
    // back through the finger tips to the body.
    fillPoly(acc, [S, E, Wr, T, Tr[0], F[0], Tr[1], F[1], Tr[2], F[2], B], MAT_B, W, H);
    // finger bones - lighter membrane tone, drawn INSIDE the panel so they
    // stay their own color (interior pixels are never outlined).
    for (const f of [T, F[0], F[1], F[2]]) stroke(acc, [Wr, f], 1.1, 1.1, 'v', W, H);
    // arm bone along the leading edge, in hide material so the wing's front
    // edge reads as a limb with a lit top face, not as membrane.
    stroke(acc, [S, E, Wr], 3.2, 2.2, SENTINEL, W, H);
    // wrist claw
    disc(acc, Wr[0] + side * 1.5, Wr[1] - 1.5, 1.8, MAT_C, W, H);
  }

  function accents(wingPhase) {
    const acc = makeSpec(H);

    // --- tail fin (a spade tip, so the tail ends in a shape not a spike) ---
    const eT = edgeAt(56);
    const tipX = CENTER + tailCurl(58);
    ellipseFill(acc, tipX + 2, 58, 6, 4.5, SENTINEL, W, H);
    ellipseFill(acc, tipX + 4, 60.5, 4, 3, MAT_D, W, H);
    if (eT) box(acc, eT.x0, 56, eT.x1, 56, SENTINEL, W, H);

    // --- legs: short, stubby, three-lobed feet ---
    for (const s of [-1, 1]) {
      const lx = CENTER + s * 8;
      stroke(acc, [[lx, 33], [lx + s * 2, 40], [lx + s * 3, 45]], 4.0, 3.2, SENTINEL, W, H);
      for (const t of [-4, 0, 4]) {
        ellipseFill(acc, lx + s * 3 + t, 47.5, 2.3, 2.6, MAT_F, W, H);
      }
    }

    // --- chest / throat plate ---
    ellipseFill(acc, CENTER, 29, 7, 8.5, MAT_D, W, H);
    for (let y = 22; y <= 36; y += 4) box(acc, CENTER - 5, y, CENTER + 4, y, 'z', W, H);

    // --- wings (drawn over the chest, under nothing) ---
    const rootY = 28, rootEdge = edgeAt(rootY);
    const angle = wingPhase === 'up' ? -0.44 : wingPhase === 'down' ? 0.46 : 0.04;
    drawWing(acc, rootEdge.x0 + 1, rootY, -1, angle);
    drawWing(acc, rootEdge.x1 - 1, rootY, 1, angle);

    // --- head crest spikes ---
    const spikes = [[CENTER - 5, 7, CENTER - 9, 1], [CENTER, 5, CENTER, 0], [CENTER + 5, 7, CENTER + 9, 1]];
    for (const [x0, y0, x1, y1] of spikes) stroke(acc, [[x0, y0], [x1, y1]], 2.8, 1.3, MAT_C, W, H);

    // --- brow, eyes, snout ---
    for (const s of [-1, 1]) {
      const ex = CENTER + s * 6;
      ellipseFill(acc, ex, 10.5, 3.6, 1.4, 'b', W, H);
      ellipseFill(acc, ex, 13.5, 3.2, 2.8, 'W', W, H);
      ellipseFill(acc, ex + s * 0.5, 14.2, 2.0, 2.1, 'P', W, H);
      box(acc, ex - 1.4, 12.0, ex - 0.6, 12.9, 'L', W, H);
    }
    ellipseFill(acc, CENTER, 19, 4.5, 2.6, MAT_D, W, H);       // snout
    box(acc, CENTER - 4, 20, CENTER + 3, 20, 'b', W, H);       // mouth line
    ellipseFill(acc, CENTER - 2, 17.5, 0.9, 0.7, 'b', W, H);   // nostrils
    ellipseFill(acc, CENTER + 2, 17.5, 0.9, 0.7, 'b', W, H);
    return acc;
  }

  function frame(wingPhase) {
    const raw = rowsFromSpecs(mergeFrame(bodyRows, accents(wingPhase)), W);
    return shadeAndOutline(raw, outline, tones);
  }

  const frames = [frame('up'), frame('level'), frame('down')];
  return { id: 'emberwing', archetype: 'winged flyer', width: W, height: H, palette, outline, frames };
}

// ---------------------------------------------------------------------
// Species 3: COILFANG - serpentine body drawn as a genuine S-curve (each
// row's center column shifts left/right across the height, not a straight
// vertical column), with the curve's phase shifting between frames for a
// sidewinding-undulation animation - visually nothing like the other two
// archetypes' silhouettes. 56x72: the one TALL grid in the roster.
// ---------------------------------------------------------------------

function buildCoilfang() {
  const W = 56, H = 72, CENTER = 28;
  const outline = 'K';
  const palette = {
    K: '#0e1512',
    a: '#2f8f6e', b: '#1d6249', c: '#57c79a', d: '#a3e6c6',   // scales
    r: '#e0483a', q: '#9d2f26', p: '#f5836e',                 // belly / throat
    F: '#f2fff6', G: '#b4ccbe',                               // fangs
    M: '#4a1018',                                             // mouth interior
    W: '#f2fff6', P: '#101410', L: '#ffffff'
  };
  const tones = {
    [SENTINEL]: defaultTones(palette),
    [MAT_D]: { shadow: 'q', mid: 'r', highlight: 'p', rim: 'p' },
    [MAT_G]: { shadow: 'q', mid: 'd', highlight: 'd', rim: 'd' },
  };

  // Wide "hood/head" at top, a neck pinch, then a body that tapers smoothly
  // over the whole remaining length to a thin (but never 1-cell) tail.
  const profile = profileFrom([
    [0, 4], [2, 9], [4, 12], [6, 13], [9, 13], [11, 12], [13, 10], [15, 8],
    [17, 7], [19, 8], [22, 10], [26, 10], [30, 10], [34, 9], [40, 8], [46, 7],
    [52, 6], [58, 5], [64, 4], [70, 3], [71, 3]
  ], H);

  function sCurve(phase) {
    // sine-based center offset per row -> S-curve; phase shifts the wave
    // so consecutive frames read as the body sliding through the curve
    // (sidewinding), not just sliding sideways as a rigid shape.
    const out = [];
    for (let y = 0; y < H; y++) out.push(Math.round(9 * Math.sin(y / 9.3 + phase)));
    return out;
  }

  function accents(offs) {
    const acc = makeSpec(H);
    const cAt = y => CENTER + offs[y];

    // --- belly stripe, following the curve; clamped inside the silhouette
    // so it can never widen the body or land on the perimeter. ---
    for (let y = 17; y <= 68; y++) {
      const hw = profile[y];
      if (!hw) continue;
      const bw = Math.max(1, Math.min(3, hw - 2));
      const c = cAt(y);
      for (let x = c - bw; x <= c + bw - 1; x++) put(acc, x, y, MAT_D, W, H);
      // ventral scute ticks on the green flanks either side of the stripe
      if (y % 6 === 2) {
        for (let x = c - hw + 2; x <= c - bw - 1; x++) put(acc, x, y, 'b', W, H);
        for (let x = c + bw; x <= c + hw - 3; x++) put(acc, x, y, 'b', W, H);
      }
    }

    // --- rattle-ish segmented tail tip ---
    for (let y = 64; y <= 70; y++) {
      const hw = profile[y];
      if (!hw) continue;
      const c = cAt(y);
      if ((y - 64) % 2 === 0) for (let x = c - hw + 1; x <= c + hw - 2; x++) put(acc, x, y, MAT_G, W, H);
    }

    // --- open mouth with fangs, authored per-row so it follows the curve ---
    const mouthHw = { 11: 4, 12: 5, 13: 5, 14: 5, 15: 4, 16: 3 };
    for (const [ys, hw] of Object.entries(mouthHw)) {
      const y = Number(ys), c = cAt(y);
      for (let x = c - hw; x <= c + hw - 1; x++) put(acc, x, y, 'M', W, H);
    }
    for (const s of [-1, 1]) {
      for (let y = 12; y <= 15; y++) {
        const c = cAt(y);
        const wdt = y <= 12 ? 2 : y <= 13 ? 1 : 0;
        const base = c + (s < 0 ? -4 : 3);
        for (let k = 0; k <= wdt; k++) put(acc, base + (s < 0 ? k : -k), y, y >= 14 ? 'G' : 'F', W, H);
      }
    }
    // tongue inside the mouth
    for (let y = 14; y <= 16; y++) put(acc, cAt(y), y, 'r', W, H);
    put(acc, cAt(15) - 1, 15, 'r', W, H);

    // --- brow + eyes on the hood ---
    for (const s of [-1, 1]) {
      const ex = cAt(6) + s * 6;
      ellipseFill(acc, ex, 3.6, 3.8, 1.4, 'b', W, H);
      ellipseFill(acc, ex, 6.4, 3.3, 2.9, 'W', W, H);
      ellipseFill(acc, ex + s * 0.5, 7.0, 1.3, 2.4, 'P', W, H);  // slit pupil
      box(acc, ex - 1.5, 4.9, ex - 0.6, 5.8, 'L', W, H);
    }
    // hood crest markings
    for (const s of [-1, 1]) ellipseFill(acc, cAt(9) + s * 9, 9, 2.2, 3.2, 'b', W, H);
    return acc;
  }

  function frame(phase) {
    const offs = sCurve(phase);
    const bodyLayer = tapered(profile, CENTER, y => offs[y]);
    const raw = rowsFromSpecs(mergeFrame(bodyLayer, accents(offs)), W);
    return shadeAndOutline(raw, outline, tones);
  }

  const frames = [frame(0), frame(0.9), frame(1.8)];
  return { id: 'coilfang', archetype: 'serpentine', width: W, height: H, palette, outline, frames };
}

// ---------------------------------------------------------------------
// Species 4: SPORELING - stout biped (mushroom/toad-like), 56x56. Big
// rounded spore cap with a gilled underside, a short thick stalk-body
// carrying the face, stubby arms, and two legs that alternate stepping
// (unlike the quadruped's diagonal gait, a biped step is a simple
// left/right alternation) - a fourth distinct mass distribution
// (top-heavy, wide cap) so the roster isn't four variations on one
// silhouette.
// ---------------------------------------------------------------------

function buildSporeling() {
  const W = 56, H = 56, CENTER = 28, GROUND = 52;
  const outline = 'K';
  const palette = {
    K: '#1a1420',
    a: '#8a4fae', b: '#5f3380', c: '#c184e0', d: '#ecd0f8',   // cap / body
    g: '#3b2056', G: '#7c4f9e',                               // gill dark / gill rib
    s: '#f4e6a8', t: '#c0ac6f', u: '#fdf6d4',                 // cap spots
    e: '#dfe8d8', n: '#a4b09e', o: '#f4faf0',                 // pale belly
    v: '#2a1540', w: '#6b3f8c',                               // foot / dark extremity
    W: '#fbf7ff', P: '#191420', L: '#ffffff'
  };
  const tones = {
    [SENTINEL]: defaultTones(palette),
    [MAT_D]: { shadow: 'n', mid: 'e', highlight: 'o', rim: 'o' },
    [MAT_G]: { shadow: 't', mid: 's', highlight: 'u', rim: 'u' },
    [MAT_F]: { shadow: 'v', mid: 'g', highlight: 'w', rim: 'w' },
  };

  // Wide dome cap (rows 2-18) with a hard rim step down to the stalk, then
  // a stalk that swells slightly at the face and narrows to the feet.
  const profile = profileFrom([
    [2, 7], [4, 13], [6, 17], [9, 20], [12, 21], [15, 21], [17, 20], [18, 19],
    [19, 12], [22, 13], [26, 14], [30, 14], [34, 13], [38, 12], [41, 11], [43, 9]
  ], H);
  const capOff = capDx => nodOffset(capDx, 19, 27);

  function accents(legPhase, capDx, bob) {
    const off = capOff(capDx);
    const acc = makeSpec(H);
    const edgeAt = y => taperedEdge(profile, CENTER, off, y);

    // --- legs ---
    const drawLeg = (x, state) => {
      const lift = state === 'plant' ? 0 : state === 'mid' ? 2 : 5;
      const bottom = GROUND - bob - lift;
      const swing = state === 'plant' ? 0 : state === 'mid' ? 1 : 2.5;
      stroke(acc, [[x, 39], [x + swing * 0.4, (39 + bottom) / 2], [x + swing, bottom - 3]], 4.6, 3.6, SENTINEL, W, H);
      ellipseFill(acc, x + swing, bottom - 1.5, 5.2, 2.8, MAT_F, W, H);
    };
    const st = {
      L: ['plant', 'lift'], N: ['mid', 'mid'], R: ['lift', 'plant']
    }[legPhase];
    drawLeg(CENTER - 7, st[0]);
    drawLeg(CENTER + 7, st[1]);

    // --- stubby arms with rounded hands ---
    const eArm = edgeAt(29);
    stroke(acc, [[eArm.x0 + 2, 29], [eArm.x0 - 5, 32], [eArm.x0 - 8, 36]], 3.6, 2.9, SENTINEL, W, H);
    disc(acc, eArm.x0 - 8, 37, 3.3, SENTINEL, W, H);
    stroke(acc, [[eArm.x1 - 2, 29], [eArm.x1 + 5, 32], [eArm.x1 + 8, 36]], 3.6, 2.9, SENTINEL, W, H);
    disc(acc, eArm.x1 + 8, 37, 3.3, SENTINEL, W, H);

    // --- pale belly ---
    ellipseFill(acc, CENTER, 35, 6.5, 6.5, MAT_D, W, H);

    // --- gilled cap underside: a dark band under the rim with lighter
    // radial ribs, which is what makes the cap read as a mushroom rather
    // than a dome hat. ---
    for (let y = 15; y <= 18; y++) {
      const e = edgeAt(y);
      if (!e) continue;
      for (let x = e.x0 + 2; x <= e.x1 - 2; x++) put(acc, x, y, 'g', W, H);
    }
    const eG = edgeAt(16);
    for (let x = eG.x0 + 3; x <= eG.x1 - 3; x += 3) {
      for (let y = 15; y <= 18; y++) {
        const e = edgeAt(y);
        if (e && x >= e.x0 + 2 && x <= e.x1 - 2) put(acc, x, y, 'G', W, H);
      }
    }

    // --- cap spots ---
    ellipseFill(acc, CENTER + off(8) - 11, 8, 4.5, 3.2, MAT_G, W, H);
    ellipseFill(acc, CENTER + off(11) + 9, 11, 5.0, 3.4, MAT_G, W, H);
    ellipseFill(acc, CENTER + off(4) + 1, 4.5, 4.2, 2.4, MAT_G, W, H);

    // --- face on the upper stalk ---
    for (const s of [-1, 1]) {
      const ex = CENTER + s * 7;
      ellipseFill(acc, ex, 21.5, 3.8, 1.4, 'b', W, H);
      ellipseFill(acc, ex, 24.5, 3.4, 3.0, 'W', W, H);
      ellipseFill(acc, ex + s * 0.5, 25.2, 2.1, 2.2, 'P', W, H);
      box(acc, ex - 1.5, 22.9, ex - 0.6, 23.8, 'L', W, H);
    }
    ellipseFill(acc, CENTER, 29.5, 3.6, 1.6, 'g', W, H);   // mouth
    return acc;
  }

  // Walk cycle motion (same idea as Ramhorn): body settles lower on each
  // weight-bearing frame, rises on the neutral/passing frame, with a cap
  // nod opposite the stepping leg, feathered across the stalk rows so the
  // nod doesn't shear the silhouette.
  function frame(legPhase) {
    const capDx = legPhase === 'L' ? -2 : legPhase === 'R' ? 2 : 0;
    const bob = legPhase === 'N' ? 0 : 2;
    const off = capOff(capDx);
    const raw = rowsFromSpecs(mergeFrame(tapered(profile, CENTER, off), accents(legPhase, capDx, bob)), W);
    return bobFrame(shadeAndOutline(raw, outline, tones), bob);
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
//
// Round 4: the source grids tripled, so the default px dropped 4 -> 2. The
// strip is still comfortably larger than the sprite's on-screen size (and
// PixelBillboard uses NearestFilter, so px only sets texture resolution,
// never the apparent pixel size) - this just keeps a 4-species roster from
// allocating ~3MB of texture for no visible gain.
function buildSpeciesCanvas(species, px = 2) {
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
  connectedComponents, checkConnected, checkSpriteRanges, checkPaletteCoverage,
  validateSpecies, validateAllSpecies,
  // rendering (browser-only, needs document)
  buildSpeciesCanvas,
};

if (typeof window !== 'undefined') window.SpeciesArt = SpeciesArtAPI;
if (typeof module !== 'undefined' && module.exports) module.exports = SpeciesArtAPI;
