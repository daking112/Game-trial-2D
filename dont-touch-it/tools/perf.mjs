// ============================================================
// perf.mjs — draw-cost budget check across chapters, quality tiers
// and device sizes. Headless fps is meaningless (CPU raster), so we
// measure JS-side render time, which is what we actually control.
//   node perf.mjs
// ============================================================
import { serve, launch, DEVICES } from './harness.mjs';

const { srv, port } = await serve();
const rows = [];
for (const device of ['phone', 'small', 'tablet']) {
  const s = await launch({ device, url: `http://127.0.0.1:${port}/` });
  await s.wait(1200);
  await s.tap(s.device.width / 2, s.device.height * 0.55);
  await s.wait(3500);
  const count = await s.page.evaluate(() => window.__DTI__.game.levelClasses.length);
  for (const q of ['high', 'medium', 'low']) {
    await s.page.evaluate((qq) => window.__DTI__.quality(qq), q);
    for (let i = 1; i <= count; i++) {
      await s.page.evaluate((n) => window.__DTI__.goto(n), i);
      await s.wait(2500);
      // let the smoothed average settle on this chapter
      const ms = await s.page.evaluate(() => +window.__DTI__.game.drawMs.toFixed(2));
      rows.push({ device, q, ch: i, drawMs: ms });
    }
  }
  await s.browser.close();
}
srv.close();
const bad = rows.filter(r => r.drawMs > 6);
console.log('device   quality  ch  drawMs');
for (const r of rows) console.log(`${r.device.padEnd(8)} ${r.q.padEnd(8)} ${r.ch}   ${r.drawMs}`);
console.log(bad.length ? `\nOVER BUDGET (>6ms): ${bad.length} rows` : '\nall chapters within the 6ms draw budget');
process.exit(0);
