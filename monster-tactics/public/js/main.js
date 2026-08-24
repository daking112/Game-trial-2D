const config = {
  type: Phaser.AUTO,
  width: 960,
  height: 640,
  parent: 'game-container',
  backgroundColor: '#12151d',
  scene: [PreloadScene, MenuScene, SanctuaryScene, RosterScene, BattleScene, HubScene, VictoryScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};

window.game = new Phaser.Game(config);
