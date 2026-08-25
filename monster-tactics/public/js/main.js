const config = {
  type: Phaser.AUTO,
  width: 1920,
  height: 1080,
  parent: 'game-container',
  backgroundColor: '#12151d',
  scene: [PreloadScene, MenuScene, SanctuaryScene, RosterScene, BattleScene, HubScene, VictoryScene, WorldScene, MasteryScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};

window.game = new Phaser.Game(config);

// Browsers refuse to start an AudioContext before a real user gesture -
// unlock it on the page's very first pointerdown, wherever that happens to
// land, so the first menu click's own sound isn't silently dropped.
document.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });
