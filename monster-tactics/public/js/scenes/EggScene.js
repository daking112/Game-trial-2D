class EggScene extends Phaser.Scene {
  constructor() {
    super('EggScene');
  }

  create() {
    const { width } = this.scale;

    this.add.text(width / 2, 50, 'EGG SHOP', {
      fontFamily: 'monospace', fontSize: '28px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.backBtn(() => this.scene.start('MenuScene'));

    this.essenceText = this.add.text(width / 2, 95, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#f5c94b'
    }).setOrigin(0.5);
    this.updateEssenceText();

    this.eggSprite = this.add.rectangle(width / 2, 240, 90, 90, 0x394258)
      .setStrokeStyle(3, 0xf5c94b);
    this.eggLabel = this.add.text(width / 2, 240, '?', {
      fontFamily: 'monospace', fontSize: '36px', color: '#f5c94b', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.resultSprite = null;
    this.resultText = this.add.text(width / 2, 340, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#f5f7fa', align: 'center'
    }).setOrigin(0.5);
    this.resultSubText = this.add.text(width / 2, 365, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#9aa4b8', align: 'center'
    }).setOrigin(0.5);

    this.openBtn = this.makeButton(width / 2, 440, `Open Egg (${EGG_COST} essence)`, () => this.openEgg());
    this.refreshOpenBtn();

    this.oddsText = this.add.text(width / 2, 500, this.oddsString(), {
      fontFamily: 'monospace', fontSize: '11px', color: '#5a6478', align: 'center'
    }).setOrigin(0.5);
  }

  oddsString() {
    const total = Object.values(RARITY).reduce((s, r) => s + r.weight, 0);
    return Object.values(RARITY)
      .map(r => `${r.label} ${Math.round((r.weight / total) * 100)}%`)
      .join('   ');
  }

  updateEssenceText() {
    this.essenceText.setText(`Essence: ${gameState.essence}`);
  }

  refreshOpenBtn() {
    const affordable = gameState.essence >= EGG_COST;
    this.openBtn.bg.setFillStyle(affordable ? 0x2a3040 : 0x1c202a);
    this.openBtn.text.setColor(affordable ? '#f5f7fa' : '#5a6478');
  }

  openEgg() {
    if (!gameState.spendEssence(EGG_COST)) return;
    this.updateEssenceText();
    this.refreshOpenBtn();

    const species = rollGachaSpecies();
    gameState.addToRoster(species.id);

    if (this.resultSprite) this.resultSprite.destroy();
    this.resultSprite = this.add.sprite(this.scale.width / 2, 240, species.sheetKey, species.frame).setScale(0);
    this.eggSprite.setVisible(false);
    this.eggLabel.setVisible(false);

    this.tweens.add({
      targets: this.resultSprite,
      scale: 2.2,
      duration: 300,
      ease: 'Back.Out',
      onComplete: () => {
        this.time.delayedCall(700, () => {
          this.eggSprite.setVisible(true);
          this.eggLabel.setVisible(true);
          if (this.resultSprite) { this.resultSprite.destroy(); this.resultSprite = null; }
        });
      }
    });

    const rarity = RARITY[species.rarity];
    const archetype = COMBAT_ARCHETYPES[species.type];
    this.resultText.setColor(Phaser.Display.Color.IntegerToColor(rarity.color).rgba);
    this.resultText.setText(`${rarity.label}: ${species.name}!`);
    this.resultSubText.setText(
      `Type ${species.type}   HP ${species.maxHp} / ATK ${species.attack}   Tower cost ${species.cost}\n` +
      `Attack: ${archetype.attackLabel}   Ability: ${archetype.abilityLabel}`
    );
  }

  makeButton(x, y, label, onClick) {
    const w = 260, h = 52;
    const bg = this.add.rectangle(x, y, w, h, 0x2a3040).setStrokeStyle(2, 0x4a5468);
    const text = this.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: '15px', color: '#f5f7fa'
    }).setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x394258));
    bg.on('pointerout', () => this.refreshOpenBtn());
    bg.on('pointerdown', onClick);

    return { bg, text };
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
