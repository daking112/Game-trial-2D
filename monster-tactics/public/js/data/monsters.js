// Species and type data for Monster Tactics.
// Stats are early placeholder balance values, tuned to be "roughly playable"
// rather than final - expect to retune once real waves are played.
//
// Art: player species (the gacha pool) and their evolved forms use the
// animated "Monster Evolution Sprites" pack (see TOWER_SHEET below); enemy
// species use a different animated pack again (see ENEMY_REGULAR_SHEET) -
// so nothing a player fields can ever look identical to something
// attacking their base, since the two pools don't even share an art source.

// Retromon Big Pack 1/2 by Willibab (https://willibab.itch.io/) - free for
// personal/commercial use with credit, see assets/retromon/LICENSE.txt.
// A 9x8 grid of 56x56 static frames (frame index = row * 9 + col). These
// were what every player species used before the animated pack below, and
// are kept loaded as the fallback path: any species with no towerIndex
// still renders as a static `frame` off these sheets (see makeSpeciesSprite
// in ui/UiKit.js), so adding a species without new art degrades to the old
// look rather than rendering nothing.
const RETROMON_SHEET = 'retromon-b1';
const RETROMON2_SHEET = 'retromon-b2';

// Enemy sprites: "MINI DUNGEON MONSTERS" by Beowulf (https://beowulf.itch.io/)
// - a purchased pack, see scripts/gen_enemies.py for the license note and
// exactly how these two sheets were built from it. Each ENEMY_SPECIES entry
// below picks one monster by sheetKey + enemyIndex instead of a single
// static frame like player species do (see RETROMON_SHEET above) - every
// enemy gets a real 4-directional walk cycle (BattleScene switches anims
// as it turns corners along the path) instead of a static pose sliding
// along the grid. ENEMY_BOSS_SHEET's monsters are genuinely bigger native
// art (32px vs the regular sheet's 16px), not just a bigger scale - see
// BattleScene ENEMY_SPRITE_SCALE.
const ENEMY_REGULAR_SHEET = 'enemies-regular';
const ENEMY_BOSS_SHEET = 'enemies-boss';
const ENEMY_DIRECTIONS = ['down', 'left', 'right', 'up'];

function enemyAnimKey(sheetKey, enemyIndex, direction) {
  return `${sheetKey}-${enemyIndex}-${direction}`;
}

// Player species / tower sprites: 18 lines are the "Monster Evolution
// Sprites" pack by the Pixel Fantasy author (https://pixel-fantasy.itch.io/
// - editable and usable in commercial and non-commercial projects, not
// resellable; see the LICENSE.txt inside assets/Monster-Evolution-
// Sprites-1.2.zip). The other 9 lines are hand-authored pixel art (see
// scripts/custom_tower_art.py and custom_tower_art2.py) built to match that
// pack's style (16px cells, compact silhouette, big 2px eyes) and used to
// fill out type/rarity combinations the pack alone didn't cover.
// scripts/gen_towers.py builds assets/towers/towers.png from both sources.
//
// Every one of the 27 lines is a real three-stage chain - base (SPECIES,
// gacha-catchable) -> mid -> final (both in EVOLVED_SPECIES, reached only
// via GameState.evolveMonster) - so evolving a monster twice visibly grows
// the same creature up instead of swapping to an unrelated sprite (see
// gen_towers.py's LINE_ASSIGNMENTS / ALL_CUSTOM_MONSTERS). towerIndex picks
// the monster's block on the built sheet; 3 facings x 3 frames each.
const TOWER_SHEET = 'towers';
const TOWER_DIRECTIONS = ['down', 'up', 'side'];

