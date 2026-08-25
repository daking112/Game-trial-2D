class VictoryScene extends Phaser.Scene {
  constructor() {
    super('VictoryScene');
  }

  create() {
    const { width, height } = this.scale;

    this.add.tileSprite(width / 2, height / 2, width, height, 'tile-grass');
    this.add.rectangle(width / 2, height / 2, width, height, 0x12151d, 0.6);
    this.add.image(width / 2, height / 2, 'vignette').setDisplaySize(width, height);

    this.add.text(width / 2, height / 2 - 150, 'RUN COMPLETE!', {
      fontFamily: 'monospace', fontSize: '60px', color: '#f5c94b', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 7);
    this.add.text(width / 2, height / 2 - 60, `Cleared all ${RUN_TARGET_STAGES} stages`, {
      fontFamily: 'monospace', fontSize: '27px', color: '#f5f7fa'
    }).setOrigin(0.5).setStroke('#1c2530', 4);
    this.add.text(width / 2, height / 2 - 15, `Final Score: ${gameState.score}   Lives remaining: ${gameState.lives}/${gameState.maxLives}`, {
      fontFamily: 'monospace', fontSize: '22px', color: '#c8ceda'
    }).setOrigin(0.5).setStroke('#1c2530', 4);
    this.add.text(width / 2, height / 2 + 25, `+${gameState.lastMasteryEarned || 0} Mastery earned (${gameState.mastery} total) - spend it on permanent upgrades`, {
      fontFamily: 'monospace', fontSize: '19px', color: '#f5c94b'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    UiKit.makeButton(this, width / 2, height / 2 + 100, 'Start New Run', () => {
      gameState.runActive = false;
      this.scene.start('RosterScene');
    }, { size: 'large' });
    UiKit.makeButton(this, width / 2, height / 2 + 200, 'Spend Mastery', () => {
      this.scene.start('MasteryScene');
    }, { size: 'large', tint: 0xf5c94b });
    UiKit.makeButton(this, width / 2, height / 2 + 300, 'Return to Menu', () => {
      this.scene.start('MenuScene');
    }, { size: 'large' });
  }
}
