// Headless verification for the Monster Siege audio bank.
//
//   node js/audio/measure.js            (from monster-siege/)
//
// Serves the game folder, drives a real Chromium, and:
//   1. renders every sound offline through the production bus chain and
//      asserts non-silent + below clipping,
//   2. renders a wave-20 stampede and asserts the master bus stays under
//      full scale with the voice limiter engaged,
//   3. plays every sound through a LIVE AudioContext with an AnalyserNode
//      tapped off the master bus, to prove the real path emits samples.
//
// "No console errors" is not verification; peak/RMS numbers are.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(p, (err, data) => {
        if (err) { res.writeHead(404); res.end('nope'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

const db = (v) => (v > 0 ? (20 * Math.log10(v)).toFixed(1) + ' dBFS' : '-inf');

(async () => {
  const { srv, port } = await serve();
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/js/audio/harness.html`);

  const r = await page.evaluate(() => window.__measureAll());

  let fails = 0;
  console.log('\n=== per-sound (offline render through master chain) ===');
  console.log('name'.padEnd(20), 'peak'.padStart(8), 'peak dB'.padStart(10), 'rms'.padStart(9), 'rms dB'.padStart(10), '  len');
  for (const s of r.sounds) {
    const bad = [];
    if (s.peak < 0.02) { bad.push('SILENT'); fails++; }
    if (s.peak > 0.95) { bad.push('CLIPPING'); fails++; }
    console.log(
      s.name.padEnd(20),
      s.peak.toFixed(4).padStart(8),
      db(s.peak).padStart(10),
      s.rms.toFixed(5).padStart(9),
      db(s.rms).padStart(10),
      ' ' + s.seconds.toFixed(2) + 's',
      bad.join(' ')
    );
  }

  console.log('\n=== repeat variation (two fire_light shots, same player) ===');
  const v = r.variation.relativeDifference;
  console.log('  relative waveform difference:', v.toFixed(3), v > 0.2 ? 'OK (not identical)' : 'FAIL (too similar)');
  if (!(v > 0.2)) fails++;

  console.log('\n=== burst / voice limiting ===');
  for (const b of r.bursts) {
    console.log(` ${b.label}: ${b.requested} events requested -> ${b.accepted} played, ${b.dropped} dropped by limiter`);
    console.log(`   peak ${b.peak.toFixed(4)} (${db(b.peak)})  rms ${b.rms.toFixed(5)} (${db(b.rms)})`);
    if (b.peak > 0.95) { console.log('   FAIL: burst pins the master bus'); fails++; }
    if (b.dropped === 0) { console.log('   WARN: limiter never engaged - burst too small to be a test'); }
  }

  console.log('\n=== music bed (12s render per intensity) ===');
  for (const m of r.music) {
    console.log(`  intensity ${m.intensity}: peak ${m.peak.toFixed(4)} (${db(m.peak)})  rms ${m.rms.toFixed(5)} (${db(m.rms)})`);
    if (m.peak > 0.95) { console.log('   FAIL: music clips'); fails++; }
    if (m.peak < 0.01) { console.log('   FAIL: music silent'); fails++; }
  }

  console.log('\n=== live AudioContext probe (AnalyserNode on master) ===');
  const live = await page.evaluate((names) => window.__liveProbe(names), r.sounds.map((s) => s.name));
  console.log(`  ctx state: ${live.ctxState} @ ${live.sampleRate}Hz`);
  for (const p of live.probes) {
    const ok = p.livePeak > 0.005;
    if (!ok) fails++;
    console.log('  ', p.name.padEnd(20), p.livePeak.toFixed(4).padStart(8), ok ? 'audible' : 'FAIL silent');
  }

  if (errors.length) { console.log('\n=== page errors ==='); errors.forEach((e) => console.log('  ' + e)); fails += errors.length; }

  console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
  await browser.close();
  srv.close();
  process.exit(fails === 0 ? 0 : 1);
})();
