// Battle grid terrain - the ground the tower-defense combat happens on.
// Pure visual/environment piece: builds a THREE.Group containing a tileable
// biome ground plane, a distinct path/road strip through the grid, and
// scattered pixel-art decorations (trees/bushes as PixelBillboard sprites,
// rocks as low-poly flat-shaded geometry) around the play area's margins.
//
// Follows Engine.js's pixel-art-in-3D contract: every texture here is built
// as a small hard-edged pixel-grid canvas (NearestFilter, no mipmaps, no
// gradients) so it stays crisp when the renderer's low internal resolution
// gets upscaled - see Engine.js's header comment.
//
// The ground/path speckle-tile technique (flat base color + scattered
// blocky rects, each drawn with +-size wraparound copies so the tile has no
// seam when repeated) and the per-biome palette/tint scheme are ported from
// this project's proven 2D predecessor - see
// monster-tactics/scripts/gen_assets.py (make_speckle_tile / BIOME_TILES)
// and monster-tactics/public/js/data/biomes.js (decorTint). Re-implemented
// here in plain canvas/JS (no Python/PIL) so it fits this project's
// build-free <script> architecture.
//
// Grid convention (also ported from monster-tactics/public/js/data/stages.js):
// cells are addressed by {col, row}; a path is authored as a short list of
// waypoints where every consecutive pair shares a row OR a column, then
// expanded into the full walked cell list by expandPathWaypoints below.

// ---- seeded RNG (deterministic decoration scatter / speckle placement) ----
function terrainMulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- per-biome palettes (ported from monster-tactics' BIOME_TILES/BIOMES) ----
const TERRAIN_BIOMES = {
  grass: {
    groundBase: '#43703d',
    groundSpeckles: [
      ['#355c32', 26, 2, 5], // shadow clumps
      ['#5a8c4a', 30, 1, 3], // light blade tufts
      ['#6c9e55', 10, 1, 2], // bright highlight flecks
      ['#2e4f2b', 8, 1, 2]   // dark accents
    ],
    groundSeed: 7,
    pathBase: '#8a6a45',
    pathSpeckles: [
      ['#6b4f34', 22, 2, 5], // darker dirt clumps
      ['#a9865c', 22, 1, 3], // light dust highlight
      ['#5a4028', 14, 1, 2], // pebbles
      ['#c2a376', 6, 1, 2]   // bright sand fleck
    ],
    pathSeed: 13,
    decorTint: null,
    rockColor: 0x8a8a86
  },
  snow: {
    groundBase: '#d8e8f0',
    groundSpeckles: [
      ['#b7d0de', 26, 2, 5],
      ['#f5fbff', 30, 1, 3],
      ['#ffffff', 10, 1, 2],
      ['#93b3c4', 8, 1, 2]
    ],
    groundSeed: 21,
    pathBase: '#9fb8c4',
    pathSpeckles: [
      ['#7693a1', 22, 2, 5],
      ['#d3e6ed', 22, 1, 3],
      ['#5c7886', 14, 1, 2],
      ['#e8f4f8', 6, 1, 2]
    ],
    pathSeed: 22,
    // Multiplicative tint on shared tree/bush art (like tactics' Phaser
    // tint) - needs real color/darkness or a pale wash barely shows up.
    decorTint: 0x6fa8d8,
    rockColor: 0xb9c9d6
  },
  desert: {
    groundBase: '#dcc07a',
    groundSpeckles: [
      ['#c2a25c', 26, 2, 5],
      ['#ecd89c', 30, 1, 3],
      ['#f5e8b8', 10, 1, 2],
      ['#a88a4a', 8, 1, 2]
    ],
    groundSeed: 31,
    pathBase: '#c9a866',
    pathSpeckles: [
      ['#a8874c', 22, 2, 5],
      ['#8f703d', 14, 1, 2],
      ['#e0c98e', 22, 1, 3],
      ['#6b552e', 6, 1, 2]
    ],
    pathSeed: 32,
    decorTint: 0xc9a860,
    rockColor: 0xb89a63
  }
};

// Blocky, seamlessly-tiling pixel-art texture canvas: a flat base color plus
// scattered rectangular "speckles". Each speckle is drawn 9x (at +-size in x
// and y) so any speckle straddling an edge wraps around cleanly - the tile
// then repeats with no visible seam. Direct port of gen_assets.py's
// make_speckle_tile.
function terrainMakeSpeckleTile(size, baseColor, speckles, seed) {
  const rand = terrainMulberry32(seed);
  const cvs = document.createElement('canvas');
  cvs.width = size; cvs.height = size;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  for (const [color, count, smin, smax] of speckles) {
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const w = smin + Math.floor(rand() * (smax - smin + 1));
      const h = smin + Math.floor(rand() * (smax - smin + 1));
      const x = Math.floor(rand() * size);
      const y = Math.floor(rand() * size);
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          ctx.fillRect(x + dx, y + dy, w, h);
        }
      }
    }
  }
  return cvs;
}

