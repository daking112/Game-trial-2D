class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const { width, height } = this.scale;

    // Reaching the menu inherently means no run is in progress - clears the
    // context flag SanctuaryScene/RosterScene use to route their back
    // button to the Hub instead of here.
    gameState.runActive = false;

    this.add.tileSprite(width / 2, height / 2, width, height, 'tile-grass');
    this.add.rectangle(width / 2, height / 2, width, height, 0x12151d, 0.55);

    this.add.sprite(width / 2, 88, 'tree-1').play('tree-1-sway').setScale(0.7).setAlpha(0.5);
    this.add.sprite(width - 90, 100, 'tree-2').play('tree-2-sway').setScale(0.6).setAlpha(0.5);

    this.add.text(width / 2, 120, 'MONSTER TACTICS', {
      fontFamily: 'monospace', fontSize: '48px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 5);

    this.add.text(width / 2, 170, 'hatch monsters, place them along the path, hold the line', {
      fontFamily: 'monospace', fontSize: '16px', color: '#c8ceda'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    this.add.text(width / 2, 250, `Roster: ${Object.keys(gameState.roster).length} monster(s)`, {
      fontFamily: 'monospace', fontSize: '18px', color: '#e8ecf5'
    }).setOrigin(0.5).setStroke('#1c2530', 3);
    this.add.text(width / 2, 278, `Essence: ${gameState.essence}`, {
      fontFamily: 'monospace', fontSize: '16px', color: '#f5c94b'
    }).setOrigin(0.5).setStroke('#1c2530', 3);

    UiKit.makeButton(this, width / 2, 340, 'Monster Sanctuary', () => this.scene.start('SanctuaryScene'), { size: 'large' });
    UiKit.makeButton(this, width / 2, 410, 'Team & Battle', () => this.scene.start('RosterScene'), { size: 'large' });
  }
}
