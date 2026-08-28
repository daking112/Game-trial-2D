// Runtime entities for the tower-defense layer: the things that walk, the
// things that shoot, and the things that fly between them.
//
// Everything here is deliberately plain and update()-driven - one array per
// entity kind owned by Game.js, iterated once per frame. No event bus, no
// per-entity requestAnimationFrame, no physics engine: at BTD6 densities
// (dozens of movers, hundreds of shots per wave) a flat loop over typed
// state is both faster and far easier to reason about than anything
// cleverer, and it keeps the simulation deterministic given a fixed dt.

// ---------------------------------------------------------------------
// shared sprite-canvas cache
//
// SpeciesArt.buildSpeciesCanvas() rasterises an entire frame strip; doing
// that per spawned enemy would rebuild the same bitmap dozens of times per
// wave. Species art is immutable once built, so one canvas per (species,
// px) pair is shared by every instance of that species.
// ---------------------------------------------------------------------
const _speciesCanvasCache = new Map();
function speciesCanvasFor(species, px) {
  const key = species.id + '@' + px;
  let cvs = _speciesCanvasCache.get(key);
  if (!cvs) {
    cvs = SpeciesArt.buildSpeciesCanvas(species, px);
    _speciesCanvasCache.set(key, cvs);
  }
  return cvs;
}

// ---------------------------------------------------------------------
// health bar - two unlit quads (track + fill) that face the camera on the
// Y axis like the sprites do.
//
// Drawn as geometry rather than a per-enemy CanvasTexture on purpose: a
// canvas per enemy means a GPU texture upload per spawn, and the bar has to
// change every time damage lands, so it would mean re-uploading mid-wave
// too. Two quads with a scaled fill cost one matrix update instead.
// ---------------------------------------------------------------------
class HealthBar {
  constructor(width, y) {
    this.width = width;
    this.group = new THREE.Group();
    this.group.position.y = y;
    const trackGeo = new THREE.PlaneGeometry(width, width * 0.16);
    const track = new THREE.Mesh(trackGeo, new THREE.MeshBasicMaterial({ color: 0x14181c, toneMapped: false, transparent: true, opacity: 0.85 }));
    track.renderOrder = 3;
    // Fill is anchored at its LEFT edge (geometry translated by half its
    // width) so scaling x shrinks it from the right, the way a health bar
    // drains - scaling a centre-anchored quad would shrink it inwards from
    // both ends instead.
    const fillGeo = new THREE.PlaneGeometry(width, width * 0.16);
    fillGeo.translate(width / 2, 0, 0);
    this.fillMat = new THREE.MeshBasicMaterial({ color: 0x5fd36a, toneMapped: false });
    this.fill = new THREE.Mesh(fillGeo, this.fillMat);
    this.fill.position.x = -width / 2;
    this.fill.position.z = 0.002;
    this.fill.renderOrder = 4;
    this.group.add(track, this.fill);
    this.group.visible = false;
  }
  set(frac) {
    const f = Math.max(0, Math.min(1, frac));
    this.fill.scale.x = f;
    // Green while healthy, amber under half, red under a quarter - the read
    // is meant to be instant at a glance across a screen full of enemies.
    this.fillMat.color.setHex(f > 0.5 ? 0x5fd36a : f > 0.25 ? 0xe8c04a : 0xe1553a);
    this.group.visible = f < 0.999;
  }
  faceCamera(cameraPos, worldPos) {
    this.group.rotation.y = Math.atan2(cameraPos.x - worldPos.x, cameraPos.z - worldPos.z);
  }
}

