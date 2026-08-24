class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const { width, height } = this.scale;

    this.add.text(width / 2, 120, 'MONSTER TACTICS', {
      fontFamily: 'monospace', fontSize: '48px', color: '#f5f7fa', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(width / 2, 170, 'catch monsters, place them on the grid, hold the line', {
      fontFamily: 'monospace', fontSize: '16px', color: '#9aa4b8'
    }).setOrigin(0.5);

    this.add.text(width / 2, 260, `Roster: ${gameState.roster.length} monster(s)`, {
      fontFamily: 'monospace', fontSize: '18px', color: '#c8ceda'
    }).setOrigin(0.5);

    this.makeButton(width / 2, 340, 'Catch Monsters', () => this.scene.start('CatchScene'));
    this.makeButton(width / 2, 410, 'Team & Battle', () => this.scene.start('RosterScene'));
  }

  makeButton(x, y, label, onClick) {
    const w = 260, h = 56;
    const bg = this.add.rectangle(x, y, w, h, 0x2a3040).setStrokeStyle(2, 0x4a5468);
    const text = this.add.text(x, y, label, {
      fontFamily: 'monospace', fontSize: '18px', color: '#f5f7fa'
    }).setOrigin(0.5);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x394258));
    bg.on('pointerout', () => bg.setFillStyle(0x2a3040));
    bg.on('pointerdown', onClick);

    return { bg, text };
  }
}
