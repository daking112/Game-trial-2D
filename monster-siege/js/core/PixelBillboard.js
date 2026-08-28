// Camera-facing (Y-axis only, so sprites stay upright) billboard for
// pixel-art creatures in the 3D world - the HGSS-in-3D look. Textures are
// horizontal frame strips (walk/idle/attack cycles); alphaTest cutout
// (not blending) keeps transparent pixels from creating z-sort seams
// between overlapping sprites, and lets the sprite still cast a real
// shadow (MeshDepthMaterial respects alphaTest for the shadow pass).
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

class PixelBillboard {
  constructor({ canvas, frameCount = 1, fps = 6, worldHeight = 1, litFlat = false }) {
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

    // litFlat: MeshLambertMaterial still receives directional light but a
    // flat plane facing the camera catches light unevenly as the sun angle
    // changes through the day/scene - fine for creatures (adds real depth,
    // Octopath-style), but UI/marker sprites want MeshBasicMaterial's flat
    // unlit read instead.
    // DoubleSide matters beyond just "visible from both sides": a Y-billboard
    // faces the RENDER camera, not the light, so from the shadow map's point
    // of view the plane is very often facing away from the sun - with the
    // default FrontSide, that silently culls it from the shadow depth pass
    // and the sprite casts no shadow at all (found by comparing against a
    // plain opaque box, which shadowed correctly under the same light).
    const mat = litFlat
      ? new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide })
      : new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = litFlat;
    this.mesh.receiveShadow = false;

    this._setFrame(0);
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
    // reads as a flat, upright 2D sprite, which is the entire point.
    const dx = cameraPos.x - this.mesh.position.x;
    const dz = cameraPos.z - this.mesh.position.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
  }
}
