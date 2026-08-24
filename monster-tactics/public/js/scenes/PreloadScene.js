class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    // Verified 64x64 cell grid, 9 color-variant rows x 8 frame columns
    // (see tinyswords/public/assets/vfx-pack/index.json for how this was measured).
    // Row 0 (orange) is used as a generic attack-impact spark.
    this.load.spritesheet('hit-spark', 'assets/vfx/hit-spark.png', {
      frameWidth: 64,
      frameHeight: 64
    });

    // Retromon Big Pack 1 by Willibab - verified 56x56 cell grid, 9 cols x 8 rows.
    // See data/monsters.js for which frame index is which species.
    this.load.spritesheet(RETROMON_SHEET, 'assets/retromon/big-pack-1.png', {
      frameWidth: 56,
      frameHeight: 56
    });
  }

  create() {
    this.generatePlaceholderTextures();

    this.anims.create({
      key: 'hit-spark-anim',
      frames: this.anims.generateFrameNumbers('hit-spark', { start: 0, end: 7 }),
      frameRate: 24,
      hideOnComplete: true
    });

    this.scene.start('MenuScene');
  }

  generatePlaceholderTextures() {
    const g = this.add.graphics();

    // Flat UI panel texture (a plain rounded rect) used for buttons/cards.
    g.clear();
    g.fillStyle(0x2a3040, 1);
    g.fillRoundedRect(0, 0, 64, 64, 10);
    g.lineStyle(2, 0x4a5468, 1);
    g.strokeRoundedRect(1, 1, 62, 62, 10);
    g.generateTexture('ui-panel', 64, 64);

    g.destroy();
  }
}
