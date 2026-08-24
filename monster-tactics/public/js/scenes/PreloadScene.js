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

    // Hand-authored seamless ground tiles (see scripts note in README.md -
    // procedurally generated, not sourced from any asset pack).
    this.load.image('tile-grass', 'assets/tiles/grass.png');
    this.load.image('tile-path', 'assets/tiles/path.png');

    // UI buttons/panels: stitched from the "Custom Border and Panels" pack's
    // green frame design into flattened textures at the exact sizes this
    // game uses - see README.md and scripts/gen_assets.py.
    this.load.image('btn-large', 'assets/ui/btn-large.png');
    this.load.image('btn-medium', 'assets/ui/btn-medium.png');
    this.load.image('panel-hud', 'assets/ui/panel-hud.png');
    this.load.image('panel-overlay', 'assets/ui/panel-overlay.png');
    this.load.image('panel-card-roster', 'assets/ui/panel-card-roster.png');
    this.load.image('panel-card-hub', 'assets/ui/panel-card-hub.png');
    this.load.image('panel-card-banner', 'assets/ui/panel-card-banner.png');
    this.load.image('panel-egg', 'assets/ui/panel-egg.png');
    this.load.image('bench-slot', 'assets/ui/bench-slot.png');

    // Coin/star icons from the "Humble Gift" pack - already gold-toned to
    // match this game's existing essence/coin color, used unmodified.
    this.load.image('icon-coin', 'assets/ui/icon-coin.png');
    this.load.image('icon-essence', 'assets/ui/icon-essence.png');

    // Tiny Swords decorations, used as-is to dress the battle grid border.
    this.load.image('rock-1', 'assets/decor/rock-1.png');
    this.load.image('rock-2', 'assets/decor/rock-2.png');
    this.load.image('rock-3', 'assets/decor/rock-3.png');
    this.load.image('rock-4', 'assets/decor/rock-4.png');
    this.load.spritesheet('bush-1', 'assets/decor/bush-1.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('bush-2', 'assets/decor/bush-2.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('tree-1', 'assets/decor/tree-1.png', { frameWidth: 192, frameHeight: 256 });
    this.load.spritesheet('tree-2', 'assets/decor/tree-2.png', { frameWidth: 192, frameHeight: 256 });
  }

  create() {
    this.anims.create({
      key: 'hit-spark-anim',
      frames: this.anims.generateFrameNumbers('hit-spark', { start: 0, end: 7 }),
      frameRate: 24,
      hideOnComplete: true
    });

    this.anims.create({
      key: 'bush-1-sway', frames: this.anims.generateFrameNumbers('bush-1', { start: 0, end: 7 }),
      frameRate: 5, repeat: -1
    });
    this.anims.create({
      key: 'bush-2-sway', frames: this.anims.generateFrameNumbers('bush-2', { start: 0, end: 7 }),
      frameRate: 5, repeat: -1
    });
    this.anims.create({
      key: 'tree-1-sway', frames: this.anims.generateFrameNumbers('tree-1', { start: 0, end: 7 }),
      frameRate: 5, repeat: -1
    });
    this.anims.create({
      key: 'tree-2-sway', frames: this.anims.generateFrameNumbers('tree-2', { start: 0, end: 7 }),
      frameRate: 5, repeat: -1
    });

    this.scene.start('MenuScene');
  }
}
