// Chapter II's payoff: the specimen divides. Sampled tightly, because the
// criticism was that what is left afterwards is two rubber balls.
import { serve, launch, ROOT } from './harness.mjs';
import path from 'node:path'; import fs from 'node:fs';
const OUT = path.join(ROOT, 'shots/split');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const { srv, port } = await serve();
const s = await launch({ device: 'phone', url: `http://127.0.0.1:${port}/?level=2&quality=high` });
await s.wait(2700);
const c = await s.page.evaluate(() => { const b = window.__DTI__.game.level.blobs[0];
  return { x: b.cx, y: b.cy, r: b.r }; });
await s.tap(c.x, c.y, 130); await s.wait(400);
// The strands live under a second and the split happens mid-gesture, so a
// round-trip poll from node cannot catch them — it arrives after they are
// gone, which reads exactly like the effect not existing. Arm a watcher
// inside the page that freezes the frame the instant one is alive.
await s.page.evaluate(() => {
  window.__CAUGHT__ = 0;
  const tick = () => {
    const l = window.__DTI__.game.level;
    if (l && l.strands && l.strands.length && !window.__CAUGHT__) {
      window.__CAUGHT__ = l.strands.length;
      window.__DTI__.pause();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
let split = false;
for (let k = 0; k < 10 && !split; k++) {
  await s.pinch(c.x, c.y, c.r * 2.0, c.r * 0.16, 900);
  for (let i = 0; i < 30; i++) {
    const st = await s.page.evaluate(() => ({
      n: window.__DTI__.game.level ? window.__DTI__.game.level.splits : 0,
      caught: window.__CAUGHT__ || 0,
    }));
    if (st.caught) { console.log('caught mid-tear:', st.caught, 'strands'); split = true; break; }
    if (st.n > 0) { split = true; break; }
    await s.wait(30);
  }
  if (!split) await s.wait(400);
}
await s.page.screenshot({ path: path.join(OUT, 'tear.png'), timeout: 60000 });
await s.page.evaluate(() => window.__DTI__.resume());
console.log('split', split);
for (const m of [0.05, 0.16, 0.30, 0.55, 1.1]) {
  await s.page.evaluate(() => window.__DTI__.pause());
  await s.page.screenshot({ path: path.join(OUT, `s${m}.png`), timeout: 60000 });
  await s.page.evaluate(() => window.__DTI__.resume());
  console.log(`m=${m}`, JSON.stringify(await s.page.evaluate(() => ({
    strands: window.__DTI__.game.level.strands.length,
    blobs: window.__DTI__.game.level.blobs.length,
  }))));
  await s.wait(m * 1000);
}
if (s.errors.length) console.log('ERRORS:\n' + s.errors.join('\n'));
await s.browser.close(); srv.close(); process.exit(0);
