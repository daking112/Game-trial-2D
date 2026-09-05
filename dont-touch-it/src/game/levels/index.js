// ============================================================
// Chapter registry.
// ------------------------------------------------------------
// Chapters are loaded dynamically and independently so that a chapter
// still under construction can never take the whole exhibition down —
// and so several people can build chapters in parallel.
// ============================================================

const MANIFEST = [
  './l1-press.js',
  './l3-squeeze.js',
  './l4-break.js',
  './l5-dark.js',
];

export async function loadLevels() {
  const out = [];
  for (const path of MANIFEST) {
    try {
      const mod = await import(path);
      const C = Object.values(mod).find(v => typeof v === 'function' && v.prototype && 'layout' in v.prototype);
      if (C) out.push(C);
      else console.warn(`[levels] ${path} exported no Level subclass`);
    } catch (e) {
      if (!/Failed to fetch|404|not found|Cannot find/i.test(String(e && e.message)))
        console.warn(`[levels] ${path} failed to load:`, e);
    }
  }
  return out;
}
