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
   the payoff for pulling something you already own.
3. **Battle** - a winding path crosses the grid from a spawn edge to your
   base. Placement is only allowed on cells the path doesn't cross, and
   hovering a cell with a bench monster selected previews its actual range
   circle before you commit - placed towers keep a faint persistent one too,
   so coverage is always visible, never guessed at. Placing a monster costs
   **coins** (session-only currency, resets each battle, earned by defeating
   enemies); picking one back up refunds half its cost. Towers target
   whichever enemy in range has traveled furthest along the path (BTD6's
   default "First" priority), not whichever happens to be nearest. Start a
   wave once you're happy with your layout - enemies spawn and follow the
   path's turns exactly, and any enemy that reaches the end costs you lives.
   Clear a wave to earn essence and move to the next, harder one. Waves are
   endless - see how far you get.

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
    state/GameState.js     roster/team/coins/essence/battle progress
    scenes/PreloadScene.js loads art, builds the one generated UI texture
    scenes/MenuScene.js
    scenes/SanctuaryScene.js  banner select + gacha pull screen
    scenes/RosterScene.js     team selection, level/essence/upgrade UI
    scenes/BattleScene.js     the path, range preview, placement, waves, combat
    vendor/phaser.min.js   Phaser 3.70.0, vendored (no CDN dependency)
  assets/
    retromon/               curated, game-ready monster art (see below)
    retromon-raw/           unprocessed source material for future species
    vfx/hit-spark.png       one frame from tinyswords' vfx-pack, reused for
                             attack-impact flashes (see its index.json there
                             for the full verified pack)
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

Everything else (grid, road, HUD, buttons, health bars, range circles) is
placeholder shapes drawn at runtime with Phaser Graphics - no art dependency.

## Known limitations (v1)

- Enemies don't fight back - placed monsters are invincible during a wave,
  they only ever attack.
- The path is a single fixed layout hardcoded in `BattleScene.js`
  (`PATH_CELLS`) - no per-wave or per-map path variety yet.
- Leveling only scales stats (+12%/level, cap level 5). Ability upgrades,
  alternate forms, and evolution (which would change a monster's Attack/
  Ability kit, not just its numbers) are not built - see below.
- All banners share one currency and one pull cost (40 essence). Capture
  Cores / tickets as a differentiated pull currency are not built.
- The Team Select roster grid doesn't scroll - a very large collection
  (beyond what fits in ~3 rows) will overflow past the Start Battle button.
  Not a problem yet at 14 total species, but noted before it becomes one.
- Waves are endless with simple linear scaling, no explicit "win" state.
- Only `retromon-b1` (Big Pack 1) is wired into species data; Big Packs 2-4
  are extracted and ready to use for more species (see the asset index.json).
- Trainer/player sprites in `retromon-raw/` aren't wired in anywhere yet -
  there's no overworld/exploration scene, just menu -> sanctuary/battle.

## Bigger design not built yet

The long-term pitch is larger than what's here - bosses, per-species
evolution that changes a monster's kit (not just its stats), an Ultimate
combat tier, differentiated pull currencies, and eventual co-op. Co-op
specifically needs backend infrastructure (matchmaking, real-time state
sync) this project doesn't have and was explicitly deferred rather than
half-built.