function towerAnimKey(towerIndex, direction) {
  return `tower-${towerIndex}-${direction}`;
}

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
  { id: 'rollpup', name: 'Rollpup', type: 'GRASS', rarity: 'COMMON', sheetKey: TOWER_SHEET, towerIndex: 15, maxHp: 24, attack: 7, range: 1.6, attackIntervalMs: 750, cost: 20 },
  { id: 'snarlpup', name: 'Snarlpup', type: 'FIRE', rarity: 'COMMON', sheetKey: TOWER_SHEET, towerIndex: 36, maxHp: 22, attack: 10, range: 1.6, attackIntervalMs: 650, cost: 20 },
  { id: 'hornlet', name: 'Hornlet', type: 'EARTH', rarity: 'COMMON', sheetKey: TOWER_SHEET, towerIndex: 24, maxHp: 30, attack: 6, range: 1.6, attackIntervalMs: 850, cost: 20 },
  { id: 'snoutling', name: 'Snoutling', type: 'EARTH', rarity: 'COMMON', sheetKey: TOWER_SHEET, towerIndex: 9, maxHp: 26, attack: 8, range: 1.6, attackIntervalMs: 750, cost: 20 },
  { id: 'boltbee', name: 'Boltbee', type: 'ELECTRIC', rarity: 'COMMON', sheetKey: TOWER_SHEET, towerIndex: 48, maxHp: 18, attack: 9, range: 1.6, attackIntervalMs: 600, cost: 20 },
  { id: 'shellcrab', name: 'Shellcrab', type: 'WATER', rarity: 'COMMON', sheetKey: TOWER_SHEET, towerIndex: 27, maxHp: 28, attack: 6, range: 1.6, attackIntervalMs: 800, cost: 20 },
  // -- Rare --
  { id: 'puffle', name: 'Puffle', type: 'NORMAL', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 18, maxHp: 38, attack: 5, range: 2.2, attackIntervalMs: 900, cost: 35 },
  { id: 'grubcoil', name: 'Grubcoil', type: 'GRASS', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 33, maxHp: 20, attack: 9, range: 2.2, attackIntervalMs: 700, cost: 35 },
  { id: 'icewhelp', name: 'Icewhelp', type: 'WATER', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 3, maxHp: 22, attack: 6, range: 2.2, attackIntervalMs: 800, cost: 35 },
  { id: 'pincer', name: 'Pincer', type: 'EARTH', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 21, maxHp: 32, attack: 8, range: 2.2, attackIntervalMs: 800, cost: 35 },
  { id: 'calfrage', name: 'Calfrage', type: 'NORMAL', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 6, maxHp: 36, attack: 7, range: 2.2, attackIntervalMs: 800, cost: 35 },
  { id: 'tidewisp', name: 'Tidewisp', type: 'WATER', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 51, maxHp: 24, attack: 8, range: 2.2, attackIntervalMs: 700, cost: 35 },
  // -- Epic --
  { id: 'molecap', name: 'Molecap', type: 'EARTH', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 0, maxHp: 55, attack: 12, range: 2.6, attackIntervalMs: 850, cost: 55 },
  { id: 'tigrub', name: 'Tigrub', type: 'FIRE', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 39, maxHp: 42, attack: 14, range: 2.6, attackIntervalMs: 650, cost: 55 },
  { id: 'geodrone', name: 'Geodrone', type: 'NORMAL', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 45, maxHp: 60, attack: 11, range: 3.2, attackIntervalMs: 900, cost: 55 },
  // -- Legendary --
  { id: 'frostmaw', name: 'Frostmaw', type: 'WATER', rarity: 'LEGENDARY', sheetKey: TOWER_SHEET, towerIndex: 30, maxHp: 70, attack: 18, range: 3.6, attackIntervalMs: 700, cost: 80 },
  { id: 'goldwasp', name: 'Goldwasp', type: 'ELECTRIC', rarity: 'LEGENDARY', sheetKey: TOWER_SHEET, towerIndex: 42, maxHp: 55, attack: 22, range: 3.6, attackIntervalMs: 550, cost: 80 },
  { id: 'ogglord', name: 'Ogglord', type: 'GRASS', rarity: 'LEGENDARY', sheetKey: TOWER_SHEET, towerIndex: 12, maxHp: 65, attack: 20, range: 3.6, attackIntervalMs: 650, cost: 80 },

  // -- Species on hand-authored art (see scripts/custom_tower_art.py) --
  // Added to fill the thinnest cells of the gacha table rather than for
  // their own sake: ELECTRIC and FIRE each had exactly one non-legendary
  // catchable, GRASS had no EPIC at all, and NORMAL had no COMMON - so a
  // type-restricted banner in those types was a near-guaranteed outcome
  // rather than a real weighted pull (the same gap Big Pack 2 was opened
  // for). Stats sit inside the existing per-rarity bands.
  { id: 'mothling', name: 'Mothling', type: 'NORMAL', rarity: 'COMMON', sheetKey: TOWER_SHEET, towerIndex: 63, maxHp: 20, attack: 7, range: 1.9, attackIntervalMs: 700, cost: 20 },
  { id: 'zapling', name: 'Zapling', type: 'ELECTRIC', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 54, maxHp: 22, attack: 8, range: 2.2, attackIntervalMs: 640, cost: 35 },
  { id: 'emberimp', name: 'Emberimp', type: 'FIRE', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 57, maxHp: 26, attack: 9, range: 2.2, attackIntervalMs: 680, cost: 35 },
  { id: 'thornshell', name: 'Thornshell', type: 'GRASS', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 60, maxHp: 58, attack: 11, range: 2.6, attackIntervalMs: 800, cost: 55 },

  // -- Species on hand-authored art (see scripts/custom_tower_art2.py) --
  // Batch 2: fills every type/rarity cell still empty after batch 1 above
  // (WATER/EPIC, EARTH/LEGENDARY, FIRE/LEGENDARY, NORMAL/LEGENDARY,
  // ELECTRIC/EPIC), designed against the same type/rarity table rather than
  // for their own sake - these are meant to sit alongside the original pack
  // roster, not replace any of it.
  { id: 'dewdrip', name: 'Dewdrip', type: 'WATER', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 66, maxHp: 44, attack: 12, range: 2.8, attackIntervalMs: 750, cost: 55 },
  { id: 'pebblet', name: 'Pebblet', type: 'EARTH', rarity: 'LEGENDARY', sheetKey: TOWER_SHEET, towerIndex: 69, maxHp: 68, attack: 16, range: 3.6, attackIntervalMs: 720, cost: 80 },
  { id: 'pyrelet', name: 'Pyrelet', type: 'FIRE', rarity: 'LEGENDARY', sheetKey: TOWER_SHEET, towerIndex: 72, maxHp: 60, attack: 23, range: 3.6, attackIntervalMs: 540, cost: 80 },
  { id: 'chimeling', name: 'Chimeling', type: 'NORMAL', rarity: 'LEGENDARY', sheetKey: TOWER_SHEET, towerIndex: 75, maxHp: 62, attack: 19, range: 3.8, attackIntervalMs: 680, cost: 80 },
  { id: 'sparkmote', name: 'Sparkmote', type: 'ELECTRIC', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 78, maxHp: 40, attack: 15, range: 2.8, attackIntervalMs: 560, cost: 55 },

  // -- Species on hand-authored art (see scripts/custom_tower_art3.py) --
  // Batch 3: by now every type/rarity cell already had a catchable species,
  // so this batch instead rounds out the thinnest remaining cell of each
  // type (one more at FIRE/COMMON, WATER/COMMON, GRASS/RARE,
  // ELECTRIC/COMMON, EARTH/RARE, NORMAL/EPIC) so every type has real pull
  // variety at more than one rarity rather than a single guaranteed catch.
  { id: 'emberadder', name: 'Emberadder', type: 'FIRE', rarity: 'COMMON', sheetKey: TOWER_SHEET, towerIndex: 81, maxHp: 22, attack: 9, range: 1.7, attackIntervalMs: 660, cost: 20 },
  { id: 'tadpip', name: 'Tadpip', type: 'WATER', rarity: 'COMMON', sheetKey: TOWER_SHEET, towerIndex: 84, maxHp: 20, attack: 6, range: 1.7, attackIntervalMs: 780, cost: 20 },
  { id: 'petaline', name: 'Petaline', type: 'GRASS', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 87, maxHp: 26, attack: 8, range: 2.3, attackIntervalMs: 720, cost: 35 },
  { id: 'voltmouse', name: 'Voltmouse', type: 'ELECTRIC', rarity: 'COMMON', sheetKey: TOWER_SHEET, towerIndex: 90, maxHp: 18, attack: 8, range: 1.6, attackIntervalMs: 620, cost: 20 },
  { id: 'stonepup', name: 'Stonepup', type: 'EARTH', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 93, maxHp: 34, attack: 7, range: 2.2, attackIntervalMs: 820, cost: 35 },
  { id: 'wisplet', name: 'Wisplet', type: 'NORMAL', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 96, maxHp: 48, attack: 13, range: 2.7, attackIntervalMs: 760, cost: 55 }
];

