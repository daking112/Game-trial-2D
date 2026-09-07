// Chapter I's glass, as it lies on the plinth at the start of Chapter II.
// The pile is what the anthology is about, so it gets looked at directly.
import { serve, launch, ROOT } from './harness.mjs';
import path from 'node:path';
const { srv, port } = await serve();
const s = await launch({ device: 'phone', url: `http://127.0.0.1:${port}/?level=1&quality=high` });
await s.wait(3200);
const G = await s.page.evaluate(() => {
  const l = window.__DTI__.game.level, g = l.g;
  return { screws: l.screws.map(x => ({ x: x.x, y: x.y, r: x.r })), cx: g.cx,
           jarBaseY: g.jarBaseY, jarStraight: g.jarStraight,
           btn: { x: g.cx, y: g.btnBaseY - g.bezelH - g.collarH - g.capBulge * 0.5 } };
});
for (let i = 0; i < 4; i++) {
  const sc = G.screws[i];
  for (let a = 0; a < 12; a++) {
    const p = await s.probe();
    if (p.freed > i) break;
    await s.circle(sc.x, sc.y, Math.max(30, sc.r * 3.4), 1.4, 650, -1);
  }
}
await s.touchStart([{ x: G.cx, y: G.jarBaseY - G.jarStraight * 0.6 }]);
for (let i = 1; i <= 34; i++) { await s.touchMove([{ x: G.cx, y: G.jarBaseY - G.jarStraight * 0.6 - i * 7 }]); await s.wait(10); }
await s.touchEnd();
await s.wait(3000);
await s.press(G.btn.x, G.btn.y, 3000);
for (let t = 0; t < 20000; t += 500) {
  await s.wait(500);
  const lv = await s.page.evaluate(() => window.__DTI__.level);
  if (lv !== 'l1') { await s.wait(3000); break; }
}
await s.page.evaluate(() => window.__DTI__.pause());
await s.page.screenshot({ path: path.join(ROOT, 'shots/wreck.png') });
console.log('level', await s.page.evaluate(() => window.__DTI__.level));
console.log('pile', JSON.stringify(await s.page.evaluate(() => {
  const w = window.__DTI__.game.wreck;
  return (w.items || []).map(i => ({ k: i.kind, s: +i.size?.toFixed?.(1) })).slice(0, 40);
})));
if (s.errors.length) console.log('ERRORS:\n' + s.errors.join('\n'));
await s.browser.close(); srv.close(); process.exit(0);
