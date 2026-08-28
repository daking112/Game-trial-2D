// Bootstrap for the core-foundation piece: proves the render pipeline
// (pixel-perfect billboards, shadows, lighting, camera) works before any
// other piece (combat, UI) is built on top of it. The monster billboards
// here are real species art (js/monsters/SpeciesArt.js, piece #45); the
// ground is the real battle grid terrain (js/world/Terrain.js, piece #44).
const engine = new Engine(document.getElementById('viewport'), { pixelScale: 3 });

engine.scene.background = new THREE.Color(0x9fd6ea);
engine.scene.fog = new THREE.Fog(0x9fd6ea, 20, 42);

engine.camera.position.set(0, 9, 11);
engine.camera.lookAt(0, 0.5, 0);

const controls = new OrbitControls(engine.camera, engine.renderer.domElement);
controls.target.set(0, 0.5, 0);
controls.enableDamping = true;
controls.minDistance = 5;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * 0.49;

// ---- lighting ----
engine.scene.add(new THREE.AmbientLight(0xbfd6ff, 0.55));
const sun = new THREE.DirectionalLight(0xfff3d6, 1.15);
sun.position.set(6, 10, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
engine.scene.add(sun);

// ---- battle grid terrain ----
// A winding path from the spawn edge (max col) to the base edge (col 0),
// authored as waypoints in the monster-tactics stages.js convention
// (consecutive waypoints share a row or a column) and expanded to the full
// walked cell list by Terrain.js.
const DEMO_PATH_WAYPOINTS = [
  { col: 11, row: 1 }, { col: 8, row: 1 }, { col: 8, row: 6 },
  { col: 3, row: 6 }, { col: 3, row: 1 }, { col: 0, row: 1 }
];
const terrain = buildTerrain({
  cols: 12,
  rows: 8,
  cellSize: 1.3,
  path: expandPathWaypoints(DEMO_PATH_WAYPOINTS),
  biome: 'grass',
  margin: 2
});
engine.scene.add(terrain);

// ---- real monster billboard (piece #45 species art, replaces the
// TestSprite placeholder blob - TestSprite.js itself is left in place in
// case another piece still references it) ----
const RAMHORN_SPECIES = SpeciesArt.buildRamhorn();
const ramhornCanvas = SpeciesArt.buildSpeciesCanvas(RAMHORN_SPECIES, 4);
const ramhorn = new PixelBillboard({ canvas: ramhornCanvas, frameCount: RAMHORN_SPECIES.frames.length, fps: 5, worldHeight: 1.4 });
ramhorn.setPosition(0, 0, 0);
ramhorn.addTo(engine.scene);

// A row of the other species at different distances, to sanity-check depth
// sorting / blob-shadow placement / alpha-cutout edges across real,
// visually distinct creatures at a glance (not just one recolored blob).
const ROSTER = [
  { species: SpeciesArt.buildEmberwing(), worldHeight: 1.3 },
  { species: SpeciesArt.buildCoilfang(), worldHeight: 1.1 },
  { species: SpeciesArt.buildSporeling(), worldHeight: 1.0 },
];
const extras = [];
ROSTER.forEach(({ species, worldHeight }, i) => {
  const canvas = SpeciesArt.buildSpeciesCanvas(species, 4);
  const s = new PixelBillboard({ canvas, frameCount: species.frames.length, fps: 5 + i * 0.4, worldHeight });
  s.setPosition(-3 + i * 2.4, 0, -2 - i * 0.6);
  s.addTo(engine.scene);
  extras.push(s);
});

engine.onUpdate((delta) => {
  controls.update();
  ramhorn.update(delta, engine.camera.position);
  extras.forEach(s => s.update(delta, engine.camera.position));
  terrain.userData.terrain.updateBillboards(engine.camera.position);
});

engine.start();

window.__engine = engine; // debug/critic handle
