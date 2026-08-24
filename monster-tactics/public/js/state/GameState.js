// Persistent-ish game state shared across scenes.
// Roster and essence are saved to localStorage so they survive a page reload;
// coins and battle progress are in-memory per battle run only.

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
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
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

  addToRoster(speciesId) {
    const entry = {
      uid: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      speciesId
    };
    this.roster.push(entry);
    this.saveRoster();
    return entry;
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

  toggleTeamMember(uid) {
    const idx = this.team.indexOf(uid);
    if (idx >= 0) {
      this.team.splice(idx, 1);
      return true;
    }
    if (this.team.length >= MAX_TEAM_SIZE) {
      return false;
    }
    this.team.push(uid);
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
