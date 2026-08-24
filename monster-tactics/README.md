# Monster Tactics

A single-player, browser-based, grid-tactics monster-collecting game built with
Phaser 3. Catch wild monsters, build a team, then place them on a battlefield
grid to hold off waves of enemies as they advance toward your base.

No build step - open `public/index.html` in a browser, or serve the `public/`
folder with any static file server.

## Current loop

1. **Catch** - random wild encounters, each with a catch-rate roll. Success adds
   the monster to your roster (persisted to `localStorage`).
2. **Team** - pick up to 5 roster monsters as your battle team.
3. **Battle** - place your team anywhere on a 10x6 grid, then start the wave.
   Enemies spawn from the right edge and walk left; placed monsters attack
   anything within their range. Enemies that reach the left edge damage your
   base. Survive as many waves as you can.

## Structure

```
public/
  index.html
  js/
    data/monsters.js       species stats + which sprite frame each uses
    state/GameState.js     roster/team/battle-progress, persisted to localStorage
    scenes/PreloadScene.js loads art, builds the one generated UI texture
    scenes/MenuScene.js
    scenes/CatchScene.js
    scenes/RosterScene.js
    scenes/BattleScene.js  the grid battle - placement, waves, combat
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
`public/assets/retromon/index.json` for exactly what was done and which frames
are currently wired up - only 8 of the 288 available frames are used so far,
so there's a lot of room to add more species before needing new art).

Everything else (grid, HUD, buttons, health bars) is placeholder shapes drawn
at runtime with Phaser Graphics - no art dependency.

## Known limitations (v1)

- Enemies don't fight back - they only damage your base if they reach it.
  Placed monsters are currently invincible during a wave.
- Waves are endless with simple linear scaling, no explicit "win" state.
- Only `retromon-b1` (Big Pack 1) is wired into species data; Big Packs 2-4 are
  extracted and ready to use for more species (see the asset index.json).
- Trainer/player sprites in `retromon-raw/` aren't wired in anywhere yet -
  there's no overworld/exploration scene, just menu -> catch/battle.
