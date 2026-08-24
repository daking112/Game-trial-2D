const GRID_COLS = 10;
const GRID_ROWS = 6;
const CELL = 64;
const GRID_X = 160;
const GRID_Y = 130;

class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  create() {
    gameState.resetBattle();

    this.phase = 'placement'; // 'placement' | 'wave' | 'waveComplete' | 'gameOver'
    this.grid = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(null));
    this.allies = [];
    this.enemies = [];
    this.selectedBenchUid = null;
    this.spawnedCount = 0;
    this.waveEnemyCount = 0;
    this.spawnTimerMs = 0;
    this.spawnIntervalMs = 700;

    this.bench = gameState.team
      .map(uid => gameState.roster.find(m => m.uid === uid))
      .filter(Boolean);

    this.drawGrid();
    this.buildHud();
    this.buildBench();
    this.buildOverlay();

    this.updateHud();
    this.refreshStartButton();
  }

  // ---------- setup ----------

  drawGrid() {
    const g = this.add.graphics();
    g.lineStyle(1, 0x2a3040, 1);
    for (let c = 0; c <= GRID_COLS; c++) {
      g.lineBetween(GRID_X + c * CELL, GRID_Y, GRID_X + c * CELL, GRID_Y + GRID_ROWS * CELL);
    }
    for (let r = 0; r <= GRID_ROWS; r++) {
      g.lineBetween(GRID_X, GRID_Y + r * CELL, GRID_X + GRID_COLS * CELL, GRID_Y + r * CELL);
    }

    // Base edge (left) and spawn edge (right) markers.
    g.lineStyle(4, 0x4caf50, 1);
    g.lineBetween(GRID_X, GRID_Y, GRID_X, GRID_Y + GRID_ROWS * CELL);
    g.lineStyle(4, 0xe0562f, 0.6);
    g.lineBetween(GRID_X + GRID_COLS * CELL, GRID_Y, GRID_X + GRID_COLS * CELL, GRID_Y + GRID_ROWS * CELL);

    this.cellZones = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      const rowZones = [];
      for (let c = 0; c < GRID_COLS; c++) {
        const { x, y } = this.cellToPixel(c, r);
        const zone = this.add.zone(x, y, CELL - 4, CELL - 4).setInteractive();
        zone.on('pointerdown', () => this.onCellClicked(c, r));
        rowZones.push(zone);
      }
      this.cellZones.push(rowZones);
    }
  }

  buildHud() {
    this.hudText = this.add.text(20, 20, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#f5f7fa'
    });

    this.backBtn = this.add.text(this.scale.width - 20, 20, 'Menu >', {
      fontFamily: 'monospace', fontSize: '16px', color: '#9aa4b8'
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    this.backBtn.on('pointerdown', () => this.scene.start('MenuScene'));
    this.backBtn.on('pointerover', () => this.backBtn.setColor('#f5f7fa'));
    this.backBtn.on('pointerout', () => this.backBtn.setColor('#9aa4b8'));

    this.startWaveBtn = this.makeButton(this.scale.width / 2, 88, 'Start Wave', () => {
      if (this.phase === 'placement' && this.allies.length > 0) this.startWave();
    });
  }

  buildBench() {
    this.benchLabel = this.add.text(20, 530, 'Bench (click, then click an empty grid cell):', {
      fontFamily: 'monospace', fontSize: '13px', color: '#9aa4b8'
    });
    this.benchIcons = [];
    this.layoutBench();
  }

  layoutBench() {
    this.benchIcons.forEach(i => { i.bg.destroy(); i.sprite.destroy(); });
    this.benchIcons = [];

    const startX = 60, y = 585, spacing = 60;
    this.bench.forEach((entry, i) => {
      const species = getSpecies(entry.speciesId);
      const x = startX + i * spacing;
      const bg = this.add.rectangle(x, y, 52, 52, 0x2a3040).setStrokeStyle(2, 0x4a5468);
      const sprite = this.add.sprite(x, y, species.sheetKey, species.frame).setScale(0.9);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.onBenchClicked(entry.uid));
      const icon = { bg, sprite, uid: entry.uid };
      this.benchIcons.push(icon);
      this.refreshBenchIcon(icon);
    });
  }

  refreshBenchIcon(icon) {
    const selected = this.selectedBenchUid === icon.uid;
    icon.bg.setStrokeStyle(2, selected ? 0xf5c94b : 0x4a5468);
  }

  buildOverlay() {
    const { width, height } = this.scale;
    this.overlayBg = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7).setVisible(false);
    this.overlayTitle = this.add.text(width / 2, height / 2 - 60, '', {
      fontFamily: 'monospace', fontSize: '30px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setVisible(false);
    this.overlaySub = this.add.text(width / 2, height / 2 - 10, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#c8ceda'
    }).setOrigin(0.5).setVisible(false);

    this.overlayPrimaryBtn = this.makeButton(width / 2, height / 2 + 50, '', () => {});
    this.overlaySecondaryBtn = this.makeButton(width / 2, height / 2 + 115, 'Return to Menu', () => {
      gameState.resetBattle();
      this.scene.start('MenuScene');
    });
    this.setOverlayVisible(false);
  }

  setOverlayVisible(visible) {
    [this.overlayBg, this.overlayTitle, this.overlaySub,
      this.overlayPrimaryBtn.bg, this.overlayPrimaryBtn.text,
      this.overlaySecondaryBtn.bg, this.overlaySecondaryBtn.text].forEach(o => o.setVisible(visible));
  }

  // ---------- placement ----------

  onBenchClicked(uid) {
    if (this.phase !== 'placement') return;
    this.selectedBenchUid = (this.selectedBenchUid === uid) ? null : uid;
    this.benchIcons.forEach(i => this.refreshBenchIcon(i));
  }

  onCellClicked(col, row) {
    if (this.phase !== 'placement') return;
    const occupant = this.grid[row][col];

    if (occupant) {
      // Pick the ally back up onto the bench.
      this.removeAllyFromGrid(occupant);
      return;
    }

    if (this.selectedBenchUid) {
      const entryIdx = this.bench.findIndex(m => m.uid === this.selectedBenchUid);
      if (entryIdx === -1) return;
      const entry = this.bench[entryIdx];
      this.bench.splice(entryIdx, 1);
      this.placeAlly(entry, col, row);
      this.selectedBenchUid = null;
      this.layoutBench();
      this.refreshStartButton();
    }
  }

  placeAlly(entry, col, row) {
    const species = getSpecies(entry.speciesId);
    const { x, y } = this.cellToPixel(col, row);
    const sprite = this.add.sprite(x, y, species.sheetKey, species.frame).setScale(1.0).setInteractive({ useHandCursor: true });

    const ally = {
      uid: entry.uid, species, col, row,
      hp: species.maxHp, maxHp: species.maxHp,
      nextAttackTime: 0, sprite,
      hpBg: this.add.rectangle(x, y - 26, 40, 5, 0x1c202a),
      hpFill: this.add.rectangle(x - 20, y - 26, 40, 5, 0x4caf50).setOrigin(0, 0.5)
    };
    sprite.on('pointerdown', () => this.onCellClicked(col, row));

    this.grid[row][col] = ally;
    this.allies.push(ally);
    this.updateHud();
  }

  removeAllyFromGrid(ally) {
    this.grid[ally.row][ally.col] = null;
    this.allies = this.allies.filter(a => a !== ally);
    ally.sprite.destroy();
    ally.hpBg.destroy();
    ally.hpFill.destroy();
    this.bench.push({ uid: ally.uid, speciesId: ally.species.id });
    this.layoutBench();
    this.refreshStartButton();
    this.updateHud();
  }

  refreshStartButton() {
    const ready = this.phase === 'placement' && this.allies.length > 0;
    this.startWaveBtn.bg.setVisible(this.phase === 'placement');
    this.startWaveBtn.text.setVisible(this.phase === 'placement');
    this.startWaveBtn.bg.setFillStyle(ready ? 0x2a3040 : 0x1c202a);
    this.startWaveBtn.text.setColor(ready ? '#f5f7fa' : '#5a6478');
  }

  // ---------- wave logic ----------

  startWave() {
    this.phase = 'wave';
    this.spawnedCount = 0;
    this.waveEnemyCount = Math.min(4 + (gameState.wave - 1) * 2, 24);
    this.spawnTimerMs = 0;
    this.refreshStartButton();
  }

  spawnEnemy() {
    const es = ENEMY_SPECIES[Math.floor(Math.random() * ENEMY_SPECIES.length)];
    const row = Math.floor(Math.random() * GRID_ROWS);
    const { y } = this.cellToPixel(0, row);
    const x = GRID_X + GRID_COLS * CELL + 20;

    const sprite = this.add.sprite(x, y, es.sheetKey, es.frame).setScale(1.0);
    const enemy = {
      species: es, x, y, row,
      hp: es.maxHp, maxHp: es.maxHp,
      sprite,
      hpBg: this.add.rectangle(x, y - 26, 40, 5, 0x1c202a),
      hpFill: this.add.rectangle(x - 20, y - 26, 40, 5, 0xe0562f).setOrigin(0, 0.5)
    };
    this.enemies.push(enemy);
  }

  update(time, delta) {
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

    // enemy movement
    for (const enemy of this.enemies) {
      enemy.x -= enemy.species.speed * (delta / 1000);
      enemy.sprite.x = enemy.x;
      enemy.hpBg.x = enemy.x;
      enemy.hpFill.x = enemy.x - 20;
    }

    // enemies reaching the base
    const reachedBase = this.enemies.filter(e => e.x < GRID_X);
    if (reachedBase.length > 0) {
      reachedBase.forEach(e => {
        gameState.baseHp = Math.max(0, gameState.baseHp - e.species.attack);
        this.destroyEnemy(e);
      });
      this.enemies = this.enemies.filter(e => !reachedBase.includes(e));
    }

    // ally attacks
    for (const ally of this.allies) {
      if (time < ally.nextAttackTime) continue;
      const center = this.cellToPixel(ally.col, ally.row);
      const rangePx = ally.species.range * CELL;
      let target = null;
      let bestDist = Infinity;
      for (const enemy of this.enemies) {
        const d = Phaser.Math.Distance.Between(center.x, center.y, enemy.x, enemy.y);
        if (d <= rangePx && d < bestDist) { bestDist = d; target = enemy; }
      }
      if (target) {
        this.dealDamage(target, ally.species.attack);
        this.playHitSpark(target.x, target.y);
        ally.nextAttackTime = time + ally.species.attackIntervalMs;
      }
    }

    // clear dead enemies
    const dead = this.enemies.filter(e => e.hp <= 0);
    if (dead.length > 0) {
      dead.forEach(e => {
        gameState.score += e.species.reward;
        this.destroyEnemy(e);
      });
      this.enemies = this.enemies.filter(e => e.hp > 0);
    }

    this.updateHud();

    if (gameState.baseHp <= 0) {
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
  }

  destroyEnemy(enemy) {
    enemy.sprite.destroy();
    enemy.hpBg.destroy();
    enemy.hpFill.destroy();
  }

  playHitSpark(x, y) {
    const fx = this.add.sprite(x, y, 'hit-spark').setScale(0.9);
    fx.play('hit-spark-anim');
    fx.once('animationcomplete', () => fx.destroy());
  }

  onWaveComplete() {
    this.phase = 'waveComplete';
    this.setOverlayVisible(true);
    this.overlayTitle.setText(`Wave ${gameState.wave} Cleared!`);
    this.overlaySub.setText(`Score: ${gameState.score}   Base HP: ${gameState.baseHp}/${gameState.maxBaseHp}`);
    this.overlayPrimaryBtn.text.setText('Next Wave');
    this.overlayPrimaryBtn.bg.off('pointerdown');
    this.overlayPrimaryBtn.bg.once('pointerdown', () => {
      gameState.wave += 1;
      this.phase = 'placement';
      this.setOverlayVisible(false);
      this.refreshStartButton();
    });
  }

  onGameOver() {
    this.phase = 'gameOver';
    this.setOverlayVisible(true);
    this.overlayTitle.setText('Base Destroyed');
    this.overlaySub.setText(`You survived to wave ${gameState.wave}   Final Score: ${gameState.score}`);
    this.overlayPrimaryBtn.text.setText('Try Again');
    this.overlayPrimaryBtn.bg.off('pointerdown');
    this.overlayPrimaryBtn.bg.once('pointerdown', () => this.scene.restart());
  }

  // ---------- helpers ----------

  updateHud() {
    this.hudText.setText(
      `Wave ${gameState.wave}   Base HP ${gameState.baseHp}/${gameState.maxBaseHp}   Score ${gameState.score}   ` +
      `Bench ${this.bench.length}   Placed ${this.allies.length}`
    );
  }

  cellToPixel(col, row) {
    return { x: GRID_X + col * CELL + CELL / 2, y: GRID_Y + row * CELL + CELL / 2 };
  }

  makeButton(x, y, label, onClick) {
    const w = 200, h = 44;
    const bg = this.add.rectangle(x, y, w, h, 0x2a3040).setStrokeStyle(2, 0x4a5468);
    const text = this.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: '15px', color: '#f5f7fa'
    }).setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x394258));
    bg.on('pointerout', () => bg.setFillStyle(0x2a3040));
    bg.on('pointerdown', onClick);

    return { bg, text };
  }
}
