class RosterScene extends Phaser.Scene {
  constructor() {
    super('RosterScene');
  }

  create() {
    const { width } = this.scale;

    this.add.text(width / 2, 40, 'TEAM SELECT', {
      fontFamily: 'monospace', fontSize: '28px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5);

    const backTarget = gameState.runActive ? 'HubScene' : 'MenuScene';
    this.backBtn(backTarget, () => this.scene.start(backTarget));

    // Team selection is scoped to monsters still actually in the roster.
    gameState.team = gameState.team.filter(id => gameState.roster[id]);

    const rosterEntries = Object.values(gameState.roster);
    if (rosterEntries.length === 0) {
      this.add.text(width / 2, 260, 'No monsters yet.\nVisit the Sanctuary first!', {
        fontFamily: 'monospace', fontSize: '18px', color: '#9aa4b8', align: 'center'
      }).setOrigin(0.5);
      this.makeButton(width / 2, 360, 'Monster Sanctuary', () => this.scene.start('SanctuaryScene'));
      return;
    }

    this.teamLabel = this.add.text(width / 2, 90, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#c8ceda'
    }).setOrigin(0.5);
    this.updateTeamLabel();

    this.cards = [];
    const cols = 5;
    const cardW = 148, cardH = 128;
    const startX = width / 2 - ((Math.min(cols, rosterEntries.length) - 1) * cardW) / 2;
    const startY = 165;

    rosterEntries.forEach((entry, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * cardW;
      const y = startY + row * cardH;
      this.buildCard(entry, x, y);
    });

    if (gameState.runActive) {
      // Mid-run, this screen is purely for adjusting the team/upgrades -
      // the Hub is the only place that actually commits to the next stage
      // (it's what picked gameState.pendingStageId), so send the player
      // back there rather than duplicating that decision here.
      this.add.text(width / 2, 610, "Head back to the Hub when you're ready", {
        fontFamily: 'monospace', fontSize: '13px', color: '#5a6478'
      }).setOrigin(0.5);
    } else {
      this.startBtn = this.makeButton(width / 2, 610, 'Start Run', () => {
        if (gameState.team.length === 0) return;
        gameState.resetRun();
        gameState.startStage(FIRST_STAGE_ID);
        this.scene.start('BattleScene');
      });
      this.refreshStartBtn();
    }
  }

  buildCard(entry, x, y) {
    const species = getSpecies(entry.speciesId);
    const rarity = RARITY[species.rarity];
    const bg = this.add.rectangle(x, y, 138, 118, 0x2a3040).setStrokeStyle(2, rarity.color);
    const sprite = this.add.sprite(x, y - 40, species.sheetKey, species.frame).setScale(0.95);
    const name = this.add.text(x, y - 10, `${species.name}  Lv.${entry.level}`, {
      fontFamily: 'monospace', fontSize: '11px', color: '#f5f7fa'
    }).setOrigin(0.5);
    const stats = this.add.text(x, y + 5, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#9aa4b8'
    }).setOrigin(0.5);
    const essenceText = this.add.text(x, y + 19, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#f5c94b'
    }).setOrigin(0.5);

