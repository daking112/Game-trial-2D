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
const STARTER_GRANTED_KEY = 'monster-tactics:starterGranted';
const MAX_TEAM_SIZE = 5;
const STARTING_COINS = 120;
const STARTER_ESSENCE = 80;
const EGG_COST = 40;
const RUN_TARGET_STAGES = 5;
const WAVES_PER_STAGE = 3;
const STAGE_CLEAR_LIVES_BONUS = 2;

class GameState {
  constructor() {
    this.roster = this.loadRoster();
    this.essence = this.loadEssence();
    this.team = [];
    this.lives = 20;
    this.maxLives = 20;
    this.wave = 1; // wave within the current stage, 1..WAVES_PER_STAGE
    this.score = 0;
    this.coins = STARTING_COINS;

    // Run/stage progression. A run is a sequence of RUN_TARGET_STAGES
    // stages; lives and score persist across stages within one run (only
    // coins and the wave counter refill per stage) so a rough early stage
    // has real consequences later, roguelike-style. runActive is the
    // context flag SanctuaryScene/RosterScene use to route their back
    // button to the Hub instead of the main menu while a run is in
    // progress - MenuScene.create() always clears it, since reaching the
    // menu inherently means no run is active.
    this.runActive = false;
    this.stageInRun = 0;
    this.currentStageId = null;

    // A brand-new player has no monsters and no essence to pull one - that's
    // a hard lock, not just rough onboarding (Team Select says "go pull",
    // the Sanctuary says "can't afford it"). Grant a starter kit exactly
    // once, tracked separately from roster size so it never re-fires just
    // because a returning player happens to be between monsters.
    if (Object.keys(this.roster).length === 0 && !this.starterAlreadyGranted()) {
      this.grantStarterKit();
    }
  }

  starterAlreadyGranted() {
    try {
      return localStorage.getItem(STARTER_GRANTED_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  grantStarterKit() {
    STARTER_SPECIES_IDS.forEach(id => {
      this.roster[id] = { speciesId: id, level: 1, essence: 0 };
    });
    this.saveRoster();
    this.essence += STARTER_ESSENCE;
    this.saveEssence();
    try {
      localStorage.setItem(STARTER_GRANTED_KEY, '1');
    } catch (e) {
      // localStorage unavailable - worst case this can grant again next
      // load, which is harmless (roster non-empty check still applies).
    }
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

  canEvolve(speciesId) {
    const entry = this.roster[speciesId];
    const targetId = EVOLUTION_MAP[speciesId];
    return !!(entry && targetId && entry.level >= MAX_MONSTER_LEVEL && entry.essence >= EVOLUTION_ESSENCE_COST);
  }

  // Swaps the roster entry (and any team slot pointing at it) from the base
  // species to its evolved form in place - same level, essence minus the
  // evolution cost. Returns the new speciesId on success, so callers that
  // hold onto the old id (e.g. a UI card mid-refresh) know what changed.
  evolveMonster(speciesId) {
    if (!this.canEvolve(speciesId)) return null;
    const entry = this.roster[speciesId];
    const targetId = EVOLUTION_MAP[speciesId];

    delete this.roster[speciesId];
    this.roster[targetId] = { speciesId: targetId, level: entry.level, essence: entry.essence - EVOLUTION_ESSENCE_COST };
    this.team = this.team.map(id => id === speciesId ? targetId : id);
    this.saveRoster();
    return targetId;
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

  // Starts a brand-new run: full lives, zero score/stage progress. Does NOT
  // pick a stage - call startStage() right after with the run's first stage.
  resetRun() {
    this.runActive = true;
    this.stageInRun = 0;
    this.currentStageId = null;
    this.lives = this.maxLives;
    this.wave = 1;
    this.score = 0;
    this.coins = STARTING_COINS;
  }

  // Enters a stage within the current run: refills coins and the
  // within-stage wave counter, but deliberately leaves lives/score alone -
  // those are the run's stakes, not the stage's.
  startStage(stageId) {
    this.stageInRun += 1;
    this.currentStageId = stageId;
    this.wave = 1;
    this.coins = STARTING_COINS;
  }

  // Monotonic wave index across the whole run (stage 2's wave 1 is harder
  // than stage 1's wave 1) - what BattleScene scales enemy counts against.
  globalWaveNumber() {
    return (this.stageInRun - 1) * WAVES_PER_STAGE + this.wave;
  }

  isRunComplete() {
    return this.stageInRun >= RUN_TARGET_STAGES;
  }

  onStageCleared() {
    this.lives = Math.min(this.maxLives, this.lives + STAGE_CLEAR_LIVES_BONUS);
  }
}

const gameState = new GameState();
