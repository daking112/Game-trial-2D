// Persistent-ish game state shared across scenes.
// Roster and essence are saved to localStorage so they survive a page reload;
// coins and battle progress are in-memory per battle run only.
//
// Roster model: a monster is owned once, not stacked. gameState.roster is
// keyed by speciesId -> { speciesId, level, essence }. "essence" here is
// per-monster Monster Essence (from pulling duplicates of that species),
// distinct from gameState.essence (the global currency spent on pulls).

const ROSTER_STORAGE_KEY = 'monster-tactics:roster';
const ESSENCE_STORAGE_KEY = 'monster-tactics:essence';
const MAX_TEAM_SIZE = 5;
const STARTING_COINS = 120;
const EGG_COST = 40;

class GameState {
  constructor() {
    this.roster = this.loadRoster();
    this.essence = this.loadEssence();
    this.team = [];
    this.lives = 20;
    this.maxLives = 20;
    this.wave = 1;
    this.score = 0;
    this.coins = STARTING_COINS;
  }

  loadRoster() {
    try {
      const raw = localStorage.getItem(ROSTER_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      // Old save format was an array of {uid, speciesId} stackable copies -
      // incompatible with the collection model, so just start fresh rather
      // than trying to migrate pre-release test data.
      return Array.isArray(parsed) ? {} : parsed;
    } catch (e) {
      return {};
    }
  }

  saveRoster() {
    try {
      localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(this.roster));
    } catch (e) {
      // localStorage unavailable (private mode, etc) - roster just won't persist
    }
  }

  loadEssence() {
    try {
      const raw = localStorage.getItem(ESSENCE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : 0;
    } catch (e) {
      return 0;
    }
  }

  saveEssence() {
    try {
      localStorage.setItem(ESSENCE_STORAGE_KEY, JSON.stringify(this.essence));
    } catch (e) {
      // localStorage unavailable - essence just won't persist
    }
  }

  // Returns { isNew, essenceGained } so the caller (SanctuaryScene) can show
  // a different reveal for "new monster" vs "duplicate -> essence".
  addToRoster(speciesId) {
    const species = getSpecies(speciesId);
    const existing = this.roster[speciesId];

    if (existing) {
      const gained = DUPLICATE_ESSENCE_BY_RARITY[species.rarity];
      existing.essence += gained;
      this.saveRoster();
      return { isNew: false, essenceGained: gained };
    }

    this.roster[speciesId] = { speciesId, level: 1, essence: 0 };
    this.saveRoster();
    return { isNew: true, essenceGained: 0 };
  }

  upgradeMonster(speciesId) {
    const entry = this.roster[speciesId];
    if (!entry || entry.level >= MAX_MONSTER_LEVEL) return false;
    const cost = essenceForNextLevel(entry.level);
    if (entry.essence < cost) return false;
    entry.essence -= cost;
    entry.level += 1;
    this.saveRoster();
    return true;
  }

  earnEssence(amount) {
    this.essence += amount;
    this.saveEssence();
  }

  spendEssence(amount) {
    if (this.essence < amount) return false;
    this.essence -= amount;
    this.saveEssence();
    return true;
  }

  earnCoins(amount) {
    this.coins += amount;
  }

  spendCoins(amount) {
    if (this.coins < amount) return false;
    this.coins -= amount;
    return true;
  }

  toggleTeamMember(speciesId) {
    const idx = this.team.indexOf(speciesId);
    if (idx >= 0) {
      this.team.splice(idx, 1);
      return true;
    }
    if (this.team.length >= MAX_TEAM_SIZE) {
      return false;
    }
    this.team.push(speciesId);
    return true;
  }

  resetBattle() {
    this.lives = this.maxLives;
    this.wave = 1;
    this.score = 0;
    this.coins = STARTING_COINS;
  }
}

const gameState = new GameState();
