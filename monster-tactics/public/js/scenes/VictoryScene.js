class VictoryScene extends Phaser.Scene {
  constructor() {
    super('VictoryScene');
  }

  create() {
    const { width, height } = this.scale;

    this.add.tileSprite(width / 2, height / 2, width, height, 'tile-grass');
    this.add.rectangle(width / 2, height / 2, width, height, 0x12151d, 0.6);

    this.add.text(width / 2, height / 2 - 100, 'RUN COMPLETE!', {
      fontFamily: 'monospace', fontSize: '40px', color: '#f5c94b', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 5);
    this.add.text(width / 2, height / 2 - 40, `Cleared all ${RUN_TARGET_STAGES} stages`, {
      fontFamily: 'monospace', fontSize: '18px', color: '#f5f7fa'
    }).setOrigin(0.5).setStroke('#1c2530', 3);
    this.add.text(width / 2, height / 2 - 10, `Final Score: ${gameState.score}   Lives remaining: ${gameState.lives}/${gameState.maxLives}`, {
      fontFamily: 'monospace', fontSize: '15px', color: '#c8ceda'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    UiKit.makeButton(this, width / 2, height / 2 + 60, 'Start New Run', () => {
      gameState.runActive = false;
      this.scene.start('RosterScene');
    }, { size: 'large' });
    UiKit.makeButton(this, width / 2, height / 2 + 125, 'Return to Menu', () => {
      this.scene.start('MenuScene');
    });
  }
}
