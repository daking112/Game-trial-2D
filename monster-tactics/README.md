# Monster Tactics

A single-player, browser-based tower-defense game built with Phaser 3, in the
style of Bloons TD 6: enemies march along a fixed winding path, you place
monsters off the path to attack anything that comes into range, and you build
your roster of monsters through a gacha-style egg system instead of a shop.

No build step - open `public/index.html` in a browser, or serve the `public/`
folder with any static file server.

## Current loop

1. **Egg Shop** - spend **essence** (persistent, earned by clearing waves) on
   an egg pull. Each pull rolls a rarity tier (Common/Rare/Epic/Legendary,
   weighted) then a random species within that tier, and adds it to your
   roster (persisted to `localStorage`).
2. **Team** - pick up to 5 roster monsters as your battle team.
3. **Battle** - a winding path crosses the grid from a spawn edge to your
   base. Placement is only allowed on cells the path doesn't cross. Placing a
   monster costs **coins** (session-only currency, resets each battle,
   earned by defeating enemies); picking a placed monster back up refunds
   half its cost. Start a wave once you're happy with your layout - enemies
   spawn and follow the path's turns exactly, placed monsters auto-attack
   anything within range, and any enemy that reaches the end of the path
   costs you lives. Clear a wave to earn essence and move to the next,
   harder one. Waves are endless - see how far you get.

## Structure

```
public/
  index.html
  js/
    data/monsters.js       species stats, rarity tiers, gacha roll logic
    state/GameState.js     roster/team/coins/essence/battle progress
    scenes/PreloadScene.js loads art, builds the one generated UI texture
    scenes/MenuScene.js
    scenes/EggScene.js     the gacha pull screen
    scenes/RosterScene.js  team selection, rarity-colored cards
    scenes/BattleScene.js  the path, placement, waves, combat
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

Everything else (grid, road, HUD, buttons, health bars) is placeholder shapes
drawn at runtime with Phaser Graphics - no art dependency.

## Known limitations (v1)

- Enemies don't fight back - placed monsters are invincible during a wave,
  they only ever attack.
- The path is a single fixed layout hardcoded in `BattleScene.js`
  (`PATH_CELLS`) - no per-wave or per-map path variety yet.
- No tower upgrades - a placed monster's stats are fixed once placed (you can
  only pick it up for a partial refund and place something else).
- Waves are endless with simple linear scaling, no explicit "win" state.
- Only `retromon-b1` (Big Pack 1) is wired into species data; Big Packs 2-4
  are extracted and ready to use for more species (see the asset index.json).
- Trainer/player sprites in `retromon-raw/` aren't wired in anywhere yet -
  there's no overworld/exploration scene, just menu -> egg shop/battle.
