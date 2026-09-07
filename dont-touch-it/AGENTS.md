# DON'T TOUCH IT — engineering brief

A mobile-first, tactile puzzle game. Every chapter presents one beautiful
object and one instruction not to touch it. Curiosity is the mechanic.

**The bar:** this has to survive a blind side-by-side against premium
tactile mobile games. "It technically works" is a failing grade.

---

## Run it

```bash
cd dont-touch-it/tools
node still.mjs 1 ../shots/still.png 4000     # one frame of chapter 1
node play-l1.mjs                             # scripted playthrough + contact sheet
DEVICE=small node still.mjs 1 ../shots/small.png
```

`tools/harness.mjs` boots the REAL game in Chromium with real touch events
(CDP `Input.dispatchTouchEvent`), so multi-touch, pinch and circular
gestures all work. Never judge the game from source — capture it and look.

Test seam (`window.__DTI__`): `state`, `level`, `goto(n)`, `probe()`,
`fps()`, `pause()`, `resume()`, `step(dt)`, `quality(name)`, `game`.
`Session.strip()` steps the game deterministically frame by frame, which is
how you judge *motion* rather than poses.

**Headless fps is meaningless here** — Chromium rasterises on CPU in this
container. Judge cost with `game.drawMs` (JS-side render time; budget
< 6ms) and by counting full-screen operations, not by the fps counter.

---

## Architecture (zero dependencies, plain ES modules, no build step)

The slice is four chapters:

| # | Rule | Object | The verb |
|---|------|--------|----------|
| I | Do not press | a switch under a bolted bell jar | torque, lift, press-and-hold |
| II | Do not squeeze | a soft specimen in a dish | poke, pinch |
| III | Do not break | a pane of tempered glass | press, then two fingers at once |
| IV | Do not turn it off | the gallery's own lamp | pull, then feel around in the dark |

```
src/
  main.js              boot, title, test seam
  core/
    math.js            vectors, easing, seeded rng, value noise, colour
    input.js           multi-touch pointers; velocity, travel, torque-about-a-pivot
    audio.js           procedural WebAudio: modal synthesis, noise, envelopes, SFX vocabulary
    haptics.js         vibration vocabulary
    tween.js           Timeline / Smooth / Pulse
  render/
    renderer.js        DPR canvas, Layer pool, bloom, vignette, grain, QualityGovernor
    materials.js       metals, glass, rubber, bevels, screws, engraving, contact shadow
    particles.js       pooled particles (SoA) + Debris rigid bodies
  physics/verlet.js    points/constraints/bend/area; rope, cloth, soft-body factories
  game/
    game.js            shell: loop, chapters, transitions       [OWNED BY LEAD]
    level.js           the Level contract                        [OWNED BY LEAD]
    set.js             the shared gallery: wall, light cone, plinth, motes
    camera.js          trauma shake, push-in, flash, time dilation
    levels/index.js    chapter registry                          [OWNED BY LEAD]
    levels/*.js        one file per chapter
  ui/
    style.css          shell chrome
    narrator.js        the voice
    hud.js             top bar, hint pill, chapter card, end card
```

### Lighting model — obey it everywhere
Key light from **upper-left** (`LIGHT` in materials.js), a **cool bounce
from the lower-right**, warm tungsten. Everything sits in one room, so a
material lit differently from its neighbours instantly reads as fake.

### The Level contract
```js
class MyLevel extends Level {
  static id = 'l2'; static chapter = 'II'; static rule = 'Do not pull';
  layout(w, h, u) {}   // (re)compute geometry; runs before enter and on resize
  enter() {}           // build state
  update(dt) {}        // dt is already time-dilated
  drawBack(ctx, glow)  // behind the plinth
  draw(ctx, glow)      // the object, in world space
  drawFront(ctx, glow) // above everything, world space
  exit() {}
  probe() {}           // MUST return a plain object describing solve state — critics read it
}
```
Signal success with `this.solve(delaySeconds)`.

Helpers on `this`: `say/interrupt` (narrator), `hint`, `shake`, `slowmo`,
`flash`, `p` (particles), `tl` (timeline), `cam`, `input`, `r` (renderer),
`game.set` (the room).

`glow` is a second, low-resolution context. Anything drawn into it blooms.

### The camera
`this.game.cam` is shared. `shake`, `kick`, `slowmo` and `flash` are
impulses — they spring back on their own. `focus(dx, dy, zoom)` is not: it
HOLDS an offset until you call it again, which is how a chapter pushes in
on something and stays there. To centre world point `(x, y)` at `zoom`:

