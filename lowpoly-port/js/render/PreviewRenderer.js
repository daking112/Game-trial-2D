// Renders a small static thumbnail of a species' actual low-poly 3D model
// (via LowPolyModels.buildTowerModel) to a PNG data URL, cached per species
// id - so roster/sanctuary/bench cards show the real model instead of a
// flat color swatch, without paying for a live Three.js canvas per card.
const PreviewRenderer = (() => {
  const SIZE = 160;
  let renderer = null, scene = null, camera = null;
  const cache = new Map();

  function ensureRenderer() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setPixelRatio(1);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
    camera.position.set(1.6, 1.5, 2.1);
    camera.lookAt(0, 0.55, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xfff3d6, 1.0);
    key.position.set(3, 4, 2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fd3e8, 0.5);
    rim.position.set(-3, 2, -2);
    scene.add(rim);
  }

  function renderFor(id, buildFn) {
    if (cache.has(id)) return cache.get(id);
    ensureRenderer();
    const model = buildFn();
    scene.add(model);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    scene.remove(model);
    cache.set(id, url);
    return url;
  }

  function forSpecies(species) {
    return renderFor(species.id, () => LowPoly.buildTowerModel(species));
  }

  function forEnemy(species) {
    return renderFor('enemy:' + species.id, () => LowPoly.buildEnemyModel(species));
  }

  return { forSpecies, forEnemy };
})();
