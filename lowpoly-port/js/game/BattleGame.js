// Low-poly 3D port of scenes/BattleScene.js's tower-defense combat loop.
// Same rules, same numbers (grid placement, path pathing, target priority,
// combat archetypes from data/archetypes.js, waves/bosses, lives/coins/
// score) - only the renderer changed, from a 2D Phaser scene to a Three.js
// scene with orbit/pan camera. Multiplayer plots and sound are not ported in
// this pass (see lowpoly-port/README.md) - this is the single-player run/
// stage loop only.
const HP_BAR_W = 0.62, HP_BAR_H = 0.09;
const ULT_BAR_H = 0.05;
const ENTITY_HOVER_Y = 1.15; // where HP/ult bars float above a unit's feet

class BattleGame {
  constructor(root, callbacks) {
    this.root = root; // DOM element to mount the canvas + overlays into
    this.callbacks = callbacks || {}; // { onExit(), onWaveClearedRun(), onRunComplete(), onGameOverRun() }
  }

  // ---------------- lifecycle ---------------- //

  mount() {
    this.stage = getStage(gameState.currentStageId) || getStage(FIRST_STAGE_ID);
    this.pathCells = this.stage.pathCells;
    this.phase = 'placement';
    this.pathBlockedCells = computePathBlockedCells(this.pathCells);
    this.pathWaypoints = buildPathWaypoints(this.pathCells);

    this.grid = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(null));
    this.allies = [];
    this.enemies = [];
    this.floaters = [];
    this.fx = [];
    this.selectedBenchSpeciesId = null;
    this.spawnedCount = 0;
    this.waveEnemyCount = 0;
    this.isBossWave = false;
    this.spawnTimerMs = 0;
    this.spawnIntervalMs = 700;
    this.bench = gameState.team.map(id => gameState.roster[id]).filter(Boolean);

    this.buildDom();
    this.buildScene();
    this.layoutBench();
    this.refreshStartButton();
    this.updateHud();
    this.bindInput();

