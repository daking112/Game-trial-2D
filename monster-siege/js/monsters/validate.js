// Standalone validation harness for SpeciesArt.js - run with plain Node
// (`node js/monsters/validate.js`), no browser/DOM required. Ports the
// discipline monster-tactics/scripts/*_chain.py used before ever rendering
// a creature: prove every frame of every species is a single 4-connected
// silhouette in the numeric sanity range, not an eyeballed guess.
const SpeciesArt = require('./SpeciesArt.js');

const species = SpeciesArt.buildAllSpecies();
let allOk = true;
for (const s of Object.values(species)) {
  console.log(`\n=== ${s.id} (${s.archetype}) grid ${s.width}x${s.height}, ${s.frames.length} frames ===`);
  allOk = SpeciesArt.validateSpecies(s) && allOk;
}
console.log('\n' + (allOk ? 'ALL SPECIES PASS' : 'SOME SPECIES FAILED VALIDATION'));
process.exitCode = allOk ? 0 : 1;
