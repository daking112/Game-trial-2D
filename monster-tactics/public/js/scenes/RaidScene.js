// Squad Skirmish raids - walk up to someone else's claimed plot in the
// shared world (see WorldScene.startRaid) and fight a real squad-vs-squad
// battle against their reported base layout, instead of just flipping a
// timer. Reuses the same COMBAT_ARCHETYPES type kits BattleScene uses for
// its grid combat, adapted to a side-vs-side skirmish with no path/range:
// both squads auto-attack, always targeting whichever living enemy has the
// least HP left (a finishing-blow bias, distinct from BattleScene's
// furthest-progress targeting since there's no path here to prioritize).
//
// Trust model (same "trust the client, document it honestly" tradeoff used
// everywhere else in this game - see README): the whole fight, including
// who wins, is simulated in THIS browser tab and self-reported to the
// server afterward (see server.js's 'raid' handler) - a modified client
// could lie about the outcome. That's a materially bigger exposure than the
// existing self-only trust (submitScore, plotLayout) because a raid outcome
// affects a THIRD PARTY, the defender. Accepted for now, same as the rest
// of this project's multiplayer layer: there's no account system to build
// real anti-cheat on top of yet.
//
// RAID_SQUAD_SIZE must match server.js's constant of the same name - the
// server silently ignores/caps anything past it when applying results.
const RAID_SQUAD_SIZE = 3;
const RAID_REWARD_ESSENCE = 40;
// Client-side-only, session-only cost for the attacker's OWN roster (see
// gameState.raidFainted) - deliberately much shorter than the defender's
// server-remembered RAID_FAINT_MS (3 min), since this is just a soft,
// unenforceable "your monster took a knock" nudge, not the real stakes.
const RAID_ATTACKER_FAINT_MS = 60 * 1000;
const RAID_BATTLE_TIMEOUT_MS = 45000;

class RaidScene extends Phaser.Scene {
  constructor() {
    super('RaidScene');
  }

  create() {
    const { width, height } = this.scale;
    this.add.tileSprite(width / 2, height / 2, width, height, 'tile-grass');
    this.add.rectangle(width / 2, height / 2, width, height, 0x12151d, 0.72);

    this.phase = 'select';
    this.selectedSquad = [];

    // Snapshot the target's defending squad right now - up to RAID_SQUAD_SIZE
    // non-fainted cells from whatever layout WorldScene last saw for that
    // plot. If it's changed by the time the raid message reaches the server
    // (they rebuilt, or someone else just raided them), the server's own
    // cooldown/layout check is still the authority - this is just what gets
    // rendered as the fight here.
    const now = Date.now();
    this.defenderCells = (gameState.raidTargetLayout || [])
      .filter(c => !c.faintedUntil || c.faintedUntil <= now)
      .slice(0, RAID_SQUAD_SIZE);

    this.buildSelectPhase();
  }

  // ---------- select phase ----------

