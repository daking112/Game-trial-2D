// ============================================================
// audit.mjs — one artifact a critic can judge the whole game from.
// Walks every chapter, captures idle + a short interaction probe,
// records console errors, draw cost and probe state, and writes a
// labelled contact sheet plus a JSON report.
//   node audit.mjs [device]
// ============================================================
import { serve, launch, contactSheet, ROOT, DEVICES } from './harness.mjs';
import path from 'node:path';
import fs from 'node:fs';

const device = process.argv[2] || process.env.DEVICE || 'phone';
const OUT = path.join(ROOT, 'shots/audit', device);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const { srv, port } = await serve();
const s = await launch({ device, url: `http://127.0.0.1:${port}/?debug=1` });
const W = s.device.width, H = s.device.height;
const report = { device, chapters: [], errors: [], startedAt: new Date().toISOString() };

await s.wait(1800);
await s.shot('00-title', OUT);

await s.tap(W / 2, H * 0.55);
await s.wait(4500);

const count = await s.page.evaluate(() => window.__DTI__.game.levelClasses.length);
report.chapterCount = count;

for (let i = 1; i <= count; i++) {
  await s.goto(i);
  await s.wait(1400);
  await s.shot(`ch${i}-idle`, OUT);

  // generic curiosity probe: a tap, a drag, and a two-finger squeeze,
  // all centred on the hero. Enough to see whether a chapter responds
  // to touch at all, without knowing anything about its design.
  const cy = Math.round(H * 0.52);
  await s.tap(W / 2, cy); await s.wait(500);
  await s.shot(`ch${i}-tap`, OUT);
  await s.swipe(W / 2, cy, W / 2, cy - H * 0.18, 500); await s.wait(500);
  await s.shot(`ch${i}-drag`, OUT);
  await s.pinch(W / 2, cy, W * 0.5, W * 0.16, 600); await s.wait(600);
  await s.shot(`ch${i}-pinch`, OUT);

  const st = await s.page.evaluate(() => ({
    level: window.__DTI__.level,
    fps: Math.round(window.__DTI__.fps()),
    drawMs: +window.__DTI__.game.drawMs.toFixed(2),
    particles: window.__DTI__.game.particles.n,
    probe: window.__DTI__.probe(),
    rule: window.__DTI__.game.levelClasses[window.__DTI__.game.index]?.rule,
  }));
  report.chapters.push({ n: i, ...st });
  console.log(`ch${i}`, JSON.stringify(st));
}

// Only load failures for chapters that don't exist are benign. A runtime
// exception thrown FROM a chapter file is exactly what an audit is for.
report.errors = s.errors.filter(e =>
  !/Blocked call to navigator\.vibrate/.test(e) &&
  !/(requestfailed|Failed to load resource).*l[0-9]-[a-z]+\.js/.test(e) &&
  !/^console: Failed to load resource: the server responded with a status of 404/.test(e));
report.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

await contactSheet(s.shots.map(x => x.file), path.join(OUT, '_sheet.png'),
  { cols: 5, cellW: 250, title: `DON'T TOUCH IT — full audit (${device})` });

console.log('\nerrors:', report.errors.length ? report.errors : 'none');
console.log('sheet:', path.join(OUT, '_sheet.png'));
await s.browser.close(); srv.close(); process.exit(0);
