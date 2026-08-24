class RosterScene extends Phaser.Scene {
  constructor() {
    super('RosterScene');
  }

  create() {
    const { width } = this.scale;

    this.add.text(width / 2, 40, 'TEAM SELECT', {
      fontFamily: 'monospace', fontSize: '28px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.backBtn(() => this.scene.start('MenuScene'));

    // Team selection is scoped to monsters that still exist in the roster.
    gameState.team = gameState.team.filter(uid => gameState.roster.some(m => m.uid === uid));

    if (gameState.roster.length === 0) {
      this.add.text(width / 2, 260, 'No monsters yet.\nGo open some eggs first!', {
        fontFamily: 'monospace', fontSize: '18px', color: '#9aa4b8', align: 'center'
      }).setOrigin(0.5);
      this.makeButton(width / 2, 360, 'Egg Shop', () => this.scene.start('EggScene'));
      return;
    }

    this.teamLabel = this.add.text(width / 2, 90, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#c8ceda'
    }).setOrigin(0.5);
    this.updateTeamLabel();

    this.cards = [];
    const cols = 4;
    const cardW = 150, cardH = 160;
    const startX = width / 2 - ((Math.min(cols, gameState.roster.length) - 1) * cardW) / 2;
    const startY = 180;

    gameState.roster.forEach((entry, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * cardW;
      const y = startY + row * cardH;
      this.buildCard(entry, x, y);
    });

    this.startBtn = this.makeButton(width / 2, 560, 'Start Battle', () => {
      if (gameState.team.length > 0) this.scene.start('BattleScene');
    });
    this.refreshStartBtn();
  }

  buildCard(entry, x, y) {
    const species = getSpecies(entry.speciesId);
    const rarity = RARITY[species.rarity];
    const archetype = COMBAT_ARCHETYPES[species.type];
    const bg = this.add.rectangle(x, y, 130, 150, 0x2a3040).setStrokeStyle(2, rarity.color);
    const sprite = this.add.sprite(x, y - 40, species.sheetKey, species.frame).setScale(1.1);
    const name = this.add.text(x, y - 3, species.name, {
      fontFamily: 'monospace', fontSize: '13px', color: '#f5f7fa'
    }).setOrigin(0.5);
    const stats = this.add.text(x, y + 15, `HP ${species.maxHp} / ATK ${species.attack}`, {
      fontFamily: 'monospace', fontSize: '11px', color: '#9aa4b8'
    }).setOrigin(0.5);
    const atkLabel = this.add.text(x, y + 32, `ATK: ${archetype.attackLabel}`, {
      fontFamily: 'monospace', fontSize: '9px', color: '#c8ceda'
    }).setOrigin(0.5);
    const ablLabel = this.add.text(x, y + 45, `ABL: ${archetype.abilityLabel}`, {
      fontFamily: 'monospace', fontSize: '9px', color: '#f5c94b'
    }).setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true });
    const card = { bg, sprite, name, stats, atkLabel, ablLabel, uid: entry.uid, rarityColor: rarity.color };
    this.cards.push(card);
    this.refreshCard(card);

    bg.on('pointerdown', () => {
      const ok = gameState.toggleTeamMember(entry.uid);
      if (!ok) return; // team full, ignored
      this.refreshCard(card);
      this.updateTeamLabel();
      this.refreshStartBtn();
    });
  }

  refreshCard(card) {
    const selected = gameState.team.includes(card.uid);
    card.bg.setStrokeStyle(selected ? 3 : 2, selected ? 0x4caf50 : card.rarityColor);
    card.bg.setFillStyle(selected ? 0x223428 : 0x2a3040);
  }

  updateTeamLabel() {
    this.teamLabel.setText(`Team: ${gameState.team.length} / ${MAX_TEAM_SIZE}`);
  }

  refreshStartBtn() {
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

  backBtn(onClick) {
    const text = this.add.text(24, 24, '< Menu', {
      fontFamily: 'monospace', fontSize: '16px', color: '#9aa4b8'
    }).setInteractive({ useHandCursor: true });
    text.on('pointerover', () => text.setColor('#f5f7fa'));
    text.on('pointerout', () => text.setColor('#9aa4b8'));
    text.on('pointerdown', onClick);
  }
}