// ---------------------------------------------------------------------
// Enemy - walks the lane, takes damage, leaks or dies.
// ---------------------------------------------------------------------
class Enemy {
  constructor({ def, path, scene, px = 4 }) {
    this.def = def;
    this.path = path;
    this.scene = scene;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.speed = def.speed;
    this.bounty = def.bounty;
    this.leakDamage = def.leakDamage || 1;
    this.dist = 0;
    this.dead = false;
    this.leaked = false;
    this._hint = { i: 1 };
    this._pos = new THREE.Vector3();
    this._flash = 0;
    this._deathT = 0;

    const species = def.species();
    const canvas = speciesCanvasFor(species, px);
    this.sprite = new PixelBillboard({
      canvas, frameCount: species.frames.length, fps: def.fps || 6, worldHeight: def.worldHeight
    });
    this.sprite.addTo(scene);
    this._baseColor = this.sprite.mesh.material.color.clone();

    this.bar = new HealthBar(def.worldHeight * 0.7, def.worldHeight * 1.12);
    scene.add(this.bar.group);

    this._sync();
  }

  _sync() {
    this.path.pointAt(this.dist, this._pos, this._hint);
    this.sprite.setPosition(this._pos.x, 0, this._pos.z);
    this.bar.group.position.set(this._pos.x, this.def.worldHeight * 1.12, this._pos.z);
  }

  get position() { return this._pos; }

  // Returns true once the enemy has finished dying and should be reaped.
  update(dt, cameraPos) {
    if (this.dead) {
      // Death is a short animation, not an instant despawn: the sprite pops
      // slightly and fades. It stays in the array (but stops moving and
      // stops being targetable - see `dead`) until this finishes.
      this._deathT += dt;
      const t = Math.min(1, this._deathT / 0.22);
      this.sprite.mesh.scale.setScalar(1 + t * 0.35);
      const mat = this.sprite.mesh.material;
      mat.transparent = true;
      mat.opacity = 1 - t;
      if (this.sprite.shadowMesh) this.sprite.shadowMesh.material.opacity = 1 - t;
      this.sprite.update(dt, cameraPos);
      return t >= 1;
    }

    this.dist += this.speed * dt;
    if (this.dist >= this.path.length) {
      this.leaked = true;
      return true;
    }
    this._sync();
    this.sprite.update(dt, cameraPos);
    this.bar.set(this.hp / this.maxHp);
    this.bar.faceCamera(cameraPos, this._pos);

    if (this._flash > 0) {
      this._flash -= dt;
      if (this._flash <= 0) this.sprite.mesh.material.color.copy(this._baseColor);
    }
    return false;
  }

  damage(amount) {
    if (this.dead) return 0;
    const dealt = Math.min(amount, this.hp);
    this.hp -= dealt;
    // Multiply the sprite's unlit texture toward white so the hit reads on
    // dark art as well as bright art. Reverted on a timer in update().
    this.sprite.mesh.material.color.setRGB(2.2, 1.5, 1.5);
    this._flash = 0.07;
    if (this.hp <= 0) {
      this.dead = true;
      this.bar.group.visible = false;
    }
    return dealt;
  }

  dispose() {
    this.sprite.removeFrom(this.scene);
    this.scene.remove(this.bar.group);
  }
}

// ---------------------------------------------------------------------
// Projectile - homes toward the enemy it was fired at.
//
// Homing rather than ballistic: a straight shot fired at where a target
// *was* misses constantly once enemies move at wave-20 speeds, and "my
// tower shot and nothing happened" is the single worst feel bug a tower
// defense can have. If the target dies mid-flight the shot retargets to the
// nearest live enemy within a short radius, so kills don't waste the shot.
// ---------------------------------------------------------------------
class Projectile {
  constructor({ origin, target, damage, speed, color, scene, radius = 0.075 }) {
    this.target = target;
    this.damage = damage;
    this.speed = speed;
    this.scene = scene;
    this.done = false;
    this.life = 2.5;
    const geo = new THREE.SphereGeometry(radius, 6, 5);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    this.mesh.position.copy(origin);
    scene.add(this.mesh);
    this._dir = new THREE.Vector3();
  }

  update(dt, enemies) {
    this.life -= dt;
    if (this.life <= 0) { this.done = true; return; }
    if (!this.target || this.target.dead) {
      this.target = nearestEnemy(enemies, this.mesh.position, 2.2);
      if (!this.target) { this.done = true; return; }
    }
    const tp = this.target.position;
    this._dir.set(tp.x - this.mesh.position.x, (this.target.def.worldHeight * 0.5) - this.mesh.position.y, tp.z - this.mesh.position.z);
    const dist = this._dir.length();
    const step = this.speed * dt;
    if (dist <= step) {
      this.target.damage(this.damage);
      this.done = true;
      return;
    }
    this.mesh.position.addScaledVector(this._dir.divideScalar(dist), step);
  }

