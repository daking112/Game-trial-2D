// Species and type data for Monster Tactics.
// Stats are early placeholder balance values, tuned to be "roughly playable"
// rather than final - expect to retune once real art/waves are in.
//
// Art: "Retromon Big Pack 1" by Willibab (https://willibab.itch.io/) - free for
// personal/commercial use with credit, see assets/retromon/LICENSE.txt.
// Sheet is a 9x8 grid of 56x56 frames (frame index = row * 9 + col).
// Player species use a line's small/base form; enemy species reuse that same
// line's evolved form, so wave "monsters" are thematically the wild/grown
// version of what you can catch.

const RETROMON_SHEET = 'retromon-b1';

const TYPE_COLORS = {
  FIRE: 0xe0562f,
  WATER: 0x3d8fd6,
  GRASS: 0x4caf50,
  ELECTRIC: 0xf5c94b,
  EARTH: 0x8a6d3b,
  NORMAL: 0xb0b0b0
};

// Player-catchable species. range/attackIntervalMs are in grid cells / milliseconds.
const SPECIES = [
  { id: 'rollpup', name: 'Rollpup', type: 'GRASS', sheetKey: RETROMON_SHEET, frame: 0, maxHp: 24, attack: 7, range: 1, attackIntervalMs: 750, catchRate: 0.60 },
  { id: 'snarlpup', name: 'Snarlpup', type: 'FIRE', sheetKey: RETROMON_SHEET, frame: 3, maxHp: 22, attack: 10, range: 1, attackIntervalMs: 650, catchRate: 0.50 },
  { id: 'hornlet', name: 'Hornlet', type: 'EARTH', sheetKey: RETROMON_SHEET, frame: 6, maxHp: 30, attack: 6, range: 1, attackIntervalMs: 850, catchRate: 0.55 },
  { id: 'puffle', name: 'Puffle', type: 'NORMAL', sheetKey: RETROMON_SHEET, frame: 27, maxHp: 38, attack: 5, range: 2, attackIntervalMs: 900, catchRate: 0.65 },
  { id: 'snoutling', name: 'Snoutling', type: 'EARTH', sheetKey: RETROMON_SHEET, frame: 30, maxHp: 26, attack: 8, range: 1, attackIntervalMs: 750, catchRate: 0.55 },
  { id: 'grubcoil', name: 'Grubcoil', type: 'GRASS', sheetKey: RETROMON_SHEET, frame: 49, maxHp: 20, attack: 9, range: 2, attackIntervalMs: 700, catchRate: 0.55 },
  { id: 'icewhelp', name: 'Icewhelp', type: 'WATER', sheetKey: RETROMON_SHEET, frame: 65, maxHp: 22, attack: 6, range: 2, attackIntervalMs: 800, catchRate: 0.50 }
];

// Enemy species that spawn during battle waves. speed is pixels/second.
// These are the evolved forms of the matching player species' lines above.
const ENEMY_SPECIES = [
  { id: 'widow', name: 'Widow', type: 'NORMAL', sheetKey: RETROMON_SHEET, frame: 33, maxHp: 14, attack: 1, speed: 48, reward: 4 },
  { id: 'rollodon', name: 'Rollodon', type: 'GRASS', sheetKey: RETROMON_SHEET, frame: 2, maxHp: 40, attack: 2, speed: 20, reward: 10 },
  { id: 'ragefang', name: 'Ragefang', type: 'FIRE', sheetKey: RETROMON_SHEET, frame: 5, maxHp: 28, attack: 3, speed: 34, reward: 9 },
  { id: 'tuskram', name: 'Tuskram', type: 'EARTH', sheetKey: RETROMON_SHEET, frame: 8, maxHp: 34, attack: 2, speed: 26, reward: 8 }
];

function getSpecies(id) {
  return SPECIES.find(s => s.id === id);
}

function getEnemySpecies(id) {
  return ENEMY_SPECIES.find(s => s.id === id);
}

function randomSpecies() {
  return SPECIES[Math.floor(Math.random() * SPECIES.length)];
}
