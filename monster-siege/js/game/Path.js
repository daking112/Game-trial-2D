// The lane enemies walk, as a continuous world-space polyline rather than a
// list of cells.
//
// Terrain.js already expands authored waypoints into the set of cells the
// path covers (that set is what the ground texture is rasterised from), but
// walking a cell list directly makes enemies move in stair-steps and snap
// through corners. So movement uses its own representation built from the
// SAME authored waypoints: cell centres joined into straight segments, with
// arc-length tables so any distance along the lane maps to an exact world
// point. One authored source, two derived views - the drawn path and the
// walked path can't drift apart.
//
// Corners get a real radius (see cornerRadius): a quadratic bend inscribed
// into each turn, so a monster leans through a 90-degree turn instead of
// pivoting on the spot. The bend is clamped to half the shorter adjoining
// segment, so it can never overshoot into the previous or next corner even
// on a one-cell jog.

function _v(x, z) { return new THREE.Vector3(x, 0, z); }

// Extend the lane past the first/last waypoint so enemies walk in from
// off-map and exit off-map, instead of popping into existence on the board
// edge. The direction is taken from the adjoining segment.
function _padEnds(pts, pad) {
  if (pts.length < 2 || pad <= 0) return pts;
  const out = pts.slice();
  const head = out[0].clone().sub(out[1]).normalize().multiplyScalar(pad).add(out[0]);
  const tailFrom = out[out.length - 2], tail = out[out.length - 1];
  const tailOut = tail.clone().sub(tailFrom).normalize().multiplyScalar(pad).add(tail);
  out.unshift(head);
  out.push(tailOut);
  return out;
}

// Replace each interior corner with a quadratic bezier fillet, sampled into
// short segments. Returns a plain point list, so everything downstream stays
// a simple polyline walk.
function _roundCorners(pts, radius, samples) {
  if (pts.length < 3 || radius <= 0) return pts;
  const out = [pts[0].clone()];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
    const toPrev = prev.clone().sub(cur), toNext = next.clone().sub(cur);
    const lenPrev = toPrev.length(), lenNext = toNext.length();
    // Never eat more than half of either adjoining segment, or two
    // consecutive corners would consume the straight between them and the
    // lane would visibly cut the corner off the drawn path.
    const r = Math.min(radius, lenPrev * 0.5, lenNext * 0.5);
    if (r < 1e-4) { out.push(cur.clone()); continue; }
    const a = cur.clone().add(toPrev.clone().setLength(r));
    const b = cur.clone().add(toNext.clone().setLength(r));
    out.push(a);
    for (let s = 1; s < samples; s++) {
      const t = s / samples, it = 1 - t;
      // quadratic bezier a -> cur -> b
      out.push(_v(
        it * it * a.x + 2 * it * t * cur.x + t * t * b.x,
        it * it * a.z + 2 * it * t * cur.z + t * t * b.z
      ));
    }
    out.push(b);
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}

// waypoints: the same [{col,row}...] array handed to buildTerrain's path
// expansion. terrainApi: group.userData.terrain (for cellToWorld/cellSize).
function buildLanePath(waypoints, terrainApi, opts = {}) {
  const { padCells = 2.0, cornerCells = 0.6, cornerSamples = 6 } = opts;
  const cell = terrainApi.cellSize;
  const centres = waypoints.map(w => terrainApi.cellToWorld(w.col, w.row));
  const padded = _padEnds(centres, padCells * cell);
  const pts = _roundCorners(padded, cornerCells * cell, cornerSamples);

  // Arc-length table: cumulative[i] is the distance from the start to pts[i].
  const cumulative = [0];
  for (let i = 1; i < pts.length; i++) {
    cumulative.push(cumulative[i - 1] + pts[i].distanceTo(pts[i - 1]));
  }
  const length = cumulative[cumulative.length - 1];

  // Distance -> world point. Walks the table with a hint index so the common
  // case (an enemy advancing a little each frame) is O(1), not a binary
  // search per enemy per frame.
  function pointAt(d, out, hint) {
    const target = out || new THREE.Vector3();
    if (d <= 0) return target.copy(pts[0]);
    if (d >= length) return target.copy(pts[pts.length - 1]);
    let i = hint && hint.i ? hint.i : 1;
    if (i >= pts.length) i = pts.length - 1;
    while (i > 1 && cumulative[i - 1] > d) i--;
    while (i < pts.length - 1 && cumulative[i] < d) i++;
    if (hint) hint.i = i;
    const segLen = cumulative[i] - cumulative[i - 1];
    const t = segLen > 1e-6 ? (d - cumulative[i - 1]) / segLen : 0;
    return target.copy(pts[i - 1]).lerp(pts[i], t);
  }

  return { points: pts, length, pointAt };
}
