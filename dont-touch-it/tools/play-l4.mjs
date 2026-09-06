// Chapter III capture: front pane → mirror reveal → mirror shatter.
//   node play-l4.mjs
import { serve, launch, ROOT } from './harness.mjs';
import path from 'node:path';
import fs from 'node:fs';

const dir = path.join(ROOT, 'shots/l4');
fs.mkdirSync(dir, { recursive: true });
const { srv, port } = await serve();
const q = process.env.QUALITY || 'high';
const s = await launch({ device: process.env.DEVICE || 'phone', url: `http://127.0.0.1:${port}/?level=3&quality=${q}` });
await s.wait(2600);

const P = async (i) => s.page.evaluate((i) => {
  const l = window.__DTI__.game.level;
  const p = l.g.panes[i];
  return { x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, cx: p.cx ?? (p.x0 + p.x1) / 2, w: p.w, h: p.h,
           phase: l.phase, reveal: l.mirrorReveal, shards: l.panes.map(q => q.shards.length), rest: l.panes.map(q => q.shards.filter(d=>d.rest).length),
           rmax: Math.round(Math.max(0, ...l.panes[1].shards.map(d=>d.data.r))) };
}, i);

const shot = async (n) => { await s.page.evaluate(() => window.__DTI__.pause());
  await s.page.screenshot({ path: path.join(dir, n + '.png'), timeout: 60000 });
  await s.page.evaluate(() => window.__DTI__.resume());
  try { console.log('->', n, JSON.stringify(await P(1))); } catch (e) { console.log('->', n, '(level gone)'); } };

// --- break the front pane
let g = await P(0);
for (let k = 0; k < 10; k++) {
  const st = await P(1);
  if (st.shards[0] > 0) break;
  await s.press(g.cx, g.y0 + g.h * 0.5, 1400); await s.wait(250);
  await s.twoFingerHold(g.cx - g.w * 0.28, g.y0 + g.h * 0.5, g.cx + g.w * 0.28, g.y0 + g.h * 0.5, 2600);
  await s.wait(600);
}
await s.wait(1600); await shot('01-front-broken');
await s.wait(2600); await shot('02-reveal-mid');
await s.wait(3200); await shot('03-mirror');

// --- now the mirror
let m = await P(1);
for (let k = 0; k < 10; k++) {
  const st = await P(1);
  if (st.shards[1] > 0) break;
  await s.press(m.cx, m.y0 + m.h * 0.5, 1400); await s.wait(250);
  await s.twoFingerHold(m.cx - m.w * 0.28, m.y0 + m.h * 0.5, m.cx + m.w * 0.28, m.y0 + m.h * 0.5, 2600);
  await s.wait(600);
}
await s.wait(420);  await shot('04-mirror-shatter');
await s.wait(1400); await shot('05-falling');
await s.wait(2400); await shot('06-pile');
await s.wait(2600); await shot('06b-closeup');
// The pile while the camera is still pushed in on it. This is the frame
// the whole chapter is built toward — the one that has to answer whether
// there is a picture in any of these pieces — so it gets a tight crop of
// its own, derived from the pane rather than from magic numbers.
{ const g = await s.page.evaluate(() => {
    const l = window.__DTI__.game.level, P = l.g.panes[1], c = window.__DTI__.game.cam;
    const z = c.ozoom, w = window.__DTI__.game.r.w, h = window.__DTI__.game.r.h;
    // world -> screen under the camera the chapter is holding
    const sx = (P.cx - w / 2 + c.ox) * z + w / 2;
    const sy = (P.y1 - h / 2 + c.oy) * z + h / 2;
    return { x: sx, y: sy, w: P.w * z, h: P.h * z, sw: w, sh: h };
  });
  const cw = Math.min(g.sw, g.w * 1.5), ch = Math.min(g.sh, g.h * 0.62);
  await s.page.evaluate(() => window.__DTI__.pause());
  await s.page.screenshot({ path: path.join(dir, '06z-pile-crop.png'), timeout: 60000,
    clip: { x: Math.max(0, Math.min(g.sw - cw, g.x - cw / 2)),
            y: Math.max(0, Math.min(g.sh - ch, g.y - ch * 0.82)),
            width: cw, height: ch } });
  await s.page.evaluate(() => window.__DTI__.resume());
  console.log('-> 06z-pile-crop'); }
await s.wait(1600); await shot('06c-closeup2');
// a close look at the pile: is there a picture in any of these?
{ await s.page.evaluate(() => window.__DTI__.pause());
  await s.page.screenshot({ path: path.join(dir, '07-pile-zoom.png'), timeout: 60000,
    clip: { x: Math.max(0, m.x0 - 60), y: m.y1 - 130, width: Math.min(393, m.w + 120), height: 175 } });
  await s.page.evaluate(() => window.__DTI__.resume()); }
console.log('drawMs', await s.page.evaluate(() => +window.__DTI__.game.drawMs.toFixed(2)));
if (s.errors.length) console.log('ERRORS:\n' + s.errors.join('\n'));
await s.browser.close(); srv.close(); process.exit(0);
