// ============================================================
// audio-lab.mjs — the ears I do not have.
// ------------------------------------------------------------
// Loads src/core/audio.js in a real browser, binds Audio to an
// OfflineAudioContext (so every measurement goes through the REAL
// master chain: reverb send, tilt EQ, compressor, sidechain), renders
// each named SFX, pulls the PCM back and then:
//
//   * plots the waveform + dB envelope and a log-frequency spectrogram
//     to a PNG, one per sound, plus a contact sheet
//   * reports peak / RMS / crest / attack / T60 / spectral centroid over
//     time / band balance / DC offset / clipping
//
// Usage:
//   node audio-lab.mjs                 # everything
//   node audio-lab.mjs screwTick shatter   # only matching names
//   OUT=../shots/audio-r3 node audio-lab.mjs
// ============================================================
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, process.env.OUT || 'shots/audio');

// ------------------------------------------------------------
// The catalogue. `call` is stringified and run in the page with
// (Audio, SFX) in scope. `dur` is the offline render length.
// ------------------------------------------------------------
const CASES = [
  // room itself
  { name: 'room-ir',      dur: 3.0, ir: true },
  { name: 'room-response', dur: 2.5, call: `Audio.click({ f: 2000, gain: 0.5, dur: 0.01, q: 1, send: 3.0 })` },

  // ui
  { name: 'uiTick',       dur: 0.6, call: `SFX.uiTick()` },
  { name: 'uiSoft',       dur: 1.0, call: `SFX.uiSoft()` },
  { name: 'whoosh',       dur: 1.6, call: `SFX.whoosh(1)` },

  // mechanical
  { name: 'screwTick',    dur: 0.7, call: `SFX.screwTick(0)` },
  { name: 'screwTick-hi', dur: 0.7, call: `SFX.screwTick(6)` },
  { name: 'screwRun',     dur: 1.6, call: `for (let i=0;i<10;i++) SFX.screwTick(i*0.5, 0, { t: Audio.ctx.currentTime + i*0.085 })` },
  { name: 'screwFree',    dur: 2.0, call: `SFX.screwFree()` },
  { name: 'screwDrop',    dur: 2.0, call: `SFX.screwDrop()` },

  // the money sound
  { name: 'buttonPress',  dur: 1.5, call: `SFX.buttonPress()` },
  { name: 'buttonBottom', dur: 2.0, call: `SFX.buttonBottom()` },
  { name: 'buttonRelease',dur: 1.0, call: `SFX.buttonRelease()` },

  // glass
  { name: 'glassLift',    dur: 2.0, call: `SFX.glassLift()` },
  { name: 'glassSet',     dur: 2.0, call: `SFX.glassSet(1)` },
  { name: 'glassRing',    dur: 3.5, call: `SFX.glassRing(1400, 0.45)` },
  { name: 'glassStress',  dur: 1.0, call: `SFX.glassStress(0.7)` },
  { name: 'glassShatter', dur: 3.5, call: `SFX.glassShatter(1)` },
  { name: 'shardTinkle',  dur: 1.2, call: `SFX.shardTinkle(1)` },

  // soft
  { name: 'squish',       dur: 1.2, call: `SFX.squish(1)` },
  { name: 'stretch',      dur: 0.8, call: `SFX.stretch(0.6)` },
  { name: 'clothPull',    dur: 0.8, call: `SFX.clothPull(1)` },
  { name: 'clothRun',     dur: 1.4, call: `for (let i=0;i<14;i++) SFX.clothPull(0.3+i*0.05, 0, { t: Audio.ctx.currentTime + i*0.055 })` },
  { name: 'threadSnap',   dur: 1.2, call: `SFX.threadSnap()` },

  // world
  { name: 'chainPull',    dur: 1.2, call: `SFX.chainPull()` },
  { name: 'lampClick',    dur: 1.2, call: `SFX.lampClick()` },
  { name: 'powerDown',    dur: 3.0, call: `SFX.powerDown()` },
  { name: 'powerUp',      dur: 3.0, call: `SFX.powerUp()` },
  { name: 'bigImpact',    dur: 2.5, call: `SFX.bigImpact(1)` },
  { name: 'reveal',       dur: 4.5, call: `SFX.reveal()` },

  // stress: does a shatter flatten the mix?
  { name: 'mix-stress',   dur: 3.5, call: `SFX.glassShatter(1); SFX.bigImpact(1); SFX.buttonBottom();` },
];

