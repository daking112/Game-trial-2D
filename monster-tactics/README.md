# Monster Tactics

A single-player, browser-based tower-defense game built with Phaser 3, in the
style of Bloons TD 6: enemies march along a fixed winding path, you place
monsters off the path to attack anything that comes into range, and you build
your collection through a gacha-style Monster Sanctuary instead of a shop.

No build step - open `public/index.html` in a browser, or serve the `public/`
folder with any static file server.

A brand-new player starts with 3 starter monsters (one each of a poison-DoT,
burn-DoT, and splash archetype - Rollpup/Snarlpup/Hornlet) and 80 essence,
granted once on first load (`GameState.grantStarterKit`, tracked separately
from roster size so it never re-fires for a returning player). Without this
a fresh player has zero monsters and zero essence to pull one with - Team
Select says "go pull" and the Sanctuary says "can't afford it" - a hard
lock, not just rough onboarding.

## Current loop

1. **Monster Sanctuary** - pick a themed discovery banner (Standard, or one
   restricted to a single type: Verdant/GRASS, Inferno/FIRE, Frozen/WATER,
   Storm/ELECTRIC, Bedrock/EARTH) and spend **essence** (persistent, earned by
   clearing waves) on a pull. A monster is owned once, not stacked: pulling a
   **new** species adds it to your roster at level 1; pulling a **duplicate**
   of one you already have converts into that species' own Monster Essence
   instead, spent on leveling it up. Higher rarity = more essence per
   duplicate.
