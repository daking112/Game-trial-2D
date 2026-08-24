// Species and type data for Monster Tactics.
// Stats are early placeholder balance values, tuned to be "roughly playable"
// rather than final - expect to retune once real waves are played.
//
// Art: "Retromon Big Pack 1" by Willibab (https://willibab.itch.io/) - free for
// personal/commercial use with credit, see assets/retromon/LICENSE.txt.
// Sheet is a 9x8 grid of 56x56 frames (frame index = row * 9 + col).
//
// Player species (the gacha pool) and enemy species deliberately use
// different frames so a pulled monster never looks identical to something
// attacking your base.

const RETROMON_SHEET = 'retromon-b1';

const TYPE_COLORS = {
  FIRE: 0xe0562f,
  WATER: 0x3d8fd6,
  GRASS: 0x4caf50,
  ELECTRIC: 0xf5c94b,
  EARTH: 0x8a6d3b,
  NORMAL: 0xb0b0b0
};

const RARITY = {
  COMMON: { id: 'COMMON', label: 'Common', color: 0xb0b0b0, weight: 50 },
  RARE: { id: 'RARE', label: 'Rare', color: 0x3d8fd6, weight: 30 },
  EPIC: { id: 'EPIC', label: 'Epic', color: 0xa64de0, weight: 15 },
  LEGENDARY: { id: 'LEGENDARY', label: 'Legendary', color: 0xf5c94b, weight: 5 }
};

// Player-catchable species - this is the pool eggs pull from.
// cost = coins to place this monster as a tower during a battle.
// attackIntervalMs is in milliseconds. range is in grid cells, but NOT a
// round number: a tower placed adjacent to a straight path segment is
// exactly 1 cell (perpendicular) from it, so an integer range of 1 only
// ever touches that segment at a single tangent point - zero real coverage
// window, not a usable arc. Every range here is padded well past the
// nearest integer specifically so a tower placed 1 cell off the road gets a
// real firing arc, not a knife-edge. See BattleScene's range-circle preview
// (drawn on hover while placing, and persistently on placed towers) - that
// circle is the source of truth for what's actually in range, use it rather
// than reasoning about the raw number here.
const SPECIES = [
  // -- Common --
  { id: 'rollpup', name: 'Rollpup', type: 'GRASS', rarity: 'COMMON', sheetKey: RETROMON_SHEET, frame: 0, maxHp: 24, attack: 7, range: 1.6, attackIntervalMs: 750, cost: 20 },
  { id: 'snarlpup', name: 'Snarlpup', type: 'FIRE', rarity: 'COMMON', sheetKey: RETROMON_SHEET, frame: 3, maxHp: 22, attack: 10, range: 1.6, attackIntervalMs: 650, cost: 20 },
  { id: 'hornlet', name: 'Hornlet', type: 'EARTH', rarity: 'COMMON', sheetKey: RETROMON_SHEET, frame: 6, maxHp: 30, attack: 6, range: 1.6, attackIntervalMs: 850, cost: 20 },
  { id: 'snoutling', name: 'Snoutling', type: 'EARTH', rarity: 'COMMON', sheetKey: RETROMON_SHEET, frame: 30, maxHp: 26, attack: 8, range: 1.6, attackIntervalMs: 750, cost: 20 },
  // -- Rare --
  { id: 'puffle', name: 'Puffle', type: 'NORMAL', rarity: 'RARE', sheetKey: RETROMON_SHEET, frame: 27, maxHp: 38, attack: 5, range: 2.2, attackIntervalMs: 900, cost: 35 },
  { id: 'grubcoil', name: 'Grubcoil', type: 'GRASS', rarity: 'RARE', sheetKey: RETROMON_SHEET, frame: 49, maxHp: 20, attack: 9, range: 2.2, attackIntervalMs: 700, cost: 35 },
  { id: 'icewhelp', name: 'Icewhelp', type: 'WATER', rarity: 'RARE', sheetKey: RETROMON_SHEET, frame: 65, maxHp: 22, attack: 6, range: 2.2, attackIntervalMs: 800, cost: 35 },
  { id: 'pincer', name: 'Pincer', type: 'EARTH', rarity: 'RARE', sheetKey: RETROMON_SHEET, frame: 34, maxHp: 32, attack: 8, range: 2.2, attackIntervalMs: 800, cost: 35 },
  // -- Epic --
  { id: 'molecap', name: 'Molecap', type: 'EARTH', rarity: 'EPIC', sheetKey: RETROMON_SHEET, frame: 41, maxHp: 55, attack: 12, range: 2.6, attackIntervalMs: 850, cost: 55 },
  { id: 'tigrub', name: 'Tigrub', type: 'FIRE', rarity: 'EPIC', sheetKey: RETROMON_SHEET, frame: 51, maxHp: 42, attack: 14, range: 2.6, attackIntervalMs: 650, cost: 55 },
  { id: 'geodrone', name: 'Geodrone', type: 'NORMAL', rarity: 'EPIC', sheetKey: RETROMON_SHEET, frame: 53, maxHp: 60, attack: 11, range: 3.2, attackIntervalMs: 900, cost: 55 },
  // -- Legendary --
  { id: 'frostmaw', name: 'Frostmaw', type: 'WATER', rarity: 'LEGENDARY', sheetKey: RETROMON_SHEET, frame: 26, maxHp: 70, attack: 18, range: 3.6, attackIntervalMs: 700, cost: 80 },
  { id: 'goldwasp', name: 'Goldwasp', type: 'ELECTRIC', rarity: 'LEGENDARY', sheetKey: RETROMON_SHEET, frame: 35, maxHp: 55, attack: 22, range: 3.6, attackIntervalMs: 550, cost: 80 },
  { id: 'ogglord', name: 'Ogglord', type: 'GRASS', rarity: 'LEGENDARY', sheetKey: RETROMON_SHEET, frame: 66, maxHp: 65, attack: 20, range: 3.6, attackIntervalMs: 650, cost: 80 }
];

