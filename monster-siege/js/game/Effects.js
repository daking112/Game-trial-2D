// Combat juice: the feedback layer that sits between "the simulation is
// correct" and "hitting something feels good".
//
// Everything here is POOLED. A late wave fires hundreds of shots and kills
// dozens of enemies inside a few seconds; allocating a mesh or a DOM node
// per hit would stall on garbage collection exactly when the screen is
// busiest, which is the one moment a frame hitch is most visible. So each
// effect type preallocates its capacity up front and recycles slots, and
// when it runs out it overwrites the oldest rather than growing.

// ---------------------------------------------------------------------
// particles - one THREE.Points for the whole game
//
// A single draw call for every spark on screen. Points render as
// screen-facing squares with no texture, which is exactly the right shape
// for this art direction - a soft round particle sprite would be the only
// anti-aliased thing in a game built entirely out of hard pixels.
// ---------------------------------------------------------------------
class ParticleField {
  constructor(scene, capacity = 900) {
    this.capacity = capacity;
    this.cursor = 0;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.colAttr = new THREE.BufferAttribute(this.col, 3);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    geo.setAttribute('size', this.sizeAttr);

    // Dead particles are parked far below the ground rather than removed:
    // a BufferGeometry draw range is contiguous, so hiding one slot in the
    // middle would otherwise mean compacting the whole buffer every frame.
    for (let i = 0; i < capacity; i++) this.pos[i * 3 + 1] = -999;

    // Per-particle size needs a shader; PointsMaterial only has one global
    // size. Kept deliberately tiny - it is a point sprite with vertex colour
    // and a size attribute, nothing more.
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 340 } },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        uniform float uScale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // uScale is tuned so a base-size spark is ~3 internal pixels at
          // normal camera distance - about 9 display pixels once the
          // low-res framebuffer is upscaled, which matches the chunk size of
          // the art. The floor matters because particles shrink as they die:
          // without it the last frames of every spark compute to under a
          // pixel and simply vanish rather than fading out.
          gl_PointSize = max(2.0, size * uScale / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() { gl_FragColor = vec4(vColor, 1.0); }`,
      vertexColors: true,
      transparent: false,
      depthWrite: false
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false; // positions change every frame
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  // Emit `count` particles from `origin` in a cone/sphere spray.
  burst(origin, { count = 10, color = 0xffffff, speed = 2.4, spread = 1, life = 0.35, size = 0.05, up = 1.2 } = {}) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const i3 = i * 3;
      this.pos[i3] = origin.x; this.pos[i3 + 1] = origin.y; this.pos[i3 + 2] = origin.z;
      // Random direction on a sphere, biased upward so a burst reads as a
      // spray off a surface rather than a symmetric puff.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.55 + Math.random() * 0.9);
      this.vel[i3] = Math.sin(phi) * Math.cos(theta) * s * spread;
      this.vel[i3 + 1] = Math.abs(Math.cos(phi)) * s * up;
      this.vel[i3 + 2] = Math.sin(phi) * Math.sin(theta) * s * spread;
      const cv = 0.82 + Math.random() * 0.36; // per-particle brightness jitter
      this.col[i3] = c.r * cv; this.col[i3 + 1] = c.g * cv; this.col[i3 + 2] = c.b * cv;
      const l = life * (0.75 + Math.random() * 0.5);
      this.life[i] = l; this.maxLife[i] = l;
      this.size[i] = size * (0.8 + Math.random() * 0.5);
    }
  }

  update(dt) {
    const G = -7.5;
    let any = false;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) { this.pos[i3 + 1] = -999; this.size[i] = 0; continue; }
      this.vel[i3 + 1] += G * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      // Shrink toward death instead of fading: an opaque shrinking square
      // stays crisp, where a fading one goes through exactly the soft
      // half-transparent values this art direction never uses.
      const t = this.life[i] / this.maxLife[i];
      this.sizeAttr.array[i] = this.size[i] * (0.35 + 0.65 * t);
    }
    if (!any) return;
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------
// floating damage numbers
//
// DOM, not in-scene geometry, for the same reason the HUD is DOM: the world
// renders at a third of the display resolution and is nearest-neighbour
// upscaled, so any text drawn into it would be three-pixel-chunky and
// unreadable. These are projected from world space to screen space each
// frame so they still belong to the thing they came from.
// ---------------------------------------------------------------------
class FloatingNumbers {
  constructor(camera, canvas, capacity = 28) {
    this.camera = camera;
    this.canvas = canvas;
    this.layer = document.createElement('div');
    this.layer.className = 'fx-numbers';
    document.body.appendChild(this.layer);
    this.slots = [];
    for (let i = 0; i < capacity; i++) {
      const el = document.createElement('div');
      el.className = 'fx-num';
      el.style.display = 'none';
      this.layer.appendChild(el);
      this.slots.push({ el, life: 0, maxLife: 0, world: new THREE.Vector3(), rise: 0 });
    }
    this.cursor = 0;
    this._v = new THREE.Vector3();
  }

  spawn(worldPos, text, kind = 'hit') {
    const s = this.slots[this.cursor];
    this.cursor = (this.cursor + 1) % this.slots.length;
    s.world.copy(worldPos);
    s.life = s.maxLife = kind === 'crit' ? 0.85 : 0.62;
    s.rise = 0;
    s.el.textContent = text;
    s.el.className = 'fx-num fx-' + kind;
    s.el.style.display = 'block';
    // Jitter the horizontal start so a stream of hits on one enemy fans out
    // instead of stacking into an unreadable pile at a single point.
    s.jitter = (Math.random() - 0.5) * 26;
  }

  update(dt) {
    const rect = this.canvas.getBoundingClientRect();
    for (const s of this.slots) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.el.style.display = 'none'; continue; }
      s.rise += dt * 0.85;
      this._v.copy(s.world);
      this._v.y += s.rise;
      this._v.project(this.camera);
      // Behind the camera: NDC z leaves [-1,1] and x/y mirror, which would
      // otherwise paste the number on the wrong side of the screen.
      if (this._v.z > 1) { s.el.style.display = 'none'; s.life = 0; continue; }
      const x = rect.left + (this._v.x * 0.5 + 0.5) * rect.width + s.jitter;
      const y = rect.top + (-this._v.y * 0.5 + 0.5) * rect.height;
      const t = s.life / s.maxLife;
      s.el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(${0.85 + 0.35 * t})`;
      s.el.style.opacity = t > 0.55 ? 1 : (t / 0.55).toFixed(3);
    }
  }
}

