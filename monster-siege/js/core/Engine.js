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
    // PCFSoftShadowMap is deprecated in this three.js version and silently
    // falls back to PCFShadowMap (confirmed by grepping the vendored build
    // for its own deprecation-warning string) - VSMShadowMap is the actual
    // current soft-shadow type.
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    // No color-management smoothing tricks - keep output flat/crisp, matching
    // the pixel-art intent rather than a photoreal tone curve.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.overflow = 'hidden';

    const canvas = this.renderer.domElement;
    canvas.style.imageRendering = 'pixelated';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const internalW = Math.max(1, Math.round(w / this.pixelScale));
    const internalH = Math.max(1, Math.round(h / this.pixelScale));
    this.camera.aspect = internalW / internalH;
    this.camera.updateProjectionMatrix();
    // false = don't touch the canvas's CSS size here, only its backing-buffer
    // resolution - this is the whole trick. The CSS size is set explicitly
    // right after, to an EXACT integer multiple of the internal resolution
    // (internalW * pixelScale, not the raw container size) - otherwise the
    // upscale ratio isn't a clean integer and the browser's nearest-neighbor
    // scaling produces unevenly-sized pixel blocks (some rows/columns 1px
    // wider than others). A few CSS pixels of letterboxing (from the
    // flex-centered container set up in the constructor) is the trade-off,
    // and is invisible in practice.
    this.renderer.setSize(internalW, internalH, false);
    this.renderer.setPixelRatio(1); // device pixel ratio would defeat the low-res trick
    const canvas = this.renderer.domElement;
    canvas.style.width = (internalW * this.pixelScale) + 'px';
    canvas.style.height = (internalH * this.pixelScale) + 'px';
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