  buildSelectPhase() {
    const { width } = this.scale;
    this.add.text(width / 2, 60, `RAID: ${gameState.raidTargetName}'s Base`, {
      fontFamily: 'monospace', fontSize: '38px', color: '#e0562f', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 6);

    UiKit.makeLink(this, 30, 30, '< Retreat', () => this.scene.start('WorldScene'), { originX: 0, originY: 0 });

    if (this.defenderCells.length === 0) {
      this.add.text(width / 2, 400, "This base has no defenders standing right now.\nNothing to raid.", {
        fontFamily: 'monospace', fontSize: '24px', color: '#c8ceda', align: 'center'
      }).setOrigin(0.5).setStroke('#1c2530', 4);
      return;
    }

    this.add.text(width / 2, 130, 'DEFENDERS', {
      fontFamily: 'monospace', fontSize: '20px', color: '#9aa4b8', fontStyle: 'bold'
    }).setOrigin(0.5);

    const defenderStartX = width / 2 - ((this.defenderCells.length - 1) * 140) / 2;
    this.defenderCells.forEach((cell, i) => {
      const species = getSpecies(cell.speciesId);
      if (!species) return;
      const x = defenderStartX + i * 140, y = 200;
      this.add.sprite(x, y, species.sheetKey, species.frame).setScale(1.6);
      this.add.text(x, y + 50, `${species.name} Lv.${cell.level}`, {
        fontFamily: 'monospace', fontSize: '14px', color: '#e8ecf5'
      }).setOrigin(0.5).setStroke('#1c2530', 3);
    });

    this.add.text(width / 2, 300, 'YOUR SQUAD - pick up to 3', {
      fontFamily: 'monospace', fontSize: '20px', color: '#4caf50', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.selectedLabel = this.add.text(width / 2, 330, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#c8ceda'
    }).setOrigin(0.5);
    this.updateSelectedLabel();

    const rosterEntries = Object.values(gameState.roster);
    this.cards = [];
    const cols = 6;
    const cardW = 190, cardH = 170;
    const startX = width / 2 - ((Math.min(cols, rosterEntries.length) - 1) * cardW) / 2;
    const startY = 420;
    rosterEntries.forEach((entry, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      this.buildRosterCard(entry, startX + col * cardW, startY + row * cardH);
    });

    this.fightBtn = UiKit.makeButton(this, width / 2, 990, 'Launch Raid!', () => this.launchRaid(), { size: 'large', tint: 0xe0562f });
    this.refreshFightBtn();
  }

  buildRosterCard(entry, x, y) {
    const species = getSpecies(entry.speciesId);
    // Soft offset shadow - see UiKit.makeButton's identical trick.
    this.add.image(x + 5, y + 7, 'panel-card-roster').setTint(0x000000).setAlpha(0.3).setScale(0.86);
    const bg = this.add.image(x, y, 'panel-card-roster').setInteractive({ useHandCursor: true }).setScale(0.86);
    const ring = this.add.rectangle(x, y, 183, 157, 0xffffff, 0).setStrokeStyle(4, 0xe0562f).setVisible(false);
    const sprite = this.add.sprite(x, y - 42, species.sheetKey, species.frame).setScale(1.1);
    const name = this.add.text(x, y, `${species.name} Lv.${entry.level}`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#f5f7fa'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    const fainted = gameState.isRaidFainted(entry.speciesId);
    const faintedText = this.add.text(x, y + 45, fainted ? 'Recovering...' : '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#e0562f'
    }).setOrigin(0.5);

    const card = { bg, ring, speciesId: entry.speciesId, fainted };
    this.cards.push(card);

    if (fainted) {
      bg.setTint(0x555555);
      sprite.setTint(0x777777);
      return;
    }

    bg.on('pointerdown', () => {
      const idx = this.selectedSquad.indexOf(entry.speciesId);
      if (idx >= 0) {
        this.selectedSquad.splice(idx, 1);
      } else {
        if (this.selectedSquad.length >= RAID_SQUAD_SIZE) return;
        this.selectedSquad.push(entry.speciesId);
      }
      Sfx.click();
      ring.setVisible(this.selectedSquad.includes(entry.speciesId));
      this.updateSelectedLabel();
      this.refreshFightBtn();
    });
    void faintedText;
  }

  updateSelectedLabel() {
    this.selectedLabel.setText(`${this.selectedSquad.length} / ${RAID_SQUAD_SIZE} selected`);
  }

  refreshFightBtn() {
    const ready = this.selectedSquad.length > 0;
    this.fightBtn.bg.setTint(ready ? 0xe0562f : 0x777777);
    this.fightBtn.text.setColor(ready ? '#f5f7fa' : '#8a95ab');
  }

  launchRaid() {
    if (this.selectedSquad.length === 0) return;
    this.children.removeAll();
    this.add.tileSprite(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 'tile-grass');
    this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x12151d, 0.8);
    this.buildBattlePhase();
  }

  // ---------- battle phase ----------

  buildBattlePhase() {
    this.phase = 'battle';
    this.battleElapsed = 0;
    this.resolved = false;
    const { width, height } = this.scale;

    this.add.text(width / 2, 50, `Raiding ${gameState.raidTargetName}'s Base`, {
      fontFamily: 'monospace', fontSize: '30px', color: '#e0562f', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 5);

    const attackerX = width * 0.26, defenderX = width * 0.74;
    const spacingY = 220, startY = height / 2 - spacingY;

    this.attackers = this.selectedSquad.map((speciesId, i) => {
      const entry = gameState.roster[speciesId];
      return this.buildCombatant(speciesId, entry.level, 'attacker', attackerX, startY + i * spacingY);
    });
    this.defenders = this.defenderCells.map((cell, i) =>
      this.buildCombatant(cell.speciesId, cell.level, 'defender', defenderX, startY + i * spacingY, cell.col, cell.row)
    );

    this.add.text(attackerX, startY - 90, 'YOUR SQUAD', {
      fontFamily: 'monospace', fontSize: '18px', color: '#4caf50', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.text(defenderX, startY - 90, `${gameState.raidTargetName}'s SQUAD`, {
      fontFamily: 'monospace', fontSize: '18px', color: '#e0562f', fontStyle: 'bold'
    }).setOrigin(0.5);
  }

  buildCombatant(speciesId, level, side, x, y, col, row) {
    const species = getSpecies(speciesId);
    const effective = getEffectiveStats(species, level);
    const sprite = this.add.sprite(x, y, species.sheetKey, species.frame).setScale(2.2);
    const nameText = this.add.text(x, y - 70, `${species.name} Lv.${level}`, {
      fontFamily: 'monospace', fontSize: '15px', color: '#f5f7fa'
    }).setOrigin(0.5).setStroke('#1c2530', 3);
    const hpBg = this.add.rectangle(x, y - 52, 100, 10, 0x1c202a).setStrokeStyle(2, 0x394258);
    const hpFill = this.add.rectangle(x - 50, y - 52, 100, 10, side === 'attacker' ? 0x4caf50 : 0xe0562f).setOrigin(0, 0.5);
    return {
      speciesId, species, level, col, row, side, x, y,
      attack: effective.attack, maxHp: effective.maxHp, hp: effective.maxHp,
      nextAttackTime: 0, nextAbilityTime: 0, ultimateCharge: 0, buffs: [], statusEffects: {},
      sprite, nameText, hpBg, hpFill
    };
  }

  update(time, delta) {
    if (this.phase === 'battle') this.stepBattle(time, delta);
  }

  stepBattle(time, delta) {
    if (this.resolved) return;
    this.battleElapsed += delta;

    [...this.attackers, ...this.defenders].forEach(c => this.processStatusEffects(c, time));

    for (const c of [...this.attackers, ...this.defenders]) {
      if (c.hp <= 0) continue;
      const ownSide = c.side === 'attacker' ? this.attackers : this.defenders;
      const otherSide = c.side === 'attacker' ? this.defenders : this.attackers;
      const aliveOther = otherSide.filter(x => x.hp > 0);
      if (aliveOther.length === 0) continue;

      const archetype = COMBAT_ARCHETYPES[c.species.type];

      if (time >= c.nextAttackTime) {
        const target = aliveOther.reduce((lowest, x) => (x.hp < lowest.hp ? x : lowest), aliveOther[0]);
        this.dealDamage(target, c.attack);
        Sfx.hit();
        this.playHitSpark(target.x, target.y, TYPE_COLORS[c.species.type]);
        this.applyAttackSecondaryEffect(c, target, time, otherSide.filter(x => x.hp > 0));
        this.chargeUltimate(c, time, ownSide.filter(x => x.hp > 0), otherSide.filter(x => x.hp > 0));
        const speedMult = this.currentAttackSpeedMultiplier(c, time);
        c.nextAttackTime = time + c.species.attackIntervalMs / speedMult;
      }

      if (archetype.abilityCooldownMs && time >= c.nextAbilityTime) {
        this.applyArchetypeAbility(c, time, ownSide.filter(x => x.hp > 0), otherSide.filter(x => x.hp > 0));
      }
    }

    const attackersAlive = this.attackers.filter(c => c.hp > 0).length;
    const defendersAlive = this.defenders.filter(c => c.hp > 0).length;
    if (attackersAlive === 0 || defendersAlive === 0 || this.battleElapsed >= RAID_BATTLE_TIMEOUT_MS) {
      this.resolveBattle();
    }
  }

  dealDamage(c, amount) {
    c.hp = Math.max(0, c.hp - amount);
    c.hpFill.scaleX = c.hp / c.maxHp;
    this.showDamageNumber(c.x, c.y - 52, amount);
    if (c.hp <= 0 && !c.deathHandled) {
      c.deathHandled = true;
      Sfx.kill();
      this.tweens.add({ targets: [c.sprite, c.nameText, c.hpBg, c.hpFill], alpha: 0.25, duration: 300 });
    }
  }

  showDamageNumber(x, y, amount) {
    const text = this.add.text(x, y - 6, `-${amount}`, {
      fontFamily: 'monospace', fontSize: '16px', color: '#fff2c4', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#3a1c00', 3).setDepth(50);
    this.tweens.add({ targets: text, y: text.y - 30, duration: 500, ease: 'Cubic.Out' });
    this.tweens.add({ targets: text, alpha: 0, delay: 250, duration: 250, onComplete: () => text.destroy() });
  }

  playHitSpark(x, y, tint, scale) {
    const fx = this.add.sprite(x, y, 'hit-spark').setScale(scale || 1.2);
    if (tint !== undefined) fx.setTint(tint);
    fx.play('hit-spark-anim');
    fx.once('animationcomplete', () => fx.destroy());
  }

  processStatusEffects(c, time) {
    const dot = c.statusEffects.dot;
    if (dot && c.hp > 0 && time >= dot.nextTickTime) {
      this.dealDamage(c, dot.damagePerTick);
      this.playHitSpark(c.x, c.y, dot.color, 0.7);
      dot.ticksRemaining -= 1;
      dot.nextTickTime = time + dot.tickIntervalMs;
      if (dot.ticksRemaining <= 0) delete c.statusEffects.dot;
    }
    const slow = c.statusEffects.slow;
    if (slow && time >= slow.expiresAt) delete c.statusEffects.slow;
  }

  addBuff(c, key, multiplier, expiresAt) {
    c.buffs = c.buffs.filter(b => b.key !== key);
    c.buffs.push({ key, multiplier, expiresAt });
  }

  currentAttackSpeedMultiplier(c, time) {
    c.buffs = c.buffs.filter(b => b.expiresAt > time);
    const slow = c.statusEffects.slow;
    const slowMult = slow ? slow.multiplier : 1;
    const buffMult = c.buffs.length === 0 ? 1 : Math.max(...c.buffs.map(b => b.multiplier));
    return slowMult * buffMult;
  }

  applyChainSquad(startTarget, cfg, baseDamage, tint, includeStartDamage, pool) {
    const hit = new Set();
    if (includeStartDamage) {
      this.dealDamage(startTarget, baseDamage);
      this.playHitSpark(startTarget.x, startTarget.y, tint);
    }
    hit.add(startTarget);
    for (let i = 0; i < cfg.jumps; i++) {
      const next = pool.filter(x => x.hp > 0 && !hit.has(x)).sort((a, b) => a.hp - b.hp)[0];
      if (!next) break;
      this.dealDamage(next, Math.round(baseDamage * cfg.falloff[i]));
      this.playHitSpark(next.x, next.y, tint);
      hit.add(next);
    }
  }

  applyAttackSecondaryEffect(c, target, time, aliveOtherSide) {
    const archetype = COMBAT_ARCHETYPES[c.species.type];
    const effect = archetype.attackEffect(c.attack);
    if (!effect) return;
    const tint = TYPE_COLORS[c.species.type];

    if (effect.kind === 'dot') {
      target.statusEffects.dot = {
        color: effect.color, damagePerTick: effect.damagePerTick,
        ticksRemaining: effect.ticks, tickIntervalMs: effect.tickIntervalMs, nextTickTime: time + effect.tickIntervalMs
      };
    } else if (effect.kind === 'slow') {
      target.statusEffects.slow = { multiplier: effect.multiplier, expiresAt: time + effect.durationMs };
    } else if (effect.kind === 'splash') {
      // No positional radius in a squad skirmish - a small enough squad that
      // "splash" just means the rest of that side takes the reduced hit too.
      aliveOtherSide.filter(x => x !== target).forEach(x => {
        this.dealDamage(x, effect.damage);
        this.playHitSpark(x.x, x.y, tint);
      });
    } else if (effect.kind === 'chain') {
      this.applyChainSquad(target, effect, c.attack, tint, false, aliveOtherSide);
    }
  }

  applyArchetypeAbility(c, time, ownSideAlive, otherSideAlive) {
    const archetype = COMBAT_ARCHETYPES[c.species.type];
    const tint = TYPE_COLORS[c.species.type];

    if (archetype.abilityKind === 'team-buff') {
      const cfg = archetype.abilityEffect();
      ownSideAlive.forEach(a => this.addBuff(a, 'rally', cfg.attackSpeedMultiplier, time + cfg.durationMs));
      c.nextAbilityTime = time + archetype.abilityCooldownMs;
      return;
    }

    if (otherSideAlive.length === 0) return;
    const cfg = archetype.abilityEffect(c.attack);
    if (cfg.kind === 'chain') {
      const start = otherSideAlive.sort((a, b) => a.hp - b.hp)[0];
      this.applyChainSquad(start, cfg, c.attack, tint, true, otherSideAlive);
    } else {
      otherSideAlive.forEach(x => {
        if (cfg.splashDamage) this.dealDamage(x, cfg.splashDamage);
        if (cfg.dot) x.statusEffects.dot = {
          color: cfg.dot.color, damagePerTick: cfg.dot.damagePerTick,
          ticksRemaining: cfg.dot.ticks, tickIntervalMs: cfg.dot.tickIntervalMs, nextTickTime: time + cfg.dot.tickIntervalMs
        };
        if (cfg.slow) x.statusEffects.slow = { multiplier: cfg.slow.multiplier, expiresAt: time + cfg.slow.durationMs };
        this.playHitSpark(x.x, x.y, tint);
      });
    }
    c.nextAbilityTime = time + archetype.abilityCooldownMs;
  }

  chargeUltimate(c, time, ownSideAlive, otherSideAlive) {
    const archetype = COMBAT_ARCHETYPES[c.species.type];
    if (!archetype.ultimateChargeHits) return;
    c.ultimateCharge++;
    if (c.ultimateCharge >= archetype.ultimateChargeHits) {
      this.applyArchetypeUltimate(c, time, ownSideAlive, otherSideAlive);
      c.ultimateCharge = 0;
    }
  }

  applyArchetypeUltimate(c, time, ownSideAlive, otherSideAlive) {
    const archetype = COMBAT_ARCHETYPES[c.species.type];
    const tint = TYPE_COLORS[c.species.type];

    if (archetype.ultimateKind === 'team-buff') {
      const cfg = archetype.ultimateEffect();
      ownSideAlive.forEach(a => this.addBuff(a, 'ultimate', cfg.attackSpeedMultiplier, time + cfg.durationMs));
      return;
    }
    if (otherSideAlive.length === 0) return;
    const cfg = archetype.ultimateEffect(c.attack);
    otherSideAlive.forEach(x => {
      if (cfg.splashDamage) this.dealDamage(x, cfg.splashDamage);
      if (cfg.dot) x.statusEffects.dot = {
        color: cfg.dot.color, damagePerTick: cfg.dot.damagePerTick,
        ticksRemaining: cfg.dot.ticks, tickIntervalMs: cfg.dot.tickIntervalMs, nextTickTime: time + cfg.dot.tickIntervalMs
      };
      if (cfg.slow) x.statusEffects.slow = { multiplier: cfg.slow.multiplier, expiresAt: time + cfg.slow.durationMs };
      this.playHitSpark(x.x, x.y, tint, 1.7);
    });
  }

  // ---------- results ----------

  totalHp(list) {
    return list.reduce((sum, c) => sum + c.hp, 0);
  }

  resolveBattle() {
    if (this.resolved) return;
    this.resolved = true;
    this.phase = 'results';

    const attackersAlive = this.attackers.filter(c => c.hp > 0).length;
    const defendersAlive = this.defenders.filter(c => c.hp > 0).length;
    let attackerWon;
    if (defendersAlive === 0 && attackersAlive > 0) attackerWon = true;
    else if (attackersAlive === 0 && defendersAlive > 0) attackerWon = false;
    else attackerWon = this.totalHp(this.attackers) > this.totalHp(this.defenders);

    const deadDefenderCells = this.defenders.filter(d => d.hp <= 0).map(d => ({ col: d.col, row: d.row }));
    const deadAttackerSpeciesIds = this.attackers.filter(a => a.hp <= 0).map(a => a.speciesId);

    deadAttackerSpeciesIds.forEach(id => gameState.raidFaint(id, RAID_ATTACKER_FAINT_MS));
    if (attackerWon) gameState.earnEssence(RAID_REWARD_ESSENCE);

    NetClient.send('raid', { targetPlotId: gameState.raidTargetPlotId, attackerWon, deadDefenderCells });

    this.showResults(attackerWon, deadAttackerSpeciesIds, deadDefenderCells.length);
  }

  showResults(attackerWon, deadAttackerSpeciesIds, deadDefenderCount) {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x0b0d12, 0.55).setDepth(60);

    this.add.text(width / 2, height / 2 - 90, attackerWon ? 'RAID WON!' : 'RAID LOST', {
      fontFamily: 'monospace', fontSize: '52px', color: attackerWon ? '#4caf50' : '#e0562f', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 7).setDepth(61);

    const lines = [];
    if (attackerWon) lines.push(`+${RAID_REWARD_ESSENCE} essence`);
    if (deadDefenderCount > 0) lines.push(`${deadDefenderCount} of ${gameState.raidTargetName}'s monsters fainted`);
    if (deadAttackerSpeciesIds.length > 0) lines.push(`${deadAttackerSpeciesIds.length} of your monsters need to recover`);
    if (lines.length === 0) lines.push('No casualties on either side.');

    this.add.text(width / 2, height / 2 - 10, lines.join('\n'), {
      fontFamily: 'monospace', fontSize: '20px', color: '#e8ecf5', align: 'center'
    }).setOrigin(0.5).setStroke('#1c2530', 4).setDepth(61);

    UiKit.makeButton(this, width / 2, height / 2 + 130, 'Back to World', () => {
      gameState.raidTargetPlotId = null;
      gameState.raidTargetName = null;
      gameState.raidTargetLayout = null;
      this.scene.start('WorldScene');
    }, { size: 'large' }).container.setDepth(61);
  }
}