// ------------------------------------------------------------
// static server: the repo, plus a synthetic lab page
// ------------------------------------------------------------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const LAB_HTML = `<!doctype html><meta charset=utf-8><title>audio lab</title>
<style>html,body{margin:0;background:#0b0b0d}canvas{display:block}</style>
<canvas id=plot width=1100 height=470></canvas>`;

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rq) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/__lab.html') {
        rq.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        rq.end(LAB_HTML); return;
      }
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rq.writeHead(404); rq.end('nope'); return; }
      rq.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(rq);
    });
    srv.listen(0, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

// ============================================================
// Everything below runs INSIDE the page.
// ============================================================
async function inPage(caseSpec) {
  const { call, dur, ir, name } = caseSpec;
  const mod = await import('/src/core/audio.js');
  const { Audio, SFX } = mod;
  const SR = 48000;
  const N = Math.round(SR * dur);
  const off = new OfflineAudioContext(2, N, SR);
  Audio.attach(off);
  Audio.muted = false;

  if (ir) {
    // play the room's own impulse response straight out
    const src = off.createBufferSource();
    src.buffer = Audio.verb.buffer;
    const g = off.createGain(); g.gain.value = 1;
    src.connect(g); g.connect(off.destination);
    src.start(0);
  } else {
    // eslint-disable-next-line no-new-func
    new Function('Audio', 'SFX', call)(Audio, SFX);
  }
  const buf = await off.startRendering();

  const L = buf.getChannelData(0);
  const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
  const n = L.length;
  const m = new Float32Array(n);
  let peak = 0, dc = 0, clips = 0;
  for (let i = 0; i < n; i++) {
    const l = L[i], r = R[i];
    m[i] = (l + r) * 0.5;
    const a = Math.max(Math.abs(l), Math.abs(r));
    if (a > peak) peak = a;
    if (a >= 0.999) clips++;
    dc += m[i];
  }
  dc /= n;

  // ---- sliding RMS envelope (2.7ms) ----
  const W = 128;
  const env = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += m[i] * m[i];
    if (i >= W) acc -= m[i - W] * m[i - W];
    env[i] = Math.sqrt(acc / Math.min(i + 1, W));
  }
  let ePeak = 0, ePeakI = 0;
  for (let i = 0; i < n; i++) if (env[i] > ePeak) { ePeak = env[i]; ePeakI = i; }

  // onset: first crossing of 10% of envelope peak; attack = onset -> peak
  let onset = 0;
  for (let i = 0; i < n; i++) if (env[i] > ePeak * 0.1) { onset = i; break; }
  const attackMs = ((ePeakI - onset) / SR) * 1000;
  const onsetMs = (onset / SR) * 1000;

  // RMS over the sounding region (down to -60dB of envelope peak)
  let endI = n - 1;
  for (let i = n - 1; i > ePeakI; i--) if (env[i] > ePeak * 0.001) { endI = i; break; }
  let sum = 0;
  for (let i = onset; i <= endI; i++) sum += m[i] * m[i];
  const rms = Math.sqrt(sum / Math.max(1, endI - onset + 1));
  const lenMs = ((endI - onset) / SR) * 1000;

  // T60: measured if it happens inside the render, else 3x T20
  const find = (frac) => { for (let i = ePeakI; i < n; i++) if (env[i] < ePeak * frac) return (i - ePeakI) / SR; return -1; };
  const t20 = find(0.1), t60raw = find(0.001);
  const t60 = t60raw >= 0 ? t60raw : (t20 >= 0 ? t20 * 3 : -1);
  const t60est = t60raw < 0;

  // ---- spectrogram ----
  const FN = 1024, HOP = 128, half = FN / 2;
  const win = new Float32Array(FN);
  for (let i = 0; i < FN; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FN - 1));
  const frames = Math.max(1, Math.floor((n - FN) / HOP));
  const spec = [];           // Float32Array(half) magnitudes per frame
  const cent = new Float32Array(frames);
  const bands = [0, 80, 200, 500, 2000, 6000, 24000];
  const bandE = new Float64Array(bands.length - 1);
  const re = new Float32Array(FN), im = new Float32Array(FN);

  function fft(re, im) {
    const N2 = re.length;
    for (let i = 1, j = 0; i < N2; i++) {
      let bit = N2 >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= N2; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < N2; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len >> 1; k++) {
          const ar = re[i + k], ai = im[i + k];
          const br = re[i + k + (len >> 1)], bi = im[i + k + (len >> 1)];
          const vr = br * cr - bi * ci, vi = br * ci + bi * cr;
          re[i + k] = ar + vr; im[i + k] = ai + vi;
          re[i + k + (len >> 1)] = ar - vr; im[i + k + (len >> 1)] = ai - vi;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }

  for (let f = 0; f < frames; f++) {
    const o = f * HOP;
    for (let i = 0; i < FN; i++) { re[i] = m[o + i] * win[i]; im[i] = 0; }
    fft(re, im);
    const mag = new Float32Array(half);
    let num = 0, den = 0;
    for (let k = 1; k < half; k++) {
      const v = Math.hypot(re[k], im[k]);
      mag[k] = v;
      const fr = k * SR / FN;
      num += fr * v; den += v;
      const p = v * v;
      for (let b = 0; b < bandE.length; b++) if (fr >= bands[b] && fr < bands[b + 1]) { bandE[b] += p; break; }
    }
    spec.push(mag);
    cent[f] = den > 1e-9 ? num / den : 0;
  }
  const totE = bandE.reduce((a, b) => a + b, 0) || 1;
  const band = Array.from(bandE, (v) => +(v / totE * 100).toFixed(1));

  // centroid at points in time (only where there's energy)
  const frAt = (ms) => Math.min(frames - 1, Math.round(ms / 1000 * SR / HOP));
  const centAvg = (a, b) => {
    let s = 0, c = 0;
    for (let f = frAt(a); f <= frAt(b) && f < frames; f++) if (cent[f] > 0) { s += cent[f]; c++; }
    return c ? Math.round(s / c) : 0;
  };
  const centroid = {
    transient: centAvg(onsetMs, onsetMs + 12),
    early: centAvg(onsetMs + 12, onsetMs + 70),
    body: centAvg(onsetMs + 70, onsetMs + 250),
    tail: centAvg(onsetMs + 250, Math.max(onsetMs + 260, lenMs)),
  };

  const db = (v) => (v > 1e-7 ? +(20 * Math.log10(v)).toFixed(1) : -140);
  const stats = {
    name,
    peak: +peak.toFixed(4), peakDb: db(peak),
    rms: +rms.toFixed(5), rmsDb: db(rms),
    crestDb: +(db(peak) - db(rms)).toFixed(1),
    onsetMs: +onsetMs.toFixed(1),
    attackMs: +attackMs.toFixed(2),
    lenMs: Math.round(lenMs),
    t60: t60 >= 0 ? +t60.toFixed(3) : -1,
    t60est,
    centroid,
    band, // [<80, 80-200, 200-500, 500-2k, 2k-6k, >6k] %
    mudPct: band[2],
    dc: +dc.toFixed(5),
    clips,
    frames,
  };

  // ============================================================
  // PLOT
  // ============================================================
  const cv = document.getElementById('plot');
  const CW = cv.width, CH = cv.height;
  const g = cv.getContext('2d');
  g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, CW, CH);
  const PADL = 54, PADR = 12, PW = CW - PADL - PADR;
  const WY = 42, WH = 132;             // waveform panel
  const SY = 196, SH = 216;            // spectrogram panel

  g.font = '13px ui-monospace, Menlo, monospace';
  g.fillStyle = '#e8e2d8';
  g.fillText(name, 12, 20);
  g.fillStyle = '#8b93a1';
  g.font = '11px ui-monospace, Menlo, monospace';
  g.fillText(`peak ${stats.peakDb}dB  rms ${stats.rmsDb}dB  crest ${stats.crestDb}dB  atk ${stats.attackMs}ms  T60 ${stats.t60 >= 0 ? stats.t60 + 's' + (t60est ? '*' : '') : 'n/a'}  len ${stats.lenMs}ms  dc ${stats.dc}  clip ${clips}`, 12, 36);
  g.fillText(`centroid  ${centroid.transient} / ${centroid.early} / ${centroid.body} / ${centroid.tail} Hz   bands <80:${band[0]} 80-200:${band[1]} 200-500:${band[2]} .5-2k:${band[3]} 2-6k:${band[4]} >6k:${band[5]} %`, 12, CH - 8);

  // --- waveform: per-column min/max + dB envelope ---
  const per = n / PW;
  g.strokeStyle = '#20242c'; g.beginPath();
  g.moveTo(PADL, WY + WH / 2); g.lineTo(PADL + PW, WY + WH / 2); g.stroke();
  g.fillStyle = '#4ea3ff';
  for (let x = 0; x < PW; x++) {
    let lo = 1, hi = -1;
    const a = Math.floor(x * per), b = Math.min(n, Math.floor((x + 1) * per));
    for (let i = a; i < b; i++) { const l = L[i], r = R[i]; const v1 = Math.min(l, r), v2 = Math.max(l, r); if (v1 < lo) lo = v1; if (v2 > hi) hi = v2; }
    if (hi < lo) continue;
    const y1 = WY + WH / 2 - hi * (WH / 2), y2 = WY + WH / 2 - lo * (WH / 2);
    g.fillRect(PADL + x, y1, 1, Math.max(1, y2 - y1));
  }
  // clip lines at 0dBFS
  g.strokeStyle = 'rgba(255,80,80,.5)'; g.setLineDash([3, 3]);
  g.beginPath(); g.moveTo(PADL, WY); g.lineTo(PADL + PW, WY);
  g.moveTo(PADL, WY + WH); g.lineTo(PADL + PW, WY + WH); g.stroke(); g.setLineDash([]);
  // dB envelope on top (0..-60 mapped over the panel)
  g.strokeStyle = '#ffcf6b'; g.beginPath();
  for (let x = 0; x < PW; x++) {
    const a = Math.floor(x * per), b = Math.min(n, Math.floor((x + 1) * per));
    let e = 0; for (let i = a; i < b; i++) if (env[i] > e) e = env[i];
    const d = Math.max(-60, 20 * Math.log10(Math.max(e, 1e-7)));
    const y = WY + WH - (d + 60) / 60 * WH;
    x ? g.lineTo(PADL + x, y) : g.moveTo(PADL + x, y);
  }
  g.stroke();
  g.fillStyle = '#5a616e';
  g.fillText('wave', 12, WY + 10); g.fillText('+env', 12, WY + 24);
  g.fillText('0dB', 12, WY + WH - 2); // env floor label is -60

  // --- spectrogram, log frequency 40Hz..20kHz ---
  const F0 = 40, F1 = 20000, lg0 = Math.log(F0), lg1 = Math.log(F1);
  const img = g.createImageData(PW, SH);
  const dbFloor = -78;
  for (let x = 0; x < PW; x++) {
    const f = Math.min(frames - 1, Math.floor(x / PW * frames));
    const mag = spec[f];
    for (let y = 0; y < SH; y++) {
      const fr = Math.exp(lg1 - (y / SH) * (lg1 - lg0));
      const k = fr * FN / SR;
      const k0 = Math.floor(k), k1 = Math.min(half - 1, k0 + 1);
      // when a display row spans many bins (high freq), take the max
      const kHi = Math.min(half - 1, Math.floor(Math.exp(lg1 - ((y - 1) / SH) * (lg1 - lg0)) * FN / SR));
      let v = 0;
      for (let kk = Math.max(1, k0); kk <= Math.max(k1, Math.min(kHi, k0 + 24)); kk++) if (mag[kk] > v) v = mag[kk];
      const d = 20 * Math.log10(Math.max(v, 1e-9) / (FN / 4));
      const t = Math.max(0, Math.min(1, (d - dbFloor) / (0 - dbFloor)));
      // magma-ish ramp
      const rr = Math.min(255, Math.round(255 * Math.min(1, t * 1.9)));
      const gg = Math.round(255 * Math.max(0, Math.min(1, t * 1.7 - 0.7)));
      const bb = Math.round(255 * (t < 0.5 ? t * 1.5 : Math.max(0, 1.6 - t * 2.0)));
      const o = (y * PW + x) * 4;
      img.data[o] = rr; img.data[o + 1] = gg; img.data[o + 2] = bb; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, PADL, SY);
  // freq gridlines
  g.strokeStyle = 'rgba(255,255,255,.16)';
  g.fillStyle = '#8b93a1';
  for (const fr of [100, 200, 500, 1000, 2000, 5000, 10000]) {
    const y = SY + (lg1 - Math.log(fr)) / (lg1 - lg0) * SH;
    g.beginPath(); g.moveTo(PADL, y); g.lineTo(PADL + PW, y); g.stroke();
    g.fillText(fr >= 1000 ? (fr / 1000) + 'k' : fr, 14, y + 4);
  }
  // 200-500Hz mud band bracket
  const my0 = SY + (lg1 - Math.log(500)) / (lg1 - lg0) * SH;
  const my1 = SY + (lg1 - Math.log(200)) / (lg1 - lg0) * SH;
  g.strokeStyle = 'rgba(120,200,255,.55)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(PADL - 4, my0); g.lineTo(PADL - 4, my1); g.stroke(); g.lineWidth = 1;

  // time axis + centroid trace over the spectrogram
  g.strokeStyle = 'rgba(120,255,180,.85)'; g.beginPath();
  for (let x = 0; x < PW; x++) {
    const f = Math.min(frames - 1, Math.floor(x / PW * frames));
    const c = Math.max(F0, Math.min(F1, cent[f] || F0));
    const y = SY + (lg1 - Math.log(c)) / (lg1 - lg0) * SH;
    x ? g.lineTo(PADL + x, y) : g.moveTo(PADL + x, y);
  }
  g.stroke();
  g.fillStyle = '#5a616e';
  for (let i = 0; i <= 4; i++) {
    const tms = dur * 1000 * i / 4;
    g.fillText(tms.toFixed(0) + 'ms', PADL + i * PW / 4 - (i === 4 ? 34 : 0), SY + SH + 12);
  }
  return stats;
}

// ------------------------------------------------------------
// driver
// ------------------------------------------------------------
const filter = process.argv.slice(2);
const cases = filter.length
  ? CASES.filter(c => filter.some(f => c.name.toLowerCase().includes(f.toLowerCase())))
  : CASES;

fs.mkdirSync(OUT, { recursive: true });
const { srv, port } = await serve();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1120, height: 500 }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

const rows = [];
for (const c of cases) {
  // reload per case: module state (and math.js's seeded rng) resets, so the
  // same case renders identically across rounds and A/B is meaningful.
  await page.goto(`http://127.0.0.1:${port}/__lab.html`, { waitUntil: 'load' });
  let st;
  try {
    st = await page.evaluate(inPage, c);
  } catch (e) {
    console.log(`FAIL ${c.name}: ${String(e).split('\n')[0]}`);
    rows.push({ name: c.name, error: String(e).split('\n')[0] });
    continue;
  }
  const png = path.join(OUT, `${c.name}.png`);
  await page.locator('#plot').screenshot({ path: png });
  rows.push(st);
}

