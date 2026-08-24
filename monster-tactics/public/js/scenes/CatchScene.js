class CatchScene extends Phaser.Scene {
  constructor() {
    super('CatchScene');
  }

  create() {
    const { width } = this.scale;

    this.add.text(width / 2, 50, 'WILD ENCOUNTER', {
      fontFamily: 'monospace', fontSize: '28px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.backBtn(() => this.scene.start('MenuScene'));

    this.infoText = this.add.text(width / 2, 400, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#c8ceda', align: 'center'
    }).setOrigin(0.5);

    this.resultText = this.add.text(width / 2, 440, '', {
      fontFamily: 'monospace', fontSize: '18px', color: '#f5c94b', fontStyle: 'bold', align: 'center'
    }).setOrigin(0.5);

    this.awaitingReroll = false;
    this.catchBtn = this.makeButton(width / 2, 500, 'Attempt Catch', () => {
      if (this.awaitingReroll) this.rollEncounter();
      else this.attemptCatch();
    });

    this.rollEncounter();
  }

  rollEncounter() {
    this.awaitingReroll = false;
    this.currentSpecies = randomSpecies();
    this.resultText.setText('');

    if (this.sprite) this.sprite.destroy();
    this.sprite = this.add.sprite(this.scale.width / 2, 220, this.currentSpecies.sheetKey, this.currentSpecies.frame).setScale(2.5);

    if (this.nameText) this.nameText.destroy();
    this.nameText = this.add.text(this.scale.width / 2, 300, this.currentSpecies.name, {
      fontFamily: 'monospace', fontSize: '22px', color: '#f5f7fa'
    }).setOrigin(0.5);

    const sp = this.currentSpecies;
    this.infoText.setText(
      `Type: ${sp.type}   HP: ${sp.maxHp}   ATK: ${sp.attack}   Range: ${sp.range}\n` +
      `Catch Rate: ${Math.round(sp.catchRate * 100)}%`
    );

    this.catchBtn.bg.setFillStyle(0x2a3040);
    this.catchBtn.text.setText('Attempt Catch');
  }

  attemptCatch() {
    const success = Math.random() < this.currentSpecies.catchRate;
    if (success) {
      gameState.addToRoster(this.currentSpecies.id);
      this.resultText.setColor('#4caf50');
      this.resultText.setText(`Caught ${this.currentSpecies.name}! It joined your roster.`);
    } else {
      this.resultText.setColor('#e0562f');
      this.resultText.setText(`${this.currentSpecies.name} broke free and fled.`);
    }

    this.awaitingReroll = true;
    this.catchBtn.text.setText('Next Encounter');
  }

  makeButton(x, y, label, onClick) {
    const w = 240, h = 52;
    const bg = this.add.rectangle(x, y, w, h, 0x2a3040).setStrokeStyle(2, 0x4a5468);
    const text = this.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: '16px', color: '#f5f7fa'
    }).setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x394258));
    bg.on('pointerout', () => bg.setFillStyle(0x2a3040));
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
