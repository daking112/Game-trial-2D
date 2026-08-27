// Shared battle-grid constants + pure geometry helpers, ported 1:1 from the
// pixel-art BattleScene.js's own GRID_COLS/GRID_ROWS/path-blocking logic so
// stage layouts (data/stages.js pathCells) read identically in both
// versions - just CELL is now a 3D world-unit size instead of a pixel size.
const GRID_COLS = 28;
const GRID_ROWS = 16;
const CELL = 1.5;
// WAVES_PER_STAGE / RUN_TARGET_STAGES already come from state/GameState.js
// (loaded before this file) - not redeclared here to avoid a duplicate
// `const` SyntaxError.
const BOSS_WAVE_INTERVAL = 5;

function cellToWorld(col, row) {
  return { x: (col - GRID_COLS / 2 + 0.5) * CELL, z: (row - GRID_ROWS / 2 + 0.5) * CELL };
}

// Same rule as BattleScene.buildPathBlockedCells: every consecutive waypoint
// pair shares a row or column, mark every cell on that straight segment.
function computePathBlockedCells(pathCells) {
  const blocked = new Set();
  const mark = (c, r) => blocked.add(r + ',' + c);
  for (let i = 0; i < pathCells.length - 1; i++) {
    const a = pathCells[i], b = pathCells[i + 1];
    if (a.row === b.row) {
      const [from, to] = a.col < b.col ? [a.col, b.col] : [b.col, a.col];
      for (let c = from; c <= to; c++) mark(c, a.row);
    } else {
      const [from, to] = a.row < b.row ? [a.row, b.row] : [b.row, a.row];
      for (let r = from; r <= to; r++) mark(a.col, r);
    }
  }
  return blocked;
}

// Same shape as BattleScene.buildPathWaypoints: an off-grid spawn point past
// the entry cell, every on-grid waypoint in order, then an off-grid base
// point past the exit cell - what enemies actually walk between.
function buildPathWaypoints(pathCells) {
  const entry = cellToWorld(pathCells[0].col, pathCells[0].row);
  const exit = cellToWorld(pathCells[pathCells.length - 1].col, pathCells[pathCells.length - 1].row);
  const spawn = { x: (GRID_COLS / 2 + 1) * CELL, z: entry.z };
  const base = { x: -(GRID_COLS / 2 + 1) * CELL, z: exit.z };
  const onGrid = pathCells.map(c => cellToWorld(c.col, c.row));
  return [spawn, ...onGrid, base];
}
