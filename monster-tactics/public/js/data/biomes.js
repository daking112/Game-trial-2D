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
const BIOMES = {
  grass: {
    groundKey: 'tile-grass',
    pathKey: 'tile-path',
    pathFleckColors: [0x6b4f34, 0xa9865c, 0x5a4028],
    decorTint: null
  },
  snow: {
    groundKey: 'tile-snow-ground',
    pathKey: 'tile-snow-path',
    pathFleckColors: [0xe8f4f8, 0xb7d0de, 0xffffff],
    // Phaser tint is multiplicative (result = original x tint / 255), so a
    // pale, near-white tint barely shifts a mid-toned green sprite at all -
    // needs real color/darkness to read as a recolor, not just a wash.
    decorTint: 0x6fa8d8
  },
  desert: {
    groundKey: 'tile-desert-ground',
    pathKey: 'tile-desert-path',
    pathFleckColors: [0xa8874c, 0x8f703d, 0xe0c98e],
    decorTint: 0xc9a860
  },
  volcanic: {
    groundKey: 'tile-volcanic-ground',
    pathKey: 'tile-volcanic-path',
    pathFleckColors: [0xe0562f, 0xffc46b, 0x5c473a],
    decorTint: 0xb85a3a
  }
};

function getBiome(id) {
  return BIOMES[id] || BIOMES.grass;
}
