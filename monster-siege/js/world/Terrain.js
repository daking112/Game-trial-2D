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

  // ---- path: one small plane per path cell, laid slightly above ground ----
  const pathSet = new Set(path.map(p => p.col + ',' + p.row));
  if (path.length) {
    const pathCanvas = terrainMakeSpeckleTile(48, b.pathBase, b.pathSpeckles, b.pathSeed);
    const pathTex = terrainMakeTexture(pathCanvas, 1, 1);
    const pathMat = new THREE.MeshLambertMaterial({ map: pathTex });
    // Slight overscale so adjacent path cells butt together with no hairline
    // gap from floating-point cell-center placement.
    const pathGeo = new THREE.PlaneGeometry(cellSize * 1.02, cellSize * 1.02);
    pathGeo.rotateX(-Math.PI / 2);
    const pathGroup = new THREE.Group();
    pathGroup.name = 'Path';
    for (const cell of path) {
      const m = new THREE.Mesh(pathGeo, pathMat);
      m.position.set(cellToWorldX(cell.col), 0.008, cellToWorldZ(cell.row));
      m.receiveShadow = true;
      pathGroup.add(m);
    }
    group.add(pathGroup);
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
