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
// A thin gold bar under an ally's HP bar tracking Ultimate charge (see
// archetypes.js) - basic attacks landed, not time, so it fills faster on a
// buffed/fast-attacking tower.
const ULT_BAR_W = HP_BAR_W;
const ULT_BAR_H = 5;
const ULT_BAR_Y_OFFSET = HP_BAR_Y_OFFSET + 11;
const BOSS_BAR_W = HP_BAR_W * 2.2;
// Every 5th wave counting across the whole run (not per-stage - see
// gameState.globalWaveNumber) spawns one boss as the last enemy of that
// wave, on top of the normal spawn count.
const BOSS_WAVE_INTERVAL = 5;
// Enemy sprites are native 16px (regular) / 32px (boss) pixel art (see
// data/monsters.js ENEMY_SPECIES sheetKey/enemyIndex and
// scripts/gen_enemies.py) - one shared scale for both sheets, so a boss's
// bigger native art (not a bigger multiplier) is what makes it read as
// physically bigger on the grid.
const ENEMY_SPRITE_SCALE = 4.5;

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
    // Set (via WorldScene.enterPlot) when this scene is standing in for one
    // claimed plot in the shared multiplayer world rather than a
    // single-player run - see the multiplayerPlotId checks throughout this
    // file for what changes: reporting the grid layout/wave count back to
    // the server so other players' WorldScene can see it, and routing
    // "back"/game-over/wave-complete to WorldScene instead of the
    // single-player Menu/Hub/Roster flow.
    this.multiplayerPlotId = gameState.multiplayerPlotId;
    this.pathWaypoints = this.buildPathWaypoints();
    this.pathBlockedCells = this.buildPathBlockedCells();

    this.grid = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(null));
    this.allies = [];
    this.enemies = [];
    this.selectedBenchSpeciesId = null;
    this.spawnedCount = 0;
    this.waveEnemyCount = 0;
    this.isBossWave = false;
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
    // Reports this plot's (empty, at this point) layout so a rebuild after
    // a game-over visibly clears the old preview for other players instead
    // of leaving their last stand frozen on everyone else's screen.
    if (this.multiplayerPlotId != null) this.reportPlotLayout();
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
    // Ground fills the whole grid; path tiles lay on top only on path cells -
    // both are hand-authored 96x96 seamless textures (see README.md), so
    // there's no visible tiling seam within either surface. Which pair gets
    // used depends on this stage's biome (see data/biomes.js) - defaults to
    // the original grass/dirt pair for stages with no biome set.
    this.biome = getBiome(this.stage.biome);
    this.add.tileSprite(
      GRID_X + (GRID_COLS * CELL) / 2, GRID_Y + (GRID_ROWS * CELL) / 2,
      GRID_COLS * CELL, GRID_ROWS * CELL, this.biome.groundKey
    );
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.isPathCell(c, r)) {
          const { x, y } = this.cellToPixel(c, r);
          this.add.image(x, y, this.biome.pathKey);
        }
      }
    }

    this.drawGroundAccents();
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

    this.drawPathTransition(g);

    g.lineStyle(1, 0xf5f7fa, 0.06);
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

  // A deterministic (not Math.random) pseudo-random 0..1 value per
  // coordinate pair - same inputs always give the same output, so the dirt
  // scatter below looks identical on every reload of the same stage rather
  // than re-rolling and shifting around each time (see drawMapDecorations'
  // "a stage always looks the same on replay" reasoning above).
  seededRandom(x, y, salt) {
    const v = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
    return v - Math.floor(v);
  }

  // Sparse per-biome ground decals (flowers/pebbles/embers/sparkle - see
  // data/biomes.js's groundAccents and gen_assets.py's GROUND_ACCENTS) laid
  // across open ground cells for texture variety beyond the tileSprite's
  // own repeat. Deterministic per-cell (seededRandom, not Math.random) for
  // the same "looks identical on replay" reason as drawPathTransition's
  // dirt flecks below - most cells stay bare so it reads as scattered
  // detail, not a second texture layer.
  drawGroundAccents() {
    const variants = this.biome.groundAccents;
    if (!variants || variants.length === 0) return;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.isPathCell(c, r)) continue;
        if (this.seededRandom(c, r, 601) > 0.16) continue;
        const key = variants[Math.floor(this.seededRandom(c, r, 602) * variants.length) % variants.length];
        const { x, y } = this.cellToPixel(c, r);
        const jitterX = (this.seededRandom(c, r, 603) - 0.5) * CELL * 0.5;
        const jitterY = (this.seededRandom(c, r, 604) - 0.5) * CELL * 0.5;
        const scale = 1.2 + this.seededRandom(c, r, 605) * 0.6;
        const rotation = this.seededRandom(c, r, 606) * Math.PI * 2;
        this.add.image(x + jitterX, y + jitterY, key).setScale(scale).setRotation(rotation);
      }
    }
  }

  // The rim stroke above draws a clean hard edge where path meets grass -
  // reads clearly, but is a flat geometric line with no corner variety (see
  // README "Known limitations"). This scatters a handful of small
  // dirt-colored flecks just past that edge, fading out over a few pixels,
  // for a softer, hand-worn boundary instead of a ruler-straight one -
  // cheap to add without needing real per-corner autotile art.
  drawPathTransition(g) {
    // Biome-specific (see data/biomes.js) - brown dirt flecks scattered onto
    // snow would read as mud, not a natural edge.
    const dirtColors = this.biome.pathFleckColors;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (!this.isPathCell(c, r)) continue;
        const x0 = GRID_X + c * CELL, y0 = GRID_Y + r * CELL;
        const edges = [
          [!this.isPathCell(c, r - 1), 'h', x0, y0],
          [!this.isPathCell(c, r + 1), 'h', x0, y0 + CELL],
          [!this.isPathCell(c - 1, r), 'v', x0, y0],
          [!this.isPathCell(c + 1, r), 'v', x0 + CELL, y0]
        ];
        edges.forEach(([isEdge, axis, ex, ey], edgeIdx) => {
          if (!isEdge) return;
          for (let i = 0; i < 10; i++) {
            const salt = c * 1000 + r * 10 + edgeIdx * 4 + i;
            const along = this.seededRandom(c, r, salt) * CELL;
            const depth = 1 + this.seededRandom(r, c, salt) * 8;
            const size = 4 + Math.floor(this.seededRandom(salt, salt, 1) * 5);
            const px = axis === 'h' ? ex + along : ex + (ex === x0 ? -depth : depth);
            const py = axis === 'h' ? ey + (ey === y0 ? -depth : depth) : ey + along;
            g.fillStyle(dirtColors[i % dirtColors.length], 0.9 - (depth / 9) * 0.5);
            g.fillRect(px - size / 2, py - size / 2, size, size);
          }
        });
      }
    }
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
      { key: 'bush-2', anim: 'bush-2-sway', scale: 0.95 },
      { key: 'tree-3', anim: 'tree-3-sway', scale: 0.8 },
      { key: 'rock-1', anim: null, scale: 1.2 },
      { key: 'tree-4', anim: 'tree-4-sway', scale: 0.8 },
      { key: 'rock-4', anim: null, scale: 1.2 }
    ];
    const rowSpacing = 240;
    const rows = Math.ceil((GRID_ROWS * CELL) / rowSpacing);
    // A biome-specific tint (see data/biomes.js) reskins this same shared
    // tree/bush/rock art per-biome (icy blue-white for snow, sandy tan for
    // desert, etc.) instead of needing new decoration sprites per biome.
    const tint = this.biome.decorTint;
    for (let i = 0; i < rows; i++) {
      const y = GRID_Y + 60 + i * rowSpacing;
      const leftDeco = pattern[i % pattern.length];
      const rightDeco = pattern[(i + 3) % pattern.length];
      const addDeco = (x, deco) => {
        const obj = deco.anim
          ? this.add.sprite(x, y, deco.key).play(deco.anim).setScale(deco.scale)
          : this.add.image(x, y, deco.key).setScale(deco.scale);
        if (tint) obj.setTint(tint);
        return obj;
      };
      addDeco(left, leftDeco);
      addDeco(right, rightDeco);
    }
  }

  buildHud() {
    this.add.image(960, 48, 'panel-hud').setScrollFactor(0);
    this.hudText = this.add.text(30, 32, '', {
      fontFamily: 'monospace', fontSize: '22px', color: '#f5f7fa'
    }).setScrollFactor(0);

    const backLabel = this.multiplayerPlotId != null ? 'World >' : 'Menu >';
    const backTarget = this.multiplayerPlotId != null ? 'WorldScene' : 'MenuScene';
    this.backBtn = UiKit.makeLink(this, this.scale.width - 30, 32, backLabel, () => this.scene.start(backTarget), {
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
      const sprite = UiKit.speciesSprite(this, x, y, species, 76).setScrollFactor(0);
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

    const secondaryLabel = this.multiplayerPlotId != null ? 'Return to World' : 'Return to Menu';
    const secondaryTarget = this.multiplayerPlotId != null ? 'WorldScene' : 'MenuScene';
    this.overlayPrimaryBtn = UiKit.makeButton(this, width / 2, height / 2 + 40, '', () => {}, { size: 'large' });
    this.overlaySecondaryBtn = UiKit.makeButton(this, width / 2, height / 2 + 140, secondaryLabel, () => {
      this.scene.start(secondaryTarget);
    }, { size: 'large' });
    this.overlayPrimaryBtn.container.setDepth(OVERLAY_DEPTH);
    this.overlaySecondaryBtn.container.setDepth(OVERLAY_DEPTH);
    UiKit.pinToScreen(this.overlayPrimaryBtn);
    UiKit.pinToScreen(this.overlaySecondaryBtn);
    this.setOverlayVisible(false);
  }

  setOverlayVisible(visible) {
    // Toggling each button's whole .container (rather than just .bg/.text
    // individually) so it also covers UiKit.makeButton's shadow child - a
    // per-child list here silently missed that shadow when it was added,
    // leaving it visible (at a scroll-panned world position, since it's
    // otherwise pinned to screen space) even while the rest of the overlay
    // was hidden.
    [this.overlayBg, this.overlayPanel, this.overlayTitle, this.overlaySub,
      this.overlayPrimaryBtn.container, this.overlaySecondaryBtn.container].forEach(o => o.setVisible(visible));
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
    const sprite = UiKit.speciesSprite(this, x, y, species, 84).setInteractive({ useHandCursor: true });
    const rangeCircle = this.add.circle(x, y, species.range * CELL, TYPE_COLORS[species.type], 0.05)
      .setStrokeStyle(1, TYPE_COLORS[species.type], 0.25).setDepth(-5);

    const hasUltimate = !!COMBAT_ARCHETYPES[species.type].ultimateChargeHits;
    const ultBarFill = hasUltimate
      ? this.add.rectangle(x - ULT_BAR_W / 2, y + ULT_BAR_Y_OFFSET, ULT_BAR_W, ULT_BAR_H, 0xf5c94b).setOrigin(0, 0.5)
      : null;
    if (ultBarFill) ultBarFill.scaleX = 0; // starts uncharged

    const ally = {
      speciesId: entry.speciesId, species, level: entry.level, col, row,
      attack: effective.attack, hp: effective.maxHp, maxHp: effective.maxHp,
      nextAttackTime: 0, nextAbilityTime: 0, ultimateCharge: 0, buffs: [], sprite, rangeCircle,
      // Matches the idle facing UiKit.speciesSprite starts on, so
      // faceAllyToward's "already facing this way" check is correct on the
      // very first shot instead of always re-playing the anim once.
      facing: 'down', spriteFlipped: false,
      hpBg: this.add.rectangle(x, y + HP_BAR_Y_OFFSET, HP_BAR_W, HP_BAR_H, 0x1c202a),
      hpFill: this.add.rectangle(x - HP_BAR_W / 2, y + HP_BAR_Y_OFFSET, HP_BAR_W, HP_BAR_H, 0x4caf50).setOrigin(0, 0.5),
      ultBarBg: hasUltimate ? this.add.rectangle(x, y + ULT_BAR_Y_OFFSET, ULT_BAR_W, ULT_BAR_H, 0x1c202a) : null,
      ultBarFill
    };
    sprite.on('pointerdown', () => this.onCellClicked(col, row));

    this.grid[row][col] = ally;
    this.allies.push(ally);
    this.updateHud();
    if (this.multiplayerPlotId != null) this.reportPlotLayout();
  }

  removeAllyFromGrid(ally) {
    Sfx.pickup();
    this.grid[ally.row][ally.col] = null;
    this.allies = this.allies.filter(a => a !== ally);
    ally.sprite.destroy();
    ally.rangeCircle.destroy();
    ally.hpBg.destroy();
    ally.hpFill.destroy();
    if (ally.ultBarBg) ally.ultBarBg.destroy();
    if (ally.ultBarFill) ally.ultBarFill.destroy();
    gameState.earnCoins(Math.floor(ally.species.cost * 0.5));
    this.bench.push(gameState.roster[ally.speciesId]);
    this.layoutBench();
    this.refreshStartButton();
    this.updateHud();
    if (this.multiplayerPlotId != null) this.reportPlotLayout();
  }

  // Sends "here's what my grid looks like" to the shared-world server (see
  // server/server.js) so every other connected player's WorldScene can draw
  // a live mini-preview of this plot without needing this scene/tab to be
  // running at all, AND so the server has real squad data to hand a raider
  // for a Squad Skirmish (see server.js's 'raid' handler) - it's a snapshot
  // of occupied cells and each one's species/level, not a live simulation
  // feed. Sending the full layout also clears any prior faintedUntil raid
  // markers server-side (a fresh placement means you've reinforced/rebuilt,
  // which is the intended way to shake off raid damage).
  // Best-effort - single-player never requires the multiplayer server (see
  // README), so this tries to connect only when there's a score worth
  // reporting, and silently gives up if nothing answers (opening
  // index.html directly, or a static-only file server with no /ws). A
  // multiplayer plot is already connected by the time this can run, so
  // that path just resolves immediately and sends.
  submitScoreBestEffort(payload) {
    NetClient.connect().then(() => NetClient.send('submitScore', payload)).catch(() => {});
  }

  reportPlotLayout() {
    const layout = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const ally = this.grid[r][c];
        if (ally) layout.push({ col: c, row: r, speciesId: ally.speciesId, level: ally.level });
      }
    }
    NetClient.send('plotLayout', { plotId: this.multiplayerPlotId, layout });
  }

  refreshStartButton() {
    const ready = this.phase === 'placement' && this.allies.length > 0;
    // .container, not .bg/.text individually - a per-child list here would
    // silently miss UiKit.makeButton's shadow child, leaving it visible
    // even once the rest of the button is hidden (see setOverlayVisible's
    // identical fix above).
    this.startWaveBtn.container.setVisible(this.phase === 'placement');
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
    this.isBossWave = gameState.globalWaveNumber() % BOSS_WAVE_INTERVAL === 0;
    // The boss spawns as one extra enemy on top of the normal count, and
    // last (see spawnEnemy) - the wave still opens with its regular ramp so
    // the boss reads as a capstone, not just "wave got bigger again".
    if (this.isBossWave) this.waveEnemyCount += 1;
    this.spawnTimerMs = 0;
    this.refreshStartButton();
    if (this.isBossWave) this.announceBoss();
  }

  announceBoss() {
    const banner = this.add.text(this.scale.width / 2, 200, 'BOSS INCOMING', {
      fontFamily: 'monospace', fontSize: '48px', color: '#e0562f', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 6).setScrollFactor(0).setDepth(60);
    this.tweens.add({ targets: banner, alpha: 0, delay: 1800, duration: 600, onComplete: () => banner.destroy() });
  }

  spawnEnemy() {
    // The boss slot (see startWave/BOSS_WAVE_INTERVAL) is always the last
    // enemy of a boss wave, picked at random among every boss:true species
    // (see BOSS_ENEMY_SPECIES) so it's not the same fight every 5th wave;
    // every other spawn - boss wave or not - rolls from the normal
    // spawnable pool (excludes split/summon-only and boss-only entries,
    // see SPAWNABLE_ENEMY_SPECIES).
    const isBossSpawn = this.isBossWave && this.spawnedCount === this.waveEnemyCount - 1;
    const es = isBossSpawn ? BOSS_ENEMY_SPECIES[Math.floor(Math.random() * BOSS_ENEMY_SPECIES.length)]
      : SPAWNABLE_ENEMY_SPECIES[Math.floor(Math.random() * SPAWNABLE_ENEMY_SPECIES.length)];
    this.spawnEnemyOfSpecies(es, this.pathWaypoints[0], 0, 0);
  }

  // Shared by spawnEnemy (fresh spawns at the map entrance) and
  // spawnSplitChildren (split-species children continuing from wherever
  // their parent died) - everything about building one enemy game object
  // lives here so both paths stay in sync.
  spawnEnemyOfSpecies(es, pos, waypointIndex, progress) {
    const barW = es.boss ? BOSS_BAR_W : HP_BAR_W;
    const sprite = this.add.sprite(pos.x, pos.y, es.sheetKey).setScale(ENEMY_SPRITE_SCALE);
    sprite.play(enemyAnimKey(es.sheetKey, es.enemyIndex, 'down'));
    const enemy = {
      species: es, x: pos.x, y: pos.y, waypointIndex, progress, facing: 'down',
      hp: es.maxHp, maxHp: es.maxHp, statusEffects: {}, barW,
      sprite,
      hpBg: this.add.rectangle(pos.x, pos.y + HP_BAR_Y_OFFSET, barW, HP_BAR_H, 0x1c202a),
      hpFill: this.add.rectangle(pos.x - barW / 2, pos.y + HP_BAR_Y_OFFSET, barW, HP_BAR_H, 0xe0562f).setOrigin(0, 0.5)
    };
    if (es.boss) {
      enemy.nameLabel = this.add.text(pos.x, pos.y + HP_BAR_Y_OFFSET - 16, es.name.toUpperCase(), {
        fontFamily: 'monospace', fontSize: '14px', color: '#e0562f', fontStyle: 'bold'
      }).setOrigin(0.5).setStroke('#1c2530', 3);
    }
    this.enemies.push(enemy);
    return enemy;
  }

  // On-death effect for splitInto/splitCount species (see monsters.js) -
  // spawns the weaker child species picking up the parent's exact path
  // position/progress rather than restarting from the map entrance.
  spawnSplitChildren(parent) {
    const childId = parent.species.splitInto;
    const count = parent.species.splitCount || 0;
    if (!childId || count <= 0) return;
    const childSpecies = getEnemySpecies(childId);
    for (let i = 0; i < count; i++) {
      const offsetX = (i - (count - 1) / 2) * 18;
      this.spawnEnemyOfSpecies(
        childSpecies, { x: parent.x + offsetX, y: parent.y }, parent.waypointIndex, parent.progress
      );
    }
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
      this.processRegen(enemy, delta);
      this.processSummon(enemy, time);
    }

    // enemy movement along the path
    const escaped = [];
    for (const enemy of this.enemies) {
      const target = this.pathWaypoints[enemy.waypointIndex + 1];
      if (!target) { escaped.push(enemy); continue; }

      const dx = target.x - enemy.x, dy = target.y - enemy.y;
      const dist = Math.hypot(dx, dy);
      const step = enemy.species.speed * this.enemySpeedMultiplier(enemy) * (delta / 1000);

      // Every path segment is axis-aligned (see data/stages.js), so exactly
      // one of dx/dy is ever non-zero mid-segment - this just picks which -
      // only switches the anim on an actual direction change, not every
      // frame, so a walk cycle already in the middle of its 2-frame loop
      // doesn't stutter back to frame 0 each tick.
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left')
        : dy !== 0 ? (dy > 0 ? 'down' : 'up') : enemy.facing;
      if (dir !== enemy.facing) {
        enemy.facing = dir;
        enemy.sprite.play(enemyAnimKey(enemy.species.sheetKey, enemy.species.enemyIndex, dir));
      }

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
      enemy.hpFill.x = enemy.x - enemy.barW / 2; enemy.hpFill.y = enemy.y + HP_BAR_Y_OFFSET;
      if (enemy.nameLabel) { enemy.nameLabel.x = enemy.x; enemy.nameLabel.y = enemy.y + HP_BAR_Y_OFFSET - 16; }
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
          this.faceAllyToward(ally, target.x - center.x, target.y - center.y);
          this.dealDamage(target, ally.attack);
          Sfx.hit();
          this.playHitSpark(target.x, target.y, TYPE_COLORS[ally.species.type]);
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

    // clear dead enemies
    const dead = this.enemies.filter(e => e.hp <= 0);
    if (dead.length > 0) {
      Sfx.kill();
      dead.forEach(e => {
        gameState.score += e.species.reward;
        gameState.earnCoins(e.species.reward);
        this.playDeathBurst(e.x, e.y, TYPE_COLORS[e.species.type]);
        this.spawnSplitChildren(e);
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
    // Armor is a flat reduction (min 1 damage still gets through, so it
    // slows a tower down rather than hard-walling it) - see monsters.js.
    // The floating number shows what actually landed, armor included, so
    // it visibly reads as "this hit for less" against an armored target.
    const armor = enemy.species.armor || 0;
    const finalAmount = armor > 0 ? Math.max(1, amount - armor) : amount;
    enemy.hp = Math.max(0, enemy.hp - finalAmount);
    enemy.hpFill.scaleX = enemy.hp / enemy.maxHp;
    this.showDamageNumber(enemy.x, enemy.y, finalAmount);
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
    if (enemy.nameLabel) enemy.nameLabel.destroy();
  }

  // Turns a placed tower to face whatever it's shooting. The tower sheet
  // only carries down/up/side facings (see TOWER_DIRECTIONS), so a left
  // target is the side art flipped horizontally rather than its own row.
  // No-ops for a species with no towerIndex, which has no anims at all and
  // renders as a single static frame (see UiKit.speciesSprite).
  faceAllyToward(ally, dx, dy) {
    if (ally.species.towerIndex == null) return;
    const dir = Math.abs(dx) > Math.abs(dy) ? 'side' : (dy > 0 ? 'down' : 'up');
    const flip = dir === 'side' && dx < 0;
    if (dir === ally.facing && flip === ally.spriteFlipped) return;
    ally.facing = dir;
    ally.spriteFlipped = flip;
    ally.sprite.setFlipX(flip);
    ally.sprite.play(towerAnimKey(ally.species.sheetKey, ally.species.towerIndex, dir));
  }

  playHitSpark(x, y, tint, scale) {
    const fx = this.add.sprite(x, y, 'hit-spark').setScale(scale || 1.3);
    if (tint !== undefined) fx.setTint(tint);
    fx.play('hit-spark-anim');
    fx.once('animationcomplete', () => fx.destroy());
  }

  // A bigger expanding-puff burst on enemy death, tinted by the killed
  // enemy's type (same TYPE_COLORS convention as playHitSpark) so it reads
  // as "that thing just died" rather than reusing the small attack flash.
  playDeathBurst(x, y, tint) {
    const fx = this.add.sprite(x, y, 'death-burst').setScale(1.6).setDepth(45);
    if (tint !== undefined) fx.setTint(tint);
    fx.play('death-burst-anim');
    fx.once('animationcomplete', () => fx.destroy());
  }

  // A large nova-ring burst played once at an ally's own tile when its
  // ultimate fires - a bigger, distinct flourish for the rarer event,
  // instead of just scaling up the regular attack-impact hit-spark.
  playUltimateBurst(x, y, tint) {
    const fx = this.add.sprite(x, y, 'ultimate-burst').setScale(2.2).setDepth(45);
    if (tint !== undefined) fx.setTint(tint);
    fx.play('ultimate-burst-anim');
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
    if (enemy.species.slowImmune) return; // e.g. the boss - see monsters.js
    enemy.statusEffects.slow = { multiplier: cfg.multiplier, expiresAt: time + cfg.durationMs };
  }

  processRegen(enemy, delta) {
    const regen = enemy.species.regenPerSecond || 0;
    if (regen <= 0 || enemy.hp <= 0) return;
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + regen * (delta / 1000));
    enemy.hpFill.scaleX = enemy.hp / enemy.maxHp;
  }

  // Trickles reinforcements on an interval for as long the source is alive
  // (see monsters.js summonIntervalMs) - unlike spawnSplitChildren, this
  // isn't a one-time burst on death, so the wave can't end just from
  // clearing the source itself while its adds are still up.
  processSummon(enemy, time) {
    const interval = enemy.species.summonIntervalMs;
    if (!interval || enemy.hp <= 0) return;
    if (enemy.nextSummonTime == null) enemy.nextSummonTime = time + interval;
    if (time < enemy.nextSummonTime) return;

    enemy.nextSummonTime = time + interval;
    const childSpecies = getEnemySpecies(enemy.species.summonSpeciesId);
    const count = enemy.species.summonCount || 1;
    for (let i = 0; i < count; i++) {
      const offsetX = (i - (count - 1) / 2) * 18;
      this.spawnEnemyOfSpecies(
        childSpecies, { x: enemy.x + offsetX, y: enemy.y }, enemy.waypointIndex, enemy.progress
      );
    }
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

  // Charge-gated, not cooldown-gated (see archetypes.js) - every basic hit
  // that actually lands advances it, so an ally's own attack speed controls
  // how often its Ultimate fires. Types without one (none currently, but
  // COMBAT_ARCHETYPES doesn't guarantee every future type will) just no-op.
  chargeUltimate(ally, time) {
    const archetype = COMBAT_ARCHETYPES[ally.species.type];
    if (!archetype.ultimateChargeHits) return;

    ally.ultimateCharge++;
    if (ally.ultBarFill) ally.ultBarFill.scaleX = Math.min(1, ally.ultimateCharge / archetype.ultimateChargeHits);

    if (ally.ultimateCharge >= archetype.ultimateChargeHits) {
      this.applyArchetypeUltimate(ally, time);
      ally.ultimateCharge = 0;
      if (ally.ultBarFill) ally.ultBarFill.scaleX = 0;
    }
  }

  applyArchetypeUltimate(ally, time) {
    const archetype = COMBAT_ARCHETYPES[ally.species.type];
    const tint = TYPE_COLORS[ally.species.type];

    if (archetype.ultimateKind === 'team-buff') {
      const cfg = archetype.ultimateEffect();
      this.allies.forEach(a => this.addBuff(a, 'ultimate', cfg.attackSpeedMultiplier, time + cfg.durationMs));
      this.announceUltimate(ally, archetype.ultimateLabel);
      this.playUltimateBurst(ally.sprite.x, ally.sprite.y, tint);
      return;
    }

    const center = this.cellToPixel(ally.col, ally.row);
    const rangePx = ally.species.range * CELL * (archetype.ultimateRangeMultiplier || 1.5);
    const targets = this.findEnemiesInRange(center.x, center.y, rangePx);
    if (targets.length === 0) return; // don't burn a rare charge swinging at nothing

    this.announceUltimate(ally, archetype.ultimateLabel);
    this.playUltimateBurst(ally.sprite.x, ally.sprite.y, tint);
    const cfg = archetype.ultimateEffect(ally.attack);
    if (cfg.kind === 'chain') {
      this.applyChain(targets[0], cfg, ally.attack, tint, true);
    } else {
      targets.forEach(e => {
        if (cfg.splashDamage) this.dealDamage(e, cfg.splashDamage);
        if (cfg.dot) this.applyDotToEnemy(e, cfg.dot, time);
        if (cfg.slow) this.applySlowToEnemy(e, cfg.slow, time);
        this.playHitSpark(e.x, e.y, tint, 1.8);
      });
    }
  }

  announceUltimate(ally, label) {
    const text = this.add.text(ally.sprite.x, ally.sprite.y - 60, label.toUpperCase() + '!', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 4).setDepth(55);
    this.tweens.add({ targets: text, y: text.y - 40, duration: 700, ease: 'Cubic.Out' });
    this.tweens.add({ targets: text, alpha: 0, delay: 400, duration: 300, ease: 'Linear', onComplete: () => text.destroy() });
  }

  onWaveComplete() {
    Sfx.waveClear();
    this.phase = 'waveComplete';
    const essenceReward = this.isBossWave ? 25 : 10;
    gameState.earnEssence(essenceReward);
    this.setOverlayVisible(true);
    this.overlayPrimaryBtn.bg.off('pointerdown');

    // A claimed plot is a persistent base, not a run through a fixed set of
    // stages - there's no stage-complete/Hub/Victory concept for it, it just
    // loops waves forever. Branch out before any of that single-player
    // stage-progress logic runs.
    if (this.multiplayerPlotId != null) {
      NetClient.send('waveResult', { plotId: this.multiplayerPlotId, wave: gameState.wave });
      this.submitScoreBestEffort({ score: gameState.score, stageReached: 0, wave: gameState.wave, mode: 'plot', outcome: 'ended' });
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
    let masteryLine = '';
    if (runComplete) {
      const masteryEarned = gameState.masteryForRunEnd();
      gameState.awardMastery(masteryEarned);
      gameState.lastMasteryEarned = masteryEarned; // read once by VictoryScene
      masteryLine = `   +${masteryEarned} Mastery`;
      this.submitScoreBestEffort({
        score: gameState.score, stageReached: gameState.stageInRun, wave: gameState.wave,
        mode: 'run', outcome: 'victory'
      });
    }
    this.overlayTitle.setText(runComplete ? 'RUN COMPLETE!' : `${this.stage.name} Cleared!`);
    this.overlaySub.setText(
      `Stage ${gameState.stageInRun}/${RUN_TARGET_STAGES}   Score: ${gameState.score}   Lives: ${gameState.lives}/${gameState.maxLives}   +${essenceReward} essence${masteryLine}`
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
    this.overlayPrimaryBtn.bg.off('pointerdown');

    if (this.multiplayerPlotId != null) {
      this.submitScoreBestEffort({ score: gameState.score, stageReached: 0, wave: gameState.wave, mode: 'plot', outcome: 'ended' });
      this.overlaySub.setText(`Your base fell on wave ${gameState.wave}   Final Score: ${gameState.score}`);
      this.overlayPrimaryBtn.text.setText('Rebuild Base');
      this.overlayPrimaryBtn.bg.once('pointerdown', () => {
        Sfx.click();
        gameState.resetRun();
        gameState.startStage(FIRST_STAGE_ID);
        this.scene.restart();
      });
      return;
    }

    const masteryEarned = gameState.masteryForRunEnd();
    gameState.awardMastery(masteryEarned);
    this.submitScoreBestEffort({
      score: gameState.score, stageReached: gameState.stageInRun, wave: gameState.wave,
      mode: 'run', outcome: 'ended'
    });
    this.overlaySub.setText(
      `Run ended on stage ${gameState.stageInRun}/${RUN_TARGET_STAGES}, wave ${gameState.wave}   ` +
      `Final Score: ${gameState.score}   +${masteryEarned} Mastery`
    );
    this.overlayPrimaryBtn.text.setText('Start New Run');
    this.overlayPrimaryBtn.bg.once('pointerdown', () => {
      Sfx.click();
      gameState.runActive = false; // team select treats this as "not mid-run"
      this.scene.start('RosterScene');
    });
  }

  // ---------- helpers ----------

  updateHud() {
    const header = this.multiplayerPlotId != null
      ? `Your Base (Plot ${this.multiplayerPlotId + 1})   Wave ${gameState.wave}   `
      : `${this.stage.name}   Stage ${gameState.stageInRun}/${RUN_TARGET_STAGES}   Wave ${gameState.wave}/${WAVES_PER_STAGE}   `;
    this.hudText.setText(
      header +
      `Lives ${gameState.lives}/${gameState.maxLives}   Coins ${gameState.coins}   Score ${gameState.score}   ` +
      `Bench ${this.bench.length}   Placed ${this.allies.length}`
    );
  }

  cellToPixel(col, row) {
    return { x: GRID_X + col * CELL + CELL / 2, y: GRID_Y + row * CELL + CELL / 2 };
  }
}
