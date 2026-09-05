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
