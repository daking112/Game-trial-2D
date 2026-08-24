// A grid this size doesn't fit in one 1920x1080 screen by design - see the
// camera setup in create() and setupCamera(). WORLD_PAD is empty space left
// past the grid's right/bottom edge for decorations to sit in without the
// camera bumping its bounds right at the grid line.
const GRID_COLS = 28;
const GRID_ROWS = 16;
const CELL = 96;
const GRID_X = 150;
const GRID_Y = 150;
const WORLD_PAD = 180;
const WORLD_WIDTH = GRID_X + GRID_COLS * CELL + WORLD_PAD;
const WORLD_HEIGHT = GRID_Y + GRID_ROWS * CELL + WORLD_PAD;
const CAMERA_PAN_SPEED = 900; // px/sec, keyboard pan
const HP_BAR_W = 60;
const HP_BAR_H = 8;
const HP_BAR_Y_OFFSET = -42;

class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  create() {
    // gameState.currentStageId is set by whoever navigated here (RosterScene
    // starting a fresh run, or HubScene's Ready/countdown) via
    // gameState.startStage() - this scene doesn't touch run/stage progress
    // itself, it just renders whatever stage is already current.
    this.stage = getStage(gameState.currentStageId) || getStage(FIRST_STAGE_ID);
    this.pathCells = this.stage.pathCells;

    this.phase = 'placement'; // 'placement' | 'wave' | 'waveComplete' | 'gameOver'
    this.pathWaypoints = this.buildPathWaypoints();
    this.pathBlockedCells = this.buildPathBlockedCells();

