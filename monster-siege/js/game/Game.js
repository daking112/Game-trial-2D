// The tower-defense game itself: state, wave scheduling, placement input and
// the HUD that surfaces all of it.
//
// Structure is a single Game object updated once per frame from Engine's
// update loop. It owns the entity arrays (Combat.js), the lane (Path.js) and
// the content tables (Waves.js); nothing else in the codebase knows the game
// exists, so main.js stays a wiring file and the render foundation stays
// reusable.
//
// Two BTD6 conventions are deliberate rather than incidental:
//   - waves are player-started (with an opt-in autostart), not on a timer.
//     Being able to take as long as you like between waves is what makes a
//     tower defense a planning game instead of a reflex game.
//   - a fast-forward toggle, because wave 20 of a tower defense at 1x is
//     mostly watching. It scales simulated dt, not the frame rate, so the
//     simulation stays frame-rate independent either way.

const GAME_PHASE = { BUILD: 'build', WAVE: 'wave', OVER: 'over', WON: 'won' };

class Game {
  constructor({ engine, terrain, waypoints, startCash = 275, startLives = 20 }) {
    this.engine = engine;
    this.scene = engine.scene;
    this.camera = engine.camera;
    this.terrainGroup = terrain;
    this.terrain = terrain.userData.terrain;
    this.path = buildLanePath(waypoints, this.terrain);

    this.cash = startCash;
    this.lives = startLives;
    this.waveIndex = 0;
    this.phase = GAME_PHASE.BUILD;
    this.speed = 1;
    this.autostart = false;

    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.occupied = new Set();

    this._spawnQueue = [];   // {t, type, hpMul, bountyMul} sorted by t
    this._waveClock = 0;
    this._selectedTowerType = null;
    this._selectedTower = null;
    this._hoverCell = null;
    this._ghost = null;

    this._raycaster = new THREE.Raycaster();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._pointer = new THREE.Vector2();
    this._hitPoint = new THREE.Vector3();

    this.fx = new Effects({ scene: this.scene, camera: this.camera, canvas: engine.renderer.domElement });

    this._buildHud();
    this._bindInput();
    this._refreshHud();
  }

  // ------------------------------------------------------------------
  // grid <-> world
  // ------------------------------------------------------------------
  worldToCell(x, z) {
    const t = this.terrain;
    const col = Math.round(x / t.cellSize + (t.cols - 1) / 2);
    const row = Math.round(z / t.cellSize + (t.rows - 1) / 2);
    return { col, row };
  }

  cellKey(col, row) { return col + ',' + row; }

  placementError(col, row, type) {
    const t = this.terrain;
    if (col < 0 || row < 0 || col >= t.cols || row >= t.rows) return 'Outside the battlefield';
    if (t.isPath(col, row)) return 'Cannot build on the path';
    if (this.occupied.has(this.cellKey(col, row))) return 'Already occupied';
    if (type && this.cash < type.cost) return 'Not enough gold';
    return null;
  }

  // ------------------------------------------------------------------
  // towers
  // ------------------------------------------------------------------
  placeTower(col, row, type) {
    if (this.placementError(col, row, type)) return false;
    const tower = new Tower({
      def: type, col, row,
      worldPos: this.terrain.cellToWorld(col, row),
      scene: this.scene
    });
    this.towers.push(tower);
    this.occupied.add(this.cellKey(col, row));
    this.cash -= type.cost;
    this.fx.place(tower.pos);
    this._refreshHud();
    return true;
  }

  sellTower(tower) {
    // 70% refund - enough that a misplacement is recoverable, little enough
    // that placement still matters.
    const refund = Math.floor(tower.def.cost * 0.7);
    this.cash += refund;
    this.occupied.delete(this.cellKey(tower.col, tower.row));
    tower.dispose();
    this.towers.splice(this.towers.indexOf(tower), 1);
    if (this._selectedTower === tower) this._selectTower(null);
    this._refreshHud();
  }

  // ------------------------------------------------------------------
  // waves
  // ------------------------------------------------------------------
  startWave() {
    if (this.phase !== GAME_PHASE.BUILD) return;
    const { groups, hpMul, bountyMul } = waveComposition(this.waveIndex);
    this._spawnQueue = [];
    for (const g of groups) {
      for (let i = 0; i < g.count; i++) {
        this._spawnQueue.push({ t: g.at + i * g.gap, type: g.type, hpMul, bountyMul });
      }
    }
    this._spawnQueue.sort((a, b) => a.t - b.t);
    this._waveClock = 0;
    this.phase = GAME_PHASE.WAVE;
    this._refreshHud();
  }