2. **Team Select** - pick up to 5 roster monsters as your battle team. Each
   card shows its level, level-scaled stats, and an Upgrade button (once
   there's enough Monster Essence for that species) that boosts its stats -
   the payoff for pulling something you already own. Once a monster hits
   max level, species in `EVOLUTION_MAP` (currently the 3 starters) can
   evolve instead, given enough Monster Essence (150) - evolving changes
   the monster's *kit*, not just its numbers: Rollpup (GRASS, poison-DoT)
   evolves into Rollodon (EARTH, splash), a genuinely different tower.
3. **Battle** - a run is 5 stages (`RUN_TARGET_STAGES`), each 3 waves
   (`WAVES_PER_STAGE`), for 15 waves total; a fixed winding path (one of
   4 distinct layouts, see `data/stages.js`) crosses the grid from a spawn
   edge to your base. Placement is only allowed on cells the path doesn't
   cross, and hovering a cell with a bench monster selected previews its
   actual range circle before you commit - placed towers keep a faint
   persistent one too, so coverage is always visible, never guessed at.
   Placing a monster costs **coins** (resets to the starting amount each
   stage, earned by defeating enemies); picking one back up refunds half
   its cost. Towers target whichever enemy in range has traveled furthest
   along the path (BTD6's default "First" priority), not whichever happens
   to be nearest. Start a wave once you're happy with your layout - enemies
   spawn and follow the path's turns exactly, and any enemy that reaches
   the end costs you lives (lives and score persist across the whole run,
   not just one stage). Clearing a wave earns essence and moves to the
   next, harder one (difficulty scales off the run-wide wave count, not
   the per-stage one, so stage 2 picks up where stage 1 left off).
4. **Hub** - clearing a stage's 3rd wave drops you here instead of straight
   into the next stage: a small bonus to lives, a choice between 2 of the
   remaining stage layouts (a single-player stand-in for "vote on the next
   map" - real voting needs a second player, which this project doesn't
   have), quick links back into the Sanctuary/Team Select to spend essence
   or adjust your team, and a 20-second auto-advance countdown with a
   Ready button to skip it. Clearing the 5th stage instead sends you to a
   **Victory** screen with your final run stats; running out of lives at
   any point ends the run early on a game-over screen with the same stats.
   Either way, "Start New Run" resets lives/score/coins and puts you back
   at stage 1.

## Monsters are the towers, not reskinned dart-throwers

A monster's **type** determines a genuinely different combat kit, not just a
palette swap - see `public/js/data/archetypes.js`:

| Type | Attack | Ability (own cooldown) |
|---|---|---|
| FIRE | Burning Strike - applies a burn DoT | Ember Nova - burns everything in range |
| WATER | Chilling Shot - slows the target | Frost Pulse - slows + damages everything in range |
| GRASS | Venom Bite - applies a poison DoT | Toxic Cloud - poisons everything in range |
| EARTH | Crushing Blow - splash damage around the target | Seismic Slam - bigger burst on everything in range |
| ELECTRIC | Spark Jolt - chains to 2 nearby enemies | Chain Overload - bigger chain, 4 jumps |
| NORMAL | Steady Strike - plain damage, plus a passive aura that speeds up nearby allies | Rally Pulse - temporary attack-speed buff for the whole team |

Every basic Attack fires on its own cooldown; the Ability is a separate,
longer-cooldown effect layered on top (skips its cooldown reset if nothing's
in range, so it doesn't get wasted swinging at nothing). This is "Attack +
Ability" only - a third "Ultimate" tier is intentionally not built yet, but
`archetypes.js` has a documented, unused shape for one so it can be added
later without restructuring the combat loop.

Range is deliberately not a round number of grid cells (1.6/2.2/2.6/3.2/3.6,
not 1/2/3/4). A tower placed adjacent to a straight path segment sits exactly
1 cell (perpendicular) from it - an integer range of 1 only ever touches that
segment at a single tangent point, not a real firing arc. Every range is
padded past the nearest integer so a tower placed the normal way always gets
real coverage. See the range-circle preview in-game, not the raw number, for
what's actually in range.

## Structure

```
public/
  index.html
  js/
    data/monsters.js       species stats, rarity/leveling, gacha roll logic
    data/archetypes.js     per-type combat kit: Attack + Ability
    data/banners.js        Monster Sanctuary discovery banners (type pools)
    data/stages.js         the 4 path layouts, run-length constants, stage-choice logic
    state/GameState.js     roster/team/coins/essence/run+stage progress
    scenes/PreloadScene.js loads every sprite/tile/UI texture, registers anims
    scenes/MenuScene.js
    scenes/SanctuaryScene.js  banner select + gacha pull screen
    scenes/RosterScene.js     team selection, level/essence/upgrade UI
    scenes/BattleScene.js     the path, range preview, placement, waves, combat
    scenes/HubScene.js        between-stage hub: stage choice, countdown, Ready
    scenes/VictoryScene.js    run-complete stats screen
    ui/UiKit.js             shared button/panel/link factory - see "Art" below
    vendor/phaser.min.js   Phaser 3.70.0, vendored (no CDN dependency)
  assets/
    retromon/               curated, game-ready monster art (see below)
    retromon-raw/           unprocessed source material for future species
    vfx/hit-spark.png       one frame from tinyswords' vfx-pack, reused for
                             attack-impact flashes (see its index.json there
                             for the full verified pack)
    tiles/grass.png, path.png   hand-authored seamless 64x64 ground tiles
    decor/                  Tiny Swords trees/bushes/rocks dressing the grid's margins
    ui/                     stitched button/panel textures + 2 icons (see "Art" below)
    Custom Border and Panels Menu All Part.rar   source pack for ui/*.png (see "Art")
    Humble Gift - v1.3.zip                       source pack for ui/icon-*.png
scripts/
  gen_assets.py            regenerates tiles/ and ui/ - see "Art" below
```

## Art

Monster sprites are from **Retromon Big Pack 1-4** by
[Willibab](https://willibab.itch.io/) - free for personal/commercial use with
credit, see `public/assets/retromon/LICENSE.txt`. The original sheets bake an
opaque near-white background into every frame; `public/assets/retromon/*.png`
are re-exported with that background flood-filled to transparent (see
`public/assets/retromon/index.json` for exactly what was done and which
frames are currently wired up - only 14 of the 288 available frames are used
so far between the gacha pool and enemy roster, so there's a lot of room to
add more species before needing new art).

The battle grid's ground (`assets/tiles/grass.png`, `path.png`) is hand-authored:
seamless 64x64 pixel-art textures generated by `scripts/gen_assets.py` (blocky,
wraparound-safe speckle placement so they tile with no visible seam - see the
script for the exact algorithm). The grid's border decorations (trees, bushes,
rocks - `assets/decor/`) are from the **Tiny Swords** pack by
[Pixel Frog](https://pixelfrog-assets.itch.io/tiny-swords), via this repo's
`tinyswords/` project - see `assets/ui/LICENSE.txt`.

Every button and panel (`assets/ui/btn-*.png`, `panel-*.png`, `bench-slot.png`)
is stitched from one frame design in the **Custom Border and Panels Menu**
pack (`assets/Custom Border and Panels Menu All Part.rar` - a purchased/
downloaded asset pack, not attributed to a public itch.io page; check its own
license before reuse outside this project). That pack ships 16 recolors of
an 80-frame sheet (a 10x8 grid of complete, self-contained 64x64 bordered
squares - unlike Tiny Swords, nothing here is pre-fragmented into nine-slice
pieces); `gen_assets.py` picks the green colorway's plain rounded-square
frame (cell at pixel (64,64)-(128,128) in `Border All 4.png`), measures its
border as a uniform 8px on all sides by sampling pixel colors along the
frame's centerline, slices that into a 3x3 nine-slice grid itself, and
recomposes it into flattened PNGs at the exact sizes this game needs. The
**Humble Gift** pack (`assets/Humble Gift - v1.3.zip`) contributes two small
16x16 icons - a coin and a star - that happened to already match this game's
gold essence/coin color, used unmodified next to the HUD's essence readout
(Menu, Sanctuary) and each bench monster's coin cost. Both packs are
committed as their original archives rather than pre-extracted (`unrar`/
`unzip`ing 80+ frames × 16 colors is a lot of repo weight for the ~2 frames
actually used); `gen_assets.py` extracts them into scratch `-raw/` folders on
demand the first time it runs (needs `unrar` - `apt install unrar-free`; 7z's
bundled RAR codec doesn't support every method these were saved with).

`public/js/ui/UiKit.js` is the one shared button/panel/link/icon-label
factory every scene calls into, replacing what used to be six near-identical
hand-rolled `makeButton()` copies.

## Known limitations (v1)

- Enemies don't fight back - placed monsters are invincible during a wave,
  they only ever attack.
- Only 4 path layouts exist (`data/stages.js`) but a run is 5 stages, so
  one layout necessarily repeats every run (`pickStageChoices` avoids
  repeating the stage just cleared, but can't avoid repeats across the
  whole run with a pool this small).
- Leveling scales stats (+12%/level, cap level 5); evolution (kit-changing,
  see `data/monsters.js` EVOLUTION_MAP) only covers the 3 starter species so
  far - everything else just stays maxed. Ability upgrades and alternate
  forms (distinct from evolution) are not built.
- All banners share one currency and one pull cost (40 essence). Capture
  Cores / tickets as a differentiated pull currency are not built.
- The Team Select roster grid doesn't scroll - a very large collection
  (beyond what fits in ~3 rows) will overflow past the Start Battle button.
  Not a problem yet at 14 total species, but noted before it becomes one.
- Stage choice in the Hub is a single-player stand-in for "vote on the next
  map" - it always offers 2 options and never involves a second player.
- Only `retromon-b1` (Big Pack 1) is wired into species data; Big Packs 2-4
  are extracted and ready to use for more species (see the asset index.json).
- Trainer/player sprites in `retromon-raw/` aren't wired in anywhere yet -
  there's no overworld/exploration scene, just menu -> sanctuary/battle.
- The path/grass boundary is a flat-color rim stroke, not proper transition
  tiles (no corner pieces where the road turns) - reads clearly enough at
  this grid's cell size, but wouldn't scale to a larger or diagonal path.
  Border decorations (trees/bushes/rocks) are fixed positions, not randomized
  or stage-specific, so every stage's margins look the same.

## Bigger design not built yet

The long-term pitch is larger than what's here - bosses, evolution for the
other 11 species (only the 3 starters have an evolution defined right now),
an Ultimate combat tier, differentiated pull currencies, and eventual co-op.
Co-op specifically needs backend infrastructure (matchmaking, real-time
state sync) this project doesn't have and was explicitly deferred rather
than half-built.
