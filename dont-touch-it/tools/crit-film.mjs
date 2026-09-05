// THROWAWAY critic tool — films the decisive motion beat of each chapter.
import { serve, launch, contactSheet, ROOT } from './harness.mjs';
import path from 'node:path'; import fs from 'node:fs';

const ch = process.argv[2] || '1';
const OUT = path.join(ROOT, 'shots/crit/film' + ch);
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const { srv, port } = await serve();
const s = await launch({ url: `http://127.0.0.1:${port}/?level=${ch}&quality=high` });
const W = s.device.width, H = s.device.height;
const P = () => s.probe();
const log = (...a) => console.log(...a);
await s.wait(4200);

if (ch === '1') {
  const screws = await s.page.evaluate(() => window.__DTI__.game.level.screws.map(x => ({ x: x.x, y: x.y, r: x.r })));
  log('screws', JSON.stringify(screws));
  // FILM: one screw turning, mid-gesture
  await s.touchStart([{ x: screws[0].x + 34, y: screws[0].y }]);
  for (let i = 1; i <= 20; i++) { const a = -(i / 20) * Math.PI * 1.6; await s.touchMove([{ x: screws[0].x + Math.cos(a) * 34, y: screws[0].y + Math.sin(a) * 34 }]); await s.wait(14); }
  await s.strip('screwturn', OUT, 6, 1 / 60, 3);
  await s.touchEnd();
  log('after 1 turn', JSON.stringify(await P()));
  // free all four
  for (let i = 0; i < screws.length; i++)
    for (let a = 0; a < 14 && (await P()).freed <= i; a++)
      await s.circle(screws[i].x, screws[i].y, Math.max(30, screws[i].r * 3.4), 1.4, 650, -1);
  await s.wait(800); await s.shot('allfree', OUT);
  log('freed', JSON.stringify(await P()));
  // lift + drop
  const j = await s.page.evaluate(() => { const g = window.__DTI__.game.level.g; return { x: g.cx, y: g.jarBaseY - g.jarStraight * 0.6 }; });
  await s.touchStart([{ x: j.x, y: j.y }]);
  for (let i = 1; i <= 30; i++) { await s.touchMove([{ x: j.x, y: j.y - i * 8 }]); await s.wait(16); }
  await s.shot('lifted', OUT);
  await s.touchEnd();
  await s.strip('drop', OUT, 12, 1 / 60, 4);
  await s.wait(1400); await s.shot('aftershatter', OUT);
  log('post drop', JSON.stringify(await P()));
  // press and hold
  const b = await s.page.evaluate(() => { const g = window.__DTI__.game.level.g; return { x: g.cx, y: g.btnBaseY - g.bezelH - g.collarH - g.capBulge * 0.5 }; });
  await s.touchStart([{ x: b.x, y: b.y }]);
  for (let t = 0; t < 2400; t += 32) { await s.touchMove([{ x: b.x, y: b.y }]); await s.wait(32); }
  await s.strip('give', OUT, 12, 1 / 60, 4);
  await s.touchEnd();
  await s.wait(2500); await s.shot('solved', OUT);
  log('final', JSON.stringify(await P()));
}

if (ch === '2') {
  const c = await s.page.evaluate(() => { const l = window.__DTI__.game.level; const b = l.blobs[0]; return { x: b.cx, y: b.cy, r: b.r }; });
  log('blob', JSON.stringify(c));
  await s.touchStart([{ x: c.x, y: c.y - c.r * 0.3 }]);
  for (let i = 1; i <= 10; i++) { await s.touchMove([{ x: c.x, y: c.y - c.r * 0.3 + i * 3 }]); await s.wait(16); }
  await s.strip('poke', OUT, 8, 1 / 60, 3);
  await s.touchEnd();
  await s.strip('pokerelease', OUT, 8, 1 / 60, 4);
  log('poked', JSON.stringify(await P()));
  await s.wait(1200);
  // pinch hard
  const mk = (d) => ([{ x: c.x - d / 2, y: c.y, id: 0 }, { x: c.x + d / 2, y: c.y, id: 1 }]);
  await s.touchStart(mk(c.r * 2.1));
  for (let i = 1; i <= 40; i++) { await s.touchMove(mk(c.r * 2.1 + (c.r * 0.16 - c.r * 2.1) * (i / 40))); await s.wait(28); }
  await s.shot('pinched', OUT);
  log('mid pinch', JSON.stringify(await P()));
  await s.strip('split', OUT, 14, 1 / 60, 4);
  await s.touchEnd();
  await s.wait(1500); await s.shot('after', OUT);
  log('after', JSON.stringify(await P()));
  for (let k = 0; k < 10 && !(await P()).solved; k++) {
    const b = await s.page.evaluate(() => { const l = window.__DTI__.game.level; const b = l.blobs[0]; return b ? { x: b.cx, y: b.cy, r: b.r } : null; });
    if (!b) break;
    await s.pinch(b.x, b.y, b.r * 2.0, b.r * 0.16, 1100); await s.wait(600);
  }
  await s.shot('end', OUT); log('end', JSON.stringify(await P()));
}