// ---- table ----
const pad = (s, w) => String(s).padEnd(w);
const padS = (s, w) => String(s).padStart(w);
console.log('\n' + pad('sound', 16) + padS('peak', 7) + padS('rms', 7) + padS('crest', 7) + padS('atk ms', 8) +
  padS('T60', 8) + padS('len ms', 8) + padS('cent T/E/B', 18) + padS('mud%', 6) + padS('air%', 6) + padS('clip', 6) + padS('dc', 9));
console.log('-'.repeat(112));
for (const r of rows) {
  if (r.error) { console.log(pad(r.name, 16) + ' ERROR ' + r.error); continue; }
  console.log(pad(r.name, 16) + padS(r.peakDb, 7) + padS(r.rmsDb, 7) + padS(r.crestDb, 7) + padS(r.attackMs, 8) +
    padS((r.t60 >= 0 ? r.t60 : '-') + (r.t60est ? '*' : ''), 8) + padS(r.lenMs, 8) +
    padS(`${r.centroid.transient}/${r.centroid.early}/${r.centroid.body}`, 18) +
    padS(r.mudPct, 6) + padS(r.band[5], 6) + padS(r.clips, 6) + padS(r.dc, 9));
}
fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(rows, null, 1));

// ---- contact sheet ----
const files = rows.filter(r => !r.error).map(r => path.join(OUT, `${r.name}.png`)).filter(f => fs.existsSync(f));
if (files.length > 1) {
  const cols = 2;
  const sheet = await browser.newPage({ viewport: { width: cols * 560 + 20, height: Math.ceil(files.length / cols) * 244 + 20 }, deviceScaleFactor: 1 });
  await sheet.setContent(`<style>body{margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},560px);gap:2px;padding:8px}
   img{width:556px;display:block}</style>` +
    files.map(f => `<img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}">`).join(''));
  await sheet.screenshot({ path: path.join(OUT, '_sheet.png'), fullPage: true });
}

if (errs.length) console.log('\nPAGE ERRORS:\n' + errs.join('\n'));
console.log('\n->', OUT);
await browser.close();
srv.close();
process.exit(0);