    this.clock = new THREE.Clock();
    this._raf = requestAnimationFrame((t) => this.loop(t));
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.root.innerHTML = '';
  }

  // ---------------- three.js scene ---------------- //

  buildScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fd3e8);
    const halfW = (GRID_COLS / 2) * CELL, halfH = (GRID_ROWS / 2) * CELL;
    scene.fog = new THREE.Fog(0x8fd3e8, Math.max(halfW, halfH) * 1.6, Math.max(halfW, halfH) * 3.4);
    this.scene = scene;

    const w = this.canvasWrap.clientWidth, h = this.canvasWrap.clientHeight;
    const camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 300);
    camera.position.set(0, halfH * 1.7, halfH * 1.5);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: this.canvas });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    this.renderer = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.minDistance = 8;
    controls.maxDistance = Math.max(halfW, halfH) * 3;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.screenSpacePanning = true;
    this.controls = controls;

    scene.add(new THREE.AmbientLight(0xbfd6ff, 0.6));
    const sun = new THREE.DirectionalLight(0xfff3d6, 1.1);
    sun.position.set(halfW * 0.4, halfH * 1.5, halfH * 0.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.left = -halfW * 1.3; sun.shadow.camera.right = halfW * 1.3;
    sun.shadow.camera.top = halfH * 1.3; sun.shadow.camera.bottom = -halfH * 1.3;
    sun.shadow.camera.far = halfH * 5;
    scene.add(sun);

    scene.add(LowPolyTerrain.build(this.stage, this.pathBlockedCells));

    // Invisible picking plane, slightly above y=0 so it never z-fights the
    // ground mesh, used for cursor -> grid-cell raycasting.
    this.pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(halfW * 3, halfH * 3),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.pickPlane.rotation.x = -Math.PI / 2;
    this.pickPlane.position.y = 0.01;
    scene.add(this.pickPlane);

    this.rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
    );
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.rangeRing.visible = false;
    scene.add(this.rangeRing);

    this.raycaster = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2();

    this._onResize = () => this.onResize();
    window.addEventListener('resize', this._onResize);
  }

  onResize() {
    const w = this.canvasWrap.clientWidth, h = this.canvasWrap.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ---------------- DOM shell (HUD / bench / overlay) ---------------- //

  buildDom() {
    this.root.innerHTML = `
      <div class="battle-hud">
        <div class="battle-hud-text" id="lp-hud-text"></div>
        <div class="battle-hud-actions">
          <button class="lp-link" id="lp-center-view">Center View</button>
          <button class="lp-link" id="lp-back">Menu &gt;</button>
        </div>
      </div>
      <button class="lp-btn lp-btn-large lp-start-wave" id="lp-start-wave">Start Wave</button>
      <div class="battle-canvas-wrap" id="lp-canvas-wrap"><canvas id="lp-canvas"></canvas></div>
      <div class="battle-bench" id="lp-bench">
        <div class="battle-bench-label">Bench (click, then click an empty non-path cell):</div>
        <div class="battle-bench-row" id="lp-bench-row"></div>
      </div>
      <div class="lp-overlay" id="lp-overlay" hidden>
        <div class="lp-overlay-panel">
          <div class="lp-overlay-title" id="lp-overlay-title"></div>
          <div class="lp-overlay-sub" id="lp-overlay-sub"></div>
          <button class="lp-btn lp-btn-large" id="lp-overlay-primary"></button>
          <button class="lp-btn lp-btn-large lp-btn-secondary" id="lp-overlay-secondary">Return to Menu</button>
        </div>
      </div>
    `;
    this.canvasWrap = this.root.querySelector('#lp-canvas-wrap');
    this.canvas = this.root.querySelector('#lp-canvas');
    this.hudText = this.root.querySelector('#lp-hud-text');
    this.benchRow = this.root.querySelector('#lp-bench-row');
    this.startWaveBtn = this.root.querySelector('#lp-start-wave');
    this.overlay = this.root.querySelector('#lp-overlay');
    this.overlayTitle = this.root.querySelector('#lp-overlay-title');
    this.overlaySub = this.root.querySelector('#lp-overlay-sub');
    this.overlayPrimary = this.root.querySelector('#lp-overlay-primary');
    this.overlaySecondary = this.root.querySelector('#lp-overlay-secondary');

    this.root.querySelector('#lp-back').onclick = () => this.callbacks.onExit();
    this.overlaySecondary.onclick = () => this.callbacks.onExit();
    this.root.querySelector('#lp-center-view').onclick = () => {
      this.controls.target.set(0, 0, 0);
      const halfH = (GRID_ROWS / 2) * CELL;
      this.camera.position.set(0, halfH * 1.7, halfH * 1.5);
    };
    this.startWaveBtn.onclick = () => {
      if (this.phase === 'placement' && this.allies.length > 0) this.startWave();
    };
  }

  bindInput() {
    this._keys = {};
    this._onPointerDown = (ev) => this.onPointerDown(ev);
    this._onPointerMove = (ev) => this.onPointerMove(ev);
    this._onKeyDown = (ev) => { this._keys[ev.key.toLowerCase()] = true; };
    this._onKeyUp = (ev) => { this._keys[ev.key.toLowerCase()] = false; };
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  screenToGroundPoint(ev) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hit = this.raycaster.intersectObject(this.pickPlane)[0];
    return hit ? hit.point : null;
  }

  worldToCell(point) {
    const col = Math.floor(point.x / CELL + GRID_COLS / 2);
    const row = Math.floor(point.z / CELL + GRID_ROWS / 2);
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;
    return { col, row };
  }

  onPointerDown(ev) {
    if (this._dragged) return;
    const pt = this.screenToGroundPoint(ev);
    if (!pt) return;
    const cell = this.worldToCell(pt);
    if (cell) this.onCellClicked(cell.col, cell.row);
  }

  onPointerMove(ev) {
    const pt = this.screenToGroundPoint(ev);
    if (!pt) { this.hideRangePreview(); return; }
    const cell = this.worldToCell(pt);
    if (!cell) { this.hideRangePreview(); return; }
    this.onCellHover(cell.col, cell.row);
  }

  // ---------------- bench / placement ---------------- //

  layoutBench() {
    this.benchRow.innerHTML = '';
    this.bench.forEach((entry) => {
      const species = getSpecies(entry.speciesId);
      const rarity = RARITY[species.rarity];
      const card = document.createElement('div');
      card.className = 'lp-bench-card';
      card.style.borderColor = cssColor(rarity.color);
      card.style.background = `linear-gradient(160deg, ${cssColor(TYPE_COLORS[species.type])}55, #1c2530)`;
      if (this.selectedBenchSpeciesId === entry.speciesId) card.classList.add('selected');
      card.innerHTML = `<div class="lp-bench-name">${species.name}</div><div class="lp-bench-cost">🪙 ${species.cost}</div>`;
      card.onclick = () => this.onBenchClicked(entry.speciesId);
      this.benchRow.appendChild(card);
    });
  }

  onBenchClicked(speciesId) {
    if (this.phase !== 'placement') return;
    this.selectedBenchSpeciesId = (this.selectedBenchSpeciesId === speciesId) ? null : speciesId;
    this.layoutBench();
    this.hideRangePreview();
  }

  onCellHover(col, row) {
    if (this.phase !== 'placement' || !this.selectedBenchSpeciesId || this.grid[row][col]) { this.hideRangePreview(); return; }
    const species = getSpecies(this.selectedBenchSpeciesId);
    const { x, z } = cellToWorld(col, row);
    const rangeWorld = species.range * CELL;
    this.rangeRing.geometry.dispose();
    this.rangeRing.geometry = new THREE.RingGeometry(rangeWorld - 0.04, rangeWorld, 40);
    this.rangeRing.position.set(x, 0.04, z);
    this.rangeRing.material.color.set(TYPE_COLORS[species.type]);
    this.rangeRing.visible = true;
  }

  hideRangePreview() { this.rangeRing.visible = false; }

  onCellClicked(col, row) {
    if (this.phase !== 'placement') return;
    const occupant = this.grid[row][col];
    if (occupant) { this.removeAllyFromGrid(occupant); return; }
    if (this.pathBlockedCells.has(row + ',' + col)) return;

    if (this.selectedBenchSpeciesId) {
      const entryIdx = this.bench.findIndex(m => m.speciesId === this.selectedBenchSpeciesId);
      if (entryIdx === -1) return;
      const entry = this.bench[entryIdx];
      const species = getSpecies(entry.speciesId);
      if (!gameState.spendCoins(species.cost)) { this.flashInsufficientCoins(); return; }
      this.bench.splice(entryIdx, 1);
      this.placeAlly(entry, col, row);
      this.selectedBenchSpeciesId = null;
      this.layoutBench();
      this.refreshStartButton();
      this.updateHud();
    }
  }

  flashInsufficientCoins() {
    this.hudText.classList.add('flash-error');
    setTimeout(() => this.hudText.classList.remove('flash-error'), 300);
  }

  placeAlly(entry, col, row) {
    const species = getSpecies(entry.speciesId);
    const effective = getEffectiveStats(species, entry.level);
    const { x, z } = cellToWorld(col, row);

    const model = LowPoly.buildTowerModel(species);
    model.position.set(x, 0, z);
    this.scene.add(model);

    const rangeWorld = species.range * CELL;
    const rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(rangeWorld - 0.02, rangeWorld, 40),
      new THREE.MeshBasicMaterial({ color: TYPE_COLORS[species.type], transparent: true, opacity: 0.12, side: THREE.DoubleSide })
    );
    rangeRing.rotation.x = -Math.PI / 2;
    rangeRing.position.set(x, 0.02, z);
    this.scene.add(rangeRing);

    const hasUltimate = !!COMBAT_ARCHETYPES[species.type].ultimateChargeHits;
    const bars = this.buildBarSet(hasUltimate);
    bars.group.position.set(x, ENTITY_HOVER_Y, z);
    this.scene.add(bars.group);

    const ally = {
      speciesId: entry.speciesId, species, level: entry.level, col, row,
      x, z, attack: effective.attack, hp: effective.maxHp, maxHp: effective.maxHp,
      nextAttackTime: 0, nextAbilityTime: 0, ultimateCharge: 0, buffs: [],
      model, rangeRing, bars, facingAngle: 0
    };
    this.grid[row][col] = ally;
    this.allies.push(ally);
    this.updateHud();
  }

  removeAllyFromGrid(ally) {
    this.grid[ally.row][ally.col] = null;
    this.allies = this.allies.filter(a => a !== ally);
    this.scene.remove(ally.model, ally.rangeRing, ally.bars.group);
    gameState.earnCoins(Math.floor(ally.species.cost * 0.5));
    this.bench.push(gameState.roster[ally.speciesId]);
    this.layoutBench();
    this.refreshStartButton();
    this.updateHud();
  }

  refreshStartButton() {
    const ready = this.phase === 'placement' && this.allies.length > 0;
    this.startWaveBtn.style.display = this.phase === 'placement' ? '' : 'none';
    this.startWaveBtn.disabled = !ready;
  }

  // ---------------- bars / fx ---------------- //

  buildBarSet(hasUltimate) {
    const group = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(HP_BAR_W, HP_BAR_H), new THREE.MeshBasicMaterial({ color: 0x1c202a }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(HP_BAR_W, HP_BAR_H), new THREE.MeshBasicMaterial({ color: 0x4caf50 }));
    fill.position.z = 0.001;
    group.add(bg, fill);
    let ultBg = null, ultFill = null;
    if (hasUltimate) {
      ultBg = new THREE.Mesh(new THREE.PlaneGeometry(HP_BAR_W, ULT_BAR_H), new THREE.MeshBasicMaterial({ color: 0x1c202a }));
      ultFill = new THREE.Mesh(new THREE.PlaneGeometry(HP_BAR_W, ULT_BAR_H), new THREE.MeshBasicMaterial({ color: 0xf5c94b }));
      ultBg.position.y = -0.13; ultFill.position.y = -0.13; ultFill.position.z = 0.001;
      ultFill.scale.x = 0.0001;
      group.add(ultBg, ultFill);
    }
    return { group, fill, ultFill };
  }

  updateBar(bars, frac) {
    bars.fill.scale.x = Math.max(0.0001, frac);
    bars.fill.position.x = -(HP_BAR_W / 2) * (1 - Math.max(0.0001, frac));
  }

  updateUltBar(bars, frac) {
    if (!bars.ultFill) return;
    bars.ultFill.scale.x = Math.max(0.0001, frac);
    bars.ultFill.position.x = -(HP_BAR_W / 2) * (1 - Math.max(0.0001, frac));
  }

  billboardAll() {
    const q = this.camera.quaternion;
    this.allies.forEach(a => a.bars.group.quaternion.copy(q));
    this.enemies.forEach(e => e.bars.group.quaternion.copy(q));
    this.floaters.forEach(f => f.sprite.quaternion.copy(q));
  }

  spawnFloatingText(x, y, z, text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = color || '#fff2c4';
    ctx.fillText(text, 64, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.9, 0.34, 1);
    sprite.position.set(x, y, z);
    sprite.renderOrder = 10;
    this.scene.add(sprite);
    this.floaters.push({ sprite, life: 0, maxLife: 0.6, riseY: 0.7 });
  }

  spawnBurst(x, y, z, color, count, size, life) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.IcosahedronGeometry(size, 0);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
      const m = new THREE.Mesh(geo, mat);
      const ang = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 1.2;
      m.position.set(x, y + 0.3, z);
      this.scene.add(m);
      this.fx.push({
        mesh: m, life: 0, maxLife: life,
        vx: Math.cos(ang) * speed, vz: Math.sin(ang) * speed, vy: 1.4 + Math.random()
      });
    }
  }

  // ---------------- wave logic (ported from BattleScene) ---------------- //

  startWave() {
    this.phase = 'wave';
    this.spawnedCount = 0;
    this.waveEnemyCount = Math.min(4 + (gameState.globalWaveNumber() - 1) * 2, 30);
    this.isBossWave = gameState.globalWaveNumber() % BOSS_WAVE_INTERVAL === 0;
    if (this.isBossWave) this.waveEnemyCount += 1;
    this.spawnTimerMs = 0;
    this.refreshStartButton();
    if (this.isBossWave) this.announceBoss();
  }

  announceBoss() {
    const banner = document.createElement('div');
    banner.className = 'lp-boss-banner';
    banner.textContent = 'BOSS INCOMING';
    this.root.appendChild(banner);
    setTimeout(() => banner.classList.add('fade'), 1200);
    setTimeout(() => banner.remove(), 2000);
  }

  spawnEnemy() {
    const isBossSpawn = this.isBossWave && this.spawnedCount === this.waveEnemyCount - 1;
    const es = isBossSpawn ? BOSS_ENEMY_SPECIES[Math.floor(Math.random() * BOSS_ENEMY_SPECIES.length)]
      : SPAWNABLE_ENEMY_SPECIES[Math.floor(Math.random() * SPAWNABLE_ENEMY_SPECIES.length)];
    this.spawnEnemyOfSpecies(es, this.pathWaypoints[0], 0, 0);
  }

  spawnEnemyOfSpecies(es, pos, waypointIndex, progress) {
    const model = LowPoly.buildEnemyModel(es);
    model.position.set(pos.x, 0, pos.z);
    this.scene.add(model);
    const bars = this.buildBarSet(false);
    bars.group.position.set(pos.x, ENTITY_HOVER_Y * (es.boss ? 1.6 : 1), pos.z);
    this.scene.add(bars.group);

    const enemy = {
      species: es, x: pos.x, z: pos.z, waypointIndex, progress,
      hp: es.maxHp, maxHp: es.maxHp, statusEffects: {}, model, bars
    };
    this.enemies.push(enemy);
    return enemy;
  }

  spawnSplitChildren(parent) {
    const childId = parent.species.splitInto;
    const count = parent.species.splitCount || 0;
    if (!childId || count <= 0) return;
    const childSpecies = getEnemySpecies(childId);
    for (let i = 0; i < count; i++) {
      const offsetX = (i - (count - 1) / 2) * 0.4;
      this.spawnEnemyOfSpecies(childSpecies, { x: parent.x + offsetX, z: parent.z }, parent.waypointIndex, parent.progress);
    }
  }

  // ---------------- main loop ---------------- //

  loop(now) {
    this._raf = requestAnimationFrame((t) => this.loop(t));
    // Clamped high enough that normal frame-rate dips (software rendering,
    // a busy tab) still simulate at real-world speed instead of quietly
    // running in slow motion - only a genuine multi-second stall (tab
    // backgrounded and resumed) gets clamped, to avoid a teleport-across-
    // the-map jump.
    const delta = Math.min(this.clock.getDelta(), 0.25);
    const deltaMs = delta * 1000;
    const time = performance.now();

    this.updateCameraPan(delta);
    this.controls.update();

    // idle bob for placed allies + enemies, purely cosmetic
    this.allies.forEach(a => { a.model.position.y = Math.sin(time / 400 + a.model.userChildBob || 0) * 0.03; });

    if (this.phase === 'wave') this.updateWave(time, deltaMs);

    this.updateFx(delta);
    this.billboardAll();
    this.renderer.render(this.scene, this.camera);
  }

  updateCameraPan(delta) {
    if (!this._keys) this._keys = {};
    const step = 10 * delta;
    let dx = 0, dz = 0;
    if (this._keys['a'] || this._keys['arrowleft']) dx -= step;
    if (this._keys['d'] || this._keys['arrowright']) dx += step;
    if (this._keys['w'] || this._keys['arrowup']) dz -= step;
    if (this._keys['s'] || this._keys['arrowdown']) dz += step;
    if (dx || dz) {
      this.camera.position.x += dx; this.camera.position.z += dz;
      this.controls.target.x += dx; this.controls.target.z += dz;
    }
  }

  updateFx(delta) {
    this.floaters = this.floaters.filter(f => {
      f.life += delta;
      const t = f.life / f.maxLife;
      f.sprite.position.y += f.riseY * delta;
      f.sprite.material.opacity = Math.max(0, 1 - t);
      if (t >= 1) { this.scene.remove(f.sprite); return false; }
      return true;
    });
    this.fx = this.fx.filter(p => {
      p.life += delta;
      const t = p.life / p.maxLife;
      p.mesh.position.x += p.vx * delta;
      p.mesh.position.z += p.vz * delta;
      p.mesh.position.y += p.vy * delta;
      p.vy -= 4 * delta;
      p.mesh.material.opacity = Math.max(0, 1 - t);
      p.mesh.scale.setScalar(1 + t * 0.6);
      if (t >= 1) { this.scene.remove(p.mesh); return false; }
      return true;
    });
  }

  updateWave(time, deltaMs) {
    if (this.spawnedCount < this.waveEnemyCount) {
      this.spawnTimerMs += deltaMs;
      if (this.spawnTimerMs >= this.spawnIntervalMs) {
        this.spawnTimerMs = 0;
        this.spawnEnemy();
        this.spawnedCount++;
      }
    }

    for (const enemy of this.enemies) {
      this.processStatusEffects(enemy, time);
      this.processRegen(enemy, deltaMs);
      this.processSummon(enemy, time);
    }

    const escaped = [];
    for (const enemy of this.enemies) {
      const target = this.pathWaypoints[enemy.waypointIndex + 1];
      if (!target) { escaped.push(enemy); continue; }
      const dx = target.x - enemy.x, dz = target.z - enemy.z;
      const dist = Math.hypot(dx, dz);
      // species.speed is px/sec calibrated against the pixel version's
      // 96px cell (see BattleScene.js CELL) - scale by our own CELL's world
      // size so the same speed value crosses a cell in the same real time.
      const step = enemy.species.speed * (CELL / 96) * this.enemySpeedMultiplier(enemy) * (deltaMs / 1000);

      if (dist <= step) {
        enemy.x = target.x; enemy.z = target.z;
        enemy.waypointIndex++;
        if (enemy.waypointIndex + 1 >= this.pathWaypoints.length) escaped.push(enemy);
      } else {
        enemy.x += (dx / dist) * step;
        enemy.z += (dz / dist) * step;
        enemy.model.rotation.y = Math.atan2(dx, dz);
      }

      const from = this.pathWaypoints[enemy.waypointIndex];
      const segLen = Math.hypot(target.x - from.x, target.z - from.z);
      const remaining = Math.hypot(enemy.x - target.x, enemy.z - target.z);
      enemy.progress = enemy.waypointIndex + (segLen > 0 ? 1 - THREE.MathUtils.clamp(remaining / segLen, 0, 1) : 1);

      enemy.model.position.x = enemy.x; enemy.model.position.z = enemy.z;
      enemy.bars.group.position.x = enemy.x; enemy.bars.group.position.z = enemy.z;
    }

    if (escaped.length > 0) {
      escaped.forEach(e => {
        gameState.lives = Math.max(0, gameState.lives - e.species.attack);
        this.destroyEnemy(e);
      });
      this.enemies = this.enemies.filter(e => !escaped.includes(e));
    }

    this.applyAuras(time);

    for (const ally of this.allies) {
      const archetype = COMBAT_ARCHETYPES[ally.species.type];
      if (time >= ally.nextAttackTime) {
        const rangeWorld = ally.species.range * CELL;
        let target = null, bestProgress = -Infinity;
        for (const enemy of this.enemies) {
          const d = Math.hypot(ally.x - enemy.x, ally.z - enemy.z);
          if (d <= rangeWorld && enemy.progress > bestProgress) { bestProgress = enemy.progress; target = enemy; }
        }
        if (target) {
          ally.model.rotation.y = Math.atan2(target.x - ally.x, target.z - ally.z);
          this.dealDamage(target, ally.attack);
          this.spawnBurst(target.x, 0.5, target.z, TYPE_COLORS[ally.species.type], 4, 0.06, 0.3);
          this.applyAttackSecondaryEffect(ally, target, time);
          this.chargeUltimate(ally, time);
          const speedMult = this.currentAttackSpeedMultiplier(ally, time);
          ally.nextAttackTime = time + ally.species.attackIntervalMs / speedMult;
        }
      }
      if (archetype.abilityCooldownMs && time >= ally.nextAbilityTime) {
        this.applyArchetypeAbility(ally, time);
      }
    }

    const dead = this.enemies.filter(e => e.hp <= 0);
    if (dead.length > 0) {
      dead.forEach(e => {
        gameState.score += e.species.reward;
        gameState.earnCoins(e.species.reward);
        this.spawnBurst(e.x, 0.5, e.z, TYPE_COLORS[e.species.type], 10, 0.1, 0.55);
        this.spawnSplitChildren(e);
        this.destroyEnemy(e);
      });
      this.enemies = this.enemies.filter(e => e.hp > 0);
    }

    this.updateHud();

    if (gameState.lives <= 0) { this.onGameOver(); return; }
    if (this.spawnedCount >= this.waveEnemyCount && this.enemies.length === 0) this.onWaveComplete();
  }

  dealDamage(enemy, amount) {
    const armor = enemy.species.armor || 0;
    const finalAmount = armor > 0 ? Math.max(1, amount - armor) : amount;
    enemy.hp = Math.max(0, enemy.hp - finalAmount);
    this.updateBar(enemy.bars, enemy.hp / enemy.maxHp);
    this.spawnFloatingText(enemy.x, ENTITY_HOVER_Y + 0.3, enemy.z, `-${finalAmount}`, '#fff2c4');
  }

  destroyEnemy(enemy) {
    this.scene.remove(enemy.model, enemy.bars.group);
  }

  findEnemiesInRange(x, z, rangeWorld) {
    return this.enemies.filter(e => Math.hypot(x - e.x, z - e.z) <= rangeWorld);
  }

  applyDotToEnemy(enemy, cfg, time) {
    enemy.statusEffects.dot = {
      color: cfg.color, damagePerTick: cfg.damagePerTick,
      ticksRemaining: cfg.ticks, tickIntervalMs: cfg.tickIntervalMs, nextTickTime: time + cfg.tickIntervalMs
    };
  }

  applySlowToEnemy(enemy, cfg, time) {
    if (enemy.species.slowImmune) return;
    enemy.statusEffects.slow = { multiplier: cfg.multiplier, expiresAt: time + cfg.durationMs };
  }

  processRegen(enemy, deltaMs) {
    const regen = enemy.species.regenPerSecond || 0;
    if (regen <= 0 || enemy.hp <= 0) return;
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + regen * (deltaMs / 1000));
    this.updateBar(enemy.bars, enemy.hp / enemy.maxHp);
  }

  processSummon(enemy, time) {
    const interval = enemy.species.summonIntervalMs;
    if (!interval || enemy.hp <= 0) return;
    if (enemy.nextSummonTime == null) enemy.nextSummonTime = time + interval;
    if (time < enemy.nextSummonTime) return;
    enemy.nextSummonTime = time + interval;
    const childSpecies = getEnemySpecies(enemy.species.summonSpeciesId);
    const count = enemy.species.summonCount || 1;
    for (let i = 0; i < count; i++) {
      const offsetX = (i - (count - 1) / 2) * 0.4;
      this.spawnEnemyOfSpecies(childSpecies, { x: enemy.x + offsetX, z: enemy.z }, enemy.waypointIndex, enemy.progress);
    }
  }

  processStatusEffects(enemy, time) {
    const dot = enemy.statusEffects.dot;
    if (dot && time >= dot.nextTickTime) {
      this.dealDamage(enemy, dot.damagePerTick);
      this.spawnBurst(enemy.x, 0.5, enemy.z, dot.color, 2, 0.05, 0.25);
      dot.ticksRemaining -= 1;
      dot.nextTickTime = time + dot.tickIntervalMs;
      if (dot.ticksRemaining <= 0) delete enemy.statusEffects.dot;
    }
    const slow = enemy.statusEffects.slow;
    if (slow && time >= slow.expiresAt) delete enemy.statusEffects.slow;
  }

  enemySpeedMultiplier(enemy) {
    const slow = enemy.statusEffects.slow;
    return slow ? slow.multiplier : 1;
  }

  addBuff(ally, key, multiplier, expiresAt) {
    ally.buffs = ally.buffs.filter(b => b.key !== key);
    ally.buffs.push({ key, multiplier, expiresAt });
  }

  currentAttackSpeedMultiplier(ally, time) {
    ally.buffs = ally.buffs.filter(b => b.expiresAt > time);
    if (ally.buffs.length === 0) return 1;
    return Math.max(...ally.buffs.map(b => b.multiplier));
  }

  applyAuras(time) {
    for (const source of this.allies) {
      const archetype = COMBAT_ARCHETYPES[source.species.type];
      if (!archetype.aura) continue;
      const rangeWorld = source.species.range * CELL;
      for (const other of this.allies) {
        if (other === source) continue;
        if (Math.hypot(source.x - other.x, source.z - other.z) <= rangeWorld) {
          this.addBuff(other, 'aura', archetype.aura.attackSpeedMultiplier, time + 600);
        }
      }
    }
  }

  applyChain(startTarget, cfg, baseDamage, tint, includeStartDamage) {
    const hit = new Set();
    let current = startTarget;
    if (includeStartDamage) {
      this.dealDamage(current, baseDamage);
      this.spawnBurst(current.x, 0.5, current.z, tint, 4, 0.06, 0.3);
    }
    hit.add(current);
    for (let i = 0; i < cfg.jumps; i++) {
      const next = this.findEnemiesInRange(current.x, current.z, cfg.jumpRangePx).find(e => !hit.has(e));
      if (!next) break;
      this.dealDamage(next, Math.round(baseDamage * cfg.falloff[i]));
      this.spawnBurst(next.x, 0.5, next.z, tint, 4, 0.06, 0.3);
      hit.add(next);
      current = next;
    }
  }

  applyAttackSecondaryEffect(ally, target, time) {
    const archetype = COMBAT_ARCHETYPES[ally.species.type];
    const effect = archetype.attackEffect(ally.attack);
    if (!effect) return;
    const tint = TYPE_COLORS[ally.species.type];
    if (effect.kind === 'dot') this.applyDotToEnemy(target, effect, time);
    else if (effect.kind === 'slow') this.applySlowToEnemy(target, effect, time);
    else if (effect.kind === 'splash') {
      this.findEnemiesInRange(target.x, target.z, effect.radiusPx).filter(e => e !== target)
        .forEach(e => { this.dealDamage(e, effect.damage); this.spawnBurst(e.x, 0.5, e.z, tint, 3, 0.05, 0.25); });
    } else if (effect.kind === 'chain') {
      this.applyChain(target, effect, ally.attack, tint, false);
    }
  }

  applyArchetypeAbility(ally, time) {
    const archetype = COMBAT_ARCHETYPES[ally.species.type];
    const tint = TYPE_COLORS[ally.species.type];
    if (archetype.abilityKind === 'team-buff') {
      const cfg = archetype.abilityEffect();
      this.allies.forEach(a => this.addBuff(a, 'rally', cfg.attackSpeedMultiplier, time + cfg.durationMs));
      ally.nextAbilityTime = time + archetype.abilityCooldownMs;
      return;
    }
    const rangeWorld = ally.species.range * CELL;
    const targets = this.findEnemiesInRange(ally.x, ally.z, rangeWorld);
    if (targets.length === 0) return;
    const cfg = archetype.abilityEffect(ally.attack);
    if (cfg.kind === 'chain') this.applyChain(targets[0], cfg, ally.attack, tint, true);
    else targets.forEach(e => {
      if (cfg.splashDamage) this.dealDamage(e, cfg.splashDamage);
      if (cfg.dot) this.applyDotToEnemy(e, cfg.dot, time);
      if (cfg.slow) this.applySlowToEnemy(e, cfg.slow, time);
      this.spawnBurst(e.x, 0.5, e.z, tint, 5, 0.07, 0.35);
    });
    ally.nextAbilityTime = time + archetype.abilityCooldownMs;
  }

  chargeUltimate(ally, time) {
    const archetype = COMBAT_ARCHETYPES[ally.species.type];
    if (!archetype.ultimateChargeHits) return;
    ally.ultimateCharge++;
    this.updateUltBar(ally.bars, ally.ultimateCharge / archetype.ultimateChargeHits);
    if (ally.ultimateCharge >= archetype.ultimateChargeHits) {
      this.applyArchetypeUltimate(ally, time);
      ally.ultimateCharge = 0;
      this.updateUltBar(ally.bars, 0);
    }
  }

  applyArchetypeUltimate(ally, time) {
    const archetype = COMBAT_ARCHETYPES[ally.species.type];
    const tint = TYPE_COLORS[ally.species.type];
    if (archetype.ultimateKind === 'team-buff') {
      const cfg = archetype.ultimateEffect();
      this.allies.forEach(a => this.addBuff(a, 'ultimate', cfg.attackSpeedMultiplier, time + cfg.durationMs));
      this.announceUltimate(ally, archetype.ultimateLabel);
      this.spawnBurst(ally.x, 0.6, ally.z, tint, 14, 0.12, 0.6);
      return;
    }
    const rangeWorld = ally.species.range * CELL * (archetype.ultimateRangeMultiplier || 1.5);
    const targets = this.findEnemiesInRange(ally.x, ally.z, rangeWorld);
    if (targets.length === 0) return;
    this.announceUltimate(ally, archetype.ultimateLabel);
    this.spawnBurst(ally.x, 0.6, ally.z, tint, 14, 0.12, 0.6);
    const cfg = archetype.ultimateEffect(ally.attack);
    if (cfg.kind === 'chain') this.applyChain(targets[0], cfg, ally.attack, tint, true);
    else targets.forEach(e => {
      if (cfg.splashDamage) this.dealDamage(e, cfg.splashDamage);
      if (cfg.dot) this.applyDotToEnemy(e, cfg.dot, time);
      if (cfg.slow) this.applySlowToEnemy(e, cfg.slow, time);
      this.spawnBurst(e.x, 0.5, e.z, tint, 8, 0.09, 0.4);
    });
  }

  announceUltimate(ally, label) {
    this.spawnFloatingText(ally.x, ENTITY_HOVER_Y + 0.6, ally.z, label.toUpperCase() + '!', '#ffffff');
  }

  // ---------------- outcomes ---------------- //

  onWaveComplete() {
    this.phase = 'waveComplete';
    const essenceReward = this.isBossWave ? 25 : 10;
    gameState.earnEssence(essenceReward);

    const stageComplete = gameState.wave >= WAVES_PER_STAGE;
    if (!stageComplete) {
      this.showOverlay(`Wave ${gameState.wave} Cleared!`,
        `Score: ${gameState.score}   Lives: ${gameState.lives}/${gameState.maxLives}   +${essenceReward} essence`,
        'Next Wave', () => {
          gameState.wave += 1;
          this.phase = 'placement';
          this.hideOverlay();
          this.refreshStartButton();
        });
      return;
    }

    gameState.onStageCleared();
    const runComplete = gameState.isRunComplete();
    let masteryLine = '';
    if (runComplete) {
      const masteryEarned = gameState.masteryForRunEnd();
      gameState.awardMastery(masteryEarned);
      gameState.lastMasteryEarned = masteryEarned;
      masteryLine = `   +${masteryEarned} Mastery`;
    }
    this.showOverlay(
      runComplete ? 'RUN COMPLETE!' : `${this.stage.name} Cleared!`,
      `Stage ${gameState.stageInRun}/${RUN_TARGET_STAGES}   Score: ${gameState.score}   Lives: ${gameState.lives}/${gameState.maxLives}   +${essenceReward} essence${masteryLine}`,
      runComplete ? 'Claim Victory' : 'Continue',
      () => {
        this.hideOverlay();
        if (runComplete) this.callbacks.onRunComplete();
        else this.callbacks.onWaveClearedRun();
      }
    );
  }

  onGameOver() {
    this.phase = 'gameOver';
    const masteryEarned = gameState.masteryForRunEnd();
    gameState.awardMastery(masteryEarned);
    this.showOverlay('Base Overrun',
      `Run ended on stage ${gameState.stageInRun}/${RUN_TARGET_STAGES}, wave ${gameState.wave}   Final Score: ${gameState.score}   +${masteryEarned} Mastery`,
      'Start New Run',
      () => { gameState.runActive = false; this.hideOverlay(); this.callbacks.onGameOverRun(); });
  }

  showOverlay(title, sub, primaryLabel, onPrimary) {
    this.overlayTitle.textContent = title;
    this.overlaySub.textContent = sub;
    this.overlayPrimary.textContent = primaryLabel;
    this.overlayPrimary.onclick = onPrimary;
    this.overlay.hidden = false;
  }

  hideOverlay() { this.overlay.hidden = true; }

  updateHud() {
    this.hudText.textContent =
      `${this.stage.name}   Stage ${gameState.stageInRun}/${RUN_TARGET_STAGES}   Wave ${gameState.wave}/${WAVES_PER_STAGE}   ` +
      `Lives ${gameState.lives}/${gameState.maxLives}   Coins ${gameState.coins}   Score ${gameState.score}   ` +
      `Bench ${this.bench.length}   Placed ${this.allies.length}`;
  }
}

function cssColor(hex) {
  return '#' + hex.toString(16).padStart(6, '0');
}
