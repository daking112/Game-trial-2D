// ============================================================
// playtest.mjs — can each chapter actually be finished?
// Chapter-appropriate gestures, driven off geometry read out of the
// running game so the test survives layout changes.
//   node playtest.mjs [chapterNumber]
// ============================================================
import { serve, launch, ROOT } from './harness.mjs';
import path from 'node:path'; import fs from 'node:fs';

const only = process.argv[2] ? +process.argv[2] : null;
const OUT = path.join(ROOT, 'shots/playtest');
fs.mkdirSync(OUT, { recursive: true });
const { srv, port } = await serve();
const s = await launch({ url: `http://127.0.0.1:${port}/?quality=medium` });
const W = s.device.width, H = s.device.height;
const P = () => s.probe();
const solved = async () => { const p = await P(); return p && p.solved; };

await s.wait(1500);
await s.tap(W / 2, H * 0.55);
await s.wait(4000);

// ---------- per-chapter strategies ----------
const strategies = {
  l1: async () => {
    const screws = await s.page.evaluate(() =>
      window.__DTI__.game.level.screws.map(x => ({ x: x.x, y: x.y, r: x.r })));
    for (let i = 0; i < screws.length; i++) {
      for (let a = 0; a < 12 && (await P()).freed <= i; a++)
        await s.circle(screws[i].x, screws[i].y, Math.max(30, screws[i].r * 3.4), 1.4, 700, -1);
    }
    await s.wait(900);
    // lift the jar off and drop it
    const j = await s.page.evaluate(() => {
      const g = window.__DTI__.game.level.g;
      return { x: g.cx, y: g.jarBaseY - g.jarStraight * 0.6 };
    });
    await s.touchStart([{ x: j.x, y: j.y }]);
    for (let i = 1; i <= 34; i++) { await s.touchMove([{ x: j.x, y: j.y - i * 7 }]); await s.wait(16); }
    await s.touchEnd();
    await s.wait(2600);
    // press and hold the switch until it gives
    const b = await s.page.evaluate(() => {
      const l = window.__DTI__.game.level, g = l.g;
      return { x: g.cx, y: g.btnBaseY - g.bezelH - g.collarH - g.capBulge * 0.5 };
    });
    await s.press(b.x, b.y, 2600);
    await s.wait(1200);
  },
  l3: async () => {
    const c = await s.page.evaluate(() => {
      const l = window.__DTI__.game.level;
      const b = l.blobs ? l.blobs[0] : null;
      const g = l.g || {};
      return { x: (b && b.cx) || g.cx || 196, y: (b && b.cy) || g.cy || 430, r: (b && b.r) || (g.R || 90) };
    });
    for (let k = 0; k < 14 && !(await solved()); k++) {
      await s.tap(c.x, c.y, 120); await s.wait(200);
      await s.pinch(c.x, c.y, c.r * 2.0, c.r * 0.18, 1100);
      await s.wait(500);
    }
  },
  l4: async () => {
    const c = await s.page.evaluate(() => {
      const l = window.__DTI__.game.level, g = l.g || {};
      return { x: g.cx || 196, y: g.paneY || g.cy || 400, w: g.paneW || 120, h: g.paneH || 200 };
    });
    for (let k = 0; k < 12 && !(await solved()); k++) {
      await s.press(c.x, c.y, 1400); await s.wait(300);
      await s.twoFingerHold(c.x - c.w * 0.28, c.y, c.x + c.w * 0.28, c.y, 2600);
      await s.wait(700);
    }
  },
  l5: async () => {
    const a = await s.page.evaluate(() => {
      const l = window.__DTI__.game.level;
      return { x: l.acorn.x, y: l.acorn.y, bx: l.g.bellX, by: l.g.bellY };
    });
    await s.touchStart([{ x: a.x, y: a.y }]);
    for (let i = 1; i <= 30; i++) { await s.touchMove([{ x: a.x, y: a.y + i * 5 }]); await s.wait(16); }
    await s.touchEnd();
    await s.wait(3600);
    // sweep the torch around, then dwell on the bell
    for (const [x, y] of [[W*0.28, H*0.62], [W*0.72, H*0.62], [W*0.5, H*0.58]])
      { await s.swipe(W*0.5, H*0.6, x, y, 450); await s.wait(150); }
    await s.touchStart([{ x: a.bx, y: a.by - 12 }]);
    for (let i = 0; i < 40; i++) { await s.touchMove([{ x: a.bx, y: a.by - 12 }]); await s.wait(30); }
    await s.touchEnd(); await s.wait(400);
    await s.tap(a.bx, a.by - 18, 70);
    await s.wait(2500);
  },
};

const count = await s.page.evaluate(() => window.__DTI__.game.levelClasses.length);
for (let n = 1; n <= count; n++) {
  if (only && n !== only) continue;
  await s.page.evaluate((i) => window.__DTI__.goto(i), n);
  await s.wait(2600);
  const id = await s.page.evaluate(() => window.__DTI__.level);
  const before = s.errors.length;
  const t0 = Date.now();
  if (strategies[id]) await strategies[id]();
  const p = await P();
  const errs = s.errors.slice(before).filter(e => !/vibrate|l[0-9]-[a-z]+\.js/.test(e));
  await s.page.screenshot({ path: path.join(OUT, `ch${n}-${id}-end.png`), timeout: 60000 }).catch(() => {});
  console.log(`ch${n} ${id}  SOLVED=${!!(p && p.solved)}  ${((Date.now()-t0)/1000|0)}s  ${JSON.stringify(p).slice(0,200)}`);
  if (errs.length) console.log('   ERRORS: ' + errs.slice(0, 2).join(' | ').slice(0, 500));
}
await s.browser.close(); srv.close(); process.exit(0);
