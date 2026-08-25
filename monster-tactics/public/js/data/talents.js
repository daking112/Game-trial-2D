// Permanent, run-independent upgrades bought with Mastery - the
// meta-progression track noted as missing in README's "Bigger design not
// built yet": everything else (roster/essence aside) resets to nothing
// between runs, so a completed run's only lasting reward used to be
// whatever essence you happened to earn along the way. Mastery is earned
// once per run, on either a win or a loss (see GameState.masteryForRunEnd),
// and never resets - spent here on MasteryScene.
//
// vitality/fortune apply at the start of a run/stage (see GameState.resetRun
// /startStage), so upgrading mid-run affects your *next* run, not the one
// in progress. insight applies live (GameState.earnEssence checks the
// current level every time), since there's no "start of run" moment for it
// to wait for.
const TALENTS = [
  {
    id: 'vitality', name: 'Vitality', icon: '❤', maxLevel: 5, baseCost: 20, costStep: 15,
    describe: (level) => `+${level * 2} max lives per run`
  },
  {
    id: 'fortune', name: 'Fortune', icon: '💰', maxLevel: 5, baseCost: 20, costStep: 15,
    describe: (level) => `+${level * 15} starting coins each stage`
  },
  {
    id: 'insight', name: 'Insight', icon: '✨', maxLevel: 5, baseCost: 25, costStep: 20,
    describe: (level) => `+${level * 10}% essence earned`
  }
];

function getTalent(id) {
  return TALENTS.find(t => t.id === id);
}

function talentCostForLevel(talent, level) {
  return talent.baseCost + level * talent.costStep;
}
