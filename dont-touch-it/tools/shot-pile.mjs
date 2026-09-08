// Chapter III's pile after both panes are down — the frame its camera move
// lands on, and the one a reviewer remembers.
import { serve, launch, ROOT } from './harness.mjs';
import path from 'node:path';
const { srv, port } = await serve();
const s = await launch({ device: 'phone', url: `http://127.0.0.1:${port}/?level=3&quality=high` });
await s.wait(2800);
const G = await s.page.evaluate(() => {
  const l = window.__DTI__.game.level, p = l.panes[0].g;
  return { x: p.cx, y: (p.y0 + p.y1) / 2, w: p.w };
});
for (let k = 0; k < 18; k++) {
  const done = await s.page.evaluate(() => !window.__DTI__.game.level || window.__DTI__.game.level.solved);
  if (done) break;
  await s.press(G.x, G.y, 1200); await s.wait(250);
  await s.twoFingerHold(G.x - G.w * 0.28, G.y, G.x + G.w * 0.28, G.y, 2600);
  await s.wait(600);
}
await s.wait(6000);
await s.page.evaluate(() => window.__DTI__.pause());
await s.page.screenshot({ path: path.join(ROOT, 'shots/pile3.png'), timeout: 60000 });
console.log(JSON.stringify(await s.probe()).slice(0, 180));
if (s.errors.length) console.log('ERRORS:\n' + s.errors.join('\n'));
await s.browser.close(); srv.close(); process.exit(0);