// ---------------------------------------------------------------------
// screen shake
//
// Applied as an offset ADDED after OrbitControls has run and REMOVED before
// it runs again. OrbitControls derives its spherical coordinates by reading
// camera.position at the top of update(), so leaving a shake offset in place
// would feed the shake back into the orbit itself and walk the camera away
// from where the player put it. main.js calls restore() -> controls.update()
// -> game.update() -> apply() for exactly this reason.
// ---------------------------------------------------------------------
class ScreenShake {
  constructor() {
    this.energy = 0;
    this.applied = new THREE.Vector3();
    this._t = 0;
  }
  add(amount) { this.energy = Math.min(1, this.energy + amount); }
  restore(camera) {
    camera.position.sub(this.applied);
    this.applied.set(0, 0, 0);
  }
  apply(camera, dt) {
    this._t += dt;
    // Decay is exponential so a hit spikes and settles quickly rather than
    // wobbling for a second afterwards.
    this.energy *= Math.pow(0.0016, dt);
    if (this.energy < 0.001) { this.energy = 0; return; }
    const a = this.energy * 0.22;
    // Two different frequencies per axis so the motion never reads as a
    // clean sine wave, which the eye picks out immediately as "an effect".
    this.applied.set(
      Math.sin(this._t * 61.3) * a,
      Math.sin(this._t * 47.9) * a * 0.7,
      Math.sin(this._t * 53.1) * a
    );
    camera.position.add(this.applied);
  }
}

// ---------------------------------------------------------------------
// facade the game talks to
// ---------------------------------------------------------------------
class Effects {
  constructor({ scene, camera, canvas }) {
    this.particles = new ParticleField(scene);
    this.numbers = new FloatingNumbers(camera, canvas);
    this.shake = new ScreenShake();
    this._p = new THREE.Vector3();
  }

  muzzle(pos, color) {
    this.particles.burst(pos, { count: 3, color, speed: 1.7, life: 0.13, size: 0.045, up: 0.5 });
  }

  hit(pos, height, damage, color) {
    this._p.set(pos.x, height * 0.55, pos.z);
    this.particles.burst(this._p, { count: 5, color, speed: 2.1, life: 0.24, size: 0.05 });
    this.numbers.spawn(this._p, String(damage), 'hit');
  }

  kill(pos, height, color, big) {
    this._p.set(pos.x, height * 0.5, pos.z);
    this.particles.burst(this._p, {
      count: big ? 34 : 14, color,
      speed: big ? 4.2 : 2.9, life: big ? 0.62 : 0.4, size: big ? 0.075 : 0.055
    });
    if (big) this.shake.add(0.45);
  }

  leak(pos, height) {
    this._p.set(pos.x, height * 0.6, pos.z);
    this.numbers.spawn(this._p, 'LEAK', 'leak');
    this.shake.add(0.7);
  }

  place(pos) {
    this.particles.burst(pos, { count: 16, color: 0x5ee6c8, speed: 2.2, life: 0.35, size: 0.05, up: 0.4 });
  }

  update(dt) {
    this.particles.update(dt);
    this.numbers.update(dt);
  }
}
