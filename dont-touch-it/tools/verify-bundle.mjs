// Does the single-file build actually run, and is it the whole game?
import { launch, ROOT } from './harness.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const file = path.join(ROOT, 'dist', 'dont-touch-it.html');
const html = fs.readFileSync(file);
const srv = http.createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

const s = await launch({ device: 'phone', url: `http://127.0.0.1:${port}/` });
await s.wait(3800);
const state = await s.page.evaluate(() => {
  const D = window.__DTI__;
  if (!D) return { ok: false, why: 'no __DTI__ — the module never ran' };
  const g = D.game;
  return {
    ok: true,
    manifest: g.levelClasses.map(c => c.id),
    fonts: [...document.fonts].map(f => f.family + ':' + f.status),
    canvas: !!document.querySelector('#world'),
    drawMs: +g.drawMs.toFixed(2),
  };
});
console.log(JSON.stringify(state, null, 1));

// and actually play the first chapter a little
if (state.ok) {
  await s.tap(196, 520, 90);
  await s.wait(2500);
  const lvl = await s.page.evaluate(() => window.__DTI__.level);
  const sc = await s.page.evaluate(() => (window.__DTI__.game.level.screws || []).map(x => ({ x: x.x, y: x.y, r: x.r })));
  if (sc.length) {
    await s.circle(sc[0].x, sc[0].y, Math.max(30, sc[0].r * 3.4), 1.4, 700, -1);
    await s.wait(400);
  }
  const p = await s.page.evaluate(() => window.__DTI__.game.level.probe());
  console.log('level after entering:', lvl, '| screw progress:', JSON.stringify(p.screwProgress));
  await s.page.screenshot({ path: path.join(ROOT, 'shots/bundle.png'), timeout: 60000 });
}
await s.wait(4000);
console.log('settled:', JSON.stringify(await s.page.evaluate(() => {
  const r = window.__DTI__.game.r;
  return { drawMs: +window.__DTI__.game.drawMs.toFixed(2), w: r.w, h: r.h, dpr: r.dpr,
           px: r.canvas.width + 'x' + r.canvas.height, quality: r.qualityName,
           innerW: window.innerWidth, viewportMeta: !!document.querySelector('meta[name=viewport]') };
})));
const errs = s.errors.filter(e => !/vibrate/.test(e));
console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 5).join('\n') : 'no errors');
await s.browser.close(); srv.close();
process.exit(state.ok && errs.length === 0 ? 0 : 1);
