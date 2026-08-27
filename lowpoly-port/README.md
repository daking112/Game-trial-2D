# Monster Tactics - Low Poly

A full low-poly 3D port of the pixel-art game in `monster-tactics/`: same
data, same rules, same progression - a new Three.js renderer in place of
Phaser's 2D canvas. The full 2D pixel-art version is preserved unchanged on
the `save/2d-pixel-art-v1` branch as a checkpoint from before this port
started; this app lives entirely in its own folder and touches nothing in
`monster-tactics/`.

## What's actually ported

**Reused verbatim from the pixel-art game** (`js/data/`, `js/state/
GameState.js` - copied byte-for-byte, framework-agnostic, no Phaser
dependency): all 99 tower species (33 base + 66 evolutions) and their exact
stats, all 12 enemy species, all 6 combat archetypes (Fire/Water/Grass/
Earth/Electric/Normal - attack/ability/ultimate effects), all 24 stage path
layouts across 6 biomes, the talent/Mastery system, the gacha/banner
system, roster/leveling/evolution, daily login, and every number in
between. A save file's roster/essence/mastery carries over between this
version and the pixel version if both are served from the same origin
(same `localStorage` keys) - though they aren't currently deployed that way.

**Fully re-implemented for 3D** (`js/game/BattleGame.js`, ported line-for-
line from `BattleScene.js`'s mechanics): grid placement, path-following
enemy movement (converted from pixel waypoints to 3D world-space
waypoints), BTD6-style "furthest along the path" targeting, every combat
archetype's attack/ability/ultimate effect (DoT, slow, splash, chain
lightning, team-wide attack-speed buffs), boss waves, splitting/summoning
enemies, armor/regen/slow-immunity, lives/coins/score, wave/stage/run
progression - the whole tower-defense loop, just rendered in a real 3D
scene with an orbiting/panning camera instead of a scrolled 2D grid.

**Procedurally generated, not hand-modeled** (`js/render/LowPolyModels.js`):
there are 99 tower species and 12 enemy species - far too many to hand-
sculpt individually in one pass. Each gets a real, distinct low-poly
creature built from a deterministic recipe: a hash of the species id picks
one of six body archetypes (quadruped / biped / serpentine / winged / blob
/ armored-shelled), `species.type` picks the color family (same
`TYPE_COLORS` as the pixel version), and evolution tier (base/mid/final)
scales size and adds detail (horns, wings, a glow ring) so an evolved form
reads as a grown-up version of the same creature. The same species id
always builds the same model. `js/render/PreviewRenderer.js` renders each
one to a cached thumbnail for the roster/sanctuary/bench UI cards.

**DOM screens, not 3D** (`js/ui/App.js`): Menu, Sanctuary (gacha pulls),
Team Select, Hub (post-stage stage choice), Mastery, Victory are plain
HTML/CSS panels, not 3D scenes - a menu doesn't benefit from a 3D pass the
way the battle grid does, and this kept the whole port tractable. Only the
actual battle grid is Three.js.

## Not ported in this pass

- **Multiplayer** (`WorldScene`/per-player plots, `RaidScene`/Squad
  Skirmish raids, `LeaderboardScene`, `NetClient`) - single-player run/
  stage loop only.
- **Sound** (`Sfx.js` is Phaser's sound manager API) - silent for now.
- Player avatars, banners' visual flair beyond the DOM card.

These are real gaps, not overlooked - porting the single-player core loop
end-to-end first (menu -> pull -> team select -> battle -> win/loss ->
mastery -> repeat) was the priority; multiplayer is a distinct, separable
follow-up.

## Running it

No build step. Serve the folder with any static file server and open
`index.html`:

```
cd lowpoly-port
npx serve .
```

`vendor/` has three.js and OrbitControls already vendored (copied from
`lowpoly-prototype/`), loaded via a browser import map - see `index.html`.

## Status

Playwright-tested end to end: menu navigation, daily login claim, gacha
pulls (new + duplicate reveals), team select (select/upgrade/evolve),
starting a run, tower placement (bench select -> raycast-to-grid-cell),
wave combat (enemy spawning, path movement, targeting, damage, status
effects, scoring), and HUD updates - all confirmed working with real
gameplay, not just "no console errors." Win/loss overlay + Hub/Victory/
Mastery loop confirmed reachable; not every stage/archetype/boss
combination has been individually played through.
