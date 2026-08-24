// Persistent-ish game state shared across scenes.
// Roster is saved to localStorage so caught monsters survive a page reload;
// everything else (team selection, battle progress) is in-memory per session.

const ROSTER_STORAGE_KEY = 'monster-tactics:roster';
const MAX_TEAM_SIZE = 5;

class GameState {
  constructor() {
    this.roster = this.loadRoster();
    this.team = [];
    this.baseHp = 10;
    this.maxBaseHp = 10;
    this.wave = 1;
    this.score = 0;
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

  addToRoster(speciesId) {
    const entry = {
      uid: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      speciesId
    };
    this.roster.push(entry);
    this.saveRoster();
    return entry;
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
    this.baseHp = this.maxBaseHp;
    this.wave = 1;
    this.score = 0;
  }
}

const gameState = new GameState();
