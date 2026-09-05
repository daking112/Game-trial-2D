// ============================================================
// playtest.mjs — can each chapter actually be finished?
// Chapter-appropriate gestures, driven off geometry read out of the
// running game so the test survives layout changes.
//   node playtest.mjs [chapterNumber]
// ============================================================
import { serve, launch, ROOT } from './harness.mjs';
import path from 'node:path'; import fs from 'node:fs';

/**
 * Which console noise is genuinely benign.
 *
 * This filter used to drop ANY message mentioning a chapter file, so that
 * 404s for chapters not yet written wouldn't show up — and it silently
 * swallowed real runtime exceptions thrown from those same files. A
 * per-frame TypeError that blanked an entire chapter's hero object went
 * unreported for days because of it. Only ignore load failures and the
 * vibration-permission notice; everything else is a failure.
 */
const isRealError = (e) =>
  !/Blocked call to navigator\.vibrate/.test(e) &&
  !/(requestfailed|Failed to load resource).*l[0-9]-[a-z]+\.js/.test(e) &&
  !/^console: Failed to load resource: the server responded with a status of 404/.test(e);

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

let failed = false;
// A chapter that fails to import is silently dropped from the manifest,
// so assert the full set is present before judging anything else.
const EXPECTED = ['l1', 'l3', 'l4', 'l5'];
const loaded = await s.page.evaluate(() => window.__DTI__.game.levelClasses.map(c => c.id));
const missing = EXPECTED.filter(id => !loaded.includes(id));
if (missing.length) {
  failed = true;
  console.log(`MISSING CHAPTERS: ${missing.join(', ')}  (loaded: ${loaded.join(', ')})`);
}
const count = loaded.length;
for (let n = 1; n <= count; n++) {
  if (only && n !== only) continue;
  const id = await s.goto(n);
  await s.wait(1200);
  const before = s.errors.length;
  const t0 = Date.now();
  if (strategies[id]) await strategies[id]();
  const p = await P();
  const errs = s.errors.slice(before).filter(isRealError);
  await s.page.screenshot({ path: path.join(OUT, `ch${n}-${id}-end.png`), timeout: 60000 }).catch(() => {});
  const ok = !!(p && p.solved) && errs.length === 0;
  console.log(`ch${n} ${id}  ${ok ? 'PASS' : 'FAIL'}  solved=${!!(p && p.solved)} errors=${errs.length}  ${((Date.now()-t0)/1000|0)}s  ${JSON.stringify(p).slice(0,180)}`);
  if (errs.length) {
    failed = true;
    // dedupe: a per-frame throw would otherwise print thousands of times
    const seen = new Set();
    for (const e of errs) {
      const key = e.split('\n')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`   ERROR x${errs.filter(x => x.split('\n')[0] === key).length}: ${e.slice(0, 400)}`);
      if (seen.size >= 3) break;
    }
  }
  if (!p || !p.solved) failed = true;
}
await s.browser.close(); srv.close();
console.log(failed ? '\nPLAYTEST FAILED' : '\nplaytest passed');
process.exit(failed ? 1 : 0);
