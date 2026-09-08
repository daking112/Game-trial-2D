// The finale's reveal: the gallery turns out to keep going.
import { serve, launch, ROOT } from './harness.mjs';
import path from 'node:path';
const { srv, port } = await serve();
const s = await launch({ device: 'phone', url: `http://127.0.0.1:${port}/?level=4&quality=high` });
await s.wait(2800);
const a = await s.page.evaluate(() => { const l = window.__DTI__.game.level;
  return { x: l.acorn.x, y: l.acorn.y, bx: l.g.bellX, by: l.g.bellY }; });
await s.touchStart([{ x: a.x, y: a.y }]);
for (let i = 1; i <= 30; i++) { await s.touchMove([{ x: a.x, y: a.y + i * 5 }]); await s.wait(16); }
await s.touchEnd(); await s.wait(4000);
for (const [x, y] of [[160, 520], [280, 520], [200, 480]]) { await s.swipe(196, 500, x, y, 420); await s.wait(140); }
await s.touchStart([{ x: a.bx, y: a.by - 12 }]);
for (let i = 0; i < 40; i++) { await s.touchMove([{ x: a.bx, y: a.by - 12 }]); await s.wait(30); }
await s.touchEnd(); await s.wait(300);
await s.tap(a.bx, a.by - 18, 70);
for (const t of [3500, 3000, 3000]) {
  await s.wait(t);
  const r = await s.page.evaluate(() => window.__DTI__.game.level ? +window.__DTI__.game.level.reveal.toFixed(2) : -1);
  console.log('reveal', r);
  if (r > 0.7) break;
}
await s.page.evaluate(() => window.__DTI__.pause());
await s.page.screenshot({ path: path.join(ROOT, 'shots/reveal.png'), timeout: 60000 });
if (s.errors.length) console.log('ERRORS:\n' + s.errors.join('\n'));
await s.browser.close(); srv.close(); process.exit(0);
