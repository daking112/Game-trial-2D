// Bootstrap for the core-foundation piece: proves the render pipeline
// (pixel-perfect billboards, shadows, lighting, camera) works before any
// other piece (terrain art, real monster art, combat, UI) is built on top
// of it. The ground/monster here are deliberately minimal placeholders.
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

// ---- placeholder ground (real terrain art is piece #44) ----
const groundGeo = new THREE.PlaneGeometry(20, 20);
groundGeo.rotateX(-Math.PI / 2);
const groundMat = new THREE.MeshLambertMaterial({ color: 0x4f9a52 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.receiveShadow = true;
engine.scene.add(ground);

// ---- placeholder monster billboard (real art is piece #45) ----
const testCanvas = makeTestSlimeCanvas();
const slime = new PixelBillboard({ canvas: testCanvas, frameCount: 2, fps: 2.4, worldHeight: 1.4, litFlat: true });
slime.mesh.position.set(0, 0, 0);
engine.scene.add(slime.mesh);

// A row of them at different distances, to sanity-check depth sorting /
// shadow casting / alpha-cutout edges at a glance.
const extras = [];
for (let i = 0; i < 4; i++) {
  const s = new PixelBillboard({ canvas: testCanvas, frameCount: 2, fps: 2.4 + i * 0.3, worldHeight: 1.0 + i * 0.15, litFlat: true });
  s.mesh.position.set(-3 + i * 2, 0, -2 - i * 0.6);
  engine.scene.add(s.mesh);
  extras.push(s);
}

engine.onUpdate((delta) => {
  controls.update();
  slime.update(delta, engine.camera.position);
  extras.forEach(s => s.update(delta, engine.camera.position));
});

engine.start();

window.__engine = engine; // debug/critic handle
