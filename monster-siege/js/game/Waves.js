// Content tables: what can be placed, what walks the lane, and in what
// order. Kept as plain data separate from the runtime classes so balance can
// be retuned without touching simulation code.
//
// The four species are split two-and-two between sides (Sporeling and
// Coilfang defend, Ramhorn and Emberwing attack) rather than shared. Seeing
// the same creature as both your tower and the thing walking at you makes a
// board unreadable at a glance, which is the one thing a tower defense
// cannot afford - BTD6's monkeys and bloons are never confusable.
//
// `species` is a function, not a built species, so the (relatively
// expensive) art build happens on first use and only for species actually
// referenced - and so this table stays a pure data literal that can be
// required from Node without building canvases.

const TOWER_TYPES = [
  {
    id: 'sporeling',
    name: 'Sporeling',
    blurb: 'Steady single-target spitter. Cheap, reliable, good first pick.',
    cost: 90,
    species: () => SpeciesArt.buildSporeling(),
    worldHeight: 1.0,
    range: 2.9,
    fireRate: 1.6,        // shots per second
    damage: 12,
    projectileSpeed: 11,
    projectileColor: 0xc184e0,
    fps: 4
  },
  {
    id: 'coilfang',
    name: 'Coilfang',
    blurb: 'Long reach, heavy venom hit, slow wind-up. Covers a whole bend.',
    cost: 175,
    species: () => SpeciesArt.buildCoilfang(),
    worldHeight: 1.15,
    range: 4.4,
    fireRate: 0.75,
    damage: 38,
    projectileSpeed: 14,
    projectileColor: 0x57c79a,
    fps: 3
  }
];

// worldHeight is a readability constraint, not just a look: a billboard's
// world WIDTH is worldHeight x the sprite's aspect ratio, and enemies in a
// column are spaced (group gap x speed) apart. Sized so a column at normal
// wave spacing reads as individuals rather than one continuous smear - the
// early sizes were wider than their own spacing, so wave 1 already overlapped.
const ENEMY_TYPES = {
  grunt: {
    id: 'grunt',
    name: 'Ramhorn',
    species: () => SpeciesArt.buildRamhorn(),
    worldHeight: 1.05,
    hp: 55,
    speed: 1.25,          // world units per second
    bounty: 9,
    leakDamage: 1,
    fps: 6
  },
  runner: {
    id: 'runner',
    name: 'Emberwing',
    species: () => SpeciesArt.buildEmberwing(),
    worldHeight: 0.92,
    hp: 34,
    speed: 2.5,
    bounty: 12,
    leakDamage: 1,
    fps: 9
  },
  brute: {
    id: 'brute',
    name: 'Elder Ramhorn',
    species: () => SpeciesArt.buildRamhorn(),
    worldHeight: 1.55,
    hp: 340,
    speed: 0.85,
    bounty: 60,
    leakDamage: 4,
    fps: 4
  }
};

// Each wave is a list of groups; a group emits `count` of one enemy type,
// `gap` seconds apart, starting `at` seconds into the wave. Overlapping
// groups (a runner stream launched partway through a grunt column) are what
// makes a wave feel composed rather than metronomic.
const WAVES = [
  { groups: [{ type: 'grunt', count: 6, gap: 1.1, at: 0 }] },
  { groups: [{ type: 'grunt', count: 9, gap: 0.95, at: 0 }] },
  { groups: [{ type: 'grunt', count: 8, gap: 0.9, at: 0 }, { type: 'runner', count: 3, gap: 1.2, at: 4 }] },
  { groups: [{ type: 'runner', count: 8, gap: 0.75, at: 0 }] },
  { groups: [{ type: 'grunt', count: 12, gap: 0.7, at: 0 }, { type: 'runner', count: 6, gap: 0.8, at: 3 }] },
  { groups: [{ type: 'brute', count: 1, gap: 1, at: 0 }, { type: 'grunt', count: 10, gap: 0.7, at: 1.5 }] },
  { groups: [{ type: 'runner', count: 14, gap: 0.45, at: 0 }] },
  { groups: [{ type: 'grunt', count: 18, gap: 0.5, at: 0 }, { type: 'runner', count: 8, gap: 0.6, at: 4 }] },
  { groups: [{ type: 'brute', count: 2, gap: 3, at: 0 }, { type: 'runner', count: 12, gap: 0.5, at: 2 }] },
  { groups: [{ type: 'grunt', count: 24, gap: 0.38, at: 0 }, { type: 'brute', count: 2, gap: 4, at: 5 }, { type: 'runner', count: 14, gap: 0.4, at: 7 }] }
];

// Enemy stats scale past the authored table so the game does not simply end
// at wave 10 - "endless" waves reuse the last authored composition with a
// compounding health multiplier, the standard tower-defense endgame.
function waveComposition(waveIndex) {
  const authored = WAVES[Math.min(waveIndex, WAVES.length - 1)];
  const over = Math.max(0, waveIndex - (WAVES.length - 1));
  const hpMul = Math.pow(1.22, over);
  const bountyMul = 1 + over * 0.1;
  return { groups: authored.groups, hpMul, bountyMul };
}

function waveClearReward(waveIndex) {
  return 55 + waveIndex * 18;
}
