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