// Granted to a brand-new player (empty roster) so there's something to place
// before they've pulled or earned anything - see GameState.grantStarterKit.
// Spans three different combat archetypes (poison DoT / burn DoT / splash)
// so a first battle already shows the kits aren't interchangeable.
const STARTER_SPECIES_IDS = ['rollpup', 'snarlpup', 'hornlet'];

// Evolved forms - NOT in the gacha pool (rollGachaSpecies never sees this
// array), reached only via GameState.evolveMonster: base -> mid the first
// time (once the base is maxed out and has enough of its own Monster
// Essence), mid -> final the second time (once the mid is itself maxed and
// has enough Essence). Each line's stages take that line's stage 1/2/3 art
// off the tower sheet in order (see TOWER_SHEET above and
// gen_towers.py/LINE_ASSIGNMENTS), so evolving twice reads as the same
// creature growing up rather than swapping to an unrelated sprite. Ids stay
// distinct (rollodon_evo etc) so they never collide with the same-named
// enemy entries in getEnemySpecies() lookups. Every mid-tier form is RARE
// and every final form is EPIC, regardless of the base species' own
// rarity - a fixed "evolved tier" bucket rather than inherited rarity, kept
// consistent across all 27 lines. Mid-tier stats are the base/final
// midpoint (rounded); mid-tier keeps the base species' type even on lines
// where the final form changes type (see Rollodon below), since the type
// change is itself part of what makes reaching the final stage a payoff.
//
// Rollodon's evolution is the flagship example of evolution changing a
// monster's function, not just its numbers: Rollpup is GRASS/poison-DoT,
// Rollodon is EARTH/splash - a different kit, not a bigger version of the
// same one. Every other line keeps its base type through both evolutions -
// still a real jump in power/range at each stage, just not a new kit.
const EVOLVED_SPECIES = [
  { id: 'tumblehide_mid', name: 'Tumblehide', type: 'GRASS', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 16, maxHp: 42, attack: 11, range: 2.0, attackIntervalMs: 775, cost: 40 },
  { id: 'rollodon_evo', name: 'Rollodon', type: 'EARTH', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 17, maxHp: 60, attack: 14, range: 2.4, attackIntervalMs: 800, cost: 60 },
  { id: 'snarlfang_mid', name: 'Snarlfang', type: 'FIRE', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 37, maxHp: 32, attack: 15, range: 1.7, attackIntervalMs: 600, cost: 40 },
  { id: 'ragefang_evo', name: 'Ragefang', type: 'FIRE', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 38, maxHp: 42, attack: 20, range: 1.8, attackIntervalMs: 550, cost: 60 },
  { id: 'hornbrute_mid', name: 'Hornbrute', type: 'EARTH', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 25, maxHp: 49, attack: 10, range: 1.7, attackIntervalMs: 800, cost: 40 },
  { id: 'tuskram_evo', name: 'Tuskram', type: 'EARTH', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 26, maxHp: 68, attack: 13, range: 1.8, attackIntervalMs: 750, cost: 60 },

  { id: 'snoutbrute_mid', name: 'Snoutbrute', type: 'EARTH', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 10, maxHp: 36, attack: 12, range: 1.8, attackIntervalMs: 725, cost: 38 },
  { id: 'snoutzar_evo', name: 'Snoutzar', type: 'EARTH', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 11, maxHp: 46, attack: 15, range: 2.0, attackIntervalMs: 700, cost: 55 },
  { id: 'pufflump_mid', name: 'Pufflump', type: 'NORMAL', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 19, maxHp: 53, attack: 7, range: 2.5, attackIntervalMs: 875, cost: 63 },
  { id: 'pufflord_evo', name: 'Pufflord', type: 'NORMAL', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 20, maxHp: 68, attack: 9, range: 2.8, attackIntervalMs: 850, cost: 90 },
  { id: 'coilworm_mid', name: 'Coilworm', type: 'GRASS', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 34, maxHp: 28, attack: 13, range: 2.4, attackIntervalMs: 660, cost: 63 },
  { id: 'grubcoilus_evo', name: 'Grubcoilus', type: 'GRASS', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 35, maxHp: 36, attack: 16, range: 2.6, attackIntervalMs: 620, cost: 90 },
  { id: 'icefang_mid', name: 'Icefang', type: 'WATER', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 4, maxHp: 31, attack: 9, range: 2.5, attackIntervalMs: 760, cost: 63 },
  { id: 'icewyrm_evo', name: 'Icewyrm', type: 'WATER', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 5, maxHp: 40, attack: 11, range: 2.8, attackIntervalMs: 720, cost: 90 },
  { id: 'pincerclaw_mid', name: 'Pincerclaw', type: 'EARTH', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 22, maxHp: 45, attack: 11, range: 2.4, attackIntervalMs: 760, cost: 63 },
  { id: 'pincerlord_evo', name: 'Pincerlord', type: 'EARTH', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 23, maxHp: 58, attack: 14, range: 2.6, attackIntervalMs: 720, cost: 90 },
  { id: 'molebore_mid', name: 'Molebore', type: 'EARTH', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 1, maxHp: 75, attack: 16, range: 2.8, attackIntervalMs: 815, cost: 93 },
  { id: 'molecrusher_evo', name: 'Molecrusher', type: 'EARTH', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 2, maxHp: 95, attack: 20, range: 3.0, attackIntervalMs: 780, cost: 130 },
  { id: 'tigrunt_mid', name: 'Tigrunt', type: 'FIRE', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 40, maxHp: 57, attack: 19, range: 2.8, attackIntervalMs: 615, cost: 93 },
  { id: 'tigrubex_evo', name: 'Tigrubex', type: 'FIRE', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 41, maxHp: 72, attack: 24, range: 3.0, attackIntervalMs: 580, cost: 130 },
  { id: 'geosentry_mid', name: 'Geosentry', type: 'NORMAL', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 46, maxHp: 80, attack: 15, range: 3.4, attackIntervalMs: 860, cost: 93 },
  { id: 'geodronarch_evo', name: 'Geodronarch', type: 'NORMAL', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 47, maxHp: 100, attack: 18, range: 3.6, attackIntervalMs: 820, cost: 130 },
  { id: 'frostfang_mid', name: 'Frostfang', type: 'WATER', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 31, maxHp: 93, attack: 24, range: 3.8, attackIntervalMs: 660, cost: 135 },
  { id: 'glacimaw_evo', name: 'Glacimaw', type: 'WATER', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 32, maxHp: 115, attack: 30, range: 4.0, attackIntervalMs: 620, cost: 190 },
  { id: 'goldstinger_mid', name: 'Goldstinger', type: 'ELECTRIC', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 43, maxHp: 73, attack: 29, range: 3.8, attackIntervalMs: 515, cost: 135 },
  { id: 'thundasp_evo', name: 'Thundasp', type: 'ELECTRIC', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 44, maxHp: 90, attack: 36, range: 4.0, attackIntervalMs: 480, cost: 190 },
  { id: 'oggtitan_mid', name: 'Oggtitan', type: 'GRASS', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 13, maxHp: 87, attack: 27, range: 3.8, attackIntervalMs: 615, cost: 135 },
  { id: 'oggmonarch_evo', name: 'Oggmonarch', type: 'GRASS', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 14, maxHp: 108, attack: 33, range: 4.0, attackIntervalMs: 580, cost: 190 },

  // Evolved forms of the hand-authored species above (batch 1, see
  // custom_tower_art.py) - same pairing rule as every other line: each
  // stage is the same creature grown up (Zapling's spark-chick sprouts
  // storm wings as Zapfowl then becomes the fully-formed Voltvern,
  // Mothling's wings widen into Duskwing then the moonlit Lunamoth), not an
  // unrelated monster.
  { id: 'duskwing_mid', name: 'Duskwing', type: 'NORMAL', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 64, maxHp: 32, attack: 10, range: 2.3, attackIntervalMs: 670, cost: 40 },
  { id: 'lunamoth_evo', name: 'Lunamoth', type: 'NORMAL', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 65, maxHp: 44, attack: 13, range: 2.6, attackIntervalMs: 640, cost: 60 },
  { id: 'zapfowl_mid', name: 'Zapfowl', type: 'ELECTRIC', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 55, maxHp: 31, attack: 12, range: 2.5, attackIntervalMs: 600, cost: 63 },
  { id: 'voltvern_evo', name: 'Voltvern', type: 'ELECTRIC', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 56, maxHp: 40, attack: 15, range: 2.8, attackIntervalMs: 560, cost: 90 },
  { id: 'emberbrute_mid', name: 'Emberbrute', type: 'FIRE', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 58, maxHp: 37, attack: 13, range: 2.4, attackIntervalMs: 640, cost: 63 },
  { id: 'cinderfiend_evo', name: 'Cinderfiend', type: 'FIRE', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 59, maxHp: 48, attack: 17, range: 2.6, attackIntervalMs: 600, cost: 90 },
  { id: 'thornguard_mid', name: 'Thornguard', type: 'GRASS', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 61, maxHp: 77, attack: 15, range: 2.8, attackIntervalMs: 770, cost: 93 },
  { id: 'bramblemaw_evo', name: 'Bramblemaw', type: 'GRASS', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 62, maxHp: 96, attack: 19, range: 3.0, attackIntervalMs: 740, cost: 130 },

  // Evolved forms of the hand-authored species above (batch 2, see
  // custom_tower_art2.py) - fills the last empty type/rarity gacha cells,
  // same 3-stage pairing rule as every other line.
  { id: 'tidebell_mid', name: 'Tidebell', type: 'WATER', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 67, maxHp: 71, attack: 20, range: 3.0, attackIntervalMs: 675, cost: 93 },
  { id: 'maelstrom_evo', name: 'Maelstrom', type: 'WATER', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 68, maxHp: 98, attack: 27, range: 3.2, attackIntervalMs: 600, cost: 130 },
  { id: 'cragfist_mid', name: 'Cragfist', type: 'EARTH', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 70, maxHp: 97, attack: 24, range: 3.8, attackIntervalMs: 690, cost: 135 },
  { id: 'terralith_evo', name: 'Terralith', type: 'EARTH', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 71, maxHp: 125, attack: 32, range: 4.0, attackIntervalMs: 660, cost: 190 },
  { id: 'blazeplume_mid', name: 'Blazeplume', type: 'FIRE', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 73, maxHp: 78, attack: 32, range: 3.7, attackIntervalMs: 500, cost: 135 },
  { id: 'solaris_evo', name: 'Solaris', type: 'FIRE', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 74, maxHp: 95, attack: 40, range: 3.8, attackIntervalMs: 460, cost: 190 },
  { id: 'tollward_mid', name: 'Tollward', type: 'NORMAL', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 76, maxHp: 90, attack: 25, range: 4.0, attackIntervalMs: 660, cost: 135 },
  { id: 'carillon_evo', name: 'Carillon', type: 'NORMAL', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 77, maxHp: 118, attack: 30, range: 4.2, attackIntervalMs: 640, cost: 190 },
  { id: 'arcnode_mid', name: 'Arcnode', type: 'ELECTRIC', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 79, maxHp: 63, attack: 23, range: 3.1, attackIntervalMs: 520, cost: 93 },
  { id: 'tesladon_evo', name: 'Tesladon', type: 'ELECTRIC', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 80, maxHp: 85, attack: 30, range: 3.4, attackIntervalMs: 480, cost: 130 },

  // Retromon Big Pack 2 (RETROMON2_SHEET) - see the comment by its
  // definition above. Frames verified by eye against the actual sheet
  // (public/assets/retromon/big-pack-2.png), each evolved frame chosen as
  // the visually larger/more developed sibling immediately next to its
  // base species' frame.
  { id: 'boltdrone_mid', name: 'Boltdrone', type: 'ELECTRIC', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 49, maxHp: 31, attack: 13, range: 1.8, attackIntervalMs: 550, cost: 40 },
  { id: 'boltswarm_evo', name: 'Boltswarm', type: 'ELECTRIC', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 50, maxHp: 44, attack: 17, range: 2.0, attackIntervalMs: 500, cost: 60 },
  { id: 'shellguard_mid', name: 'Shellguard', type: 'WATER', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 28, maxHp: 45, attack: 9, range: 1.8, attackIntervalMs: 790, cost: 40 },
  { id: 'shellclaw_evo', name: 'Shellclaw', type: 'WATER', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 29, maxHp: 62, attack: 12, range: 2.0, attackIntervalMs: 780, cost: 60 },
  { id: 'bisonrage_mid', name: 'Bisonrage', type: 'NORMAL', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 7, maxHp: 51, attack: 11, range: 2.4, attackIntervalMs: 790, cost: 63 },
  { id: 'bisonlord_evo', name: 'Bisonlord', type: 'NORMAL', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 8, maxHp: 66, attack: 15, range: 2.6, attackIntervalMs: 780, cost: 90 },
  { id: 'tidespirit_mid', name: 'Tidespirit', type: 'WATER', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 52, maxHp: 37, attack: 13, range: 2.5, attackIntervalMs: 690, cost: 63 },
  { id: 'tidewraith_evo', name: 'Tidewraith', type: 'WATER', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 53, maxHp: 50, attack: 18, range: 2.8, attackIntervalMs: 680, cost: 90 },

  // Evolved forms of the hand-authored species above (batch 3, see
  // custom_tower_art3.py) - same 3-stage pairing rule as every other line.
  { id: 'cinderviper_mid', name: 'Cinderviper', type: 'FIRE', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 82, maxHp: 34, attack: 14, range: 2.2, attackIntervalMs: 610, cost: 40 },
  { id: 'infernasp_evo', name: 'Infernasp', type: 'FIRE', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 83, maxHp: 46, attack: 19, range: 2.6, attackIntervalMs: 560, cost: 60 },
  { id: 'ripplefin_mid', name: 'Ripplefin', type: 'WATER', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 85, maxHp: 31, attack: 9, range: 2.2, attackIntervalMs: 730, cost: 40 },
  { id: 'tsunarine_evo', name: 'Tsunarine', type: 'WATER', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 86, maxHp: 42, attack: 12, range: 2.6, attackIntervalMs: 680, cost: 60 },
  { id: 'petalguard_mid', name: 'Petalguard', type: 'GRASS', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 88, maxHp: 36, attack: 12, range: 2.6, attackIntervalMs: 660, cost: 62 },
  { id: 'bloomqueen_evo', name: 'Bloomqueen', type: 'GRASS', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 89, maxHp: 46, attack: 15, range: 3.0, attackIntervalMs: 600, cost: 90 },
  { id: 'amperat_mid', name: 'Amperat', type: 'ELECTRIC', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 91, maxHp: 28, attack: 12, range: 2.0, attackIntervalMs: 570, cost: 40 },
  { id: 'galvatail_evo', name: 'Galvatail', type: 'ELECTRIC', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 92, maxHp: 38, attack: 16, range: 2.4, attackIntervalMs: 520, cost: 60 },
  { id: 'boulderhound_mid', name: 'Boulderhound', type: 'EARTH', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 94, maxHp: 48, attack: 11, range: 2.5, attackIntervalMs: 770, cost: 62 },
  { id: 'granitewolf_evo', name: 'Granitewolf', type: 'EARTH', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 95, maxHp: 62, attack: 15, range: 2.8, attackIntervalMs: 720, cost: 90 },
  { id: 'phantorb_mid', name: 'Phantorb', type: 'NORMAL', rarity: 'RARE', sheetKey: TOWER_SHEET, towerIndex: 97, maxHp: 68, attack: 18, range: 3.0, attackIntervalMs: 700, cost: 92 },
  { id: 'spectralord_evo', name: 'Spectralord', type: 'NORMAL', rarity: 'EPIC', sheetKey: TOWER_SHEET, towerIndex: 98, maxHp: 88, attack: 24, range: 3.4, attackIntervalMs: 640, cost: 130 }
];

