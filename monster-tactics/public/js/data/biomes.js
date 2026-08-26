// Per-stage visual theme for BattleScene's grid - which ground/path
// textures to lay down (see scripts/gen_assets.py for how those PNGs are
// generated), what color the path-edge dirt-fleck scatter should be
// (BattleScene.drawPathTransition - brown flecks would look wrong dropped
// onto snow), and what tint to apply to the shared tree/bush/rock
// decoration sprites so the same art reads as biome-appropriate without
// needing new decoration art.
//
// 'grass' is the original/default biome and deliberately keeps the
// original tile-grass/tile-path texture keys rather than new ones - several
// menu-like scenes already reference those directly as their own tiled
// background, so renaming would touch far more than just BattleScene.
// groundAccents: sparse decorative decals (see gen_assets.py's
// ACCENT_SIZE/GROUND_ACCENTS) that BattleScene.drawGroundAccents scatters
// across open (non-path) ground cells - flowers/pebbles/embers etc, purely
// cosmetic texture variety on top of the tileSprite's own repeating pattern.
const BIOMES = {
  grass: {
    groundKey: 'tile-grass',
    pathKey: 'tile-path',
    pathFleckColors: [0x6b4f34, 0xa9865c, 0x5a4028],
    decorTint: null,
    groundAccents: ['grass-accent-1', 'grass-accent-2']
  },
  snow: {
    groundKey: 'tile-snow-ground',
    pathKey: 'tile-snow-path',
    pathFleckColors: [0xe8f4f8, 0xb7d0de, 0xffffff],
    // Phaser tint is multiplicative (result = original x tint / 255), so a
    // pale, near-white tint barely shifts a mid-toned green sprite at all -
    // needs real color/darkness to read as a recolor, not just a wash.
    decorTint: 0x6fa8d8,
    groundAccents: ['snow-accent-1', 'snow-accent-2']
  },
  desert: {
    groundKey: 'tile-desert-ground',
    pathKey: 'tile-desert-path',
    pathFleckColors: [0xa8874c, 0x8f703d, 0xe0c98e],
    decorTint: 0xc9a860,
    groundAccents: ['desert-accent-1', 'desert-accent-2']
  },
  volcanic: {
    groundKey: 'tile-volcanic-ground',
    pathKey: 'tile-volcanic-path',
    pathFleckColors: [0xe0562f, 0xffc46b, 0x5c473a],
    decorTint: 0xb85a3a,
    groundAccents: ['volcanic-accent-1', 'volcanic-accent-2']
  },
  // The two biomes below are the only ones whose ground/path art is real
  // hand-drawn tileset material rather than generated speckle (see
  // gen_assets.py's TILESET_TILES) - everything else about them works the
  // same way.
  cloud: {
    groundKey: 'tile-cloud-ground',
    pathKey: 'tile-cloud-path',
    pathFleckColors: [0xffffff, 0xdbe6ff, 0xaebde8],
    // Washes the shared trees/rocks pale and cold so they read as cloud
    // formations flanking the path rather than land plants floating in
    // open sky.
    decorTint: 0xa8bce0,
    groundAccents: ['cloud-accent-1', 'cloud-accent-2']
  },
  crystal: {
    groundKey: 'tile-crystal-ground',
    pathKey: 'tile-crystal-path',
    pathFleckColors: [0xc98a2e, 0x8a5f1e, 0xe0b154],
    decorTint: 0x9c5aa8,
    groundAccents: ['crystal-accent-1', 'crystal-accent-2']
  }
};

function getBiome(id) {
  return BIOMES[id] || BIOMES.grass;
}
