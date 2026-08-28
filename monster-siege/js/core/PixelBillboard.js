// Camera-facing (Y-axis only, so sprites stay upright) billboard for
// pixel-art creatures in the 3D world - the HGSS-in-3D look. Textures are
// horizontal frame strips (walk/idle/attack cycles); alphaTest cutout
// (not blending) keeps transparent pixels from creating z-sort seams
// between overlapping sprites.
//
// Deliberately UNLIT (MeshBasicMaterial, no dynamic lighting) and shadowed
// via a non-billboarded blob decal rather than real shadow-mapping. A first
// version used MeshLambertMaterial + castShadow on the billboard itself,
// and a fresh critic caught a real bug: since the plane's normal rotates to
// face the render camera (not the light), both its lit brightness and its
// cast-shadow silhouette swung wildly just from orbiting the camera around
// a stationary sprite (measured: ~1.6x brightness swing, ~40x shadow-area
// swing, purely from azimuth). Root cause, not a tunable: a camera-facing
// plane has no lighting-stable normal to shade or shadow-cast from. Real
// 2D-sprite games don't dynamically light sprites either - the shading is
// baked into the art - so unlit + a stable blob shadow is the correct fix,
// not a patch.
function makePixelTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// One shared soft-edged radial gradient, reused (via texture, not geometry)
// across every sprite's blob shadow - cheap, and avoids per-sprite shadow
// map passes entirely.
let _blobShadowTexture = null;
function getBlobShadowTexture() {
  if (_blobShadowTexture) return _blobShadowTexture;
  const size = 64;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = size;
  const ctx = cvs.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(10,14,10,0.55)');
  grad.addColorStop(0.7, 'rgba(10,14,10,0.32)');
  grad.addColorStop(1, 'rgba(10,14,10,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  _blobShadowTexture = tex;
  return tex;
}

function makeBlobShadow(worldHeight) {
  // Sized off the sprite's height, not its (camera-dependent) on-screen
  // silhouette - a stable, plausible footprint regardless of view angle.
  const r = worldHeight * 0.32;
  const geo = new THREE.CircleGeometry(r, 16);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: getBlobShadowTexture(), transparent: true, depthWrite: false, toneMapped: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.015; // just above the ground to avoid z-fighting
  mesh.renderOrder = 1;
  return mesh;
}

class PixelBillboard {
  constructor({ canvas, frameCount = 1, fps = 6, worldHeight = 1, shadow = true }) {
    this.frameCount = frameCount;
    this.fps = fps;
    this.frame = 0;
    this._frameTimer = 0;
    this.playing = frameCount > 1;

    const tex = makePixelTexture(canvas);
    tex.repeat.set(1 / frameCount, 1);
    this.texture = tex;

    const aspect = (canvas.width / frameCount) / canvas.height;
    const h = worldHeight, w = worldHeight * aspect;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, h / 2, 0); // pivot at the feet, not the center

    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, transparent: false, toneMapped: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;

    this.shadowMesh = shadow ? makeBlobShadow(worldHeight) : null;

    this._setFrame(0);
  }

  // Adds both the sprite and its ground blob shadow (if any) to a scene/
  // group in one call, so callers can't forget the shadow half.
  addTo(parent) {
    parent.add(this.mesh);
    if (this.shadowMesh) parent.add(this.shadowMesh);
    return this;
  }

  removeFrom(parent) {
    parent.remove(this.mesh);
    if (this.shadowMesh) parent.remove(this.shadowMesh);
  }

  setPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
    if (this.shadowMesh) this.shadowMesh.position.set(x, 0.015, z);
  }

  _setFrame(i) {
    this.frame = i % this.frameCount;
    this.texture.offset.x = this.frame / this.frameCount;
  }

  update(delta, cameraPos) {
    if (this.playing && this.frameCount > 1) {
      this._frameTimer += delta;
      const frameDur = 1 / this.fps;
      while (this._frameTimer >= frameDur) {
        this._frameTimer -= frameDur;
        this._setFrame(this.frame + 1);
      }
    }
    // Y-billboard: face the camera's XZ direction only, so a sprite never
    // tilts/foreshortens as the camera's polar angle changes - it always
    // reads as a flat, upright 2D sprite, which is the entire point. The
    // blob shadow deliberately does NOT rotate with this - that stability
    // is exactly what fixes the swinging-shadow bug.
    const dx = cameraPos.x - this.mesh.position.x;
    const dz = cameraPos.z - this.mesh.position.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
  }
}