```js
this.game.cam.focus(this.r.w / 2 - x, this.r.h / 2 - y, 2, 0.95);
// ...and to release
this.game.cam.focus(0, 0, Math.max(1, this.constructor.push || 1), 1.1);
```

The Set's layers are cached at screen resolution, so a zoom above about
2 starts showing you their pixels. `game._goto` calls `cam.resetFocus()`,
so you never have to clean up after yourself on the way out.

Use it for a payoff the player cannot otherwise see. Chapter III's mirror
comes apart into pieces forty pixels wide; the line about every piece
still having a bit of you in it is worth nothing until the camera crosses
the room and reads them.

### The room gives you your size
`this.game.set.geom` = `{ w, h, u, cx, topY, topRx, topRy, plinthW, heroR, heroTop }`.
`heroR` is the radius the room expects your hero object to occupy — build
your geometry as multiples of it so every chapter is framed identically.

---

## Rules of the house

1. **No new dependencies.** No npm, no CDN, no external assets. Fonts are
   vendored in `assets/fonts`.
2. **Own your files.** Do not edit files another agent owns. If you need a
   change in shared code, say so in your report; the lead will make it.
3. **60fps on a mid-tier phone.** Cache anything static into a `Layer` and
   blit it. Never rasterise a full-screen gradient or a large
   `ctx.filter='blur()'` per frame. Paint low-frequency content small and
   upscale it.
4. **Every interaction gets sound + haptics + a visual response**, in that
   order of importance, within one frame of the touch.
5. **Discoverability without instruction.** If the player needs a text
   hint to find the interaction, the interaction is wrong. Hints exist as a
   safety net after ~5s of idling, never as the primary teacher.
6. **Every chapter needs a "wait — I can do THAT?"** A moment that exceeds
   what the player thought the toy could do. If your chapter doesn't have
   one, you are not finished.
7. **Look at it.** Capture the running game after every change.
8. **Every prop needs one true detail.** Not more gradient — one thing
   that is only true of that object. The plinth is a painted MDF box, so
   it has roller nap, a lid joint and chipped arrises. The screws were
   sealed by an inspector, so they carry a lacquer torque seal that breaks
   the instant one turns. The bell is a casting, so it has a sound bow.
   Smooth gradients are what an object looks like when nobody decided
   what it was made of.

---

## Performance traps this project has already paid for

**Run `node inorder.mjs` too, and believe it over the others.** It is the
only tool here that PLAYS THE GAME — from the title, in order, no `?level=`
jump. Everything else enters a chapter through `?level=` or `goto()`, and
that is the exact code path that hid the anthology's central mechanic
being unimplemented for five reviews: Chapters I and III deposited no
wreckage at all, and the finale covered for them with a demo pile that
only seeded when the store was empty — which is every `?level=` entry, so
the pile every tool and every screenshot showed was the fake one, and the
real Chapter IV was never once on screen. A debug path that is prettier
than the real one hides the bug it is standing in front of.

**Run `node budget.mjs` as well as `playtest.mjs`.** playtest drives a
phone. Chapter III once cost 0.6ms on a phone and 68.6ms on a tablet, and
not one test in the repo could see it.

**Never hand the quality governor a clamped frame delta.** The simulation
clamps `dt` so a tab returning from the background does not integrate a
thirty-second step. The governor must not get that value: below 4fps every
real delta exceeds the clamp, so it received a counterfeit 16.7ms on
exactly the frames proving the device could not keep up, its seconds-based
window accrued at a fifteenth of real time, and it could not demote at
all. No threshold on the delta substitutes, either — a device slow enough
to matter produces deltas indistinguishable from a resume. Only
`visibilitychange` tells those apart.

**Never read back the presenting canvas mid-frame.** `drawImage(mainCanvas, …)`
while you are drawing on it forces an eager, unbatched raster of
everything queued so far. Measured here it turned a 2.7ms frame into an
80ms one, and on mobile it can cost a canvas its acceleration for the rest
of the session. Both glass chapters originally did this to refract the
scene. The fix is to composite what you need into a layer you own — the
Set already keeps the wall, light cone and plinth as cached layers — and
sample that instead. Chapter III's version is built once at layout time,
because everything behind that pane is static.

**Don't hand a full-screen image to drawImage and let it scale down.**
The whole source is resampled regardless of how little of it lands. Blit
the sub-rectangle you actually need.

**Don't resize a canvas every frame.** A canvas whose width or height
changes is reallocated and cleared by the browser. Camera shake moves
things every frame; quantise any derived layer's SIZE and let its origin
drift.

