import { serve, launch, contactSheet, ROOT } from './harness.mjs';
import path from 'node:path'; import fs from 'node:fs';
const OUT = path.join(ROOT, 'shots/crit/trans');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const { srv, port } = await serve();
const s = await launch({ url: `http://127.0.0.1:${port}/?level=1&quality=high` });
await s.wait(4200);
const screws = await s.page.evaluate(() => window.__DTI__.game.level.screws.map(x => ({ x: x.x, y: x.y, r: x.r })));
const P = () => s.probe();
for (let i = 0; i < screws.length; i++)
  for (let a = 0; a < 14 && (await P()).freed <= i; a++)
    await s.circle(screws[i].x, screws[i].y, 34, 1.4, 620, -1);
const j = await s.page.evaluate(() => { const g = window.__DTI__.game.level.g; return { x: g.cx, y: g.jarBaseY - g.jarStraight * 0.6 }; });
await s.touchStart([{ x: j.x, y: j.y }]);
for (let i = 1; i <= 30; i++) { await s.touchMove([{ x: j.x, y: j.y - i * 8 }]); await s.wait(16); }
await s.touchEnd(); await s.wait(3000);
const b = await s.page.evaluate(() => { const g = window.__DTI__.game.level.g; return { x: g.cx, y: g.btnBaseY - g.bezelH - g.collarH - g.capBulge * 0.5 }; });
await s.press(b.x, b.y, 2600);
console.log('solved?', JSON.stringify(await P()));
// now watch the NATURAL hand-off to chapter II
for (let i = 0; i < 20; i++) { await s.shot('t' + String(i).padStart(2,'0'), OUT); await s.wait(520); }
console.log('level now', await s.page.evaluate(() => window.__DTI__.level), await s.page.evaluate(() => window.__DTI__.game.transgressions));
await contactSheet(s.shots.map(x => x.file), path.join(OUT, '_sheet.png'), { cols: 7, cellW: 185, title: 'natural chapter hand-off I -> II' });
await s.browser.close(); srv.close(); process.exit(0);