if (ch === '3') {
  const c = await s.page.evaluate(() => { const g = window.__DTI__.game.level.g; return { x: g.cx, y: g.paneY || g.cy, w: g.paneW, h: g.paneH, g: JSON.stringify(Object.keys(g)) }; });
  log('pane', JSON.stringify(c));
  const cy = c.y;
  await s.touchStart([{ x: c.x, y: cy }]);
  for (let t = 0; t < 1500; t += 32) { await s.touchMove([{ x: c.x, y: cy }]); await s.wait(32); }
  await s.shot('press1', OUT);
  log('1finger', JSON.stringify(await P()));
  await s.touchEnd(); await s.wait(400);
  await s.touchStart([{ x: c.x - c.w * 0.28, y: cy, id: 0 }, { x: c.x + c.w * 0.28, y: cy, id: 1 }]);
  for (let t = 0; t < 2400; t += 32) { await s.touchMove([{ x: c.x - c.w * 0.28, y: cy, id: 0 }, { x: c.x + c.w * 0.28, y: cy, id: 1 }]); await s.wait(32); }
  await s.shot('twofinger', OUT);
  log('2finger', JSON.stringify(await P()));
  await s.strip('crack', OUT, 14, 1 / 60, 4);
  await s.touchEnd();
  await s.wait(2000); await s.shot('broken', OUT);
  log('broken', JSON.stringify(await P()));
  await s.wait(2500); await s.shot('mirror', OUT);
  log('mirror', JSON.stringify(await P()));
}

if (ch === '4') {
  const a = await s.page.evaluate(() => { const l = window.__DTI__.game.level; return { x: l.acorn.x, y: l.acorn.y, bx: l.g.bellX, by: l.g.bellY }; });
  log('acorn', JSON.stringify(a));
  await s.touchStart([{ x: a.x, y: a.y }]);
  for (let i = 1; i <= 26; i++) { await s.touchMove([{ x: a.x, y: a.y + i * 5 }]); await s.wait(16); }
  await s.shot('pulling', OUT);
  await s.touchEnd();
  await s.strip('click', OUT, 12, 1 / 60, 5);
  await s.wait(900); await s.shot('dark', OUT);
  log('dark', JSON.stringify(await P()));
  await s.wait(2600); await s.shot('darkheld', OUT);
  const cy = H * 0.60;
  for (const [x, y] of [[W * 0.3, cy], [W * 0.5, cy], [W * 0.7, cy]]) { await s.swipe(W * 0.5, cy, x, y, 450); await s.wait(150); }
  await s.shot('torch', OUT);
  log('explore', JSON.stringify(await P()));
  await s.touchStart([{ x: a.bx, y: a.by - 12 }]);
  for (let i = 0; i < 45; i++) { await s.touchMove([{ x: a.bx, y: a.by - 12 }]); await s.wait(30); }
  await s.shot('foundbell', OUT);
  await s.touchEnd(); await s.wait(300);
  log('bell', JSON.stringify(await P()));
  await s.tap(a.bx, a.by - 18, 70);
  await s.strip('ring', OUT, 12, 1 / 60, 5);
  await s.wait(1800); await s.shot('rung', OUT);
  log('rung', JSON.stringify(await P()));
  await s.wait(3000); await s.shot('reveal1', OUT);
  await s.wait(3000); await s.shot('reveal2', OUT);
  log('final', JSON.stringify(await P()));
}

await contactSheet(s.shots.map(x => x.file), path.join(OUT, '_sheet.png'), { cols: 6, cellW: 210, title: 'chapter ' + ch });
const errs = s.errors.filter(e => !/vibrate/.test(e));
if (errs.length) log('ERRORS:\n' + errs.slice(0, 6).join('\n'));
log('sheet', path.join(OUT, '_sheet.png'));
await s.browser.close(); srv.close(); process.exit(0);