// Granted to a brand-new player (empty roster) so there's something to place
// before they've pulled or earned anything - see GameState.grantStarterKit.
// Spans three different combat archetypes (poison DoT / burn DoT / splash)
// so a first battle already shows the kits aren't interchangeable.
const STARTER_SPECIES_IDS = ['rollpup', 'snarlpup', 'hornlet'];

// Enemy species that spawn during battle waves. speed is pixels/second.
// Deliberately distinct frames from the player pool above.
const ENEMY_SPECIES = [
  { id: 'widow', name: 'Widow', type: 'NORMAL', sheetKey: RETROMON_SHEET, frame: 33, maxHp: 14, attack: 1, speed: 58, reward: 4 },
  { id: 'rollodon', name: 'Rollodon', type: 'GRASS', sheetKey: RETROMON_SHEET, frame: 2, maxHp: 40, attack: 2, speed: 26, reward: 10 },
  { id: 'ragefang', name: 'Ragefang', type: 'FIRE', sheetKey: RETROMON_SHEET, frame: 5, maxHp: 28, attack: 3, speed: 40, reward: 9 },
  { id: 'tuskram', name: 'Tuskram', type: 'EARTH', sheetKey: RETROMON_SHEET, frame: 8, maxHp: 34, attack: 2, speed: 30, reward: 8 },
  { id: 'clawcrab', name: 'Clawcrab', type: 'EARTH', sheetKey: RETROMON_SHEET, frame: 43, maxHp: 20, attack: 1, speed: 70, reward: 6 },
  { id: 'bouldergeist', name: 'Bouldergeist', type: 'NORMAL', sheetKey: RETROMON_SHEET, frame: 62, maxHp: 90, attack: 4, speed: 16, reward: 16 }
];

function getSpecies(id) {
  return SPECIES.find(s => s.id === id);
}

function getEnemySpecies(id) {
  return ENEMY_SPECIES.find(s => s.id === id);
}

// Weighted rarity roll restricted to whatever rarities are actually present
// in the (possibly type-filtered) pool, then a uniform pick within that
// rarity. typesFilter is an array of type ids, or null/undefined for no
// filter (the standard banner).
function rollGachaSpecies(typesFilter) {
  const pool = typesFilter ? SPECIES.filter(s => typesFilter.includes(s.type)) : SPECIES;
  const availableRarities = Object.values(RARITY).filter(r => pool.some(s => s.rarity === r.id));
  const totalWeight = availableRarities.reduce((sum, r) => sum + r.weight, 0);
  let roll = Math.random() * totalWeight;
  let chosenRarity = availableRarities[0];
  for (const r of availableRarities) {
    if (roll < r.weight) { chosenRarity = r; break; }
    roll -= r.weight;
  }
  const rarityPool = pool.filter(s => s.rarity === chosenRarity.id);
  return rarityPool[Math.floor(Math.random() * rarityPool.length)];
}

// ---------- collection progression ----------
//
// A monster is owned once, not stacked: pulling a duplicate doesn't give you
// a second copy to place, it converts into Monster Essence spent leveling up
// the one you have. This is what makes duplicates feel like progress instead
// of waste. Levels only scale stats for now - ability upgrades, alternate
// forms, and evolution (which would change a monster's Attack/Ability kit,
// not just its numbers) are intentionally not built yet, see README.

const MAX_MONSTER_LEVEL = 5;

const DUPLICATE_ESSENCE_BY_RARITY = {
  COMMON: 15,
  RARE: 25,
  EPIC: 40,
  LEGENDARY: 70
};

// Monster Essence cost to go from `level` to `level + 1`.
function essenceForNextLevel(level) {
  return level * 30;
}

// Stats actually used in battle: base stats scaled up per level.
function getEffectiveStats(species, level) {
  const multiplier = 1 + (level - 1) * 0.12;
  return {
    maxHp: Math.round(species.maxHp * multiplier),
    attack: Math.round(species.attack * multiplier)
  };
}
