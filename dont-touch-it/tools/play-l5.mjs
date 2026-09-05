// Drive the finale: pull the chain, sit in the dark, feel around, ring it.
import { serve, launch, contactSheet, ROOT } from './harness.mjs';
import path from 'node:path'; import fs from 'node:fs';
const OUT = path.join(ROOT, 'shots/l5');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const { srv, port } = await serve();
const s = await launch({ url: `http://127.0.0.1:${port}/?level=4&quality=high` });
const W = s.device.width, H = s.device.height;
await s.wait(4500);
await s.shot('lit', OUT);
const P = () => s.probe();

// where is the chain end?
const a = await s.page.evaluate(() => { const l = window.__DTI__.game.level; return { x: l.acorn.x, y: l.acorn.y, bx: l.g.bellX, by: l.g.bellY }; });
console.log('acorn', JSON.stringify(a));

// pull it down
await s.touchStart([{ x: a.x, y: a.y }]);
for (let i = 1; i <= 30; i++) { await s.touchMove([{ x: a.x, y: a.y + i * 5 }]); await s.wait(16); }
await s.shot('pulling', OUT);
await s.touchEnd();
await s.wait(400); await s.shot('click', OUT);
console.log('after pull', JSON.stringify(await P()));
await s.wait(1400); await s.shot('blackout', OUT);
await s.wait(2600); await s.shot('dark-held', OUT);

// feel around
const cy = H * 0.60;
for (const [x, y] of [[W*0.3, cy], [W*0.5, cy], [W*0.7, cy], [W*0.62, cy-20]]) {
  await s.swipe(W*0.5, cy, x, y, 500); await s.wait(200);
}
await s.shot('torch', OUT);
console.log('exploring', JSON.stringify(await P()));
// sweep toward the bell
await s.touchStart([{ x: a.bx, y: a.by - 12 }]);
for (let i = 0; i < 40; i++) { await s.touchMove([{ x: a.bx, y: a.by - 12 }]); await s.wait(30); }
await s.shot('found-bell', OUT);
await s.touchEnd(); await s.wait(300);
console.log('bell?', JSON.stringify(await P()));
// ring it
await s.tap(a.bx, a.by - 18, 70);
await s.wait(400);
await s.wait(600); await s.shot('ringing', OUT);
console.log('rung', JSON.stringify(await P()));
await s.wait(2500); await s.shot('restoring', OUT);
await s.wait(2500); await s.shot('restored', OUT);
console.log('final', JSON.stringify(await P()));
const errs = s.errors.filter(e => !/vibrate|l[0-9]-[a-z]+\.js/.test(e));
console.log(errs.length ? 'ERRORS:\n' + errs.slice(0,4).join('\n') : 'no errors');
await contactSheet(s.shots.map(x => x.file), path.join(OUT, '_sheet.png'), { cols: 5, cellW: 240, title: 'Finale — DO NOT TURN IT OFF' });
await s.browser.close(); srv.close(); process.exit(0);