function terrainMakeTexture(canvas, repeatX, repeatY) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

// Non-repeating variant for a texture meant to be mapped 1:1 across a whole
// mesh (the path overlay, below) rather than tiled - clamped, not repeated.
function terrainMakeClampTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A second, much-coarser ground variation layer: a handful of big blocky
// lighter/darker patches, alpha-blended over the speckle tile, to break up
// its visible repeat rhythm at wide pull-back. Deliberately NOT a repeating
// tile (a small tile repeated at a coarse scale just produces a second,
// bigger checkerboard, no better than the one it's fixing) - instead this
// draws directly, once, at random world-space positions across the WHOLE
// grid's extent, the same way the path overlay above avoids tiling.
function terrainMakeGroundMacroCanvas(totalCols, totalRows, seed) {
  const sub = 6; // coarse subpixels per cell - this layer is soft/low-detail
  const W = totalCols * sub, H = totalRows * sub;
  const cvs = document.createElement('canvas');
  cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rand = terrainMulberry32(seed);
  const patchCount = 10;
  for (let i = 0; i < patchCount; i++) {
    const light = rand() < 0.5;
    ctx.fillStyle = light ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
    const w = Math.floor(W * (0.16 + rand() * 0.2));
    const h = Math.floor(H * (0.16 + rand() * 0.2));
    const x = Math.floor(rand() * W - w * 0.4);
    const y = Math.floor(rand() * H - h * 0.4);
    ctx.fillRect(x, y, w, h);
  }
  return cvs;
}

// ---- small color helpers for the path-overlay raster below ----
function terrainHexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
}
function terrainShadeHex(hex, factor) {
  const { r, g, b } = terrainHexToRgb(hex);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return { r: clamp(r * factor), g: clamp(g * factor), b: clamp(b * factor) };
}
// Deterministic integer-coordinate hash -> [0,1), used to drive the boundary
// bite/dilate noise and the world-space (non-tiled) speckle color picks.
function terrainHash2D(x, y, salt) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
// Approximates each speckle color's area-share of the original small tile
// (count * average-size^2 / tile-area), so a per-pixel weighted pick can
// stand in for the literal tiny-tile stamping and still look right.
function terrainSpeckleWeights(speckles, tileSize) {
  return speckles.map(([color, count, smin, smax]) => {
    const avgSide = (smin + smax) / 2;
    const weight = Math.min(0.9, (count * avgSide * avgSide) / (tileSize * tileSize));
    return { rgb: terrainHexToRgb(color), weight };
  });
}
function terrainPickWeighted(entries, baseRgb, r) {
  let acc = 0;
  for (const e of entries) { acc += e.weight; if (r < acc) return e.rgb; }
  return baseRgb;
}

// ---- pixel-art decoration sprites (procedurally drawn, hard-edged blocks) ----

