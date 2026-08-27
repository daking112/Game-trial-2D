import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

// ------------------------------------------------------------------ //
// Standalone low-poly style prototype. Independent of the live 2D game
// (public/js/*) — nothing here is wired into monsters.js or any scene.
// Goal: evaluate whether a faceted, flat-shaded "low poly" aesthetic is
// worth pursuing further before committing to any real conversion.
// ------------------------------------------------------------------ //

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd3e8);
scene.fog = new THREE.Fog(0x8fd3e8, 18, 42);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(9, 7, 11);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.minDistance = 5;
controls.maxDistance = 25;
controls.maxPolarAngle = Math.PI * 0.49;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------- lighting ---------------- //
scene.add(new THREE.AmbientLight(0xbfd6ff, 0.55));
const sun = new THREE.DirectionalLight(0xfff3d6, 1.2);
sun.position.set(8, 14, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
scene.add(sun);

// ---------------- helpers ---------------- //
function flatMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0.02, ...opts });
}

function mesh(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------------- low-poly terrain ---------------- //
// A subdivided plane with randomized vertex height + per-vertex color
// banding (grass -> dirt path -> rock), faceted via flatShading.
function buildGround() {
  const size = 40, seg = 26;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const grass1 = new THREE.Color(0x5fb84f), grass2 = new THREE.Color(0x3f9a3f);
  const dirt = new THREE.Color(0x8a6b3d);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const d = Math.hypot(x, z);
    let h = (Math.sin(x * 0.5) * Math.cos(z * 0.45) + Math.sin(x * 0.9 + z * 0.3)) * 0.35;
    h *= Math.max(0, 1 - d / (size * 0.55));
    if (d < 3.2) h *= 0.15; // keep a flat clearing near the monster
    pos.setY(i, h);
    const c = d < 3.2 ? grass1.clone().lerp(dirt, 0.35) : grass1.clone().lerp(grass2, Math.random());
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  return ground;
}
scene.add(buildGround());

// ---------------- low-poly tree ---------------- //
function buildTree(x, z, scale = 1) {
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.1, 6), flatMat(0x6b4a2f), 0, 0.55, 0);
  const leaves = mesh(new THREE.ConeGeometry(0.9, 1.6, 7), flatMat(0x2f8f4f), 0, 1.7, 0);
  const leaves2 = mesh(new THREE.ConeGeometry(0.65, 1.2, 7), flatMat(0x3aa85c), 0, 2.35, 0);
  g.add(trunk, leaves, leaves2);
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  g.rotation.y = Math.random() * Math.PI * 2;
  return g;
}
[[-6, -5, 1.1], [6, -4, 0.9], [-7, 4, 1.0], [7, 5, 1.2], [-3.5, -7.5, 0.8], [4, 8, 1.0], [8.5, -2, 0.85]]
  .forEach(([x, z, s]) => scene.add(buildTree(x, z, s)));

// ---------------- low-poly rocks ---------------- //
function buildRock(x, z, scale = 1) {
  const geo = new THREE.IcosahedronGeometry(0.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const j = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    j.multiplyScalar(0.85 + Math.random() * 0.3);
    pos.setXYZ(i, j.x, j.y, j.z);
  }
  geo.computeVertexNormals();
  const r = mesh(geo, flatMat(0x8a8a8a), x, 0.3 * scale, z);
  r.scale.setScalar(scale);
  r.rotation.set(Math.random(), Math.random(), Math.random());
  return r;
}
[[-2.8, 2.6, 0.6], [3.2, -2.2, 0.5], [-4.2, -1.5, 0.4], [2.5, 3.4, 0.45]]
  .forEach(([x, z, s]) => scene.add(buildRock(x, z, s)));

// ---------------- low-poly monster ---------------- //
// A blocky, faceted stand-in for the game's fire-fox line (cindertail),
// built entirely from low-detail primitives — no sculpted mesh, on
// purpose, to keep this a fast style test rather than a real asset.
function buildMonster() {
  const g = new THREE.Group();
  const body1 = flatMat(0xff7a3c);
  const body2 = flatMat(0xe85a20);
  const cream = flatMat(0xffe3b0);
  const dark = flatMat(0x2a1810);
  const eyeMat = flatMat(0xfff4d6, { emissive: 0x664400, emissiveIntensity: 0.4 });

  const torso = mesh(new THREE.IcosahedronGeometry(0.75, 0), body1, 0, 1.05, 0);
  torso.scale.set(1, 0.9, 1.15);
  g.add(torso);

  const chest = mesh(new THREE.ConeGeometry(0.42, 0.7, 5), cream, 0, 0.85, 0.55);
  chest.rotation.x = Math.PI / 2.1;
  g.add(chest);

  const head = mesh(new THREE.IcosahedronGeometry(0.48, 0), body1, 0, 1.75, 0.55);
  g.add(head);

  const snout = mesh(new THREE.ConeGeometry(0.22, 0.5, 5), cream, 0, 1.65, 0.98);
  snout.rotation.x = Math.PI / 2;
  g.add(snout);

  [[-0.24, 1.5], [0.24, 1.5]].forEach(([ex]) => {
    g.add(mesh(new THREE.SphereGeometry(0.09, 6, 5), eyeMat, ex, 1.8, 0.92));
  });

  [[-0.32, 2.15, 5], [0.32, 2.15, -5]].forEach(([ex, ey, tilt]) => {
    const ear = mesh(new THREE.ConeGeometry(0.2, 0.55, 4), body2, ex, ey, 0.35);
    ear.rotation.z = THREE.MathUtils.degToRad(tilt);
    g.add(ear);
  });

  [[-0.35, 0.15, 0.3], [0.35, 0.15, 0.3], [-0.32, 0.15, -0.25], [0.32, 0.15, -0.25]].forEach(([lx, ly, lz]) => {
    g.add(mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.5, 5), body2, lx, ly, lz));
  });

  const tailGroup = new THREE.Group();
  const tailSegs = [[0, 0, 0], [0.05, 0.25, -0.55], [0.15, 0.55, -1.05], [0.3, 0.95, -1.4]];
  tailSegs.forEach(([tx, ty, tz], i) => {
    const s = 0.28 - i * 0.045;
    tailGroup.add(mesh(new THREE.SphereGeometry(s, 6, 5), i === tailSegs.length - 1 ? body2 : body1, tx, ty, tz));
  });
  const flame = mesh(new THREE.ConeGeometry(0.22, 0.55, 6), flatMat(0xffc23c, { emissive: 0xff6a00, emissiveIntensity: 0.6 }), 0.32, 1.35, -1.7);
  flame.rotation.x = -0.5;
  tailGroup.add(flame);
  tailGroup.position.set(0, 0.7, -0.6);
  g.add(tailGroup);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
const monster = buildMonster();
scene.add(monster);

// ---------------- animate ---------------- //
const clock = new THREE.Clock();
function tick() {
  const t = clock.getElapsedTime();
  monster.position.y = Math.sin(t * 1.6) * 0.06;
  monster.rotation.y = t * 0.35;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
