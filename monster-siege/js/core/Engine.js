// Core render pipeline shared by every other piece of Monster Siege.
//
// Pixel-art-in-3D technique: render the actual WebGL framebuffer at a low
// internal resolution (renderer.setSize with updateStyle=false) while the
// <canvas> element's CSS size stays at the full display size with
// image-rendering: pixelated - the GPU renders genuinely few pixels, the
// browser's own nearest-neighbor upscale is what gives the crisp pixel
// grid. This is the standard "pixel art in a 3D engine" approach (no
// fragment-shader pixelation pass needed) and keeps billboard sprite
// textures reading as real pixel art instead of a blurry 3D scene with a
// filter slapped on top.
class Engine {
  constructor(container, opts = {}) {
    this.container = container;
    this.pixelScale = opts.pixelScale || 3; // 1 internal pixel = this many CSS pixels
    this.updateFns = [];

    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // No color-management smoothing tricks - keep output flat/crisp, matching
    // the pixel-art intent rather than a photoreal tone curve.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const canvas = this.renderer.domElement;
    canvas.style.imageRendering = 'pixelated';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const internalW = Math.max(1, Math.round(w / this.pixelScale));
    const internalH = Math.max(1, Math.round(h / this.pixelScale));
    // false = don't touch the canvas's CSS size, only its backing-buffer
    // resolution - this is the whole trick.
    this.renderer.setSize(internalW, internalH, false);
    this.renderer.setPixelRatio(1); // device pixel ratio would defeat the low-res trick
  }

  onUpdate(fn) { this.updateFns.push(fn); }

  start() {
    const tick = () => {
      requestAnimationFrame(tick);
      const delta = Math.min(this.clock.getDelta(), 0.25);
      const elapsed = this.clock.getElapsedTime();
      for (const fn of this.updateFns) fn(delta, elapsed);
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(tick);
  }
}
