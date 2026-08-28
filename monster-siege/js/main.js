// Wiring only: build the world, hand it to the Game, run the loop. Every
// system it touches (render pipeline, terrain, species art, tower-defense
// simulation) lives behind its own module so this file stays the one place
// that knows how the pieces fit together.
const engine = new Engine(document.getElementById('viewport'), { pixelScale: 3 });

engine.scene.background = new THREE.Color(0x9fd6ea);
engine.scene.fog = new THREE.Fog(0x9fd6ea, 22, 46);

engine.camera.position.set(0, 10.5, 12);
engine.camera.lookAt(0, 0.5, 0);

const controls = new OrbitControls(engine.camera, engine.renderer.domElement);
controls.target.set(0, 0.5, 0);
controls.enableDamping = true;
controls.minDistance = 6;
controls.maxDistance = 24;
// Clamped away from both the horizon and straight-down: a grazing angle puts
// the camera inside the ground plane, and a true top-down view collapses the
// billboards to nothing, since they are camera-facing planes with no
// thickness.
controls.minPolarAngle = Math.PI * 0.12;
controls.maxPolarAngle = Math.PI * 0.44;

// ---- lighting ----
// Sprites are unlit by design (see PixelBillboard.js), so these light the
// terrain and its decorations only.
engine.scene.add(new THREE.AmbientLight(0xbfd6ff, 0.55));
const sun = new THREE.DirectionalLight(0xfff3d6, 1.15);
sun.position.set(6, 10, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
engine.scene.add(sun);

// ---- battle grid terrain ----
// Waypoints run from the spawn edge (max col) to the base edge (col 0), in
// the convention Terrain.js expects (consecutive waypoints share a row or a
// column). The SAME array is handed to the Game, which derives the walked
// lane from it - so the drawn path and the walked path cannot drift apart.
const PATH_WAYPOINTS = [
  { col: 11, row: 1 }, { col: 8, row: 1 }, { col: 8, row: 6 },
  { col: 3, row: 6 }, { col: 3, row: 1 }, { col: 0, row: 1 }
];
const terrain = buildTerrain({
  cols: 12,
  rows: 8,
  cellSize: 1.3,
  path: expandPathWaypoints(PATH_WAYPOINTS),
  biome: 'grass',
  margin: 2
});
engine.scene.add(terrain);

// ---- the game ----
const game = new Game({ engine, terrain, waypoints: PATH_WAYPOINTS });

engine.onUpdate((delta) => {
  controls.update();
  game.update(delta);
  terrain.userData.terrain.updateBillboards(engine.camera.position);
});

engine.start();

// Debug/critic handles - a critic agent inspects the running game rather
// than a build summary, so it needs a way to drive state without clicking.
window.__engine = engine;
window.__game = game;
// OrbitControls re-applies its own target every frame, so a critic that sets
// camera.position directly gets it overwritten on the next tick - driving the
// camera has to go through the controls object.
window.__controls = controls;
