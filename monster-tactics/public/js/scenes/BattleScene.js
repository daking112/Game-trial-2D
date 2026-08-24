const GRID_COLS = 10;
const GRID_ROWS = 6;
const CELL = 64;
const GRID_X = 160;
const GRID_Y = 130;

// Waypoints the enemy path bends through, in grid cells. Enemies spawn off
// the right edge, follow these in order, then exit off the left edge and
// damage the base. Cells the path crosses are blocked for tower placement.
const PATH_CELLS = [
  { col: 9, row: 1 },
  { col: 6, row: 1 },
  { col: 6, row: 4 },
  { col: 3, row: 4 },
  { col: 3, row: 1 },
  { col: 0, row: 1 }
];

class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  create() {
    gameState.resetBattle();

    this.phase = 'placement'; // 'placement' | 'wave' | 'waveComplete' | 'gameOver'
    this.pathWaypoints = this.buildPathWaypoints();
    this.pathBlockedCells = this.buildPathBlockedCells();

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

  // ---------- path ----------

  buildPathWaypoints() {
    const entry = this.cellToPixel(PATH_CELLS[0].col, PATH_CELLS[0].row);
    const exit = this.cellToPixel(PATH_CELLS[PATH_CELLS.length - 1].col, PATH_CELLS[PATH_CELLS.length - 1].row);
    const spawn = { x: GRID_X + GRID_COLS * CELL + 30, y: entry.y };
    const base = { x: GRID_X - 30, y: exit.y };
    const onGrid = PATH_CELLS.map(c => this.cellToPixel(c.col, c.row));
    return [spawn, ...onGrid, base];
  }

  buildPathBlockedCells() {
    const blocked = new Set();
    const mark = (c, r) => blocked.add(r + ',' + c);
    for (let i = 0; i < PATH_CELLS.length - 1; i++) {
      const a = PATH_CELLS[i], b = PATH_CELLS[i + 1];
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
    const g = this.add.graphics();

    // Road surface first, so grid lines still show through it.
    g.fillStyle(0x3a3020, 1);
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (this.isPathCell(c, r)) {
          g.fillRect(GRID_X + c * CELL, GRID_Y + r * CELL, CELL, CELL);
        }
      }
    }

    g.lineStyle(1, 0x2a3040, 1);
    for (let c = 0; c <= GRID_COLS; c++) {
      g.lineBetween(GRID_X + c * CELL, GRID_Y, GRID_X + c * CELL, GRID_Y + GRID_ROWS * CELL);
    }
    for (let r = 0; r <= GRID_ROWS; r++) {
      g.lineBetween(GRID_X, GRID_Y + r * CELL, GRID_X + GRID_COLS * CELL, GRID_Y + r * CELL);
    }

