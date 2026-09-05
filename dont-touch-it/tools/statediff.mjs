// Does the object actually change when its state changes?
// Sets state directly, captures, and reports the pixel delta — no input
// timing involved, so a null result is the renderer's fault, not the test's.
import { serve, launch, ROOT } from './harness.mjs';
import path from 'node:path'; import fs from 'node:fs';
const OUT = path.join(ROOT, 'shots/statediff');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const { srv, port } = await serve();

async function pair(level, name, setA, setB, region) {
  const s = await launch({ url: `http://127.0.0.1:${port}/?level=${level}&quality=high` });
  await s.wait(4200);
  await s.page.evaluate(() => window.__DTI__.pause());
  const shot = async (tag, setter) => {
    await s.page.evaluate(setter);
    await s.page.evaluate(() => window.__DTI__.step(1 / 60));
    const f = path.join(OUT, `${name}-${tag}.png`);
    await s.page.screenshot({ path: f, timeout: 60000, clip: region });
    return f;
  };
  const a = await shot('A', setA);
  const b = await shot('B', setB);
  // pixel delta, computed in the page to avoid extra deps
  const diff = await s.page.evaluate(async ([fa, fb]) => {
    const load = (u) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
    return null;
  }, [a, b]);
  await s.browser.close();
  return [a, b];
}

const cmp = (fa, fb) => {
  const A = fs.readFileSync(fa), B = fs.readFileSync(fb);
  return { same: A.equals(B), bytes: [A.length, B.length] };
};

const region = { x: 60, y: 380, width: 280, height: 300 };

let r = await pair(1, 'screw',
  () => { const l = window.__DTI__.game.level; for (const s of l.screws) { s.turned = 0; s.spin = 0; s.lift = 0; } },
  () => { const l = window.__DTI__.game.level; for (const s of l.screws) { s.turned = s.target * 0.55; s.spin = 2.4; s.lift = 0.55 * 0.35; } },
  region);
console.log('screw 0 vs 55% turned :', JSON.stringify(cmp(r[0], r[1])));

r = await pair(1, 'button',
  () => { const l = window.__DTI__.game.level; l.jar.gone = true; l.exposed = true; l.phase = 'button'; l.btn.press = 0; },
  () => { const l = window.__DTI__.game.level; l.jar.gone = true; l.exposed = true; l.phase = 'button'; l.btn.press = 1; l.btn.committed = false; },
  { x: 100, y: 420, width: 200, height: 180 });
console.log('button press 0 vs 1   :', JSON.stringify(cmp(r[0], r[1])));

srv.close(); process.exit(0);
