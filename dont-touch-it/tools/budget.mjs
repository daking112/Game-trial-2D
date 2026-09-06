// Frame budget, every chapter, every screen size.
//
// This exists because Chapter III once cost 0.6ms on a phone and 68.6ms on
// a tablet — superlinear, from three scaled blits of a large region per
// frame — and not one test in the repo could see it. playtest.mjs drives a
// phone; a regression that only appears at 820x1180 is invisible to it.
//
//   node budget.mjs            # all chapters, all devices
//   BUDGET=6 node budget.mjs   # tighten the threshold
import { serve, launch, DEVICES } from './harness.mjs';

const BUDGET = +(process.env.BUDGET || 8);      // ms of draw, our half of 16.7
// ?level is 1-based (main.js does level-1), so these are chapters I..IV.
// They were '0,1,3,4' for a while, which measured Chapter I twice and
// Chapter II never.
const LEVELS = (process.env.LEVELS || '1,2,3,4').split(',');
const DEVS = (process.env.DEVICES_ || 'phone,tall,tablet').split(',');

const EXPECTED = ['l1', 'l3', 'l4', 'l5'];
const { srv, port } = await serve();
let failed = false;

// A chapter whose module throws on import is silently dropped from the
// manifest by the fault-tolerant loader, and every ?level= after it then
// points at the wrong chapter — so this tool would go on reporting twelve
// green rows while measuring a game with a hole in it. Check first.
{
  const s = await launch({ device: 'phone', url: `http://127.0.0.1:${port}/?level=1&quality=high` });
  await s.wait(2600);
  const loaded = await s.page.evaluate(() => window.__DTI__.game.levelClasses.map(c => c.id));
  const missing = EXPECTED.filter(id => !loaded.includes(id));
  if (missing.length) {
    console.log(`MISSING CHAPTERS: ${missing.join(', ')}  (loaded: ${loaded.join(', ')})`);
    console.log('\nBUDGET FAILED');
    await s.browser.close(); srv.close(); process.exit(1);
  }
  await s.browser.close();
}
for (const device of DEVS) {
  for (const level of LEVELS) {
    // pinned to `high`: the governor would otherwise quietly demote and
    // hide exactly the regression this is looking for
    const s = await launch({ device, url: `http://127.0.0.1:${port}/?level=${level}&quality=high` });
    await s.wait(4200);
    const m = await s.page.evaluate(() => {
      const g = window.__DTI__.game;
      return { draw: +g.drawMs.toFixed(2), level: +(g.level?.drawCost ?? 0).toFixed(2) };
    });
    const d = DEVICES[device];
    const over = m.draw > BUDGET;
    if (over) failed = true;
    console.log(`${over ? 'OVER' : 'ok  '}  ${device.padEnd(7)} ${d.width}x${d.height}@${d.dpr}  level ${level}  draw ${String(m.draw).padStart(6)}ms  (level.draw ${m.level}ms)`);
    await s.browser.close();
  }
}
srv.close();
console.log(failed ? `\nBUDGET FAILED (> ${BUDGET}ms)` : `\nall inside ${BUDGET}ms`);
process.exit(failed ? 1 : 0);