  dispose() { this.scene.remove(this.mesh); }
}

function nearestEnemy(enemies, point, maxDist) {
  let best = null, bestD = maxDist * maxDist;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.position.x - point.x, dz = e.position.z - point.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// ---------------------------------------------------------------------
// Tower - a placed monster that acquires a target in range and fires.
//
// Targeting priority is BTD6's model (first / last / strong / close) rather
// than "nearest", because on a lane with a base at the end, "nearest" makes
// towers waste shots on enemies walking away from the objective while the
// leader escapes.
// ---------------------------------------------------------------------
const TARGET_MODES = ['first', 'last', 'strong', 'close'];

class Tower {
  constructor({ def, col, row, worldPos, scene, px = 4 }) {
    this.def = def;
    this.col = col;
    this.row = row;
    this.pos = worldPos.clone();
    this.scene = scene;
    this.cooldown = 0;
    this.targetMode = 'first';
    this.totalDamage = 0;
    this.kills = 0;

    const species = def.species();
    const canvas = speciesCanvasFor(species, px);
    this.sprite = new PixelBillboard({
      canvas, frameCount: species.frames.length, fps: def.fps || 4, worldHeight: def.worldHeight
    });
    this.sprite.setPosition(this.pos.x, 0, this.pos.z);
    this.sprite.addTo(scene);

    this.rangeRing = makeRangeRing(def.range);
    this.rangeRing.position.set(this.pos.x, 0.02, this.pos.z);
    this.rangeRing.visible = false;
    scene.add(this.rangeRing);

    this._muzzle = new THREE.Vector3(this.pos.x, def.worldHeight * 0.62, this.pos.z);
  }

  setRangeVisible(v) { this.rangeRing.visible = v; }

  cycleTargetMode() {
    this.targetMode = TARGET_MODES[(TARGET_MODES.indexOf(this.targetMode) + 1) % TARGET_MODES.length];
    return this.targetMode;
  }

  _pick(enemies) {
    const r2 = this.def.range * this.def.range;
    let best = null, bestKey = -Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.position.x - this.pos.x, dz = e.position.z - this.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      let key;
      switch (this.targetMode) {
        case 'last': key = -e.dist; break;
        case 'strong': key = e.hp; break;
        case 'close': key = -d2; break;
        default: key = e.dist; // 'first' = furthest along the lane
      }
      if (key > bestKey) { bestKey = key; best = e; }
    }
    return best;
  }

  update(dt, enemies, spawnProjectile, cameraPos) {
    this.sprite.update(dt, cameraPos);
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    const target = this._pick(enemies);
    if (!target) return;
    this.cooldown = 1 / this.def.fireRate;
    for (let i = 0; i < (this.def.shots || 1); i++) {
      spawnProjectile({
        origin: this._muzzle,
        target,
        damage: this.def.damage,
        speed: this.def.projectileSpeed,
        color: this.def.projectileColor
      });
    }
  }

  dispose() {
    this.sprite.removeFrom(this.scene);
    this.scene.remove(this.rangeRing);
  }
}

// A flat translucent disc plus a brighter rim, laid on the ground. Drawn
// with depthWrite off and a high renderOrder so it reads as an overlay on
// the terrain rather than z-fighting with it.
function makeRangeRing(radius, color = 0x5ee6c8) {
  const g = new THREE.Group();
  const discGeo = new THREE.CircleGeometry(radius, 48);
  discGeo.rotateX(-Math.PI / 2);
  const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false
  }));
  disc.renderOrder = 2;
  const rimGeo = new THREE.RingGeometry(radius * 0.985, radius, 48);
  rimGeo.rotateX(-Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false
  }));
  rim.renderOrder = 3;
  g.add(disc, rim);
  return g;
}