// speciesId -> speciesId it evolves into. Only species listed here (as a
// key) can evolve; everything else stays as-is once maxed (see
// RosterScene). Every base species in SPECIES maps to its mid-tier form,
// and every mid-tier form maps to its final form, so
// GameState.canEvolve/evolveMonster (both generic single-hop lookups, no
// hardcoded chain length) walk each line base -> mid -> final across two
// separate evolve actions.
const EVOLUTION_MAP = {
  rollpup: 'tumblehide_mid', tumblehide_mid: 'rollodon_evo',
  snarlpup: 'snarlfang_mid', snarlfang_mid: 'ragefang_evo',
  hornlet: 'hornbrute_mid', hornbrute_mid: 'tuskram_evo',
  snoutling: 'snoutbrute_mid', snoutbrute_mid: 'snoutzar_evo',
  puffle: 'pufflump_mid', pufflump_mid: 'pufflord_evo',
  grubcoil: 'coilworm_mid', coilworm_mid: 'grubcoilus_evo',
  icewhelp: 'icefang_mid', icefang_mid: 'icewyrm_evo',
  pincer: 'pincerclaw_mid', pincerclaw_mid: 'pincerlord_evo',
  molecap: 'molebore_mid', molebore_mid: 'molecrusher_evo',
  tigrub: 'tigrunt_mid', tigrunt_mid: 'tigrubex_evo',
  geodrone: 'geosentry_mid', geosentry_mid: 'geodronarch_evo',
  frostmaw: 'frostfang_mid', frostfang_mid: 'glacimaw_evo',
  goldwasp: 'goldstinger_mid', goldstinger_mid: 'thundasp_evo',
  ogglord: 'oggtitan_mid', oggtitan_mid: 'oggmonarch_evo',
  boltbee: 'boltdrone_mid', boltdrone_mid: 'boltswarm_evo',
  shellcrab: 'shellguard_mid', shellguard_mid: 'shellclaw_evo',
  calfrage: 'bisonrage_mid', bisonrage_mid: 'bisonlord_evo',
  tidewisp: 'tidespirit_mid', tidespirit_mid: 'tidewraith_evo',
  mothling: 'duskwing_mid', duskwing_mid: 'lunamoth_evo',
  zapling: 'zapfowl_mid', zapfowl_mid: 'voltvern_evo',
  emberimp: 'emberbrute_mid', emberbrute_mid: 'cinderfiend_evo',
  thornshell: 'thornguard_mid', thornguard_mid: 'bramblemaw_evo',
  dewdrip: 'tidebell_mid', tidebell_mid: 'maelstrom_evo',
  pebblet: 'cragfist_mid', cragfist_mid: 'terralith_evo',
  pyrelet: 'blazeplume_mid', blazeplume_mid: 'solaris_evo',
  chimeling: 'tollward_mid', tollward_mid: 'carillon_evo',
  sparkmote: 'arcnode_mid', arcnode_mid: 'tesladon_evo',
  emberadder: 'cinderviper_mid', cinderviper_mid: 'infernasp_evo',
  tadpip: 'ripplefin_mid', ripplefin_mid: 'tsunarine_evo',
  petaline: 'petalguard_mid', petalguard_mid: 'bloomqueen_evo',
  voltmouse: 'amperat_mid', amperat_mid: 'galvatail_evo',
  stonepup: 'boulderhound_mid', boulderhound_mid: 'granitewolf_evo',
  wisplet: 'phantorb_mid', phantorb_mid: 'spectralord_evo'
};