  _spawn(entry) {
    const base = ENEMY_TYPES[entry.type];
    const def = Object.assign({}, base, {
      hp: Math.round(base.hp * entry.hpMul),
      bounty: Math.round(base.bounty * entry.bountyMul)
    });
    this.enemies.push(new Enemy({ def, path: this.path, scene: this.scene }));
  }

  _endWave() {
    this.cash += waveClearReward(this.waveIndex);
    this.waveIndex++;
    this.phase = GAME_PHASE.BUILD;
    this._refreshHud();
    if (this.autostart) this._autostartTimer = 2.5;
  }

  // ------------------------------------------------------------------
  // frame
  // ------------------------------------------------------------------
  update(rawDt) {
    if (this.phase === GAME_PHASE.OVER || this.phase === GAME_PHASE.WON) return;
    const dt = rawDt * this.speed;
    const cameraPos = this.camera.position;

    if (this._autostartTimer > 0) {
      this._autostartTimer -= rawDt;
      if (this._autostartTimer <= 0 && this.phase === GAME_PHASE.BUILD) this.startWave();
    }

    if (this.phase === GAME_PHASE.WAVE) {
      this._waveClock += dt;
      while (this._spawnQueue.length && this._spawnQueue[0].t <= this._waveClock) {
        this._spawn(this._spawnQueue.shift());
      }
    }

    // enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      // The death burst has to fire on the frame HP reaches zero, not when
      // the corpse is reaped ~0.22s later once its fade finishes - otherwise
      // the particles arrive after the thing they came from has vanished.
      if (e.dead && !e._burst) {
        e._burst = true;
        this.fx.kill(e.position, e.def.worldHeight, e.tint.getHex(), e.maxHp >= 200);
      }
      const finished = e.update(dt, cameraPos);
      if (!finished) continue;
      if (e.leaked) {
        this.lives -= e.leakDamage;
        this.fx.leak(e.position, e.def.worldHeight);
        if (this.lives <= 0) { this.lives = 0; this._gameOver(); }
      } else {
        this.cash += e.bounty;
      }
      e.dispose();
      this.enemies.splice(i, 1);
      this._refreshHud();
    }

