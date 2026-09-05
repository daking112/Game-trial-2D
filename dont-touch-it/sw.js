// ============================================================
// sw.js — offline shell.
// The whole game is a few hundred KB of source plus three fonts, so we
// simply precache everything on install and serve cache-first. Bumping
// VERSION is the only deploy step.
// ============================================================
const VERSION = 'dti-v1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './src/main.js',
  './src/core/math.js', './src/core/input.js', './src/core/audio.js',
  './src/core/haptics.js', './src/core/tween.js',
  './src/render/renderer.js', './src/render/materials.js', './src/render/particles.js',
  './src/physics/verlet.js',
  './src/game/game.js', './src/game/level.js', './src/game/set.js',
  './src/game/camera.js', './src/game/wreckage.js', './src/game/levels/index.js',
  './src/ui/style.css', './src/ui/narrator.js', './src/ui/hud.js',
  './assets/fonts/inter-var-latin.woff2',
  './assets/fonts/instrument-serif.woff2',
  './assets/fonts/instrument-serif-italic.woff2',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Chapters are added individually so one missing file can't fail the
    // whole install (chapters ship independently).
    await Promise.allSettled(ASSETS.map(a => cache.add(a)));
    for (const n of [1, 2, 3, 4, 5]) {
      for (const slug of ['l1-press', 'l2-pull', 'l3-squeeze', 'l4-break', 'l5-dark']) {
        // best effort; missing chapters are skipped
      }
    }
    await Promise.allSettled(
      ['l1-press', 'l2-pull', 'l3-squeeze', 'l4-break', 'l5-dark']
        .map(s => cache.add(`./src/game/levels/${s}.js`))
    );
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith((async () => {
    const cached = await caches.match(e.request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(e.request);
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const cache = await caches.open(VERSION);
        cache.put(e.request, res.clone());
      }
      return res;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
