class VictoryScene extends Phaser.Scene {
  constructor() {
    super('VictoryScene');
  }

  create() {
    const { width, height } = this.scale;

    this.add.text(width / 2, height / 2 - 100, 'RUN COMPLETE!', {
      fontFamily: 'monospace', fontSize: '40px', color: '#f5c94b', fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.text(width / 2, height / 2 - 40, `Cleared all ${RUN_TARGET_STAGES} stages`, {
      fontFamily: 'monospace', fontSize: '18px', color: '#f5f7fa'
    }).setOrigin(0.5);
    this.add.text(width / 2, height / 2 - 10, `Final Score: ${gameState.score}   Lives remaining: ${gameState.lives}/${gameState.maxLives}`, {
      fontFamily: 'monospace', fontSize: '15px', color: '#c8ceda'
    }).setOrigin(0.5);

    this.makeButton(width / 2, height / 2 + 60, 'Start New Run', () => {
      gameState.runActive = false;
      this.scene.start('RosterScene');
    });
    this.makeButton(width / 2, height / 2 + 125, 'Return to Menu', () => {
      this.scene.start('MenuScene');
    });
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
}
