// Discovery banners: themed pulls that restrict the gacha pool to specific
// types, so a player chasing "a Fire monster" doesn't have to pull the whole
// SPECIES list hoping for one. All banners share the same essence cost and
// currency for now - see GameState/SanctuaryScene. Differentiated pull
// currencies (Capture Cores, tickets) are a deferred enhancement, not built
// here, to avoid currency proliferation before there's a reason for it.
//
// types: null means "no filter" (the full SPECIES list, all rarities).

const BANNERS = [
  { id: 'standard', name: 'Standard Discovery', icon: '⭐', types: null, blurb: 'Every known species.' },
  { id: 'verdant', name: 'Verdant Discovery', icon: '🌿', types: ['GRASS'], blurb: 'Forest & bug-type monsters.' },
  { id: 'inferno', name: 'Inferno Discovery', icon: '🔥', types: ['FIRE'], blurb: 'Fire-type monsters.' },
  { id: 'frozen', name: 'Frozen Discovery', icon: '❄️', types: ['WATER'], blurb: 'Ice & water-type monsters.' },
  { id: 'storm', name: 'Storm Discovery', icon: '⚡', types: ['ELECTRIC'], blurb: 'Electric-type monsters.' },
  { id: 'bedrock', name: 'Bedrock Discovery', icon: '🪨', types: ['EARTH'], blurb: 'Earth-type monsters.' }
];

function getBanner(id) {
  return BANNERS.find(b => b.id === id);
}
