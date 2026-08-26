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

    // Retromon Big Pack 2 - same author/license/grid as Big Pack 1 above,
    // opened to add ELECTRIC/WATER/NORMAL variety (see RETROMON2_SHEET's
    // comment in data/monsters.js).
    this.load.spritesheet(RETROMON2_SHEET, 'assets/retromon/big-pack-2.png', {
      frameWidth: 56,
      frameHeight: 56
    });

    // Hand-authored seamless ground tiles (see scripts note in README.md -
    // procedurally generated, not sourced from any asset pack).
    this.load.image('tile-grass', 'assets/tiles/grass.png');
    this.load.image('tile-path', 'assets/tiles/path.png');
    // Biome ground/path variants for non-grass stages - see data/biomes.js
    // and gen_assets.py's BIOME_TILES for how these are generated/picked.
    this.load.image('tile-snow-ground', 'assets/tiles/snow-ground.png');
    this.load.image('tile-snow-path', 'assets/tiles/snow-path.png');
    this.load.image('tile-desert-ground', 'assets/tiles/desert-ground.png');
    this.load.image('tile-desert-path', 'assets/tiles/desert-path.png');
    this.load.image('tile-volcanic-ground', 'assets/tiles/volcanic-ground.png');
    this.load.image('tile-volcanic-path', 'assets/tiles/volcanic-path.png');

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
    // Pre-rendered title logo (gradient fill + outline + drop shadow baked
    // in - see scripts/gen_assets.py make_title_logo) - was a plain flat
    // Phaser Text object.
    this.load.image('title-logo', 'assets/ui/title-logo.png');
    // Soft radial darken for MenuScene's background - see gen_assets.py
    // make_vignette.
    this.load.image('vignette', 'assets/ui/vignette.png');

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
    // Tree3/Tree4 from the same Tiny Swords pack as tree-1/tree-2 above,
    // already extracted in the sibling tinyswords/ project but never wired
    // into this game - more decoration variety for free, no new art needed
    // (copied as-is into assets/decor/, same as tree-1/tree-2 were).
    this.load.spritesheet('tree-3', 'assets/decor/tree-3.png', { frameWidth: 192, frameHeight: 192 });
    this.load.spritesheet('tree-4', 'assets/decor/tree-4.png', { frameWidth: 192, frameHeight: 192 });
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
    this.anims.create({
      key: 'tree-3-sway', frames: this.anims.generateFrameNumbers('tree-3', { start: 0, end: 7 }),
      frameRate: 5, repeat: -1
    });
    this.anims.create({
      key: 'tree-4-sway', frames: this.anims.generateFrameNumbers('tree-4', { start: 0, end: 7 }),
      frameRate: 5, repeat: -1
    });

    this.scene.start('MenuScene');
  }
}
