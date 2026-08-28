# Monster Siege

A hybrid monster-collector / tower-defense game in Three.js, aiming for
Pokemon HeartGold/SoulSilver-quality pixel-art creatures inside a real 3D
world, with Bloons TD 6-caliber tower-defense feel and a polished gacha
loop. Built piece by piece; see the live build log for current status:
`/home/user/Game-trial-2D/lowpoly-port` was a prior, unrelated experiment
(removed) - this is a fresh build.

## Art direction

HGSS's actual look is 2D pixel-art sprites, not sculpted 3D models - so
rather than faking AAA 3D art (which reads badly at any real budget), every
creature is a **pixel-art billboard**: a camera-facing (Y-axis only) plane
textured with a hand-styled pixel-art frame strip, alpha-cutout (not
blended) so overlapping sprites don't z-fight, lit and shadow-casting for
real depth in the 3D world (Octopath-style "2D sprites in a lit 3D scene").

The render pipeline renders the actual WebGL framebuffer at a low internal
resolution and lets the browser's own nearest-neighbor upscale do the
pixelation (`renderer.setSize(w, h, false)` + `image-rendering: pixelated`
on the canvas) - no fragment-shader pixelation pass needed, and it keeps
sprite textures reading as genuine pixel art rather than a blurry 3D scene
with a filter on top.

## Structure

- `js/core/Engine.js` - shared render pipeline (scene/camera/renderer,
  low-res-then-upscale pixelation, shadow map setup, update-loop registry).
  Everything else builds on this.
- `js/core/PixelBillboard.js` - the camera-facing pixel-art sprite system:
  frame-strip animation, alpha cutout, real shadow casting.
- `js/core/TestSprite.js` - a placeholder 2-frame blob sprite used only to
  verify the pipeline (facing, shadows, animation) before the real species
  art pipeline exists. Not meant to pass any art critique itself.

## A real bug found + fixed while building the foundation

Billboards initially cast **no shadow at all**. Isolated it by comparing
against a plain opaque `BoxGeometry` mesh under the same light (which
shadowed correctly) - the difference was the billboard's alpha-cutout
material's default `FrontSide`. A Y-billboard faces the *render camera*,
not the light, so from the shadow map's point of view the plane is very
often facing away from the sun - `FrontSide` silently culls it from the
shadow depth pass. Fixed with `side: THREE.DoubleSide` on the billboard
material (see `PixelBillboard.js`).

## Running it

No build step. Serve the folder and open `index.html`:

```
cd monster-siege
npx serve .
```

## Status

Core rendering foundation only, at time of writing. See the live build log
(linked from the session) for current piece-by-piece status - terrain art,
real monster species art, combat feel, gacha flow, UI, audio, and a
whole-game coherence pass are still ahead.
