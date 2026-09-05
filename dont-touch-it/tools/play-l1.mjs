// Scripted playthrough of Chapter I, capturing the real running game.
import { serve, launch, contactSheet, ROOT } from './harness.mjs';
import path from 'node:path';
import fs from 'node:fs';

const OUT = process.env.OUT || path.join(ROOT, 'shots/l1');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const { srv, port } = await serve();
const s = await launch({ device: process.env.DEVICE || 'phone', url: `http://127.0.0.1:${port}/?debug=1` });
const W = s.device.width, H = s.device.height;

const log = (...a) => console.log(...a);

await s.wait(1600);
await s.shot('title', OUT);

// enter
await s.tap(W / 2, H / 2);
await s.wait(2600);
await s.shot('chapter-card', OUT);
await s.wait(2600);
await s.shot('scene-idle', OUT);
log('state', JSON.stringify(await s.state()));

// tap the glass a few times
for (let i = 0; i < 3; i++) { await s.tap(W / 2, H * 0.42); await s.wait(700); }
await s.shot('glass-tapped', OUT);

// where are the screws? read them out of the running game
const screws = await s.page.evaluate(() => {
  const lv = window.__DTI__.game.level;
  return lv.screws.map(x => ({ x: x.x, y: x.y, r: x.r }));
});
log('screws', JSON.stringify(screws));

for (let i = 0; i < screws.length; i++) {
  const sc = screws[i];
  // spin until free (poll)
  for (let attempt = 0; attempt < 10; attempt++) {
    await s.circle(sc.x, sc.y, Math.max(26, sc.r * 3), 1.4, 800, -1);
    const p = await s.probe();
    if (p.freed > i) break;
  }
  await s.shot(`screw-${i}-free`, OUT);
  log('after screw', i, JSON.stringify(await s.probe()));
}

await s.wait(1200);
await s.shot('all-screws-out', OUT);

// lift the jar
const jarY = H * 0.42;
await s.touchStart([{ x: W / 2, y: jarY }]);
for (let i = 1; i <= 26; i++) {
  await s.touchMove([{ x: W / 2, y: jarY - i * 6 }]);
  await s.wait(16);
  if (i === 13) await s.shot('jar-lifting', OUT);
}
await s.shot('jar-high', OUT);
await s.touchEnd();
await s.wait(120);
await s.shot('jar-drop-1', OUT);
await s.wait(160);
await s.shot('jar-drop-2', OUT);
await s.wait(400);
await s.shot('jar-aftermath', OUT);
await s.wait(1600);
await s.shot('button-exposed', OUT);
log('probe', JSON.stringify(await s.probe()));

// press the button
const btn = await s.page.evaluate(() => {
  const lv = window.__DTI__.game.level, g = lv.g;
  return { x: g.cx, y: g.plateY - g.collarH - g.capBulge * 0.5 };
});
await s.touchStart([{ x: btn.x, y: btn.y }]);
await s.wait(200); await s.shot('btn-travel', OUT);
for (let t = 0; t < 1400; t += 60) { await s.touchMove([{ x: btn.x, y: btn.y }]); await s.wait(60); }
await s.shot('btn-resisting', OUT);
await s.touchEnd();
await s.wait(120); await s.shot('btn-committed', OUT);
await s.wait(600); await s.shot('blackout', OUT);
await s.wait(900); await s.shot('emergency', OUT);
await s.wait(2000); await s.shot('restored', OUT);
log('final', JSON.stringify(await s.state()));

if (s.errors.length) { console.log('\n!! ERRORS:\n' + s.errors.join('\n')); }
else console.log('\nno console errors');

const files = s.shots.map(x => x.file);
await contactSheet(files, path.join(OUT, '_sheet.png'), { cols: 5, cellW: 240, title: 'Chapter I — DO NOT PRESS' });
console.log('sheet:', path.join(OUT, '_sheet.png'));

await s.browser.close();
srv.close();
process.exit(0);
