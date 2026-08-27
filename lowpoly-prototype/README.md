# Low Poly Prototype

A standalone visual-style experiment, evaluating a faceted/flat-shaded
"low poly" 3D look as a possible future direction for Monster Tactics.

**Not wired into the real game.** Nothing in `monster-tactics/` was
touched — this is a separate Three.js scene living in its own folder, so
it can be thrown away with zero impact if the style doesn't land.

The full working 2D pixel-art game is preserved on the `save/2d-pixel-art-v1`
branch as a checkpoint before this experiment started.

## What's here

- A low-poly terrain (subdivided plane, randomized vertex heights + vertex
  colors, flat shaded)
- Low-poly trees and rocks scattered around
- A blocky low-poly stand-in monster (built from primitives — icosahedrons,
  cones, cylinders — not a sculpted asset) with an idle bob and flame-tail
  accent, echoing the game's fire-fox line (cindertail)
- Orbit camera (drag to rotate, scroll to zoom)

## Running it

```
cd lowpoly-prototype
npm install        # pulls in three.js locally (only needed to re-vendor
                    # vendor/three.module.min.js + vendor/OrbitControls.js
                    # if they're ever regenerated - the committed vendor/
                    # files are enough to run as-is)
```

Then serve the folder with any static file server and open `index.html`
in a browser, e.g.:

```
npx serve .
```

No build step — `index.html` uses a browser import map to resolve
`"three"` to the vendored `vendor/three.module.min.js`.

## Status

Early visual test only. No game logic, no monster roster, no battle
system — just answering "does this aesthetic direction seem worth
pursuing?" before any real conversion work is considered.