    this.grid = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(null));
    this.allies = [];
    this.enemies = [];
    this.selectedBenchSpeciesId = null;
    this.spawnedCount = 0;
    this.waveEnemyCount = 0;
    this.spawnTimerMs = 0;
    this.spawnIntervalMs = 700;

    // Each roster entry is unique per species, so a team member can only
    // ever be on the bench or placed once - no stacked duplicates to place.
    this.bench = gameState.team
      .map(id => gameState.roster[id])
      .filter(Boolean);

    this.drawGrid();
    this.buildHud();
    this.buildBench();
    this.buildOverlay();
    this.setupCamera();

    this.updateHud();
    this.refreshStartButton();
  }

  // ---------- camera ----------

  // The grid is bigger than the viewport, so the player needs to actively
  // move around it: WASD/arrow keys and mouse wheel both pan the same
  // camera (edge-scroll was tried and dropped - the bench sits flush against
  // the left edge and the Menu/Center View links flush against the right, so
  // just hovering them to click fought with edge-pan). Every HUD/bench/
  // overlay element is set scrollFactor(0) (see buildHud/buildBench/
  // buildOverlay) so none of this drags the UI around with the world - only
  // grid/path/decorations/allies/enemies scroll.
  setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    cam.centerOn(GRID_X + (GRID_COLS * CELL) / 2, GRID_Y + (GRID_ROWS * CELL) / 2);

    this.panKeys = this.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT');

    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      cam.scrollX += deltaX;
      cam.scrollY += deltaY;
    });

    UiKit.makeLink(this, this.scale.width - 30, 60, 'Center View', () => {
      cam.centerOn(GRID_X + (GRID_COLS * CELL) / 2, GRID_Y + (GRID_ROWS * CELL) / 2);
    }, { originX: 1, originY: 0, fontSize: '16px' }).setScrollFactor(0);
  }

  updateCameraPan(delta) {
    // No keyboard pan while a modal overlay is up - the player is reading
    // results, not scouting the map.
    if (this.overlayBg.visible) return;

    const cam = this.cameras.main;
    const step = (CAMERA_PAN_SPEED * delta) / 1000;
    let dx = 0, dy = 0;

    if (this.panKeys.A.isDown || this.panKeys.LEFT.isDown) dx -= step;
    if (this.panKeys.D.isDown || this.panKeys.RIGHT.isDown) dx += step;
    if (this.panKeys.W.isDown || this.panKeys.UP.isDown) dy -= step;
    if (this.panKeys.S.isDown || this.panKeys.DOWN.isDown) dy += step;

    if (dx !== 0 || dy !== 0) cam.scrollX += dx, cam.scrollY += dy;
  }

  // ---------- path ----------

  buildPathWaypoints() {
    const entry = this.cellToPixel(this.pathCells[0].col, this.pathCells[0].row);
    const exit = this.cellToPixel(this.pathCells[this.pathCells.length - 1].col, this.pathCells[this.pathCells.length - 1].row);
    const spawn = { x: GRID_X + GRID_COLS * CELL + 45, y: entry.y };
    const base = { x: GRID_X - 45, y: exit.y };
    const onGrid = this.pathCells.map(c => this.cellToPixel(c.col, c.row));
    return [spawn, ...onGrid, base];
  }

  buildPathBlockedCells() {
    const blocked = new Set();
    const mark = (c, r) => blocked.add(r + ',' + c);
    for (let i = 0; i < this.pathCells.length - 1; i++) {
      const a = this.pathCells[i], b = this.pathCells[i + 1];
      if (a.row === b.row) {
        const [from, to] = a.col < b.col ? [a.col, b.col] : [b.col, a.col];
        for (let c = from; c <= to; c++) mark(c, a.row);
      } else {
        const [from, to] = a.row < b.row ? [a.row, b.row] : [b.row, a.row];
        for (let r = from; r <= to; r++) mark(a.col, r);
      }
    }
    return blocked;
  }

  isPathCell(col, row) {
    return this.pathBlockedCells.has(row + ',' + col);
  }

  // ---------- setup ----------

  drawGrid() {
    // Grass fills the whole grid; path tiles lay on top only on path cells -
    // both are hand-authored 64x64 seamless textures (see README.md), so
    // there's no visible tiling seam within either surface.
    this.add.tileSprite(
      GRID_X + (GRID_COLS * CELL) / 2, GRID_Y + (GRID_ROWS * CELL) / 2,
      GRID_COLS * CELL, GRID_ROWS * CELL, 'tile-grass'
    );
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.isPathCell(c, r)) {
          const { x, y } = this.cellToPixel(c, r);
          this.add.image(x, y, 'tile-path');
        }
      }
    }

    this.drawMapDecorations();

    const g = this.add.graphics();

    // A dark rim where path meets grass reads the road's shape clearly even
    // where the faint grid lines below are hard to see against the texture.
    g.lineStyle(2, 0x33210f, 0.85);
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (!this.isPathCell(c, r)) continue;
        const x0 = GRID_X + c * CELL, y0 = GRID_Y + r * CELL;
        if (!this.isPathCell(c, r - 1)) g.lineBetween(x0, y0, x0 + CELL, y0);
        if (!this.isPathCell(c, r + 1)) g.lineBetween(x0, y0 + CELL, x0 + CELL, y0 + CELL);
        if (!this.isPathCell(c - 1, r)) g.lineBetween(x0, y0, x0, y0 + CELL);
        if (!this.isPathCell(c + 1, r)) g.lineBetween(x0 + CELL, y0, x0 + CELL, y0 + CELL);
      }
    }

    g.lineStyle(1, 0xf5f7fa, 0.12);
    for (let c = 0; c <= GRID_COLS; c++) {
      g.lineBetween(GRID_X + c * CELL, GRID_Y, GRID_X + c * CELL, GRID_Y + GRID_ROWS * CELL);
    }
    for (let r = 0; r <= GRID_ROWS; r++) {
      g.lineBetween(GRID_X, GRID_Y + r * CELL, GRID_X + GRID_COLS * CELL, GRID_Y + r * CELL);
    }

    // Spawn edge and base edge markers.
    const entryRow = this.pathCells[0].row;
    const exitRow = this.pathCells[this.pathCells.length - 1].row;
    g.lineStyle(4, 0xe0562f, 0.7);
    g.lineBetween(GRID_X + GRID_COLS * CELL, GRID_Y + entryRow * CELL, GRID_X + GRID_COLS * CELL, GRID_Y + (entryRow + 1) * CELL);
    g.lineStyle(4, 0x4caf50, 1);
    g.lineBetween(GRID_X, GRID_Y + exitRow * CELL, GRID_X, GRID_Y + (exitRow + 1) * CELL);

    this.cellZones = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      const rowZones = [];
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.isPathCell(c, r)) { rowZones.push(null); continue; }
        const { x, y } = this.cellToPixel(c, r);
        const zone = this.add.zone(x, y, CELL - 4, CELL - 4).setInteractive();
        zone.on('pointerdown', () => this.onCellClicked(c, r));
        zone.on('pointerover', () => this.onCellHover(c, r));
        zone.on('pointerout', () => this.hideRangePreview());
        rowZones.push(zone);
      }
      this.cellZones.push(rowZones);
    }

    this.rangePreview = this.add.circle(0, 0, 1, 0xffffff, 0.12)
      .setStrokeStyle(1, 0xffffff, 0.5).setDepth(-5).setVisible(false);
  }

  // Purely cosmetic dressing in the margins flanking the grid - fixed
  // positions (not random) so a stage always looks the same on replay, and
  // kept clear of the HUD strip, bench row, and the grid's own interactive
  // zones so nothing here can ever intercept a click meant for the game.
  drawMapDecorations() {
    const left = GRID_X - 100;
    const right = GRID_X + GRID_COLS * CELL + 90;
    // A 16-row grid runs much taller than the old 8-row one - repeat the
    // same tree/bush/rock rhythm down both margins instead of leaving most
    // of the map's edges bare. Still fixed positions, not randomized (see
    // the note above isPathCell's caller) so a stage looks the same on replay.
    const pattern = [
      { key: 'tree-1', anim: 'tree-1-sway', scale: 0.85 },
      { key: 'bush-1', anim: 'bush-1-sway', scale: 1.05 },
      { key: 'rock-2', anim: null, scale: 1.3 },
      { key: 'tree-2', anim: 'tree-2-sway', scale: 0.75 },
      { key: 'rock-3', anim: null, scale: 1.3 },
      { key: 'bush-2', anim: 'bush-2-sway', scale: 0.95 }
    ];
    const rowSpacing = 240;
    const rows = Math.ceil((GRID_ROWS * CELL) / rowSpacing);
    for (let i = 0; i < rows; i++) {
      const y = GRID_Y + 60 + i * rowSpacing;
      const leftDeco = pattern[i % pattern.length];
      const rightDeco = pattern[(i + 3) % pattern.length];
      const addDeco = (x, deco) => deco.anim
        ? this.add.sprite(x, y, deco.key).play(deco.anim).setScale(deco.scale)
        : this.add.image(x, y, deco.key).setScale(deco.scale);
      addDeco(left, leftDeco);
      addDeco(right, rightDeco);
    }
  }

  buildHud() {
    this.add.image(960, 48, 'panel-hud').setScrollFactor(0);
    this.hudText = this.add.text(30, 32, '', {
      fontFamily: 'monospace', fontSize: '22px', color: '#f5f7fa'
    }).setScrollFactor(0);

    this.backBtn = UiKit.makeLink(this, this.scale.width - 30, 32, 'Menu >', () => this.scene.start('MenuScene'), {
      originX: 1, originY: 0, fontSize: '22px'
    }).setScrollFactor(0);

    this.startWaveBtn = UiKit.makeButton(this, this.scale.width / 2, 125, 'Start Wave', () => {
      if (this.phase === 'placement' && this.allies.length > 0) this.startWave();
    });
    UiKit.pinToScreen(this.startWaveBtn);
  }

  buildBench() {
    this.benchLabel = this.add.text(30, 950, 'Bench (click, then click an empty non-path cell):', {
      fontFamily: 'monospace', fontSize: '19px', color: '#c8ceda'
    }).setStroke('#1c2530', 3).setScrollFactor(0);
    this.benchIcons = [];
    this.layoutBench();
  }

  layoutBench() {
    this.benchIcons.forEach(i => {
      i.bg.destroy(); i.selectionRing.destroy(); i.sprite.destroy();
      i.costIcon.destroy(); i.costText.destroy();
    });
    this.benchIcons = [];

    const startX = 100, y = 1015, spacing = 96;
    this.bench.forEach((entry, i) => {
      const species = getSpecies(entry.speciesId);
      const rarity = RARITY[species.rarity];
      const x = startX + i * spacing;
      const bg = this.add.image(x, y, 'bench-slot').setDisplaySize(78, 78).setTint(rarity.color).setScrollFactor(0);
      const selectionRing = this.add.rectangle(x, y, 84, 84, 0xffffff, 0).setStrokeStyle(3, 0xf5c94b).setVisible(false).setScrollFactor(0);
      const sprite = this.add.sprite(x, y, species.sheetKey, species.frame).setScale(1.35).setScrollFactor(0);
      const { icon: costIcon, text: costText } = UiKit.iconLabel(this, x, y + 48, 'icon-coin', `${species.cost}`, {
        fontFamily: 'monospace', fontSize: '16px', color: '#f5c94b', stroke: '#1c2530', strokeThickness: 3
      }, 18);
      costIcon.setScrollFactor(0);
      costText.setScrollFactor(0);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.onBenchClicked(entry.speciesId));
      const icon = { bg, selectionRing, sprite, costIcon, costText, speciesId: entry.speciesId };
      this.benchIcons.push(icon);
      this.refreshBenchIcon(icon);
    });
  }

  refreshBenchIcon(icon) {
    icon.selectionRing.setVisible(this.selectedBenchSpeciesId === icon.speciesId);
  }

  buildOverlay() {
    const { width, height } = this.scale;
    // Explicit high depth: this is built once up front in create(), but
    // enemy/ally sprites get added to the scene continuously afterwards
    // during a wave, and Phaser draws later-added objects on top by default
    // regardless of this overlay's visibility toggle. Without a depth above
    // everything else, a monster in-frame when the overlay opens renders
    // through it instead of being hidden behind it.
    const OVERLAY_DEPTH = 100;
    this.overlayBg = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7).setDepth(OVERLAY_DEPTH).setScrollFactor(0).setVisible(false);
    this.overlayPanel = this.add.image(width / 2, height / 2, 'panel-overlay').setDepth(OVERLAY_DEPTH).setScrollFactor(0).setVisible(false);
    this.overlayTitle = this.add.text(width / 2, height / 2 - 140, '', {
      fontFamily: 'monospace', fontSize: '45px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 6).setDepth(OVERLAY_DEPTH).setScrollFactor(0).setVisible(false);
    this.overlaySub = this.add.text(width / 2, height / 2 - 60, '', {
      fontFamily: 'monospace', fontSize: '24px', color: '#c8ceda'
    }).setOrigin(0.5).setStroke('#1c2530', 4).setDepth(OVERLAY_DEPTH).setScrollFactor(0).setVisible(false);

    this.overlayPrimaryBtn = UiKit.makeButton(this, width / 2, height / 2 + 40, '', () => {}, { size: 'large' });
    this.overlaySecondaryBtn = UiKit.makeButton(this, width / 2, height / 2 + 140, 'Return to Menu', () => {
      this.scene.start('MenuScene');
    }, { size: 'large' });
    this.overlayPrimaryBtn.container.setDepth(OVERLAY_DEPTH);
    this.overlaySecondaryBtn.container.setDepth(OVERLAY_DEPTH);
    UiKit.pinToScreen(this.overlayPrimaryBtn);
    UiKit.pinToScreen(this.overlaySecondaryBtn);
    this.setOverlayVisible(false);
  }

  setOverlayVisible(visible) {
    [this.overlayBg, this.overlayPanel, this.overlayTitle, this.overlaySub,
      this.overlayPrimaryBtn.bg, this.overlayPrimaryBtn.text,
      this.overlaySecondaryBtn.bg, this.overlaySecondaryBtn.text].forEach(o => o.setVisible(visible));
  }

  // ---------- placement ----------

  onBenchClicked(speciesId) {
    if (this.phase !== 'placement') return;
    Sfx.click();
    this.selectedBenchSpeciesId = (this.selectedBenchSpeciesId === speciesId) ? null : speciesId;
    this.benchIcons.forEach(i => this.refreshBenchIcon(i));
    this.hideRangePreview();
  }

  onCellHover(col, row) {
    if (this.phase !== 'placement' || !this.selectedBenchSpeciesId || this.grid[row][col]) return;
    const entry = this.bench.find(m => m.speciesId === this.selectedBenchSpeciesId);
    if (!entry) return;
    const species = getSpecies(entry.speciesId);
    const { x, y } = this.cellToPixel(col, row);
    const rangePx = species.range * CELL;
    this.rangePreview.setPosition(x, y);
    this.rangePreview.radius = rangePx;
    this.rangePreview
      .setFillStyle(TYPE_COLORS[species.type], 0.12)
      .setStrokeStyle(1, TYPE_COLORS[species.type], 0.6)
      .setVisible(true);
  }

  hideRangePreview() {
    this.rangePreview.setVisible(false);
  }

  onCellClicked(col, row) {
    if (this.phase !== 'placement') return;
    const occupant = this.grid[row][col];

    if (occupant) {
      this.removeAllyFromGrid(occupant);
      return;
    }

    if (this.selectedBenchSpeciesId) {
      const entryIdx = this.bench.findIndex(m => m.speciesId === this.selectedBenchSpeciesId);
      if (entryIdx === -1) return;
      const entry = this.bench[entryIdx];
      const species = getSpecies(entry.speciesId);

      if (!gameState.spendCoins(species.cost)) {
        this.flashInsufficientCoins();
        return;
      }

      this.bench.splice(entryIdx, 1);
      this.placeAlly(entry, col, row);
      Sfx.place();
      this.selectedBenchSpeciesId = null;
      this.layoutBench();
      this.refreshStartButton();
      this.updateHud();
    }
  }

  flashInsufficientCoins() {
    Sfx.error();
    this.hudText.setColor('#e0562f');
    this.time.delayedCall(300, () => this.hudText.setColor('#f5f7fa'));
  }

  placeAlly(entry, col, row) {
    const species = getSpecies(entry.speciesId);
    const effective = getEffectiveStats(species, entry.level);
    const { x, y } = this.cellToPixel(col, row);
    const sprite = this.add.sprite(x, y, species.sheetKey, species.frame).setScale(1.5).setInteractive({ useHandCursor: true });
    const rangeCircle = this.add.circle(x, y, species.range * CELL, TYPE_COLORS[species.type], 0.05)
      .setStrokeStyle(1, TYPE_COLORS[species.type], 0.25).setDepth(-5);

    const ally = {
      speciesId: entry.speciesId, species, level: entry.level, col, row,
      attack: effective.attack, hp: effective.maxHp, maxHp: effective.maxHp,
      nextAttackTime: 0, nextAbilityTime: 0, buffs: [], sprite, rangeCircle,
      hpBg: this.add.rectangle(x, y + HP_BAR_Y_OFFSET, HP_BAR_W, HP_BAR_H, 0x1c202a),
      hpFill: this.add.rectangle(x - HP_BAR_W / 2, y + HP_BAR_Y_OFFSET, HP_BAR_W, HP_BAR_H, 0x4caf50).setOrigin(0, 0.5)
    };
    sprite.on('pointerdown', () => this.onCellClicked(col, row));

    this.grid[row][col] = ally;
    this.allies.push(ally);
    this.updateHud();
  }

  removeAllyFromGrid(ally) {
    Sfx.pickup();
    this.grid[ally.row][ally.col] = null;
    this.allies = this.allies.filter(a => a !== ally);
    ally.sprite.destroy();
    ally.rangeCircle.destroy();
    ally.hpBg.destroy();
    ally.hpFill.destroy();
    gameState.earnCoins(Math.floor(ally.species.cost * 0.5));
    this.bench.push(gameState.roster[ally.speciesId]);
    this.layoutBench();
    this.refreshStartButton();
    this.updateHud();
  }

  refreshStartButton() {
    const ready = this.phase === 'placement' && this.allies.length > 0;
    this.startWaveBtn.bg.setVisible(this.phase === 'placement');
    this.startWaveBtn.text.setVisible(this.phase === 'placement');
    this.startWaveBtn.bg.setTint(ready ? 0xffffff : 0x777777);
    this.startWaveBtn.text.setColor(ready ? '#f5f7fa' : '#8a95ab');
  }

  // ---------- wave logic ----------

  startWave() {
    Sfx.waveStart();
    this.phase = 'wave';
    this.spawnedCount = 0;
    // Scales off the run-wide wave count, not the within-stage one, so
    // stage 2's first wave is harder than stage 1's - a fresh coin refill
    // per stage shouldn't also mean a fresh (easy) difficulty curve.
    this.waveEnemyCount = Math.min(4 + (gameState.globalWaveNumber() - 1) * 2, 30);
    this.spawnTimerMs = 0;
    this.refreshStartButton();
  }

  spawnEnemy() {
    const es = ENEMY_SPECIES[Math.floor(Math.random() * ENEMY_SPECIES.length)];
    const spawn = this.pathWaypoints[0];

    const sprite = this.add.sprite(spawn.x, spawn.y, es.sheetKey, es.frame).setScale(1.5);
    const enemy = {
      species: es, x: spawn.x, y: spawn.y, waypointIndex: 0, progress: 0,
      hp: es.maxHp, maxHp: es.maxHp, statusEffects: {},
      sprite,
      hpBg: this.add.rectangle(spawn.x, spawn.y + HP_BAR_Y_OFFSET, HP_BAR_W, HP_BAR_H, 0x1c202a),
      hpFill: this.add.rectangle(spawn.x - HP_BAR_W / 2, spawn.y + HP_BAR_Y_OFFSET, HP_BAR_W, HP_BAR_H, 0xe0562f).setOrigin(0, 0.5)
    };
    this.enemies.push(enemy);
  }

  update(time, delta) {
    this.updateCameraPan(delta);

    if (this.phase !== 'wave') return;

    // spawning
    if (this.spawnedCount < this.waveEnemyCount) {
      this.spawnTimerMs += delta;
      if (this.spawnTimerMs >= this.spawnIntervalMs) {
        this.spawnTimerMs = 0;
        this.spawnEnemy();
        this.spawnedCount++;
      }
    }

    // status effects (burn/poison ticks, slow expiry) before movement so a
    // fresh slow affects this frame's step and a fatal DoT tick is caught by
    // the dead-enemy sweep later in this same frame.
    for (const enemy of this.enemies) {
      this.processStatusEffects(enemy, time);
    }

    // enemy movement along the path
    const escaped = [];
    for (const enemy of this.enemies) {
      const target = this.pathWaypoints[enemy.waypointIndex + 1];
      if (!target) { escaped.push(enemy); continue; }

      const dx = target.x - enemy.x, dy = target.y - enemy.y;
      const dist = Math.hypot(dx, dy);
      const step = enemy.species.speed * this.enemySpeedMultiplier(enemy) * (delta / 1000);

      if (dist <= step) {
        enemy.x = target.x; enemy.y = target.y;
        enemy.waypointIndex++;
        if (enemy.waypointIndex + 1 >= this.pathWaypoints.length) escaped.push(enemy);
      } else {
        enemy.x += (dx / dist) * step;
        enemy.y += (dy / dist) * step;
      }

      // How far along the whole path this enemy is, for "furthest along"
      // target priority - the BTD6-standard default ("First") rather than
      // whichever enemy happens to be nearest to a given tower.
      const from = this.pathWaypoints[enemy.waypointIndex];
      const segLen = Phaser.Math.Distance.Between(from.x, from.y, target.x, target.y);
      const remaining = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
      enemy.progress = enemy.waypointIndex + (segLen > 0 ? 1 - Phaser.Math.Clamp(remaining / segLen, 0, 1) : 1);

      enemy.sprite.x = enemy.x; enemy.sprite.y = enemy.y;
      enemy.hpBg.x = enemy.x; enemy.hpBg.y = enemy.y + HP_BAR_Y_OFFSET;
      enemy.hpFill.x = enemy.x - HP_BAR_W / 2; enemy.hpFill.y = enemy.y + HP_BAR_Y_OFFSET;
    }

    if (escaped.length > 0) {
      escaped.forEach(e => {
        gameState.lives = Math.max(0, gameState.lives - e.species.attack);
        this.destroyEnemy(e);
      });
      this.enemies = this.enemies.filter(e => !escaped.includes(e));
    }

    // passive auras (Normal-type towers buffing nearby allies) before attacks
    // so a freshly-buffed attack speed applies this frame.
    this.applyAuras(time);

    // ally attacks + abilities
    for (const ally of this.allies) {
      const archetype = COMBAT_ARCHETYPES[ally.species.type];

      if (time >= ally.nextAttackTime) {
        const center = this.cellToPixel(ally.col, ally.row);
        const rangePx = ally.species.range * CELL;
        // BTD6's default "First" priority: among enemies in range, hit
        // whichever has traveled furthest along the path (closest to
        // breaking through), not whichever is geometrically nearest to
        // this tower.
        let target = null;
        let bestProgress = -Infinity;
        for (const enemy of this.enemies) {
          const d = Phaser.Math.Distance.Between(center.x, center.y, enemy.x, enemy.y);
          if (d <= rangePx && enemy.progress > bestProgress) { bestProgress = enemy.progress; target = enemy; }
        }
        if (target) {
          this.dealDamage(target, ally.attack);
          Sfx.hit();
          this.playHitSpark(target.x, target.y, TYPE_COLORS[ally.species.type]);
          this.applyAttackSecondaryEffect(ally, target, time);
          const speedMult = this.currentAttackSpeedMultiplier(ally, time);
          ally.nextAttackTime = time + ally.species.attackIntervalMs / speedMult;
        }
      }

      if (archetype.abilityCooldownMs && time >= ally.nextAbilityTime) {
        this.applyArchetypeAbility(ally, time);
      }
    }

    // clear dead enemies
    const dead = this.enemies.filter(e => e.hp <= 0);
    if (dead.length > 0) {
      Sfx.kill();
      dead.forEach(e => {
        gameState.score += e.species.reward;
        gameState.earnCoins(e.species.reward);
        this.destroyEnemy(e);
      });
      this.enemies = this.enemies.filter(e => e.hp > 0);
    }

    this.updateHud();

    if (gameState.lives <= 0) {
      this.onGameOver();
      return;
    }

    if (this.spawnedCount >= this.waveEnemyCount && this.enemies.length === 0) {
      this.onWaveComplete();
    }
  }

  dealDamage(enemy, amount) {
    enemy.hp = Math.max(0, enemy.hp - amount);
    enemy.hpFill.scaleX = enemy.hp / enemy.maxHp;
    this.showDamageNumber(enemy.x, enemy.y, amount);
  }

  // A floating "-N" that rises and fades - centralized here (rather than at
  // each of dealDamage's callers) so every damage source gets one for free:
  // basic attacks, DoT ticks, splash, chain jumps, and ability effects alike.
  showDamageNumber(x, y, amount) {
    const text = this.add.text(x, y + HP_BAR_Y_OFFSET - 6, `-${amount}`, {
      fontFamily: 'monospace', fontSize: '18px', color: '#fff2c4', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#3a1c00', 3).setDepth(50);
    // Two separate tweens sharing one target rather than one tween animating
    // both properties: a single tween can only take one ease for all its
    // properties, and Cubic.Out on alpha front-loads the fade so the number
    // is nearly invisible within ~150ms of a 550ms tween - unreadable in
    // practice. Rise stays eased the whole time; alpha holds at full then
    // fades only in the back third.
    this.tweens.add({ targets: text, y: text.y - 34, duration: 550, ease: 'Cubic.Out' });
    this.tweens.add({
      targets: text, alpha: 0, delay: 280, duration: 270, ease: 'Linear',
      onComplete: () => text.destroy()
    });
  }

  destroyEnemy(enemy) {
    enemy.sprite.destroy();
    enemy.hpBg.destroy();
    enemy.hpFill.destroy();
  }

  playHitSpark(x, y, tint, scale) {
    const fx = this.add.sprite(x, y, 'hit-spark').setScale(scale || 1.3);
    if (tint !== undefined) fx.setTint(tint);
    fx.play('hit-spark-anim');
    fx.once('animationcomplete', () => fx.destroy());
  }

  // ---------- combat archetypes ----------

  findEnemiesInRange(x, y, rangePx) {
    return this.enemies.filter(e => Phaser.Math.Distance.Between(x, y, e.x, e.y) <= rangePx);
  }

  applyDotToEnemy(enemy, cfg, time) {
    enemy.statusEffects.dot = {
      color: cfg.color, damagePerTick: cfg.damagePerTick,
      ticksRemaining: cfg.ticks, tickIntervalMs: cfg.tickIntervalMs,
      nextTickTime: time + cfg.tickIntervalMs
    };
  }

  applySlowToEnemy(enemy, cfg, time) {
    enemy.statusEffects.slow = { multiplier: cfg.multiplier, expiresAt: time + cfg.durationMs };
  }

  processStatusEffects(enemy, time) {
    const dot = enemy.statusEffects.dot;
    if (dot && time >= dot.nextTickTime) {
      this.dealDamage(enemy, dot.damagePerTick);
      this.playHitSpark(enemy.x, enemy.y, dot.color, 0.75);
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
      const center = this.cellToPixel(source.col, source.row);
      const rangePx = source.species.range * CELL;
      for (const other of this.allies) {
        if (other === source) continue;
        const p = this.cellToPixel(other.col, other.row);
        if (Phaser.Math.Distance.Between(center.x, center.y, p.x, p.y) <= rangePx) {
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
      this.playHitSpark(current.x, current.y, tint);
    }
    hit.add(current);
    for (let i = 0; i < cfg.jumps; i++) {
      const next = this.findEnemiesInRange(current.x, current.y, cfg.jumpRangePx).find(e => !hit.has(e));
      if (!next) break;
      this.dealDamage(next, Math.round(baseDamage * cfg.falloff[i]));
      this.playHitSpark(next.x, next.y, tint);
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
      this.findEnemiesInRange(target.x, target.y, effect.radiusPx)
        .filter(e => e !== target)
        .forEach(e => { this.dealDamage(e, effect.damage); this.playHitSpark(e.x, e.y, tint); });
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

    const center = this.cellToPixel(ally.col, ally.row);
    const rangePx = ally.species.range * CELL;
    const targets = this.findEnemiesInRange(center.x, center.y, rangePx);
    if (targets.length === 0) return; // don't burn the cooldown swinging at nothing

    const cfg = archetype.abilityEffect(ally.attack);
    if (cfg.kind === 'chain') {
      this.applyChain(targets[0], cfg, ally.attack, tint, true);
    } else {
      targets.forEach(e => {
        if (cfg.splashDamage) this.dealDamage(e, cfg.splashDamage);
        if (cfg.dot) this.applyDotToEnemy(e, cfg.dot, time);
        if (cfg.slow) this.applySlowToEnemy(e, cfg.slow, time);
        this.playHitSpark(e.x, e.y, tint);
      });
    }

    ally.nextAbilityTime = time + archetype.abilityCooldownMs;
  }

  onWaveComplete() {
    Sfx.waveClear();
    this.phase = 'waveComplete';
    const essenceReward = 10;
    gameState.earnEssence(essenceReward);
    this.setOverlayVisible(true);
    this.overlayPrimaryBtn.bg.off('pointerdown');

    const stageComplete = gameState.wave >= WAVES_PER_STAGE;

    if (!stageComplete) {
      this.overlayTitle.setText(`Wave ${gameState.wave} Cleared!`);
      this.overlaySub.setText(
        `Score: ${gameState.score}   Lives: ${gameState.lives}/${gameState.maxLives}   +${essenceReward} essence`
      );
      this.overlayPrimaryBtn.text.setText('Next Wave');
      this.overlayPrimaryBtn.bg.once('pointerdown', () => {
        Sfx.click();
        gameState.wave += 1;
        this.phase = 'placement';
        this.setOverlayVisible(false);
        this.refreshStartButton();
      });
      return;
    }

    gameState.onStageCleared();
    const runComplete = gameState.isRunComplete();
    this.overlayTitle.setText(runComplete ? 'RUN COMPLETE!' : `${this.stage.name} Cleared!`);
    this.overlaySub.setText(
      `Stage ${gameState.stageInRun}/${RUN_TARGET_STAGES}   Score: ${gameState.score}   Lives: ${gameState.lives}/${gameState.maxLives}   +${essenceReward} essence`
    );
    this.overlayPrimaryBtn.text.setText(runComplete ? 'Claim Victory' : 'Continue');
    this.overlayPrimaryBtn.bg.once('pointerdown', () => {
      Sfx.click();
      this.setOverlayVisible(false);
      this.scene.start(runComplete ? 'VictoryScene' : 'HubScene');
    });
  }

  onGameOver() {
    Sfx.gameOver();
    this.phase = 'gameOver';
    this.setOverlayVisible(true);
    this.overlayTitle.setText('Base Overrun');
    this.overlaySub.setText(
      `Run ended on stage ${gameState.stageInRun}/${RUN_TARGET_STAGES}, wave ${gameState.wave}   Final Score: ${gameState.score}`
    );
    this.overlayPrimaryBtn.text.setText('Start New Run');
    this.overlayPrimaryBtn.bg.off('pointerdown');
    this.overlayPrimaryBtn.bg.once('pointerdown', () => {
      Sfx.click();
      gameState.runActive = false; // team select treats this as "not mid-run"
      this.scene.start('RosterScene');
    });
  }

  // ---------- helpers ----------

  updateHud() {
    this.hudText.setText(
      `${this.stage.name}   Stage ${gameState.stageInRun}/${RUN_TARGET_STAGES}   Wave ${gameState.wave}/${WAVES_PER_STAGE}   ` +
      `Lives ${gameState.lives}/${gameState.maxLives}   Coins ${gameState.coins}   Score ${gameState.score}   ` +
      `Bench ${this.bench.length}   Placed ${this.allies.length}`
    );
  }

  cellToPixel(col, row) {
    return { x: GRID_X + col * CELL + CELL / 2, y: GRID_Y + row * CELL + CELL / 2 };
  }
}