// Three-tier pine tree, drawn on an integer pixel grid (no anti-aliased
// paths - every "pixel" is a fillRect block) so it reads as real pixel art
// rather than a smooth vector shape at this render scale.
function terrainMakePineCanvas(px) {
  const gridW = 13, gridH = 16;
  const cvs = document.createElement('canvas');
  cvs.width = gridW * px; cvs.height = gridH * px;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const put = (x, y, color) => { ctx.fillStyle = color; ctx.fillRect(x * px, y * px, px, px); };

  const darkG = '#2e4f2b', midG = '#4f8a44', liteG = '#7cbf5f';
  const trunkD = '#5a4028', trunkL = '#7a5a3a';
  const tiers = [
    { top: 0, h: 4, minW: 1, maxW: 7 },
    { top: 4, h: 4, minW: 5, maxW: 11 },
    { top: 8, h: 4, minW: 7, maxW: 13 }
  ];
  const cx = (gridW - 1) / 2; // 6, center column
  for (const t of tiers) {
    for (let i = 0; i < t.h; i++) {
      const y = t.top + i;
      const w = Math.round(t.minW + (t.maxW - t.minW) * (i / (t.h - 1)));
      const half = (w - 1) / 2;
      const x0 = Math.round(cx - half), x1 = Math.round(cx + half);
      for (let x = x0; x <= x1; x++) {
        let color = midG;
        if (x === x0 || x === x1) color = darkG;
        else if (x > cx && i === 0) color = liteG; // light-from-upper-right fleck per tier tip
        put(x, y, color);
      }
    }
  }
  for (let y = 12; y < gridH; y++) {
    put(cx - 1, y, trunkD);
    put(cx, y, trunkL);
    put(cx + 1, y, trunkD);
  }
  return cvs;
}

// Three overlapping blocky circles fused into one bush silhouette.
function terrainMakeBushCanvas(px) {
  const gridW = 14, gridH = 9;
  const cvs = document.createElement('canvas');
  cvs.width = gridW * px; cvs.height = gridH * px;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const put = (x, y, color) => { ctx.fillStyle = color; ctx.fillRect(x * px, y * px, px, px); };

  const darkG = '#355c2f', midG = '#5a8c4a', liteG = '#8fc46a';
  const circles = [
    { cx: 4, cy: 5, r: 3.2 },
    { cx: 9, cy: 5, r: 3.2 },
    { cx: 6.5, cy: 3.4, r: 3.0 }
  ];
  const inside = (x, y) => circles.some(c => {
    const dx = x - c.cx, dy = (y - c.cy) * 1.15;
    return dx * dx + dy * dy <= c.r * c.r;
  });
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      if (!inside(x, y)) continue;
      const isEdge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      let color = midG;
      if (isEdge) color = darkG;
      else if (x > 7 && y < 4) color = liteG;
      put(x, y, color);
    }
  }
  return cvs;
}

