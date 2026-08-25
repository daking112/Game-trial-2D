const config = {
  type: Phaser.AUTO,
  width: 1920,
  height: 1080,
  parent: 'game-container',
  backgroundColor: '#12151d',
  scene: [PreloadScene, MenuScene, SanctuaryScene, RosterScene, BattleScene, HubScene, VictoryScene, WorldScene, RaidScene, MasteryScene, LeaderboardScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  // Every sprite in this game (monsters, tiles, UI chrome) is hand-pixel-art
  // at a small native size, scaled up - without this, Phaser's default
  // bilinear texture filtering softens every hard pixel edge into a blur.
  // pixelArt also sets antialias:false and roundPixels:true for the same
  // "keep pixels crisp" reason.
  pixelArt: true
};

window.game = new Phaser.Game(config);

// Browsers refuse to start an AudioContext before a real user gesture -
// unlock it on the page's very first pointerdown, wherever that happens to
// land, so the first menu click's own sound isn't silently dropped.
document.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });
