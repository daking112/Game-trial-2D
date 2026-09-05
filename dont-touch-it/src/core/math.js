// ============================================================
// math.js — small, allocation-light math toolkit
// ============================================================

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp01(inv(a, b, v)));
export const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const smootherstep = (t) => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const sign = Math.sign;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
export const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
};
export const wrapAngle = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

/** Framerate-independent exponential smoothing. `rate` ≈ how much closes per second. */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

/** Critically-damped spring step. state = {v}. Returns new position. */
export function spring(cur, target, state, dt, freq = 8, zeta = 1) {
  const omega = TAU * freq;
  const f = 1 + 2 * dt * zeta * omega;
  const oo = omega * omega, hoo = dt * oo, hhoo = dt * hoo;
  const det = 1 / (f + hhoo);
  const detX = (f * cur + dt * state.v + hhoo * target) * det;
  const detV = (state.v + hoo * (target - cur)) * det;
  state.v = detV;
  return detX;
}

// ---------- deterministic RNG ----------
export function makeRng(seed = 1337) {
  let s = seed >>> 0 || 1;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
export const rand = makeRng(0xC0FFEE);
export const rrange = (a, b, r = rand) => a + (b - a) * r();
export const rpick = (arr, r = rand) => arr[(r() * arr.length) | 0];

// ---------- value noise (smooth, cheap, seeded) ----------
const NOISE_N = 512;
const noiseTable = (() => {
  const r = makeRng(9137);
  const t = new Float32Array(NOISE_N);
  for (let i = 0; i < NOISE_N; i++) t[i] = r() * 2 - 1;
  return t;
})();
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const a = noiseTable[i & (NOISE_N - 1)];
  const b = noiseTable[(i + 1) & (NOISE_N - 1)];
  return lerp(a, b, smootherstep(f));
}
export function fbm1(x, oct = 3) {
  let a = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { a += noise1(x * f) * amp; f *= 2.04; amp *= 0.5; }
  return a;
}
export function noise2(x, y) {
  return noise1(x * 1.0 + y * 57.13) * 0.5 + noise1(y * 1.0 + x * 31.7) * 0.5;
}

// ---------- easing ----------
export const Ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => 1 - (1 - t) * (1 - t),
  inOutQuad: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  inCubic: t => t * t * t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outQuart: t => 1 - Math.pow(1 - t, 4),
  inOutQuart: t => t < .5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,
  outQuint: t => 1 - Math.pow(1 - t, 5),
  inExpo: t => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  outExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  inOutExpo: t => t === 0 ? 0 : t === 1 ? 1 : t < .5
    ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
  outElastic: t => {
    if (t === 0 || t === 1) return t;
    const c = TAU / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c) + 1;
  },
  outBounce: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375;
    return n * (t -= 2.625 / d) * t + .984375;
  },
  /** Snappy overshoot tuned for tactile UI. */
  snap: t => 1 - Math.pow(1 - t, 3.2) * Math.cos(t * 5.2),
};

// ---------- color ----------
export const rgba = (r, g, b, a = 1) => `rgba(${r|0},${g|0},${b|0},${a})`;
export function mixHex(h1, h2, t) {
  const a = hexToRgb(h1), b = hexToRgb(h2);
  return `rgb(${lerp(a[0],b[0],t)|0},${lerp(a[1],b[1],t)|0},${lerp(a[2],b[2],t)|0})`;
}
export function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(hex, amt) { // amt -1..1
  const [r, g, b] = hexToRgb(hex);
  const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
  return `rgb(${lerp(r,f,p)|0},${lerp(g,f,p)|0},${lerp(b,f,p)|0})`;
}
export function withAlpha(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ---------- geometry ----------
export function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function segDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = clamp01(t);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