    const upgradeBg = this.add.rectangle(x, y + 38, 116, 20, 0x394258).setStrokeStyle(1, 0x5a6478);
    const upgradeText = this.add.text(x, y + 38, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#f5f7fa'
    }).setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true });
    const card = { bg, sprite, name, stats, essenceText, upgradeBg, upgradeText, speciesId: entry.speciesId, rarityColor: rarity.color };
    this.cards.push(card);
    this.refreshCard(card);

    bg.on('pointerdown', () => {
      const ok = gameState.toggleTeamMember(entry.speciesId);
      if (!ok) return; // team full, ignored
      this.refreshCard(card);
      this.updateTeamLabel();
      this.refreshStartBtn();
    });

    upgradeBg.setInteractive({ useHandCursor: true });
    upgradeBg.on('pointerdown', () => {
      const current = gameState.roster[entry.speciesId];
      if (!current) return;

      if (current.level >= MAX_MONSTER_LEVEL) {
        if (gameState.canEvolve(entry.speciesId)) {
          gameState.evolveMonster(entry.speciesId);
          // Evolving swaps the roster key (and this card's identity along
          // with it) to a different species - simplest correct thing is to
          // rebuild the whole scene from the now-current gameState rather
          // than patch this card's sprite/text in place.
          this.scene.restart();
        }
        return;
      }

      if (gameState.upgradeMonster(entry.speciesId)) {
        this.refreshCard(card);
      }
    });
  }

  refreshCard(card) {
    const entry = gameState.roster[card.speciesId];
    const species = getSpecies(card.speciesId);
    const effective = getEffectiveStats(species, entry.level);

    const selected = gameState.team.includes(card.speciesId);
    card.bg.setStrokeStyle(selected ? 3 : 2, selected ? 0x4caf50 : card.rarityColor);
    card.bg.setFillStyle(selected ? 0x223428 : 0x2a3040);

    card.name.setText(`${species.name}  Lv.${entry.level}`);
    card.stats.setText(`HP ${effective.maxHp} / ATK ${effective.attack}`);

    if (entry.level >= MAX_MONSTER_LEVEL) {
      const evolvesTo = EVOLUTION_MAP[card.speciesId];
      if (!evolvesTo) {
        card.essenceText.setText('MAX LEVEL');
        card.upgradeText.setText('Maxed');
        card.upgradeBg.setFillStyle(0x1c202a);
        card.upgradeText.setColor('#5a6478');
        card.upgradeBg.disableInteractive();
      } else {
        const canEvolve = entry.essence >= EVOLUTION_ESSENCE_COST;
        card.essenceText.setText(`Essence ${entry.essence}/${EVOLUTION_ESSENCE_COST}`);
        card.upgradeText.setText(canEvolve ? `Evolve! (${getSpecies(evolvesTo).name})` : 'Evolve');
        card.upgradeBg.setFillStyle(canEvolve ? 0x2f4a34 : 0x394258);
        card.upgradeText.setColor(canEvolve ? '#4caf50' : '#9aa4b8');
        card.upgradeBg.setInteractive({ useHandCursor: true });
      }
    } else {
      const cost = essenceForNextLevel(entry.level);
      const affordable = entry.essence >= cost;
      card.essenceText.setText(`Essence ${entry.essence}/${cost}`);
      card.upgradeText.setText(affordable ? `Upgrade to Lv.${entry.level + 1}` : 'Upgrade');
      card.upgradeBg.setFillStyle(affordable ? 0x2f4a34 : 0x394258);
      card.upgradeText.setColor(affordable ? '#4caf50' : '#9aa4b8');
      card.upgradeBg.setInteractive({ useHandCursor: true });
    }
  }

  updateTeamLabel() {
    this.teamLabel.setText(`Team: ${gameState.team.length} / ${MAX_TEAM_SIZE}`);
  }

  refreshStartBtn() {
    if (!this.startBtn) return; // no Start Run button mid-run - see create()
    const ready = gameState.team.length > 0;
    this.startBtn.bg.setFillStyle(ready ? 0x2a3040 : 0x1c202a);
    this.startBtn.text.setColor(ready ? '#f5f7fa' : '#5a6478');
  }

  makeButton(x, y, label, onClick) {
    const w = 240, h = 52;
    const bg = this.add.rectangle(x, y, w, h, 0x2a3040).setStrokeStyle(2, 0x4a5468);
    const text = this.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: '16px', color: '#f5f7fa'
    }).setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x394258));
    bg.on('pointerout', () => this.refreshStartBtnColor(bg));
    bg.on('pointerdown', onClick);

    return { bg, text };
  }

  refreshStartBtnColor(bg) {
    const ready = gameState.team.length > 0;
    bg.setFillStyle(ready ? 0x2a3040 : 0x1c202a);
  }

  backBtn(target, onClick) {
    const label = target === 'HubScene' ? '< Hub' : '< Menu';
    const text = this.add.text(24, 24, label, {
      fontFamily: 'monospace', fontSize: '16px', color: '#9aa4b8'
    }).setInteractive({ useHandCursor: true });
    text.on('pointerover', () => text.setColor('#f5f7fa'));
    text.on('pointerout', () => text.setColor('#9aa4b8'));
    text.on('pointerdown', onClick);
  }
}
