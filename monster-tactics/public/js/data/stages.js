// Stage pool: each is a distinct path layout for BattleScene. A run picks
// a fixed first stage, then HubScene offers a choice of 2 random stages
// (from this pool, excluding a repeat of the one just cleared where
// possible) after every clear - a lightweight single-player stand-in for
// "vote on the next map" (see README - real voting needs multiple players,
// which needs backend infra this project doesn't have).
//
// pathCells: waypoints in grid cells the path bends through, in order.
// Every consecutive pair must share a row OR a column (BattleScene walks
// straight segments between them) - see BattleScene.buildPathBlockedCells.
// Grid is 28 cols x 16 rows (see BattleScene GRID_COLS/GRID_ROWS) - big
// enough that BattleScene needs a scrollable camera to see it all at once -
// every path here enters near col 27 (the spawn edge) and exits near col 0
// (the base edge).
//
// biome: which ground/path texture pair + decoration tint BattleScene draws
// this stage with (see data/biomes.js) - omitted (or 'grass') for the
// original 5 stages, which keep the game's original look unchanged.

const STAGES = [
  {
    id: 'valley',
    name: 'Winding Valley',
    biome: 'grass',
    pathCells: [
      { col: 26, row: 2 }, { col: 18, row: 2 }, { col: 18, row: 12 },
      { col: 9, row: 12 }, { col: 9, row: 2 }, { col: 0, row: 2 }
    ]
  },
  {
    id: 'switchback',
    name: 'Switchback Ridge',
    biome: 'grass',
    pathCells: [
      { col: 27, row: 14 }, { col: 24, row: 14 }, { col: 24, row: 2 },
      { col: 21, row: 2 }, { col: 21, row: 14 }, { col: 18, row: 14 },
      { col: 18, row: 2 }, { col: 15, row: 2 }, { col: 15, row: 14 },
      { col: 12, row: 14 }, { col: 12, row: 2 }, { col: 9, row: 2 },
      { col: 9, row: 14 }, { col: 6, row: 14 }, { col: 6, row: 2 },
      { col: 3, row: 2 }, { col: 3, row: 14 }, { col: 0, row: 14 }
    ]
  },
  {
    id: 'sweep',
    name: 'Full Sweep',
    biome: 'grass',
    pathCells: [
      { col: 27, row: 0 }, { col: 2, row: 0 }, { col: 2, row: 6 },
      { col: 25, row: 6 }, { col: 25, row: 12 }, { col: 2, row: 12 },
      { col: 2, row: 15 }, { col: 0, row: 15 }
    ]
  },
  {
    id: 'gauntlet',
    name: 'The Gauntlet',
    biome: 'grass',
    pathCells: [
      { col: 27, row: 8 }, { col: 9, row: 8 }, { col: 9, row: 0 }, { col: 0, row: 0 }
    ]
  },
  {
    id: 'coil',
    name: "Serpent's Coil",
    biome: 'grass',
    pathCells: [
      { col: 27, row: 3 }, { col: 23, row: 3 }, { col: 23, row: 14 },
      { col: 18, row: 14 }, { col: 18, row: 3 }, { col: 13, row: 3 },
      { col: 13, row: 14 }, { col: 8, row: 14 }, { col: 8, row: 3 },
      { col: 3, row: 3 }, { col: 3, row: 10 }, { col: 0, row: 10 }
    ]
  },

  // -- Snow --
  {
    id: 'frozen-pass',
    name: 'Frozen Pass',
    biome: 'snow',
    pathCells: [
      { col: 27, row: 1 }, { col: 22, row: 1 }, { col: 22, row: 9 },
      { col: 15, row: 9 }, { col: 15, row: 3 }, { col: 8, row: 3 },
      { col: 8, row: 13 }, { col: 0, row: 13 }
    ]
  },
  {
    id: 'glacier-switchback',
    name: 'Glacier Switchback',
    biome: 'snow',
    pathCells: [
      { col: 27, row: 15 }, { col: 25, row: 15 }, { col: 25, row: 1 },
      { col: 20, row: 1 }, { col: 20, row: 15 }, { col: 15, row: 15 },
      { col: 15, row: 1 }, { col: 10, row: 1 }, { col: 10, row: 15 },
      { col: 5, row: 15 }, { col: 5, row: 1 }, { col: 0, row: 1 }
    ]
  },

  // -- Desert --
  {
    id: 'dune-crossing',
    name: 'Dune Crossing',
    biome: 'desert',
    pathCells: [
      { col: 27, row: 5 }, { col: 20, row: 5 }, { col: 20, row: 12 },
      { col: 10, row: 12 }, { col: 10, row: 2 }, { col: 3, row: 2 },
      { col: 3, row: 10 }, { col: 0, row: 10 }
    ]
  },
  {
    id: 'scorpions-maze',
    name: "Scorpion's Maze",
    biome: 'desert',
    pathCells: [
      { col: 27, row: 2 }, { col: 24, row: 2 }, { col: 24, row: 13 },
      { col: 19, row: 13 }, { col: 19, row: 5 }, { col: 14, row: 5 },
      { col: 14, row: 13 }, { col: 9, row: 13 }, { col: 9, row: 2 },
      { col: 0, row: 2 }
    ]
  },

  // -- Volcanic --
  {
    id: 'magma-flow',
    name: 'Magma Flow',
    biome: 'volcanic',
    pathCells: [
      { col: 27, row: 8 }, { col: 21, row: 8 }, { col: 21, row: 2 },
      { col: 16, row: 2 }, { col: 16, row: 14 }, { col: 9, row: 14 },
      { col: 9, row: 6 }, { col: 0, row: 6 }
    ]
  },
  {
    id: 'cinder-trench',
    name: 'Cinder Trench',
    biome: 'volcanic',
    pathCells: [
      { col: 27, row: 0 }, { col: 26, row: 0 }, { col: 26, row: 15 },
      { col: 22, row: 15 }, { col: 22, row: 0 }, { col: 18, row: 0 },
      { col: 18, row: 15 }, { col: 14, row: 15 }, { col: 14, row: 0 },
      { col: 10, row: 0 }, { col: 10, row: 15 }, { col: 6, row: 15 },
      { col: 6, row: 0 }, { col: 0, row: 0 }
    ]
  },

  // -- Procedurally generated (scripts/gen_paths.py) --
  // 2 more per biome, picked by hand from the generator's output for a mix
  // of simple and complex layouts (same "shares a row or column" waypoint
  // rule, just constructed by a randomized rectilinear walk instead of by
  // hand - see the script for how it guarantees validity and avoids
  // self-overlap by construction, and README.md "Path variation" for why
  // this stays an offline/curated tool rather than a live per-run one).
  {
    id: 'thicket-maze',
    name: 'Thicket Maze',
    biome: 'grass',
    pathCells: [
      { col: 26, row: 6 }, { col: 22, row: 6 }, { col: 22, row: 12 },
      { col: 18, row: 12 }, { col: 18, row: 0 }, { col: 9, row: 0 },
      { col: 9, row: 15 }, { col: 3, row: 15 }, { col: 3, row: 6 },
      { col: 0, row: 6 }
    ]
  },
  {
    id: 'wildwood-labyrinth',
    name: 'Wildwood Labyrinth',
    biome: 'grass',
    pathCells: [
      { col: 25, row: 12 }, { col: 23, row: 12 }, { col: 23, row: 15 },
      { col: 20, row: 15 }, { col: 20, row: 1 }, { col: 18, row: 1 },
      { col: 18, row: 11 }, { col: 14, row: 11 }, { col: 14, row: 0 },
      { col: 10, row: 0 }, { col: 10, row: 13 }, { col: 6, row: 13 },
      { col: 6, row: 7 }, { col: 2, row: 7 }, { col: 2, row: 15 },
      { col: 0, row: 15 }
    ]
  },
  {
    id: 'icebound-shortcut',
    name: 'Icebound Shortcut',
    biome: 'snow',
    pathCells: [
      { col: 27, row: 15 }, { col: 15, row: 15 }, { col: 15, row: 0 },
      { col: 0, row: 0 }
    ]
  },
  {
    id: 'blizzard-labyrinth',
    name: 'Blizzard Labyrinth',
    biome: 'snow',
    pathCells: [
      { col: 27, row: 0 }, { col: 25, row: 0 }, { col: 25, row: 15 },
      { col: 19, row: 15 }, { col: 19, row: 9 }, { col: 13, row: 9 },
      { col: 13, row: 13 }, { col: 10, row: 13 }, { col: 10, row: 7 },
      { col: 7, row: 7 }, { col: 7, row: 9 }, { col: 3, row: 9 },
      { col: 3, row: 5 }, { col: 0, row: 5 }
    ]
  },
  {
    id: 'mirage-trail',
    name: 'Mirage Trail',
    biome: 'desert',
    pathCells: [
      { col: 26, row: 7 }, { col: 18, row: 7 }, { col: 18, row: 0 },
      { col: 11, row: 0 }, { col: 11, row: 15 }, { col: 4, row: 15 },
      { col: 4, row: 5 }, { col: 0, row: 5 }
    ]
  },
  {
    id: 'sandstorm-gauntlet',
    name: 'Sandstorm Gauntlet',
    biome: 'desert',
    pathCells: [
      { col: 26, row: 14 }, { col: 22, row: 14 }, { col: 22, row: 0 },
      { col: 20, row: 0 }, { col: 20, row: 11 }, { col: 12, row: 11 },
      { col: 12, row: 0 }, { col: 6, row: 0 }, { col: 6, row: 15 },
      { col: 3, row: 15 }, { col: 3, row: 11 }, { col: 0, row: 11 }
    ]
  },
  {
    id: 'ashfall-rift',
    name: 'Ashfall Rift',
    biome: 'volcanic',
    pathCells: [
      { col: 25, row: 5 }, { col: 15, row: 5 }, { col: 15, row: 0 },
      { col: 7, row: 0 }, { col: 7, row: 15 }, { col: 0, row: 15 }
    ]
  },
  {
    id: 'inferno-labyrinth',
    name: 'Inferno Labyrinth',
    biome: 'volcanic',
    pathCells: [
      { col: 26, row: 9 }, { col: 22, row: 9 }, { col: 22, row: 0 },
      { col: 19, row: 0 }, { col: 19, row: 15 }, { col: 14, row: 15 },
      { col: 14, row: 11 }, { col: 11, row: 11 }, { col: 11, row: 5 },
      { col: 6, row: 5 }, { col: 6, row: 8 }, { col: 2, row: 8 },
      { col: 2, row: 10 }, { col: 0, row: 10 }
    ]
  },

  // -- Cloud / Crystal (tileset-art biomes, see data/biomes.js) --
  // Same generator as the block above, one simpler and one maze-like per
  // biome.
  {
    id: 'skybridge',
    name: 'Skybridge',
    biome: 'cloud',
    pathCells: [
      { col: 25, row: 0 }, { col: 14, row: 0 }, { col: 14, row: 15 },
      { col: 0, row: 15 }
    ]
  },
  {
    id: 'stormreach-spiral',
    name: 'Stormreach Spiral',
    biome: 'cloud',
    pathCells: [
      { col: 25, row: 2 }, { col: 22, row: 2 }, { col: 22, row: 14 },
      { col: 20, row: 14 }, { col: 20, row: 3 }, { col: 15, row: 3 },
      { col: 15, row: 6 }, { col: 12, row: 6 }, { col: 12, row: 10 },
      { col: 10, row: 10 }, { col: 10, row: 0 }, { col: 7, row: 0 },
      { col: 7, row: 15 }, { col: 5, row: 15 }, { col: 5, row: 2 },
      { col: 0, row: 2 }
    ]
  },
  {
    id: 'geode-hollow',
    name: 'Geode Hollow',
    biome: 'crystal',
    pathCells: [
      { col: 27, row: 10 }, { col: 15, row: 10 }, { col: 15, row: 15 },
      { col: 11, row: 15 }, { col: 11, row: 8 }, { col: 7, row: 8 },
      { col: 7, row: 0 }, { col: 0, row: 0 }
    ]
  },
  {
    id: 'prism-descent',
    name: 'Prism Descent',
    biome: 'crystal',
    pathCells: [
      { col: 25, row: 4 }, { col: 22, row: 4 }, { col: 22, row: 11 },
      { col: 18, row: 11 }, { col: 18, row: 15 }, { col: 14, row: 15 },
      { col: 14, row: 3 }, { col: 9, row: 3 }, { col: 9, row: 9 },
      { col: 4, row: 9 }, { col: 4, row: 0 }, { col: 0, row: 0 }
    ]
  }
];

const FIRST_STAGE_ID = 'valley';

function getStage(id) {
  return STAGES.find(s => s.id === id);
}

// Returns `count` distinct stages, preferring not to repeat excludeId
// unless the pool is too small to avoid it.
function pickStageChoices(count, excludeId) {
  const pool = STAGES.filter(s => s.id !== excludeId);
  const source = pool.length >= count ? pool : STAGES;
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