// Rasterize the path cells into one canvas-drawn alpha mask covering the
// WHOLE grid (not a tile stamped per cell), so the road reads as a single
// walked-in road instead of a brown rectangle mask fill:
//  - the cell-rectangle boundary is bitten/dilated a few subpixels in and
//    out with per-pixel noise (no knife-edge straight line),
//  - the path shape's outer (convex) corners are rounded off instead of
//    staying hard 90 deg miters,
//  - a 1-2 subpixel darker "worn rim" band is drawn just inside the edge,
//  - a scatter of grass-tuft blocks spill onto the dirt right at that rim,
//  - the dirt speckle color itself is picked per small clump from a
//    world-space hash of its raster position (not a repeated small tile),
//  so the pebble pattern never repeats down a straight run of path.
function terrainBuildPathOverlayCanvas(b, pathSet, cols, rows, margin, seed) {
  const R = 16;      // mask subpixels per grid cell (edge-detail resolution)
  const BAND = 4;     // how many subpixels deep the boundary may bite/dilate
  const BLOCK_EDGE = 4; // along-edge chunk size, in subpixels - the whole
                         // chunk gets one graded bite depth, so the ragged
                         // edge reads as a few chunky irregular teeth (like a
                         // worn-in path) instead of per-pixel static noise
  const CORNER_R = 5; // outer-corner rounding radius, in subpixels
  const RIM_DEPTH = 2; // worn-rim band depth, in subpixels
  const BLOCK = 3;    // speckle "clump" size in subpixels (keeps noise
                       // blocky/pixel-art rather than per-pixel static)
  const totalCols = cols + margin * 2;
  const totalRows = rows + margin * 2;
  const W = totalCols * R, H = totalRows * R;

  const isPath = (c, r) => pathSet.has(c + ',' + r);
  const colOf = (px) => Math.floor(px / R) - margin;
  const rowOf = (py) => Math.floor(py / R) - margin;

  // Pass 1: base rectangular cell occupancy, then bite/dilate the boundary.
  // The bite depth is decided once per BLOCK_EDGE-wide chunk along a given
  // straight edge run (keyed on the edge's fixed cell coordinate, so it
  // stays continuous along that run and independent from other, unrelated
  // boundary runs) rather than per subpixel, so the result is a handful of
  // graded, irregular-depth notches - not salt-and-pepper fuzz.
  const occ = new Uint8Array(W * H);
  for (let py = 0; py < H; py++) {
    const cr = rowOf(py), ly = py - (cr + margin) * R;
    for (let px = 0; px < W; px++) {
      const cc = colOf(px), lx = px - (cc + margin) * R;
      let o = isPath(cc, cr) ? 1 : 0;
      const dLeft = lx, dRight = R - 1 - lx, dTop = ly, dBottom = R - 1 - ly;
      const edgeDist = Math.min(dLeft, dRight, dTop, dBottom);
      // Corner zones (near a cell's actual corner) are left alone here and
      // handled exclusively by the dedicated corner-rounding pass below -
      // letting both passes act on the same pixels compounded into long
      // diagonal spike artifacts rather than a clean rounded corner.
      const inCornerZone = (lx < CORNER_R || lx >= R - CORNER_R) && (ly < CORNER_R || ly >= R - CORNER_R);
      if (edgeDist < BAND && !inCornerZone) {
        let nc = cc, nr = cr, alongBlock, otherCoord, edgeSide;
        if (edgeDist === dLeft) { nc = cc - 1; alongBlock = Math.floor(py / BLOCK_EDGE); otherCoord = cc; edgeSide = 1; }
        else if (edgeDist === dRight) { nc = cc + 1; alongBlock = Math.floor(py / BLOCK_EDGE); otherCoord = cc; edgeSide = 2; }
        else if (edgeDist === dTop) { nr = cr - 1; alongBlock = Math.floor(px / BLOCK_EDGE); otherCoord = cr; edgeSide = 3; }
        else { nr = cr + 1; alongBlock = Math.floor(px / BLOCK_EDGE); otherCoord = cr; edgeSide = 4; }
        const neighborPath = isPath(nc, nr);
        if (neighborPath !== !!o) {
          const n = terrainHash2D(alongBlock, otherCoord, b.pathSeed + seed * 97 + edgeSide * 17 + 11);
          const biteDepth = Math.floor(n * (BAND + 1)); // 0..BAND, graded per chunk
          if (edgeDist < biteDepth) o = neighborPath ? 1 : 0;
        }
      }
      occ[py * W + px] = o;
    }
  }

  // Pass 2: round the path shape's outer (convex) corners - where a path
  // cell's two orthogonal neighbors are both non-path (a turn or a dead
  // end), cut a blocky quarter-circle notch instead of a hard miter.
  for (let py = 0; py < H; py++) {
    const cr = rowOf(py), ly = py - (cr + margin) * R;
    for (let px = 0; px < W; px++) {
      if (!occ[py * W + px]) continue;
      const cc = colOf(px), lx = px - (cc + margin) * R;
      const nearLeft = lx < CORNER_R, nearRight = lx >= R - CORNER_R;
      const nearTop = ly < CORNER_R, nearBottom = ly >= R - CORNER_R;
      let cx = -1, cy = -1;
      if (nearLeft && nearTop && !isPath(cc - 1, cr) && !isPath(cc, cr - 1)) { cx = CORNER_R - 1 - lx; cy = CORNER_R - 1 - ly; }
      else if (nearRight && nearTop && !isPath(cc + 1, cr) && !isPath(cc, cr - 1)) { cx = lx - (R - CORNER_R); cy = CORNER_R - 1 - ly; }
      else if (nearLeft && nearBottom && !isPath(cc - 1, cr) && !isPath(cc, cr + 1)) { cx = CORNER_R - 1 - lx; cy = ly - (R - CORNER_R); }
      else if (nearRight && nearBottom && !isPath(cc + 1, cr) && !isPath(cc, cr + 1)) { cx = lx - (R - CORNER_R); cy = ly - (R - CORNER_R); }
      if (cx >= 0 && cy >= 0 && cx * cx + cy * cy > CORNER_R * CORNER_R) occ[py * W + px] = 0;
    }
  }

  // Pass 3: worn rim = occupied subpixel within RIM_DEPTH of an unoccupied one.
  const rim = new Uint8Array(W * H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      if (!occ[py * W + px]) continue;
      let isRim = false;
      for (let dy = -RIM_DEPTH; dy <= RIM_DEPTH && !isRim; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= H) { isRim = true; break; }
        for (let dx = -RIM_DEPTH; dx <= RIM_DEPTH; dx++) {
          const nx = px + dx;
          if (nx < 0 || nx >= W || !occ[ny * W + nx]) { isRim = true; break; }
        }
      }
      rim[py * W + px] = isRim ? 1 : 0;
    }
  }

  // Pass 4: raster the actual colors.
  const dirtWeights = terrainSpeckleWeights(b.pathSpeckles, 48);
  const tuftRgb = terrainHexToRgb((b.groundSpeckles[1] && b.groundSpeckles[1][0]) || b.groundBase);
  const baseRgb = terrainHexToRgb(b.pathBase);
  const cvs = document.createElement('canvas');
  cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const img = ctx.createImageData(W, H);
  for (let py = 0; py < H; py++) {
    const blockY = Math.floor(py / BLOCK);
    for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4;
      if (!occ[py * W + px]) { img.data[i + 3] = 0; continue; }
      const blockX = Math.floor(px / BLOCK);
      const isRimPx = rim[py * W + px] === 1;
      const tuftRoll = terrainHash2D(blockX, blockY, b.pathSeed + seed * 53 + 5);
      let rgb;
      if (isRimPx && tuftRoll < 0.05) {
        rgb = tuftRgb; // a grass tuft spilling onto the dirt right at the edge
      } else {
        const speckleRoll = terrainHash2D(blockX, blockY, b.pathSeed + seed * 211 + 31);
        rgb = terrainPickWeighted(dirtWeights, baseRgb, speckleRoll);
        if (isRimPx) rgb = terrainShadeHex('#' +
          rgb.r.toString(16).padStart(2, '0') + rgb.g.toString(16).padStart(2, '0') + rgb.b.toString(16).padStart(2, '0'),
          0.76); // darker worn-rim band
      }
      img.data[i] = rgb.r; img.data[i + 1] = rgb.g; img.data[i + 2] = rgb.b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cvs;
}