// Monster Essence needed (on top of being at MAX_MONSTER_LEVEL) to evolve.
const EVOLUTION_ESSENCE_COST = 150;

// Enemy species that spawn during battle waves. speed is pixels/second.
// Deliberately distinct frames from the player pool above.
//
// Beyond the original 6 (which are all just "walk and die" at different
// stat points), the entries below give BattleScene real counterplay to
// build around instead of every enemy being a bigger-numbers version of the
// same unit:
//   armor            flat damage reduction per hit (min 1 still gets
//                    through) - rewards high-damage-per-hit towers over
//                    many-small-hits ones (see BattleScene.dealDamage).
//   regenPerSecond   heals back over time - rewards burst damage, punishes
//                    chip damage that lets it outheal you.
//   slowImmune       can't be slowed - the counter to just kiting it forever.
//   splitInto/       on death, spawns splitCount copies of a (weaker,
//   splitCount       spawnable:false) species picking up the same path
//                    progress - splash/AoE towers matter more against it.
//   spawnable        false = only ever appears via a split or a boss slot,
//                    never picked by the normal random spawn roll
//                    (see SPAWNABLE_ENEMY_SPECIES below).
//   boss             true = eligible for BattleScene's periodic boss-wave
//                    slot (BOSS_WAVE_INTERVAL), picked at random among all
//                    boss:true entries - not the regular roll either.
//   summonIntervalMs/  while alive, spawns summonCount copies of a (weaker,
//   summonSpeciesId/   spawnable:false) species every summonIntervalMs,
//   summonCount        picking up its current path progress - a different
//                       kind of pressure than splitInto (constant trickle
//                       instead of a one-time burst on death), and the wave
//                       can't end until every summoned add is also cleared.
const ENEMY_SPECIES = [
  { id: 'widow', name: 'Widow', type: 'NORMAL', sheetKey: ENEMY_REGULAR_SHEET, enemyIndex: 0, maxHp: 14, attack: 1, speed: 58, reward: 4 },
  { id: 'rollodon', name: 'Rollodon', type: 'GRASS', sheetKey: ENEMY_REGULAR_SHEET, enemyIndex: 1, maxHp: 40, attack: 2, speed: 26, reward: 10 },
  { id: 'ragefang', name: 'Ragefang', type: 'FIRE', sheetKey: ENEMY_REGULAR_SHEET, enemyIndex: 2, maxHp: 28, attack: 3, speed: 40, reward: 9 },
  { id: 'tuskram', name: 'Tuskram', type: 'EARTH', sheetKey: ENEMY_REGULAR_SHEET, enemyIndex: 3, maxHp: 34, attack: 2, speed: 30, reward: 8 },
  { id: 'clawcrab', name: 'Clawcrab', type: 'EARTH', sheetKey: ENEMY_REGULAR_SHEET, enemyIndex: 4, maxHp: 20, attack: 1, speed: 70, reward: 6 },
  { id: 'bouldergeist', name: 'Bouldergeist', type: 'NORMAL', sheetKey: ENEMY_REGULAR_SHEET, enemyIndex: 5, maxHp: 90, attack: 4, speed: 16, reward: 16 },

  // -- variety --
  { id: 'ironshell', name: 'Ironshell', type: 'EARTH', sheetKey: ENEMY_REGULAR_SHEET, enemyIndex: 6, maxHp: 46, attack: 3, speed: 22, reward: 14, armor: 4 },
  { id: 'zipfin', name: 'Zipfin', type: 'WATER', sheetKey: ENEMY_REGULAR_SHEET, enemyIndex: 7, maxHp: 12, attack: 1, speed: 100, reward: 5 },
  { id: 'mossback', name: 'Mossback', type: 'GRASS', sheetKey: ENEMY_REGULAR_SHEET, enemyIndex: 8, maxHp: 50, attack: 2, speed: 20, reward: 13, regenPerSecond: 3 },
  { id: 'splitworm', name: 'Splitworm', type: 'NORMAL', sheetKey: ENEMY_REGULAR_SHEET, enemyIndex: 9, maxHp: 36, attack: 2, speed: 34, reward: 11, splitInto: 'wormlet', splitCount: 2 },
  { id: 'wormlet', name: 'Wormlet', type: 'NORMAL', sheetKey: ENEMY_REGULAR_SHEET, enemyIndex: 10, maxHp: 10, attack: 1, speed: 46, reward: 3, spawnable: false },

  // -- bosses (see BattleScene.BOSS_WAVE_INTERVAL) - 3 genuinely different
  // fights, not 3 reskins of the same "big numbers" boss:
  //   Kingcrab    tanky/immobile - armor + can't be slowed + regen, so it's
  //               a straightforward "your DPS vs its wall" check.
  //   Zephyrus    fast/fragile - no armor, no slow immunity (WATER towers
  //               matter a lot here), but hits hard if it reaches the end -
  //               the counter is actually landing slows, not brute HP.
  //   Broodmother slow and unarmored on its own, but trickles Wormlets the
  //               whole fight - splash/AoE towers matter far more than
  //               single-target ones, and the wave won't end from clearing
  //               just the boss.
  { id: 'kingcrab', name: 'Kingcrab', type: 'EARTH', sheetKey: ENEMY_BOSS_SHEET, enemyIndex: 0, maxHp: 400, attack: 6, speed: 20, reward: 60, armor: 5, slowImmune: true, regenPerSecond: 4, boss: true, spawnable: false },
  { id: 'zephyrus', name: 'Zephyrus', type: 'ELECTRIC', sheetKey: ENEMY_BOSS_SHEET, enemyIndex: 1, maxHp: 260, attack: 10, speed: 55, reward: 55, regenPerSecond: 2, boss: true, spawnable: false },
  { id: 'broodmother', name: 'Broodmother', type: 'GRASS', sheetKey: ENEMY_BOSS_SHEET, enemyIndex: 2, maxHp: 340, attack: 5, speed: 18, reward: 55, armor: 2, summonIntervalMs: 3000, summonSpeciesId: 'wormlet', summonCount: 2, boss: true, spawnable: false }
];

const SPAWNABLE_ENEMY_SPECIES = ENEMY_SPECIES.filter(e => e.spawnable !== false);
const BOSS_ENEMY_SPECIES = ENEMY_SPECIES.filter(e => e.boss);

function getSpecies(id) {
  return SPECIES.find(s => s.id === id) || EVOLVED_SPECIES.find(s => s.id === id);
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
// of waste. Levels scale stats; reaching max level with enough essence also
// unlocks evolving into a different kit for species in EVOLUTION_MAP above.
// Ability-level-ups and alternate forms (distinct from evolution) are still
// not built, see README.

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
