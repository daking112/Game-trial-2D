// Play the game the way a player does: from the title, in order, no
// ?level= jump — and assert the wreckage actually accumulates.
//
// This exists because nothing else in this repo plays the game. playtest,
// budget, still and every throwaway enter a chapter through ?level= or
// goto(), and that is the exact path that hid the anthology's central
// mechanic being unimplemented: two of four chapters deposited nothing,
// and the finale covered for them with a demo seed that only fired on the
// code path the tools use.
import { serve, launch, ROOT } from './harness.mjs';
import path from 'node:path'; import fs from 'node:fs';

const OUT = path.join(ROOT, 'shots/inorder');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const { srv, port } = await serve();
const s = await launch({ device: 'phone', url: `http://127.0.0.1:${port}/?quality=high` });
const W = s.device.width, H = s.device.height;

const wreck = () => s.page.evaluate(() => {
  const w = window.__DTI__.game.wreck.items;
  const by = {};
  for (const it of w) by[it.kind] = (by[it.kind] || 0) + 1;
  return { total: w.length, by, level: window.__DTI__.level };
});
const lvl = () => s.page.evaluate(() => window.__DTI__.level);
const wait = async (fn, ms = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await s.wait(220); }
  return false;
};

// enter from the title, like a player
await s.wait(2600);
await s.tap(W * 0.5, H * 0.62, 90);
await wait(async () => (await lvl()) === 'l1');
await s.wait(1500);
console.log('entered', await lvl());

const marks = [];
const strategies = {
  l1: async () => {
    const sc = await s.page.evaluate(() => window.__DTI__.game.level.screws.map(x => ({ x: x.x, y: x.y, r: x.r })));
    for (let i = 0; i < sc.length; i++)
      for (let a = 0; a < 12; a++) {
        const f = await s.page.evaluate(() => window.__DTI__.game.level.freed);
        if (f > i) break;
        await s.circle(sc[i].x, sc[i].y, Math.max(30, sc[i].r * 3.4), 1.4, 700, -1);
      }
    await s.wait(900);
    const j = await s.page.evaluate(() => { const g = window.__DTI__.game.level.g;
      return { x: g.cx, y: g.jarBaseY - g.jarStraight * 0.6 }; });
    await s.touchStart([{ x: j.x, y: j.y }]);
    for (let i = 1; i <= 34; i++) { await s.touchMove([{ x: j.x, y: j.y - i * 7 }]); await s.wait(16); }
    await s.touchEnd(); await s.wait(3000);
    const b = await s.page.evaluate(() => { const g = window.__DTI__.game.level.g;
      return { x: g.cx, y: g.btnBaseY - g.bezelH - g.collarH - g.capBulge * 0.5 }; });
    for (let k = 0; k < 6; k++) {
      if (await s.page.evaluate(() => window.__DTI__.game.level.solved)) break;
      await s.press(b.x, b.y, 2600); await s.wait(600);
    }
  },
  l3: async () => {
    const c = await s.page.evaluate(() => { const l = window.__DTI__.game.level;
      const b = l.blobs[0]; return { x: b.cx, y: b.cy, r: b.r }; });
    for (let k = 0; k < 14; k++) {
      if (await s.page.evaluate(() => !window.__DTI__.game.level || window.__DTI__.game.level.solved)) break;
      await s.tap(c.x, c.y, 120); await s.wait(200);
      await s.pinch(c.x, c.y, c.r * 2.0, c.r * 0.18, 1100); await s.wait(500);
    }
  },
  l4: async () => {
    const g = await s.page.evaluate(() => { const p = window.__DTI__.game.level.g.panes[0];
      return { x: p.cx, y: p.y0 + p.h * 0.5, w: p.w }; });
    for (let k = 0; k < 14; k++) {
      if (await s.page.evaluate(() => !window.__DTI__.game.level || window.__DTI__.game.level.solved)) break;
      await s.press(g.x, g.y, 1400); await s.wait(300);
      await s.twoFingerHold(g.x - g.w * 0.28, g.y, g.x + g.w * 0.28, g.y, 2600);
      await s.wait(700);
    }
  },
  l5: async () => {
    const a = await s.page.evaluate(() => { const l = window.__DTI__.game.level;
      return { x: l.acorn.x, y: l.acorn.y, bx: l.g.bellX, by: l.g.bellY }; });
    await s.touchStart([{ x: a.x, y: a.y }]);
    for (let i = 1; i <= 30; i++) { await s.touchMove([{ x: a.x, y: a.y + i * 5 }]); await s.wait(16); }
    await s.touchEnd(); await s.wait(4000);
    for (const [x, y] of [[W*0.28, H*0.62], [W*0.72, H*0.62], [W*0.5, H*0.58]])
      { await s.swipe(W*0.5, H*0.6, x, y, 450); await s.wait(150); }
    await s.touchStart([{ x: a.bx, y: a.by - 12 }]);
    for (let i = 0; i < 40; i++) { await s.touchMove([{ x: a.bx, y: a.by - 12 }]); await s.wait(30); }
    await s.touchEnd(); await s.wait(400);
    await s.tap(a.bx, a.by - 18, 70);
    await s.wait(3000);
  },
};

for (const id of ['l1', 'l3', 'l4', 'l5']) {
  const ok = await wait(async () => (await lvl()) === id, 40000);
  if (!ok) { console.log(`never reached ${id}`); break; }
  await s.wait(1400);
  await strategies[id]();
  await s.wait(2600);
  const w = await wreck();
  marks.push({ after: id, ...w });
  console.log(`after ${id}:`.padEnd(12), `total ${String(w.total).padStart(3)}  ${JSON.stringify(w.by)}`);
  await s.page.screenshot({ path: path.join(OUT, `after-${id}.png`), timeout: 60000 }).catch(() => {});
}

// the closing card, which reads off the same store
await s.wait(9000);
const card = await s.page.evaluate(() => {
  const el = document.querySelector('#endcard');
  if (!el) return null;
  return { big: el.querySelector('.big') && el.querySelector('.big').textContent,
           lines: [...el.querySelectorAll('.small span')].map(x => x.textContent) };
});
console.log('end card:', JSON.stringify(card));
await s.page.screenshot({ path: path.join(OUT, 'endcard.png'), timeout: 60000 }).catch(() => {});

const final = marks[marks.length - 1] || { by: {}, total: 0 };
const kinds = Object.keys(final.by);
let failed = false;
const need = [['shard', 'the two glass chapters'], ['screw', 'Chapter I brass']];
for (const [k, why] of need) {
  if (!(final.by[k] > 0)) { failed = true; console.log(`MISSING ${k} in the pile — ${why} deposited nothing`); }
}
if (final.total < 20) { failed = true; console.log(`pile is only ${final.total} items`); }
console.log(failed ? '\nIN-ORDER FAILED' : `\nin-order passed — pile: ${JSON.stringify(final.by)}`);
await s.browser.close(); srv.close();
process.exit(failed ? 1 : 0);
