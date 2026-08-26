class RosterScene extends Phaser.Scene {
  constructor() {
    super('RosterScene');
  }

  create() {
    const { width, height } = this.scale;

    this.add.tileSprite(width / 2, height / 2, width, height, 'tile-grass');
    this.add.rectangle(width / 2, height / 2, width, height, 0x12151d, 0.68);
    this.add.image(width / 2, height / 2, 'vignette').setDisplaySize(width, height);

    this.add.text(width / 2, 60, 'TEAM SELECT', {
      fontFamily: 'monospace', fontSize: '42px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 6);

    const backTarget = gameState.inMultiplayerWorld ? 'WorldScene' : (gameState.runActive ? 'HubScene' : 'MenuScene');
    this.backBtn(backTarget, () => this.scene.start(backTarget));

    // Team selection is scoped to monsters still actually in the roster.
    gameState.team = gameState.team.filter(id => gameState.roster[id]);

    const rosterEntries = Object.values(gameState.roster);
    if (rosterEntries.length === 0) {
      this.add.text(width / 2, 400, 'No monsters yet.\nVisit the Sanctuary first!', {
        fontFamily: 'monospace', fontSize: '27px', color: '#c8ceda', align: 'center'
      }).setOrigin(0.5).setStroke('#1c2530', 4);
      UiKit.makeButton(this, width / 2, 540, 'Monster Sanctuary', () => this.scene.start('SanctuaryScene'), { size: 'large' });
      return;
    }

    this.teamLabel = this.add.text(width / 2, 135, '', {
      fontFamily: 'monospace', fontSize: '24px', color: '#e8ecf5'
    }).setOrigin(0.5).setStroke('#1c2530', 4);
    this.updateTeamLabel();

    this.cards = [];
    const cols = 5;
    const cardW = 222, cardH = 192;
    const startX = width / 2 - ((Math.min(cols, rosterEntries.length) - 1) * cardW) / 2;
    const startY = 260;

    rosterEntries.forEach((entry, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * cardW;
      const y = startY + row * cardH;
      this.buildCard(entry, x, y);
    });

    if (gameState.inMultiplayerWorld) {
      this.add.text(width / 2, 990, "Head back to the World when you're ready", {
        fontFamily: 'monospace', fontSize: '19px', color: '#c8ceda'
      }).setOrigin(0.5).setStroke('#1c2530', 4);
    } else if (gameState.runActive) {
      // Mid-run, this screen is purely for adjusting the team/upgrades -
      // the Hub is the only place that actually commits to the next stage
      // (it's what picked gameState.pendingStageId), so send the player
      // back there rather than duplicating that decision here.
      this.add.text(width / 2, 990, "Head back to the Hub when you're ready", {
        fontFamily: 'monospace', fontSize: '19px', color: '#c8ceda'
      }).setOrigin(0.5).setStroke('#1c2530', 4);
    } else {
      this.startBtn = UiKit.makeButton(this, width / 2, 990, 'Start Run', () => {
        if (gameState.team.length === 0) return;
        gameState.resetRun();
        gameState.startStage(FIRST_STAGE_ID);
        this.scene.start('BattleScene');
      }, { size: 'large' });
      this.refreshStartBtn();
    }
  }

  buildCard(entry, x, y) {
    const species = getSpecies(entry.speciesId);
    const rarity = RARITY[species.rarity];
    // Soft offset shadow so the card reads as sitting above the background
    // instead of flush with it - see UiKit.makeButton's identical trick.
    this.add.image(x + 5, y + 7, 'panel-card-roster').setTint(0x000000).setAlpha(0.3);
    const bg = this.add.image(x, y, 'panel-card-roster').setInteractive({ useHandCursor: true });
    const rarityDot = this.add.circle(x - 87, y - 72, 9, rarity.color).setStrokeStyle(2, 0x1c2530);
    const selectionRing = this.add.rectangle(x, y, 213, 183, 0xffffff, 0).setStrokeStyle(4, 0x4caf50).setVisible(false);
    const sprite = UiKit.speciesSprite(this, x, y - 60, species, 78);
    const name = this.add.text(x, y - 15, `${species.name}  Lv.${entry.level}`, {
      fontFamily: 'monospace', fontSize: '17px', color: '#f5f7fa'
    }).setOrigin(0.5).setStroke('#1c2530', 4);
    const stats = this.add.text(x, y + 8, '', {
      fontFamily: 'monospace', fontSize: '15px', color: '#e8ecf5'
    }).setOrigin(0.5).setStroke('#1c2530', 3);
    const essenceText = this.add.text(x, y + 29, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#f5c94b'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    const upgradeBg = this.add.rectangle(x, y + 57, 174, 30, 0x394258).setStrokeStyle(2, 0x5a6478);
    const upgradeText = this.add.text(x, y + 57, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#f5f7fa'
    }).setOrigin(0.5);

    const card = { bg, selectionRing, sprite, name, stats, essenceText, upgradeBg, upgradeText, speciesId: entry.speciesId, rarityColor: rarity.color };
    this.cards.push(card);
    this.refreshCard(card);

    bg.on('pointerdown', () => {
      const ok = gameState.toggleTeamMember(entry.speciesId);
      if (!ok) return; // team full, ignored
      Sfx.click();
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
          Sfx.egg();
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
        Sfx.coin();
        this.refreshCard(card);
      }
    });
  }

  refreshCard(card) {
    const entry = gameState.roster[card.speciesId];
    const species = getSpecies(card.speciesId);
    const effective = getEffectiveStats(species, entry.level);

    const selected = gameState.team.includes(card.speciesId);
    card.selectionRing.setVisible(selected);

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
    this.startBtn.bg.setTint(ready ? 0xffffff : 0x777777);
    this.startBtn.text.setColor(ready ? '#f5f7fa' : '#8a95ab');
  }

  backBtn(target, onClick) {
    const label = target === 'HubScene' ? '< Hub' : target === 'WorldScene' ? '< World' : '< Menu';
    UiKit.makeLink(this, 30, 30, label, onClick, { originX: 0, originY: 0 });
  }
}
