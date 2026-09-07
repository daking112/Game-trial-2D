// Chapter III with the crack arrested: the frame the mirror is judged on.
import { serve, launch, ROOT } from './harness.mjs';
import path from 'node:path';
const { srv, port } = await serve();
const s = await launch({ device: 'phone', url: `http://127.0.0.1:${port}/?level=3&quality=high` });
await s.wait(2800);
const G = await s.page.evaluate(() => {
  const l = window.__DTI__.game.level, P = l.panes[0].g;
  return { x0: P.x0, x1: P.x1, cy: (P.y0 + P.y1) / 2, flaw: P.flaw };
});
// two fingers, squeezing the pane until it goes
await s.touchStart([{ x: G.x0 + 12, y: G.cy, id: 0 }, { x: G.x1 - 12, y: G.cy, id: 1 }]);
for (let i = 0; i < 40; i++) {
  const k = i / 40;
  await s.touchMove([{ x: G.x0 + 12 + k * 26, y: G.cy, id: 0 },
                     { x: G.x1 - 12 - k * 26, y: G.cy, id: 1 }]);
  await s.wait(45);
  const p = await s.probe();
  if (p.crack && p.crack.progress > 0.42) break;
}
await s.touchEnd();
await s.wait(400);
await s.page.evaluate(() => window.__DTI__.pause());
await s.page.screenshot({ path: path.join(ROOT, 'shots/crack.png') });
console.log(JSON.stringify(await s.probe()).slice(0, 200));
if (s.errors.length) console.log('ERRORS:\n' + s.errors.join('\n'));
await s.browser.close(); srv.close(); process.exit(0);
