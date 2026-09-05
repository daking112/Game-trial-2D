// THROWAWAY critic tool — idle life, chapter transition, end card, small device.
import { serve, launch, contactSheet, ROOT } from './harness.mjs';
import path from 'node:path'; import fs from 'node:fs';
const OUT = path.join(ROOT, 'shots/crit/idle');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const { srv, port } = await serve();
const s = await launch({ device: process.env.DEVICE || 'phone', url: `http://127.0.0.1:${port}/?quality=high` });
const W = s.device.width, H = s.device.height;
await s.wait(2200);
await s.shot('title', OUT);
await s.tap(W / 2, H * 0.55);
// film the title -> chapter 1 entry, live
for (let i = 0; i < 6; i++) { await s.shot('entry' + i, OUT); await s.wait(700); }
await s.wait(2500);
// idle life: 10 deterministic frames spaced ~0.25s apart. Anything alive should move.
await s.strip('idle', OUT, 8, 1 / 60, 15);
// chapter transition, live
await s.page.evaluate(() => window.__DTI__.goto(2));
for (let i = 0; i < 8; i++) { await s.shot('trans' + i, OUT); await s.wait(340); }
console.log('after trans', await s.page.evaluate(() => window.__DTI__.level));
// finish -> end card
await s.page.evaluate(() => window.__DTI__.game.finish());
for (let i = 0; i < 5; i++) { await s.shot('end' + i, OUT); await s.wait(900); }
await contactSheet(s.shots.map(x => x.file), path.join(OUT, '_sheet.png'), { cols: 7, cellW: 190, title: 'idle / transition / end' });
await s.browser.close(); srv.close(); process.exit(0);
