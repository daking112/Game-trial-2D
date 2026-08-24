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

const STAGES = [
  {
    id: 'valley',
    name: 'Winding Valley',
    pathCells: [
      { col: 26, row: 2 }, { col: 18, row: 2 }, { col: 18, row: 12 },
      { col: 9, row: 12 }, { col: 9, row: 2 }, { col: 0, row: 2 }
    ]
  },
  {
    id: 'switchback',
    name: 'Switchback Ridge',
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
    pathCells: [
      { col: 27, row: 0 }, { col: 2, row: 0 }, { col: 2, row: 6 },
      { col: 25, row: 6 }, { col: 25, row: 12 }, { col: 2, row: 12 },
      { col: 2, row: 15 }, { col: 0, row: 15 }
    ]
  },
  {
    id: 'gauntlet',
    name: 'The Gauntlet',
    pathCells: [
      { col: 27, row: 8 }, { col: 9, row: 8 }, { col: 9, row: 0 }, { col: 0, row: 0 }
    ]
  },
  {
    id: 'coil',
    name: "Serpent's Coil",
    pathCells: [
      { col: 27, row: 3 }, { col: 23, row: 3 }, { col: 23, row: 14 },
      { col: 18, row: 14 }, { col: 18, row: 3 }, { col: 13, row: 3 },
      { col: 13, row: 14 }, { col: 8, row: 14 }, { col: 8, row: 3 },
      { col: 3, row: 3 }, { col: 3, row: 10 }, { col: 0, row: 10 }
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
