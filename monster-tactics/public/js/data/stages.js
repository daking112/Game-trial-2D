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
// Grid is 16 cols x 8 rows (see BattleScene GRID_COLS/GRID_ROWS) - every
// path here enters at col 15 (the spawn edge) and exits at col 0 (the base
// edge).

const STAGES = [
  {
    id: 'valley',
    name: 'Winding Valley',
    pathCells: [
      { col: 15, row: 1 }, { col: 10, row: 1 }, { col: 10, row: 6 },
      { col: 5, row: 6 }, { col: 5, row: 1 }, { col: 0, row: 1 }
    ]
  },
  {
    id: 'switchback',
    name: 'Switchback Ridge',
    pathCells: [
      { col: 15, row: 6 }, { col: 12, row: 6 }, { col: 12, row: 1 },
      { col: 9, row: 1 }, { col: 9, row: 6 }, { col: 6, row: 6 },
      { col: 6, row: 1 }, { col: 3, row: 1 }, { col: 3, row: 6 },
      { col: 0, row: 6 }
    ]
  },
  {
    id: 'sweep',
    name: 'Full Sweep',
    pathCells: [
      { col: 15, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 3 },
      { col: 14, row: 3 }, { col: 14, row: 6 }, { col: 1, row: 6 },
      { col: 1, row: 7 }, { col: 0, row: 7 }
    ]
  },
  {
    id: 'gauntlet',
    name: 'The Gauntlet',
    pathCells: [
      { col: 15, row: 4 }, { col: 5, row: 4 }, { col: 5, row: 0 }, { col: 0, row: 0 }
    ]
  },
  {
    id: 'coil',
    name: "Serpent's Coil",
    pathCells: [
      { col: 15, row: 2 }, { col: 13, row: 2 }, { col: 13, row: 7 },
      { col: 10, row: 7 }, { col: 10, row: 2 }, { col: 7, row: 2 },
      { col: 7, row: 7 }, { col: 4, row: 7 }, { col: 4, row: 2 },
      { col: 1, row: 2 }, { col: 1, row: 5 }, { col: 0, row: 5 }
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
