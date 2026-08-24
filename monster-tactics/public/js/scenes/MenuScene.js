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

    this.add.sprite(350, 180, 'tree-1').play('tree-1-sway').setScale(1.0).setAlpha(0.5);
    this.add.sprite(width - 350, 180, 'tree-2').play('tree-2-sway').setScale(0.85).setAlpha(0.5);

    this.add.text(width / 2, 220, 'MONSTER TACTICS', {
      fontFamily: 'monospace', fontSize: '72px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5).setStroke('#1c2530', 7);

    this.add.text(width / 2, 300, 'hatch monsters, place them along the path, hold the line', {
      fontFamily: 'monospace', fontSize: '22px', color: '#c8ceda'
    }).setOrigin(0.5).setStroke('#1c2530', 4);

    this.add.text(width / 2, 440, `Roster: ${Object.keys(gameState.roster).length} monster(s)`, {
      fontFamily: 'monospace', fontSize: '26px', color: '#e8ecf5'
    }).setOrigin(0.5).setStroke('#1c2530', 4);
    UiKit.iconLabel(this, width / 2, 484, 'icon-essence', `Essence: ${gameState.essence}`, {
      fontFamily: 'monospace', fontSize: '22px', color: '#f5c94b', stroke: '#1c2530', strokeThickness: 4
    }, 24);

    UiKit.makeButton(this, width / 2, 590, 'Monster Sanctuary', () => this.scene.start('SanctuaryScene'), { size: 'large' });
    UiKit.makeButton(this, width / 2, 700, 'Team & Battle', () => this.scene.start('RosterScene'), { size: 'large' });
  }
}
