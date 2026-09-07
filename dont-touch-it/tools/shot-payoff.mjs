// Chapter I's payoff: the switch bottoms out and the gallery loses power.
// Captures the whole beat, because the criticism was of a still.
import { serve, launch, ROOT } from './harness.mjs';
import path from 'node:path'; import fs from 'node:fs';
const OUT = path.join(ROOT, 'shots/payoff');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const { srv, port } = await serve();
const s = await launch({ device: 'phone', url: `http://127.0.0.1:${port}/?level=1&quality=high` });
await s.wait(2800);
const G = await s.page.evaluate(() => {
  const l = window.__DTI__.game.level, g = l.g;
  return { screws: l.screws.map(x => ({ x: x.x, y: x.y, r: x.r })), cx: g.cx,
           jarBaseY: g.jarBaseY, jarStraight: g.jarStraight,
           btn: { x: g.cx, y: g.btnBaseY - g.bezelH - g.collarH - g.capBulge * 0.5 } };
});
for (let i = 0; i < 4; i++) {
  for (let a = 0; a < 12; a++) {
    if ((await s.probe()).freed > i) break;
    await s.circle(G.screws[i].x, G.screws[i].y, Math.max(30, G.screws[i].r * 3.4), 1.4, 650, -1);
  }
}
await s.touchStart([{ x: G.cx, y: G.jarBaseY - G.jarStraight * 0.6 }]);
for (let i = 1; i <= 34; i++) { await s.touchMove([{ x: G.cx, y: G.jarBaseY - G.jarStraight * 0.6 - i * 7 }]); await s.wait(12); }
await s.touchEnd();
await s.wait(3200);
// hold the switch down until it commits, then sample the beat
s.page.evaluate(() => {}).catch(() => {});
await s.touchStart([{ x: G.btn.x, y: G.btn.y }]);
const t0 = Date.now();
let committed = false;
for (let i = 0; i < 220; i++) {
  await s.touchMove([{ x: G.btn.x, y: G.btn.y }]);
  await s.wait(40);
  if (await s.page.evaluate(() => window.__DTI__.game.level && window.__DTI__.game.level.btn.committed)) { committed = true; break; }
}
await s.touchEnd();
console.log('committed', committed, 'after', ((Date.now() - t0) / 1000).toFixed(1) + 's');
const marks = [0.4, 0.9, 1.3, 1.8, 2.3, 2.9, 3.6];
let prev = 0;
for (const m of marks) {
  await s.wait((m - prev) * 1000); prev = m;
  const st = await s.page.evaluate(() => ({
    e: +window.__DTI__.game.set.exposure.toFixed(3),
    em: +(window.__DTI__.game.set.emergency || 0).toFixed(3),
    lit: +window.__DTI__.game.set.lit.toFixed(3),
  }));
  await s.page.evaluate(() => window.__DTI__.pause());
  await s.page.screenshot({ path: path.join(OUT, `t${m}.png`), timeout: 60000 });
  await s.page.evaluate(() => window.__DTI__.resume());
  console.log(`t=${m}`, JSON.stringify(st));
}
if (s.errors.length) console.log('ERRORS:\n' + s.errors.join('\n'));
await s.browser.close(); srv.close(); process.exit(0);