**Transparency accumulates.** A hundred and sixty glass shards at 0.5
alpha composite to solid white. Anything that appears in large overlapping
quantities has to be almost invisible on its own.

**Rest thresholds must be compared against gravity, not against a fixed
speed.** One frame at 2700px/s² adds 43px/s, so a "resting" test of
`|vy| < 22` can never be satisfied — the body re-accelerates past it every
frame and jitters forever. Compare the post-bounce speed against
`grav * dt`.

**Paint low-frequency content small and upscale it.** A 30px `ctx.filter`
blur across a full-resolution surface costs ~100x what the same look
costs at 1/8 scale, and nobody can tell the difference.

**Judging motion: drive the input WHILE the clock runs.** `Session.strip()`
pauses the game and steps it frame by frame. That is useful for
deterministic captures of something already in motion, but if you use it
while no touch is being driven, nothing moves — because nothing is being
done. A critic once concluded from it that the screws, the switch and the
crack "have no visual state"; all three animate fine. To judge an
interaction, send a `touchMove`, wait ~30-50ms, screenshot, repeat, with
the game running normally — or set state directly
(`window.__DTI__.game.level.<field> = …`) and compare frames. See
`tools/statediff.mjs`. If you are about to claim something does not
animate, first prove your method was actually moving the input.

**Headless fps here is meaningless** — this container rasterises on CPU.
Judge with `game.drawMs` (budget: under 6ms) and pin `?quality=high` when
reviewing art, or the auto-governor will settle on a fallback tier and you
will be looking at the wrong image.

---

## Silent failures this project has already paid for

Four separate times now, a change has looked right in the source, passed
`node --check`, passed `playtest.mjs`, and been wrong on screen. They share
a shape: **the code never ran, or ran and was thrown away, and nothing
said so.** Assume this is the failure mode here, and check the pixels.

**A shadowed `const` deletes a whole chapter.** `levels/index.js` is
fault-tolerant: a module that throws on import is dropped from the
manifest and the game runs with the rest. So `const sq` shadowing one
already in scope took Chapter I out of the build, and every `?level=`
after it silently pointed at the wrong chapter. `node --check` does not
catch a redeclaration in a nested scope. `budget.mjs` and `playtest.mjs`
both assert the full manifest before they measure anything — keep it that
way, and when a chapter behaves strangely check it is *there* first:

```js
node -e "import('./src/game/levels/l1-press.js').then(()=>console.log('OK')).catch(e=>console.log(e.message))"
```

**A throw inside a draw call leaves a plausible picture.** An exception
part-way through `draw()` aborts the rest of it, so whatever that method
had left to do simply does not happen — and what you see is the previous
layers, which usually look like a lighting bug rather than a crash. A
temporal-dead-zone `const on = fil` cost Chapter IV its entire darkness
mask this way: the room stayed lit through the blackout and every test
passed. If a frame looks wrong in a way you cannot explain, check the
console before you touch the maths.

**A delayed tween supersedes the one already running.** `tl.to(obj, k, …)`
then `tl.to(obj, k, …, delay)` on the same property does not queue: the
second replaces the first before it ever runs. Chapter I's power stutter
existed only in the source for this reason. To flash a value, SET it and
tween back — one tween.

**`solve()` sets `solved` immediately.** Only the chapter *advance* is
delayed. An `if (this.solved) return` guard inside anything scheduled
after `solve()` will never run. The level stops ticking when the chapter
really ends, which is the only condition worth guarding on.

The general lesson: when a change does not appear, do not re-read the
code and adjust the numbers. Prove the code ran — count the callbacks,
read the value back a frame later, diff the frame against the previous
build. Every one of these cost more time to guess at than to measure.

---

## Wreckage — what you broke stays broken

`src/game/wreckage.js` holds a persistent, chapter-spanning pile of debris.
Anything a chapter destroys should be deposited there before the chapter
ends, so the plinth becomes a crime scene by Chapter V.

From inside a Level:
```js
this.leave('shard', x, y, { size, a, hue });   // one item
this.leaveDebris(this.shards, 'shard');        // a whole array of Debris bodies
```
Kinds: `shard` (glass) · `screw` (brass) · `thread` · `bead` · `crumb` · `ash`.

Coordinates are converted to plinth-relative on deposit, so wreckage
survives resize and orientation changes. The shell draws it automatically
between the plinth and your chapter. If your chapter owns the room's
lighting, set `this.ownsWreckage = true` and paint it yourself with
`this.game.wreck.draw(ctx, { light: { x, y, r, strength }, ambient })`,
which reveals debris only inside a light pool.