    // towers
    const onHit = (enemy, dealt, color) => {
      if (dealt > 0) this.fx.hit(enemy.position, enemy.def.worldHeight, dealt, enemy.tint.getHex());
    };
    const spawnProjectile = (opts) => {
      this.fx.muzzle(opts.origin, opts.color);
      this.projectiles.push(new Projectile(Object.assign({ scene: this.scene, onHit }, opts)));
    };
    for (const t of this.towers) t.update(dt, this.enemies, spawnProjectile, cameraPos);

    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt, this.enemies);
      if (p.done) { p.dispose(); this.projectiles.splice(i, 1); }
    }

    if (this.phase === GAME_PHASE.WAVE && this._spawnQueue.length === 0 && this.enemies.length === 0) {
      this._endWave();
    }

    // Effects run on RAW dt, not the fast-forwarded dt: at 3x the whole
    // point of a 0.24s spark is that it is still legible, and scaling its
    // lifetime with the simulation makes late waves a strobe.
    this.fx.update(rawDt);

    if (this._ghost) this._ghost.sprite.update(dt, cameraPos);
  }

  _gameOver() {
    this.phase = GAME_PHASE.OVER;
    this._showBanner('THE BASE HAS FALLEN', `You held ${this.waveIndex} wave${this.waveIndex === 1 ? '' : 's'}.`);
    this._refreshHud();
  }

  // ------------------------------------------------------------------
  // input
  // ------------------------------------------------------------------
  _bindInput() {
    const dom = this.engine.renderer.domElement;

    const toPointer = (ev) => {
      const r = dom.getBoundingClientRect();
      this._pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      this._pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    };

    const cellUnderPointer = () => {
      this._raycaster.setFromCamera(this._pointer, this.camera);
      const hit = this._raycaster.ray.intersectPlane(this._groundPlane, this._hitPoint);
      if (!hit) return null;
      return this.worldToCell(hit.x, hit.z);
    };

    dom.addEventListener('pointermove', (ev) => {
      toPointer(ev);
      if (!this._selectedTowerType) { this._setGhost(null); return; }
      const cell = cellUnderPointer();
      this._hoverCell = cell;
      this._setGhost(cell);
    });

    // Placement fires on pointerup only if the pointer barely moved between
    // down and up. Without that test every camera orbit that happens to end
    // over a legal cell also drops a tower - OrbitControls and click-to-place
    // share the same canvas, and a drag is not a click.
    let downAt = null;
    dom.addEventListener('pointerdown', (ev) => { downAt = { x: ev.clientX, y: ev.clientY }; });
    dom.addEventListener('pointerup', (ev) => {
      if (!downAt) return;
      const moved = Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y);
      downAt = null;
      if (moved > 5) return;
      toPointer(ev);
      const cell = cellUnderPointer();
      if (!cell) return;

      if (this._selectedTowerType) {
        const err = this.placementError(cell.col, cell.row, this._selectedTowerType);
        if (err) { this._flashHint(err); return; }
        this.placeTower(cell.col, cell.row, this._selectedTowerType);
        // Stay in placing mode while gold allows, so building a line of
        // towers is one click each rather than a round trip to the shop.
        if (this.cash < this._selectedTowerType.cost) this._selectTowerType(null);
        return;
      }
      const hit = this.towers.find(t => t.col === cell.col && t.row === cell.row);
      this._selectTower(hit || null);
    });

    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { this._selectTowerType(null); this._selectTower(null); }
      if (ev.key === ' ') { ev.preventDefault(); if (this.phase === GAME_PHASE.BUILD) this.startWave(); }
      if (ev.key === '1') this._selectTowerType(TOWER_TYPES[0]);
      if (ev.key === '2') this._selectTowerType(TOWER_TYPES[1]);
    });
  }

  _selectTowerType(type) {
    this._selectedTowerType = type;
    if (!type) this._setGhost(null);
    if (type) this._selectTower(null);
    this._refreshHud();
  }

  _selectTower(tower) {
    if (this._selectedTower) this._selectedTower.setRangeVisible(false);
    this._selectedTower = tower;
    if (tower) tower.setRangeVisible(true);
    this._refreshHud();
  }

  // Translucent preview of the tower about to be placed, plus its range
  // ring, so range is visible BEFORE committing gold - guessing coverage and
  // then selling is the worst part of a tower defense without one.
  _setGhost(cell) {
    if (!cell || !this._selectedTowerType) {
      if (this._ghost) { this._ghost.sprite.removeFrom(this.scene); this.scene.remove(this._ghost.ring); this._ghost = null; }
      return;
    }
    const type = this._selectedTowerType;
    if (!this._ghost || this._ghost.typeId !== type.id) {
      if (this._ghost) { this._ghost.sprite.removeFrom(this.scene); this.scene.remove(this._ghost.ring); }
      const species = type.species();
      const sprite = new PixelBillboard({
        canvas: speciesCanvasFor(species, 4), frameCount: species.frames.length,
        fps: type.fps || 4, worldHeight: type.worldHeight, shadow: false
      });
      sprite.mesh.material.transparent = true;
      sprite.mesh.material.opacity = 0.62;
      sprite.mesh.material.depthWrite = false;
      sprite.addTo(this.scene);
      const ring = makeRangeRing(type.range);
      this.scene.add(ring);
      this._ghost = { typeId: type.id, sprite, ring };
    }
    const world = this.terrain.cellToWorld(cell.col, cell.row);
    this._ghost.sprite.setPosition(world.x, 0, world.z);
    this._ghost.ring.position.set(world.x, 0.02, world.z);
    const err = this.placementError(cell.col, cell.row, type);
    const tint = err ? 0xff6a55 : 0xffffff;
    this._ghost.sprite.mesh.material.color.setHex(tint);
    for (const child of this._ghost.ring.children) child.material.color.setHex(err ? 0xff6a55 : 0x5ee6c8);
  }

  // ------------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------------
  _buildHud() {
    const root = document.createElement('div');
    root.className = 'hud';
    root.innerHTML = `
      <div class="hud-top">
        <div class="stat"><span class="stat-icon">&#9829;</span><span id="hud-lives">0</span></div>
        <div class="stat"><span class="stat-icon">&#9679;</span><span id="hud-cash">0</span></div>
        <div class="stat stat-wave">WAVE <span id="hud-wave">1</span></div>
      </div>
      <div class="hud-shop" id="hud-shop"></div>
      <div class="hud-bottom">
        <div class="hint" id="hud-hint"></div>
        <div class="controls">
          <button class="btn ghost" id="hud-speed">1&times;</button>
          <button class="btn ghost" id="hud-auto">AUTO OFF</button>
          <button class="btn primary" id="hud-start">START WAVE</button>
        </div>
      </div>
      <div class="hud-inspect" id="hud-inspect" hidden></div>
      <div class="banner" id="hud-banner" hidden><div class="banner-inner"><h2 id="banner-title"></h2><p id="banner-sub"></p></div></div>
    `;
    document.body.appendChild(root);
    this.hud = root;

    const shop = root.querySelector('#hud-shop');
    TOWER_TYPES.forEach((type, i) => {
      const card = document.createElement('button');
      card.className = 'shop-card';
      card.dataset.typeId = type.id;
      card.innerHTML = `
        <div class="shop-key">${i + 1}</div>
        <div class="shop-name">${type.name}</div>
        <div class="shop-blurb">${type.blurb}</div>
        <div class="shop-stats">
          <span>DMG ${type.damage}</span><span>RATE ${type.fireRate}/s</span><span>RNG ${type.range.toFixed(1)}</span>
        </div>
        <div class="shop-cost">${type.cost}</div>
      `;
      card.addEventListener('click', () => {
        this._selectTowerType(this._selectedTowerType === type ? null : type);
      });
      shop.appendChild(card);
    });

    root.querySelector('#hud-start').addEventListener('click', () => this.startWave());
    root.querySelector('#hud-speed').addEventListener('click', () => {
      this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
      this._refreshHud();
    });
    root.querySelector('#hud-auto').addEventListener('click', () => {
      this.autostart = !this.autostart;
      if (this.autostart && this.phase === GAME_PHASE.BUILD) this._autostartTimer = 1.5;
      this._refreshHud();
    });
  }

  _flashHint(text) {
    const el = this.hud.querySelector('#hud-hint');
    el.textContent = text;
    el.classList.add('flash');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => { el.classList.remove('flash'); el.textContent = this._idleHint(); }, 1400);
  }

  _idleHint() {
    if (this._selectedTowerType) return `Placing ${this._selectedTowerType.name} — click a grass cell, Esc to cancel`;
    if (this._selectedTower) return 'Click empty ground to deselect';
    return 'Pick a defender below, or press Space to send the wave';
  }

  _showBanner(title, sub) {
    const b = this.hud.querySelector('#hud-banner');
    b.querySelector('#banner-title').textContent = title;
    b.querySelector('#banner-sub').textContent = sub;
    b.hidden = false;
  }

  _refreshHud() {
    if (!this.hud) return;
    const q = (s) => this.hud.querySelector(s);
    q('#hud-lives').textContent = this.lives;
    q('#hud-cash').textContent = this.cash;
    q('#hud-wave').textContent = this.waveIndex + 1;

    const start = q('#hud-start');
    start.disabled = this.phase !== GAME_PHASE.BUILD;
    start.textContent = this.phase === GAME_PHASE.WAVE ? 'WAVE IN PROGRESS' : 'START WAVE';
    q('#hud-speed').textContent = this.speed + '×';
    q('#hud-auto').textContent = this.autostart ? 'AUTO ON' : 'AUTO OFF';
    q('#hud-auto').classList.toggle('on', this.autostart);

    for (const card of this.hud.querySelectorAll('.shop-card')) {
      const type = TOWER_TYPES.find(t => t.id === card.dataset.typeId);
      card.classList.toggle('selected', this._selectedTowerType === type);
      card.classList.toggle('unaffordable', this.cash < type.cost);
    }

    const inspect = q('#hud-inspect');
    const t = this._selectedTower;
    if (!t) {
      inspect.hidden = true;
    } else {
      inspect.hidden = false;
      inspect.innerHTML = `
        <div class="inspect-name">${t.def.name}</div>
        <div class="inspect-rows">
          <div><span>Damage</span><b>${t.def.damage}</b></div>
          <div><span>Fire rate</span><b>${t.def.fireRate}/s</b></div>
          <div><span>Range</span><b>${t.def.range.toFixed(1)}</b></div>
        </div>
        <button class="btn ghost" id="inspect-target">TARGET: ${t.targetMode.toUpperCase()}</button>
        <button class="btn danger" id="inspect-sell">SELL ${Math.floor(t.def.cost * 0.7)}</button>
      `;
      inspect.querySelector('#inspect-target').addEventListener('click', () => { t.cycleTargetMode(); this._refreshHud(); });
      inspect.querySelector('#inspect-sell').addEventListener('click', () => this.sellTower(t));
    }

    const hint = q('#hud-hint');
    if (!hint.classList.contains('flash')) hint.textContent = this._idleHint();
  }
}
