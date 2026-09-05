// Can each chapter actually be finished? Drives plausible gestures and
// watches probe() for a solve. Reports what it reached and what threw.
import { serve, launch } from './harness.mjs';

const { srv, port } = await serve();
const s = await launch({ url: `http://127.0.0.1:${port}/?quality=high` });
const W = s.device.width, H = s.device.height;
await s.wait(1500);
await s.tap(W / 2, H * 0.55);
await s.wait(4000);

const only = process.argv[2] ? +process.argv[2] : null;
const count = await s.page.evaluate(() => window.__DTI__.game.levelClasses.length);

for (let n = 1; n <= count; n++) {
  if (only && n !== only) continue;
  await s.page.evaluate((i) => window.__DTI__.goto(i), n);
  await s.wait(2500);
  const id = await s.page.evaluate(() => window.__DTI__.level);
  const cy = H * 0.50;
  const before = s.errors.length;

  // a determined but uninformed player
  for (let round = 0; round < 3 && !(await s.probe())?.solved; round++) {
    await s.tap(W / 2, cy); await s.wait(300);
    await s.press(W / 2, cy, 1600); await s.wait(400);
    await s.twoFingerHold(W * 0.34, cy, W * 0.66, cy, 2200); await s.wait(500);
    await s.pinch(W / 2, cy, W * 0.62, W * 0.10, 900); await s.wait(500);
    await s.swipe(W / 2, cy, W / 2, cy - H * 0.22, 600); await s.wait(400);
    await s.swipe(W * 0.3, cy, W * 0.75, cy, 600); await s.wait(400);
  }
  const p = await s.probe();
  const errs = s.errors.slice(before).filter(e => !/l[1-5]-[a-z]+\.js|vibrate/.test(e));
  console.log(`ch${n} (${id}) solved=${p && p.solved}  ${JSON.stringify(p).slice(0, 220)}`);
  if (errs.length) console.log('   ERRORS: ' + errs.slice(0, 3).join(' | ').slice(0, 600));
}
await s.browser.close(); srv.close(); process.exit(0);
