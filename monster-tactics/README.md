# Monster Tactics

A browser-based tower-defense game built with Phaser 3, in the style of
Bloons TD 6: enemies march along a fixed winding path, you place monsters off
the path to attack anything that comes into range, and you build your
collection through a gacha-style Monster Sanctuary instead of a shop. Also
has an early **Multiplayer World** beta - see below - where players share one
map and can see each other build.

Canvas is a fixed 1920x1080 (Phaser's FIT scale mode letterboxes/scales it to
whatever window it's actually shown in). Two ways to run it:

- **Single-player only:** no build step, no server needed - open
  `public/index.html` in a browser, or serve `public/` with any static file
  server.
- **With the multiplayer world:** `npm install && npm start` (needs the `ws`
  package - see `package.json`) runs `server/server.js`, which both serves
  `public/` *and* hosts the multiplayer WebSocket endpoint at `/ws`, then
  visit `http://localhost:8080`. Single-player still works fine served this
  way too; it just doesn't use the socket.

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
   max level, it can evolve instead (every species has one now, via
   `EVOLUTION_MAP`), given enough Monster Essence (150) - a real jump in
   power/range, not just a level-up. The 3 starters go further and change
   *kit*, not just numbers: Rollpup (GRASS, poison-DoT) evolves into
   Rollodon (EARTH, splash), a genuinely different tower - the other 11
   keep their base type/kit on evolving (still stronger, just not a
   different Attack/Ability).
3. **Battle** - a run is 5 stages (`RUN_TARGET_STAGES`), each 3 waves
   (`WAVES_PER_STAGE`), for 15 waves total; a fixed winding path (one of
   5 distinct layouts, see `data/stages.js`) crosses a 28x16 grid from a
   spawn edge to your base - bigger than the 1920x1080 viewport by design,
   so BattleScene runs a scrollable camera (WASD/arrow keys, mouse wheel, or
   the "Center View" link) rather than showing the whole map at once. HUD,
   bench, and the wave-result overlay are all pinned to the screen
   (`setScrollFactor(0)`) so panning never drags the UI around with the
   world. Placement is only allowed on cells the path doesn't
   cross, and hovering a cell with a bench monster selected previews its
   actual range circle before you commit - placed towers keep a faint
   persistent one too, so coverage is always visible, never guessed at.
   Placing a monster costs **coins** (resets to the starting amount each
   stage, earned by defeating enemies); picking one back up refunds half
   its cost. Towers target whichever enemy in range has traveled furthest
   along the path (BTD6's default "First" priority), not whichever happens
   to be nearest. Start a wave once you're happy with your layout - enemies
   spawn and follow the path's turns exactly (see "Enemy variety & bosses"
   below for what's actually coming at you, not just bigger numbers), and
   any enemy that reaches the end costs you lives (lives and score persist
   across the whole run, not just one stage). Clearing a wave earns essence
   (more on a boss wave) and moves to the next, harder one (difficulty
   scales off the run-wide wave count, not the per-stage one, so stage 2
   picks up where stage 1 left off).
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

| Type | Attack | Ability (own cooldown) | Ultimate (charge-gated) |
|---|---|---|---|
| FIRE | Burning Strike - applies a burn DoT | Ember Nova - burns everything in range | Wildfire - a big burst + heavy burn in a wide radius |
| WATER | Chilling Shot - slows the target | Frost Pulse - slows + damages everything in range | Absolute Zero - near-total freeze + a big hit, wide radius |
| GRASS | Venom Bite - applies a poison DoT | Toxic Cloud - poisons everything in range | Bloom of Decay - a heavy, long poison in a wide radius |
| EARTH | Crushing Blow - splash damage around the target | Seismic Slam - bigger burst on everything in range | Cataclysm - a massive burst, wide radius |
| ELECTRIC | Spark Jolt - chains to 2 nearby enemies | Chain Overload - bigger chain, 4 jumps | Overload Surge - chains to 8 |
| NORMAL | Steady Strike - plain damage, plus a passive aura that speeds up nearby allies | Rally Pulse - temporary attack-speed buff for the whole team | Unstoppable - a bigger, longer team-wide attack-speed buff |

Every basic Attack fires on its own cooldown; the Ability is a separate,
longer-cooldown effect layered on top (skips its cooldown reset if nothing's
in range, so it doesn't get wasted swinging at nothing). The Ultimate is a
third tier, gated by *charge* rather than a cooldown timer - a thin gold bar
under a placed ally's HP bar fills by 1/20th on every basic attack that
actually lands, and fires automatically at full charge (BattleScene
`chargeUltimate`/`applyArchetypeUltimate`). That's a deliberately different
trigger from the Ability, not just a bigger version of it: a tower's own
attack speed - its species base, a Normal-type aura, a Rally Pulse/
Unstoppable buff - directly controls how often its Ultimate fires, so
investing in attack speed compounds instead of only mattering for the basic
Attack.

Range is deliberately not a round number of grid cells (1.6/2.2/2.6/3.2/3.6,
not 1/2/3/4). A tower placed adjacent to a straight path segment sits exactly
1 cell (perpendicular) from it - an integer range of 1 only ever touches that
segment at a single tangent point, not a real firing arc. Every range is
padded past the nearest integer so a tower placed the normal way always gets
real coverage. See the range-circle preview in-game, not the raw number, for
what's actually in range.

## Enemy variety & bosses

The original 6 enemy species (`ENEMY_SPECIES` in `data/monsters.js`) were all
the same "walk and die" unit at different stat points - no real reason to
build differently against any of them. On top of those, there are now
species with genuine counterplay:

| Trait | Example | What it means |
|---|---|---|
| `armor` | Ironshell | Flat damage reduction per hit (min 1 still lands) - rewards a few big hits over many small ones; DoT/chip damage struggles against it. |
| `regenPerSecond` | Mossback | Heals back over time - rewards burst damage, punishes leaving it half-dead and moving on. |
| `slowImmune` | the boss | Can't be slowed - the counter to just kiting it with WATER towers forever. |
| `splitInto`/`splitCount` | Splitworm -> 2x Wormlet | Killing it spawns weaker copies that pick up its exact path progress - splash/AoE towers matter more than single-target ones against it. |

**Boss waves:** every 5th wave counting across the whole run
(`BOSS_WAVE_INTERVAL` in `BattleScene.js`, not per-stage - matches how
regular difficulty already scales) spawns one boss as the last enemy of that
wave, after the normal ramp - a "BOSS INCOMING" banner announces it when the
wave starts. Currently one boss species (Kingcrab: huge HP, armored, immune
to slow, regenerating) at 2.4x scale with a wider HP bar and a name label so
it's unmistakable, worth double the essence on clear. Not yet: multiple
distinct boss species, a boss-specific attack/ability beyond stats, or
scaling boss difficulty within a single run beyond the normal per-wave curve.

## Meta-progression (Mastery)

Every other reward in this game resets to nothing but roster/essence between
runs - lives, coins, score, and stage progress all start over on a new run
(`GameState.resetRun`). **Mastery** (`data/talents.js`, `MasteryScene.js`) is
the one currency that doesn't: it's awarded once when a run ends, whether it
ends in victory or a game over (`GameState.masteryForRunEnd` -
`stageInRun * 5 + floor(score / 20)`, so even a rough early loss still
banks something), and it never resets. Spend it on `MasteryScene` (a
"Mastery" button on the main menu, plus a quick link from the Hub) on 3
permanent talents, each 5 levels deep, cost scaling per level:

| Talent | Effect | Applies |
|---|---|---|
| Vitality | +2 max lives per level, per run | Start of a run (`resetRun`) |
| Fortune | +15 starting coins per level, each stage | Start of a stage (`startStage`) |
| Insight | +10% essence earned per level | Live, every `earnEssence` call |

Vitality/Fortune only take effect at the start of a run/stage they're read
at, so upgrading mid-run changes your *next* run, not the one in progress -
Insight has no such delay since there's no equivalent moment for it to wait
for. Not built yet: more talents beyond these 3, a respec/refund option, and
any Mastery sink beyond the talent tree (e.g. cosmetic unlocks).

## Leaderboard

The one piece of cross-player visibility this game had none of before -
".io games" live and die on being able to see how you stack up against
real strangers, and until now nothing here showed a player anyone else's
result, ever. `server/server.js` keeps an in-memory, all-time top-25 list
(`leaderboard`), sorted by score, fed from two places:

- **Single-player run-ends** (both a win and a loss - `BattleScene`'s
  `submitScoreBestEffort`) - best-effort only: it tries to connect to the
  multiplayer server and silently gives up if nothing answers, so
  single-player genuinely still needs no server (see top of this README).
  Opening `index.html` directly, or serving it with a plain static file
  server, plays exactly as before; run it via `npm start` and those same
  runs start feeding the leaderboard for free.
- **Multiplayer plot wave-clears** - already connected by definition, so
  every wave cleared reports the plot's running score under `mode: 'plot'`.

Viewable two ways: a full sortable `LeaderboardScene` (name/score/stage/
wave/result columns, reachable from the main menu) and a live top-5 panel
pinned in the corner of `WorldScene` while you're in the shared world,
updated in real time as anyone - including players you've never
interacted with - submits a new score. No accounts: entries are trusted
client-reported data tagged with whatever `Tamer<N>` name the server
handed out that session (same "trust the client" tradeoff the rest of the
multiplayer server already makes - see "Multiplayer World" above). Not
built yet: persisting the leaderboard across a server restart (it's
in-memory only, same as the rest of the shared-world state), per-player
identity across sessions, and any filtering (e.g. "this week" / by mode).

## Structure

```
public/
  index.html
  js/
    data/monsters.js       species stats, rarity/leveling, gacha roll logic
    data/archetypes.js     per-type combat kit: Attack + Ability
    data/banners.js        Monster Sanctuary discovery banners (type pools)
    data/stages.js         the 5 path layouts, run-length constants, stage-choice logic
    data/talents.js        Mastery talent tree - see "Meta-progression" below
    state/GameState.js     roster/team/coins/essence/run+stage progress
    scenes/PreloadScene.js loads every sprite/tile/UI texture, registers anims
    scenes/MenuScene.js
    scenes/SanctuaryScene.js  banner select + gacha pull screen
    scenes/RosterScene.js     team selection, level/essence/upgrade UI
    scenes/BattleScene.js     the path, range preview, placement, waves, combat
    scenes/HubScene.js        between-stage hub: stage choice, countdown, Ready
    scenes/VictoryScene.js    run-complete stats screen
    scenes/WorldScene.js     shared multiplayer overworld - see "Multiplayer World" below
    scenes/MasteryScene.js   spend Mastery on permanent talents - see "Meta-progression" below
    scenes/LeaderboardScene.js  all-time top runs - see "Leaderboard" below
    audio/Sfx.js            procedural Web Audio sound effects - see "Audio" below
    net/NetClient.js        WebSocket client wrapper for WorldScene/BattleScene/LeaderboardScene
    ui/UiKit.js             shared button/panel/link factory - see "Art" below
    vendor/phaser.min.js   Phaser 3.70.0, vendored (no CDN dependency)
  assets/
    retromon/               curated, game-ready monster art (see below)
    retromon-raw/           unprocessed source material for future species
    vfx/hit-spark.png       one frame from tinyswords' vfx-pack, reused for
                             attack-impact flashes (see its index.json there
                             for the full verified pack)
    tiles/grass.png, path.png   hand-authored seamless 96x96 ground tiles
    decor/                  Tiny Swords trees/bushes/rocks dressing the grid's margins
    ui/                     stitched button/panel textures + 2 icons (see "Art" below)
    Custom Border and Panels Menu All Part.rar   source pack for ui/*.png (see "Art")
    Humble Gift - v1.3.zip                       source pack for ui/icon-*.png
scripts/
  gen_assets.py            regenerates tiles/ and ui/ - see "Art" below
server/
  server.js                shared-world WebSocket server + static file host - see "Multiplayer World" below
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
seamless 96x96 pixel-art textures generated by `scripts/gen_assets.py` (blocky,
wraparound-safe speckle placement so they tile with no visible seam - see the
script for the exact algorithm; the tile size is a constant there, matching
BattleScene's `CELL`). The grid's border decorations (trees, bushes,
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

## Audio & combat feedback

Every sound in the game is generated at runtime with the raw Web Audio API
(`public/js/audio/Sfx.js`) - oscillator tones for clean UI/combat blips,
filtered noise bursts for percussive hits/kills - rather than loaded from
sample files. No external audio dependency, nothing to license, and no
network fetch on load. `Sfx` exposes one call per event
(`place`/`pickup`/`click`/`hit`/`kill`/`coin`/`error`/`waveStart`/
`waveClear`/`gameOver`/`egg`); every scene's interactive handlers call the
matching one, and every failure is swallowed internally (`safe()` wrapper)
so a busted AudioContext can never break gameplay. Browsers require a user
gesture before audio can play at all - `main.js` unlocks the shared
`AudioContext` on the first `pointerdown` anywhere on the page.

`BattleScene.dealDamage()` also spawns a floating `-N` combat text at the
hit target (`showDamageNumber`) - centralized there so every damage source
(basic attacks, DoT, splash, chain) gets one for free. It rises and fades
using two independent tweens on the same object rather than one tween
animating both properties: a single tween can only apply one ease to
everything it touches, and easing an alpha 1→0 fade the same way as the
rise (`Cubic.Out`) front-loads the fade almost to invisibility in the
first ~25% of the tween - the position tween keeps that ease, the alpha
tween holds full opacity and only fades linearly in the final third.

## Multiplayer World (beta)

`MenuScene`'s "Multiplayer World (Beta)" button drops the player into
`WorldScene`: a shared overworld map (`server/server.js` + `net/NetClient.js`)
where every connected player has a walking avatar (WASD/arrows) and can see
everyone else's in real time. The map has 12 fixed plots; walking into an
unclaimed one and pressing **E** claims it as your base, and pressing **E**
again while standing in your own claimed plot hands off into the ordinary
single-player `BattleScene` - it plays exactly like solo mode (same
placement/combat/archetypes), just against an endless wave counter instead of
a fixed 5-stage run, since a claimed plot is a persistent base rather than a
run through a set path list. Every other player sees a live miniature preview
of your grid (a colored square per occupied cell, from `TYPE_COLORS`) update
on their own screen as you place/remove towers, without their client needing
to load your battle at all.

**The trust split that keeps this simple:** the server is authoritative only
for *world* state - who's connected, where their avatar is, who owns which
plot, and the shared "World Wave" clock ticking in the corner. It does
**not** simulate a plot's combat; that stays entirely client-side exactly as
single-player already worked, and a plot's owner just reports outcomes
(`plotLayout`, `waveResult` messages) for the server to relay to everyone
else. This is a deliberate simplification, not an oversight - full
server-authoritative combat (recomputing every attack server-side to prevent
a client from lying about outcomes) is a much bigger project; trusting the
client for combat now and hardening it later if the concept proves out is
the standard early move for this genre of game.

**The World Boss is the one exception to that trust split**, because it has
to be: it's the one piece of gameplay here that's genuinely *shared* rather
than one player's own combat rendered for others to watch, so its HP can't
live on any one client or two players' clients would each think they landed
the finishing blow. Every World Wave tick (`WORLD_WAVE_INTERVAL_MS`, 45s)
spawns one if the last isn't still standing, in a dedicated open arena above
the plot grid. Click it, or walk up and press **SPACE** - each hit is a
flat, server-decided amount (`WORLD_BOSS_ATTACK_DAMAGE`) on a per-player
cooldown, not a client-reported number, specifically so a client can't just
lie about its damage the way it can everywhere else on this server. HP is
one shared number, broadcast to everyone on every hit; when it dies, essence
is split among every contributor by their share of the total damage and
sent only to them (`worldBossReward`) - verified this whole loop directly
with 8 concurrent connections hammering it at once: damage summed to
exactly its max HP, HP only ever decreased, and reward messages went only to
the 8 who actually landed a hit, none of the bystanders.

Progression (roster/essence/coins/lives) is exactly the same
`GameState`/localStorage as single-player - entering a plot just calls the
same `gameState.resetRun()` + `startStage()` single-player already used.
There's no separate multiplayer account system.

**Not built yet, roughly in the order it'd matter:**
- Per-plot state (lives/coins/wave) lives only in that player's own
  `GameState` for their current session - the server only ever sees the
  cosmetic layout + wave number it relays to other players' previews, not
  real persistent base stats. Closing the tab resets your base's session
  progress same as abandoning a single-player run does today.
- One shared room for everyone connected, capped at 12 plots total - no
  matchmaking, sharding into multiple rooms, or a lobby list. Fine for a
  handful of concurrent players, not for real scale.
- No accounts/auth - `Tamer<N>` display names are assigned per-connection,
  there's nothing tying a person to the same identity across sessions.
- No reconnect handling - a dropped WebSocket just shows a "Disconnected"
  message; refreshing starts a brand new connection/avatar.
- Only one World Boss species/difficulty exists - no variety or scaling by
  however many players happen to be online when it spawns.
- No visiting/co-op on a *plot* specifically (walking into someone else's
  live battle to help defend) or chat - the World Boss is the only actually
  shared combat right now.
- Needs real hosting to be reachable by anyone but localhost - this only
  runs as long as `npm start`'s process does, on whatever host runs it.

## Known limitations (v1)

- Enemies don't fight back - placed monsters are invincible during a wave,
  they only ever attack.
- 5 path layouts exist (`data/stages.js`) for a 5-stage run, but
  `pickStageChoices` only avoids repeating the stage just cleared, not every
  stage played earlier in the run - a layout can still resurface mid-run.
- Leveling scales stats (+12%/level, cap level 5); every species now has an
  evolution (`data/monsters.js` EVOLUTION_MAP), but kit-changing evolution
  (a genuinely different Attack/Ability, not just bigger numbers) is still
  only the 3 starters - the other 11 keep their base type on evolving, just
  stronger. Ability upgrades and alternate forms (distinct from evolution)
  are not built.
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
  the Multiplayer World's avatars are plain colored circles + name labels,
  not a sprite.
- The path/grass boundary is a flat-color rim stroke, not proper transition
  tiles (no corner pieces where the road turns) - reads clearly enough at
  this grid's cell size, but wouldn't scale to a larger or diagonal path.
  Border decorations (trees/bushes/rocks) are fixed positions, not randomized
  or stage-specific, so every stage's margins look the same.

## Bigger design not built yet

The long-term pitch is larger than what's here. The two immediate next
targets per direction from the project owner both now have a first version
built: ~~enemy variety~~ (see "Enemy variety & bosses" above -
armor/regen/split/slow-immune traits plus periodic boss waves now exist;
still to add: a flying trait that only certain tower types can hit, more
boss species, and a further balance pass now that real variety exists to
balance) and ~~meta-progression~~ (see "Meta-progression (Mastery)" above -
3 permanent talents now exist; still to add: more talents, a respec option,
and any Mastery sink beyond the talent tree). Also shipped since then: every
species now has an evolution, not just the 3 starters (see "Current loop"
above) - kit-changing evolution specifically (a different Attack/Ability,
not just bigger numbers) is still only those original 3, though. The
Ultimate combat tier mentioned here previously is also now built (see
"Monsters are the towers" above). Still on the list: differentiated pull
currencies, and kit-changing evolution/Ultimate variety beyond what's above.

Longer-term, the stated direction is a multiplayer .io-style game (think
Roblox tycoon-tower-defense) - a shared world players build/defend in
together rather than solo runs. A first slice of that now exists (see
"Multiplayer World (beta)" above): a real WebSocket server, a shared
walkable map, claimable plots with live cross-player previews, and a shared
wave clock - client-trusted combat rather than server-authoritative, and a
single fixed-size room rather than real matchmaking, both called out above
as the next things to harden if the concept proves out. It's also why the
single-player battle grid was built with a camera scrolling a world bigger
than one screen instead of just a bigger fixed viewport - a shared world
needs to be navigable, not just large, and that camera work carried over
directly into WorldScene.