    // Spawn edge and base edge markers.
    const entryRow = PATH_CELLS[0].row;
    const exitRow = PATH_CELLS[PATH_CELLS.length - 1].row;
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
    this.benchLabel = this.add.text(20, 490, 'Bench (click, then click an empty non-path cell):', {
      fontFamily: 'monospace', fontSize: '13px', color: '#9aa4b8'
    });
    this.benchCostLabel = this.add.text(20, 508, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#f5c94b'
    });
    this.benchIcons = [];
    this.layoutBench();
  }

  layoutBench() {
    this.benchIcons.forEach(i => { i.bg.destroy(); i.sprite.destroy(); i.costText.destroy(); });
    this.benchIcons = [];

    const startX = 60, y = 585, spacing = 64;
    this.bench.forEach((entry, i) => {
      const species = getSpecies(entry.speciesId);
      const rarity = RARITY[species.rarity];
      const x = startX + i * spacing;
      const bg = this.add.rectangle(x, y, 52, 52, 0x2a3040).setStrokeStyle(2, rarity.color);
      const sprite = this.add.sprite(x, y, species.sheetKey, species.frame).setScale(0.9);
      const costText = this.add.text(x, y + 32, `${species.cost}c`, {
        fontFamily: 'monospace', fontSize: '11px', color: '#f5c94b'
      }).setOrigin(0.5);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.onBenchClicked(entry.uid));
      const icon = { bg, sprite, costText, uid: entry.uid };
      this.benchIcons.push(icon);
      this.refreshBenchIcon(icon);
    });
  }

  refreshBenchIcon(icon) {
    const selected = this.selectedBenchUid === icon.uid;
    icon.bg.setStrokeStyle(selected ? 3 : 2, selected ? 0xf5c94b : icon.bg.strokeColor);
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
      this.removeAllyFromGrid(occupant);
      return;
    }

    if (this.selectedBenchUid) {
      const entryIdx = this.bench.findIndex(m => m.uid === this.selectedBenchUid);
      if (entryIdx === -1) return;
      const entry = this.bench[entryIdx];
      const species = getSpecies(entry.speciesId);

      if (!gameState.spendCoins(species.cost)) {
        this.flashInsufficientCoins();
        return;
      }

      this.bench.splice(entryIdx, 1);
      this.placeAlly(entry, col, row);
      this.selectedBenchUid = null;
      this.layoutBench();
      this.refreshStartButton();
      this.updateHud();
    }
  }

  flashInsufficientCoins() {
    this.hudText.setColor('#e0562f');
    this.time.delayedCall(300, () => this.hudText.setColor('#f5f7fa'));
  }

  placeAlly(entry, col, row) {
    const species = getSpecies(entry.speciesId);
    const { x, y } = this.cellToPixel(col, row);
    const sprite = this.add.sprite(x, y, species.sheetKey, species.frame).setScale(1.0).setInteractive({ useHandCursor: true });

    const ally = {
      uid: entry.uid, species, col, row,
      hp: species.maxHp, maxHp: species.maxHp,
      nextAttackTime: 0, nextAbilityTime: 0, buffs: [], sprite,
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
    gameState.earnCoins(Math.floor(ally.species.cost * 0.5));
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
    const spawn = this.pathWaypoints[0];

    const sprite = this.add.sprite(spawn.x, spawn.y, es.sheetKey, es.frame).setScale(1.0);
    const enemy = {
      species: es, x: spawn.x, y: spawn.y, waypointIndex: 0,
      hp: es.maxHp, maxHp: es.maxHp, statusEffects: {},
      sprite,
      hpBg: this.add.rectangle(spawn.x, spawn.y - 26, 40, 5, 0x1c202a),
      hpFill: this.add.rectangle(spawn.x - 20, spawn.y - 26, 40, 5, 0xe0562f).setOrigin(0, 0.5)
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

      enemy.sprite.x = enemy.x; enemy.sprite.y = enemy.y;
      enemy.hpBg.x = enemy.x; enemy.hpBg.y = enemy.y - 26;
      enemy.hpFill.x = enemy.x - 20; enemy.hpFill.y = enemy.y - 26;
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
        let target = null;
        let bestDist = Infinity;
        for (const enemy of this.enemies) {
          const d = Phaser.Math.Distance.Between(center.x, center.y, enemy.x, enemy.y);
          if (d <= rangePx && d < bestDist) { bestDist = d; target = enemy; }
        }
        if (target) {
          this.dealDamage(target, ally.species.attack);
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
  }

  destroyEnemy(enemy) {
    enemy.sprite.destroy();
    enemy.hpBg.destroy();
    enemy.hpFill.destroy();
  }

  playHitSpark(x, y, tint, scale) {
    const fx = this.add.sprite(x, y, 'hit-spark').setScale(scale || 0.9);
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
      this.playHitSpark(enemy.x, enemy.y, dot.color, 0.5);
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
    const effect = archetype.attackEffect(ally.species.attack);
    if (!effect) return;
    const tint = TYPE_COLORS[ally.species.type];

    if (effect.kind === 'dot') this.applyDotToEnemy(target, effect, time);
    else if (effect.kind === 'slow') this.applySlowToEnemy(target, effect, time);
    else if (effect.kind === 'splash') {
      this.findEnemiesInRange(target.x, target.y, effect.radiusPx)
        .filter(e => e !== target)
        .forEach(e => { this.dealDamage(e, effect.damage); this.playHitSpark(e.x, e.y, tint); });
    } else if (effect.kind === 'chain') {
      this.applyChain(target, effect, ally.species.attack, tint, false);
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

    const cfg = archetype.abilityEffect(ally.species.attack);
    if (cfg.kind === 'chain') {
      this.applyChain(targets[0], cfg, ally.species.attack, tint, true);
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
    this.phase = 'waveComplete';
    const essenceReward = 10;
    gameState.earnEssence(essenceReward);
    this.setOverlayVisible(true);
    this.overlayTitle.setText(`Wave ${gameState.wave} Cleared!`);
    this.overlaySub.setText(
      `Score: ${gameState.score}   Lives: ${gameState.lives}/${gameState.maxLives}   +${essenceReward} essence`
    );
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
    this.overlayTitle.setText('Base Overrun');
    this.overlaySub.setText(`You survived to wave ${gameState.wave}   Final Score: ${gameState.score}`);
    this.overlayPrimaryBtn.text.setText('Try Again');
    this.overlayPrimaryBtn.bg.off('pointerdown');
    this.overlayPrimaryBtn.bg.once('pointerdown', () => this.scene.restart());
  }

  // ---------- helpers ----------

  updateHud() {
    this.hudText.setText(
      `Wave ${gameState.wave}   Lives ${gameState.lives}/${gameState.maxLives}   Coins ${gameState.coins}   Score ${gameState.score}   ` +
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
