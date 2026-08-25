// Spends Mastery (see data/talents.js + GameState.masteryForRunEnd) on
// permanent, run-independent upgrades - the one thing a run leaves behind
// that never resets, on either a win or a loss.
class MasteryScene extends Phaser.Scene {
  constructor() {
    super('MasteryScene');
  }

  create() {
    const { width, height } = this.scale;

    this.add.tileSprite(width / 2, height / 2, width, height, 'tile-grass');
    this.add.rectangle(width / 2, height / 2, width, height, 0x12151d, 0.68);
    this.add.image(width / 2, height / 2, 'vignette').setDisplaySize(width, height);

    this.add.text(width / 2, 60, 'MASTERY', {
      fontFamily: 'monospace', fontSize: '42px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 6);
    this.add.text(width / 2, 106, 'Permanent upgrades earned by completing runs - never resets, win or lose.', {
      fontFamily: 'monospace', fontSize: '17px', color: '#c8ceda'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    this.masteryText = this.add.text(width / 2, 148, '', {
      fontFamily: 'monospace', fontSize: '24px', color: '#f5c94b'
    }).setOrigin(0.5).setStroke('#1c2530', 4);
    this.updateMasteryText();

    const backTarget = gameState.inMultiplayerWorld ? 'WorldScene' : (gameState.runActive ? 'HubScene' : 'MenuScene');
    const backLabel = backTarget === 'HubScene' ? '< Hub' : backTarget === 'WorldScene' ? '< World' : '< Menu';
    UiKit.makeLink(this, 30, 30, backLabel, () => this.scene.start(backTarget), { originX: 0, originY: 0 });

    this.cards = [];
    const cardW = 430, cardH = 320;
    const startX = width / 2 - cardW;
    TALENTS.forEach((talent, i) => {
      const x = startX + i * cardW;
      this.buildTalentCard(talent, x, 420, cardW - 30, cardH);
    });
  }

  buildTalentCard(talent, x, y, w, h) {
    this.add.rectangle(x, y, w, h, 0x1c2530, 0.85).setStrokeStyle(2, 0x394258);
    this.add.text(x, y - h / 2 + 40, talent.icon, { fontSize: '40px' }).setOrigin(0.5);
    this.add.text(x, y - h / 2 + 92, talent.name, {
      fontFamily: 'monospace', fontSize: '24px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 4);

    const levelText = this.add.text(x, y - h / 2 + 130, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#c8ceda'
    }).setOrigin(0.5);

    const effectText = this.add.text(x, y - h / 2 + 170, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#e8ecf5', align: 'center', wordWrap: { width: w - 50 }
    }).setOrigin(0.5);

    const upgradeBg = this.add.rectangle(x, y + h / 2 - 40, w - 60, 44, 0x2f4a34).setStrokeStyle(2, 0x4caf50);
    const upgradeText = this.add.text(x, y + h / 2 - 40, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#f5f7fa'
    }).setOrigin(0.5);

    const card = { talent, levelText, effectText, upgradeBg, upgradeText };
    this.cards.push(card);
    this.refreshCard(card);

    upgradeBg.on('pointerdown', () => {
      if (gameState.upgradeTalent(talent.id)) {
        Sfx.coin();
        this.updateMasteryText();
        this.refreshCard(card);
      } else {
        Sfx.error();
      }
    });
  }

  refreshCard(card) {
    const level = gameState.talents[card.talent.id] || 0;
    const maxed = level >= card.talent.maxLevel;
    card.levelText.setText(`Level ${level}/${card.talent.maxLevel}`);
    card.effectText.setText(card.talent.describe(level));

    if (maxed) {
      card.upgradeText.setText('MAXED');
      card.upgradeBg.setFillStyle(0x1c202a).setStrokeStyle(2, 0x394258);
      card.upgradeBg.disableInteractive();
    } else {
      const cost = talentCostForLevel(card.talent, level);
      const affordable = gameState.mastery >= cost;
      card.upgradeText.setText(`Upgrade - ${cost} Mastery`);
      card.upgradeBg.setFillStyle(affordable ? 0x2f4a34 : 0x394258).setStrokeStyle(2, affordable ? 0x4caf50 : 0x5a6478);
      card.upgradeBg.setInteractive({ useHandCursor: true });
    }
  }

  updateMasteryText() {
    this.masteryText.setText(`Mastery: ${gameState.mastery}`);
  }
}
