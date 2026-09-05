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
      // A chapter that does not exist yet is fine and expected. A chapter
      // that exists and throws on import is a BUG, and being quiet about
      // it means the game silently ships with a chapter missing — which
      // is exactly what happened once, for a duplicate declaration that
      // `node --check` did not catch.
      const missing = /Failed to fetch|404|not found|Cannot find|Failed to resolve/i
        .test(String(e && e.message));
      if (missing) console.info(`[levels] ${path} not present, skipping`);
      else console.error(`[levels] ${path} FAILED TO LOAD — chapter dropped:`, e);
    }
  }
  return out;
}