// Expand a short list of {col,row} waypoints (each consecutive pair sharing
// a row OR a column - the monster-tactics stages.js convention) into the
// full list of grid cells the path walks through, in order and de-duplicated
// at the shared corner cells.
function expandPathWaypoints(waypoints) {
  if (!waypoints || waypoints.length === 0) return [];
  const cells = [];
  const seen = new Set();
  const addCell = (col, row) => {
    const key = col + ',' + row;
    if (!seen.has(key)) { seen.add(key); cells.push({ col, row }); }
  };
  addCell(waypoints[0].col, waypoints[0].row);
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1], b = waypoints[i];
    if (a.col === b.col && a.row === b.row) continue;
    if (a.col === b.col) {
      const step = b.row > a.row ? 1 : -1;
      for (let r = a.row + step; ; r += step) { addCell(a.col, r); if (r === b.row) break; }
    } else if (a.row === b.row) {
      const step = b.col > a.col ? 1 : -1;
      for (let c = a.col + step; ; c += step) { addCell(c, a.row); if (c === b.col) break; }
    } else {
      throw new Error('expandPathWaypoints: consecutive waypoints must share a row or a column');
    }
  }
  return cells;
}

// Build the battle grid terrain as a THREE.Group.
//
// opts:
//   cols, rows      - playable grid size in cells (default 12x8)
//   cellSize        - world units per cell (default 1.3)
//   path            - array of {col,row} cells the enemy path walks through
//                      (use expandPathWaypoints to build this from waypoints)
//   biome           - 'grass' | 'snow' | 'desert' (default 'grass')
//   margin          - extra decorated-but-unplayable cells of ground ringing
//                      the playable grid, where decorations are scattered
//                      (default 2)
//   decorationDensity - chance [0,1] a given margin cell gets a decoration
//   seed            - decoration-placement RNG seed, for reproducible layouts
//
// The inner playable grid is centered on the group's local origin; cell
// (col,row) world position is available back out via group.userData.terrain.
function buildTerrain(opts = {}) {
  const {
    cols = 12,
    rows = 8,
    cellSize = 1.3,
    path = [],
    biome = 'grass',
    margin = 2,
    decorationDensity = 0.35,
    seed = 1
  } = opts;

  const b = TERRAIN_BIOMES[biome] || TERRAIN_BIOMES.grass;
  const group = new THREE.Group();
  group.name = 'Terrain';

  const cellToWorldX = (col) => (col - (cols - 1) / 2) * cellSize;
  const cellToWorldZ = (row) => (row - (rows - 1) / 2) * cellSize;

  const totalCols = cols + margin * 2;
  const totalRows = rows + margin * 2;

  // ---- ground: one big plane, biome speckle tile repeated once per cell ----
  const groundCanvas = terrainMakeSpeckleTile(48, b.groundBase, b.groundSpeckles, b.groundSeed);
  const groundTex = terrainMakeTexture(groundCanvas, totalCols, totalRows);
  const groundGeo = new THREE.PlaneGeometry(totalCols * cellSize, totalRows * cellSize);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshLambertMaterial({ map: groundTex });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  ground.name = 'Ground';
  group.add(ground);

  // ---- far ground skirt: a big flat low-detail plane well past the play
  // field, so pulling the camera back reveals grass fading toward the fog/
  // horizon color instead of the detailed ground ending in a hard slab edge
  // against the sky. ----
  const farColor = new THREE.Color(b.groundBase).multiplyScalar(0.92);
  const farGeo = new THREE.PlaneGeometry(220, 220);
  farGeo.rotateX(-Math.PI / 2);
  const farMat = new THREE.MeshLambertMaterial({ color: farColor });
  const farGround = new THREE.Mesh(farGeo, farMat);
  farGround.position.y = -0.01;
  farGround.name = 'FarGroundSkirt';
  group.add(farGround);

  // ---- ground macro variation: a second, much-coarser noise layer (a
  // handful of big lighter/darker patches, alpha-blended) over the speckle
  // tile so the ground doesn't resolve into an obvious repeating plaid grid
  // at wide pull-back. Drawn once across the whole grid's world-space
  // extent (not a small tile repeated), so it can't itself read as another,
  // bigger repeating grid. ----
  const macroCanvas = terrainMakeGroundMacroCanvas(totalCols, totalRows, b.groundSeed * 3 + 5);
  const macroTex = terrainMakeClampTexture(macroCanvas);
  const macroGeo = new THREE.PlaneGeometry(totalCols * cellSize, totalRows * cellSize);
  macroGeo.rotateX(-Math.PI / 2);
  const macroMat = new THREE.MeshBasicMaterial({ map: macroTex, transparent: true, depthWrite: false, toneMapped: false });
  const macroMesh = new THREE.Mesh(macroGeo, macroMat);
  macroMesh.position.y = 0.003;
  macroMesh.name = 'GroundMacroVariation';
  group.add(macroMesh);

  // ---- path: one canvas-rasterized alpha-mask overlay covering the whole
  // grid, instead of a stamped 1.02-cell quad per cell (see
  // terrainBuildPathOverlayCanvas for why: that gave a knife-edge miter
  // boundary and repeated the same 48px pebble tile every single cell). ----
  const pathSet = new Set(path.map(p => p.col + ',' + p.row));
  if (path.length) {
    const pathCanvas = terrainBuildPathOverlayCanvas(b, pathSet, cols, rows, margin, seed);
    const pathTex = terrainMakeClampTexture(pathCanvas);
    // alphaTest cutout (not blended transparency), same convention as
    // PixelBillboard's sprites - a hard-edged mask with no z-sort seam.
    const pathMat = new THREE.MeshLambertMaterial({ map: pathTex, alphaTest: 0.5, transparent: false });
    const pathGeo = new THREE.PlaneGeometry(totalCols * cellSize, totalRows * cellSize);
    pathGeo.rotateX(-Math.PI / 2);
    const pathMesh = new THREE.Mesh(pathGeo, pathMat);
    pathMesh.position.y = 0.008;
    pathMesh.receiveShadow = true;
    pathMesh.name = 'Path';
    group.add(pathMesh);
  }

  // ---- decorations: trees/bushes (billboards) + rocks (low-poly), margins only ----
  const decoGroup = new THREE.Group();
  decoGroup.name = 'Decorations';
  const treeCanvas = terrainMakePineCanvas(4);
  const bushCanvas = terrainMakeBushCanvas(4);
  const rand = terrainMulberry32((seed >>> 0) * 977 + 13);
  // Y-billboards (trees/bushes) only read as upright flat sprites if their
  // rotation.y is kept facing the camera every frame - see
  // PixelBillboard.update. Collect the live instances (not just their
  // meshes) so the caller's render loop can drive that each tick, same as
  // any other billboard in the scene; a decoration mesh that never gets
  // this update renders edge-on (a near-invisible sliver) from most angles.
  const billboards = [];

  for (let col = -margin; col < cols + margin; col++) {
    for (let row = -margin; row < rows + margin; row++) {
      const inInner = col >= 0 && col < cols && row >= 0 && row < rows;
      if (inInner) continue; // decorations stay off the playable/path field
      if (rand() > decorationDensity) continue;

      const wx = cellToWorldX(col) + (rand() - 0.5) * cellSize * 0.5;
      const wz = cellToWorldZ(row) + (rand() - 0.5) * cellSize * 0.5;
      const roll = rand();
      if (roll < 0.45) {
        // shadow defaults to true, so this tree gets the same ground-contact
        // blob shadow as every creature billboard (PixelBillboard.js) - it
        // does NOT castShadow=true itself (a camera-facing plane has no
        // lighting-stable normal to cast a real shadow from; see that
        // file's header comment for the measured bug that fix replaced),
        // which is why it looks different from the rocks below without
        // being ungrounded.
        const h = 1.3 + rand() * 0.6;
        const bb = new PixelBillboard({ canvas: treeCanvas, frameCount: 1, worldHeight: h });
        if (b.decorTint != null) bb.mesh.material.color.setHex(b.decorTint);
        bb.setPosition(wx, 0, wz);
        bb.addTo(decoGroup);
        billboards.push(bb);
      } else if (roll < 0.75) {
        const h = 0.5 + rand() * 0.3;
        const bb = new PixelBillboard({ canvas: bushCanvas, frameCount: 1, worldHeight: h });
        if (b.decorTint != null) bb.mesh.material.color.setHex(b.decorTint);
        bb.setPosition(wx, 0, wz);
        bb.addTo(decoGroup);
        billboards.push(bb);
      } else {
        // Real low-poly 3D geometry, unlike the tree/bush billboards above -
        // a faceted rock reads fine from any angle so it doesn't need to
        // fake being flat, and (unlike a billboard plane) can carry real
        // dynamic lighting/shadows without the swinging-shadow problem
        // documented in PixelBillboard.js.
        const geo = new THREE.IcosahedronGeometry(0.22 + rand() * 0.15, 0);
        const mat = new THREE.MeshLambertMaterial({ color: b.rockColor, flatShading: true });
        const rock = new THREE.Mesh(geo, mat);
        rock.position.set(wx, 0, wz);
        rock.scale.y = 0.6 + rand() * 0.2;
        rock.rotation.y = rand() * Math.PI * 2;
        rock.castShadow = true;
        rock.receiveShadow = true;
        decoGroup.add(rock);
      }
    }
  }
  group.add(decoGroup);

  group.userData.terrain = {
    cols, rows, cellSize, margin, biome,
    cellToWorld: (col, row) => new THREE.Vector3(cellToWorldX(col), 0, cellToWorldZ(row)),
    isPath: (col, row) => pathSet.has(col + ',' + row),
    // Call once per frame with the camera's world position so decoration
    // billboards keep facing the camera (see the `billboards` comment above).
    updateBillboards: (cameraPos) => { for (const bb of billboards) bb.update(0, cameraPos); }
  };

  return group;
}
