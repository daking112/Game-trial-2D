// Renders the app icon at several sizes by drawing it in a real canvas.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets/icons');
fs.mkdirSync(OUT, { recursive: true });

const DRAW = `(S, maskable) => {
  const c = document.getElementById('c');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const TAU = Math.PI * 2;
  const safe = maskable ? 0.78 : 1;             // maskable icons keep a safe zone
  // ---- ground ----
  const bg = x.createRadialGradient(S*0.42, S*0.30, 0, S*0.5, S*0.5, S*0.80);
  bg.addColorStop(0, '#24242c'); bg.addColorStop(0.5, '#131318'); bg.addColorStop(1, '#08080b');
  x.fillStyle = bg; x.fillRect(0, 0, S, S);
  x.save();
  x.translate(S*0.5, S*0.5); x.scale(safe, safe); x.translate(-S*0.5, -S*0.5);

  const cx = S*0.5, plinthY = S*0.735, R = S*0.30;

  // ---- plinth top ----
  x.beginPath(); x.ellipse(cx, plinthY, R*1.62, R*0.44, 0, 0, TAU);
  const pg = x.createRadialGradient(cx - R*0.3, plinthY - R*0.2, 0, cx, plinthY, R*1.6);
  pg.addColorStop(0, '#6a6a74'); pg.addColorStop(0.5, '#43434c'); pg.addColorStop(1, '#1d1d22');
  x.fillStyle = pg; x.fill();
  x.beginPath(); x.ellipse(cx, plinthY, R*1.62, R*0.44, 0, Math.PI*1.02, Math.PI*1.98);
  x.strokeStyle = 'rgba(255,236,208,0.34)'; x.lineWidth = S*0.006; x.stroke();

  // ---- contact shadow under the switch ----
  const sg = x.createRadialGradient(cx, plinthY - R*0.02, 0, cx, plinthY - R*0.02, R*1.05);
  sg.addColorStop(0, 'rgba(0,0,0,0.78)'); sg.addColorStop(0.5, 'rgba(0,0,0,0.4)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  x.save(); x.translate(cx, plinthY - R*0.02); x.scale(1, 0.30);
  x.fillStyle = sg; x.beginPath(); x.arc(0, 0, R*1.05, 0, TAU); x.fill(); x.restore();

  // ---- the switch ----
  const capY = plinthY - R*0.10, capR = R*0.70, bulge = R*0.58;
  x.beginPath();
  x.moveTo(cx-capR, capY);
  x.bezierCurveTo(cx-capR, capY-bulge*1.36, cx+capR, capY-bulge*1.36, cx+capR, capY);
  x.ellipse(cx, capY, capR, capR*0.3, 0, 0, Math.PI);
  x.closePath();
  x.save(); x.clip();
  const cg = x.createRadialGradient(cx-capR*0.34, capY-bulge*0.92, capR*0.03, cx, capY-bulge*0.2, capR*1.6);
  cg.addColorStop(0, '#ff9a80'); cg.addColorStop(0.20, '#f04a30'); cg.addColorStop(0.58, '#ac1d15'); cg.addColorStop(1, '#3f0908');
  x.fillStyle = cg; x.fillRect(cx-capR*1.3, capY-bulge*2, capR*2.6, bulge*2+capR);
  x.globalCompositeOperation = 'lighter';
  const gl = x.createRadialGradient(cx-capR*0.30, capY-bulge*0.80, 0, cx-capR*0.30, capY-bulge*0.80, capR*0.40);
  gl.addColorStop(0, 'rgba(255,255,255,0.92)'); gl.addColorStop(0.4, 'rgba(255,228,218,0.22)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gl;
  x.beginPath(); x.ellipse(cx-capR*0.30, capY-bulge*0.80, capR*0.40, bulge*0.30, -0.42, 0, TAU); x.fill();
  const rl = x.createLinearGradient(cx + capR*0.2, 0, cx + capR, 0);
  rl.addColorStop(0, 'rgba(255,150,120,0)'); rl.addColorStop(1, 'rgba(255,176,150,0.34)');
  x.fillStyle = rl; x.fillRect(cx, capY-bulge*2, capR*1.3, bulge*2+capR);
  x.restore();

  // ---- the bell jar over it ----
  const jR = R*1.10, jBase = plinthY - R*0.03, jStr = R*0.62;
  const jar = () => {
    x.beginPath();
    x.moveTo(cx-jR, jBase);
    x.lineTo(cx-jR, jBase-jStr);
    x.arc(cx, jBase-jStr, jR, Math.PI, 0);
    x.lineTo(cx+jR, jBase);
    x.closePath();
  };
  x.save(); jar(); x.clip();
  const bodyG = x.createLinearGradient(cx-jR, 0, cx+jR, 0);
  bodyG.addColorStop(0, 'rgba(184,212,232,0.26)');
  bodyG.addColorStop(0.22, 'rgba(210,232,246,0.05)');
  bodyG.addColorStop(0.5, 'rgba(255,255,255,0.015)');
  bodyG.addColorStop(0.8, 'rgba(190,214,232,0.05)');
  bodyG.addColorStop(1, 'rgba(160,190,212,0.28)');
  x.fillStyle = bodyG; x.fillRect(cx-jR*1.2, jBase-jStr-jR*1.2, jR*2.4, jStr+jR*2.4);
  x.globalCompositeOperation = 'lighter';
  const hs = x.createRadialGradient(cx-jR*0.40, jBase-jStr-jR*0.46, 0, cx-jR*0.40, jBase-jStr-jR*0.46, jR*0.36);
  hs.addColorStop(0, 'rgba(255,255,255,0.72)'); hs.addColorStop(0.45, 'rgba(255,255,255,0.12)'); hs.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = hs; x.fillRect(cx-jR*1.2, jBase-jStr-jR*1.2, jR*2.4, jR*1.6);
  x.restore();
  jar();
  const rim = x.createLinearGradient(cx-jR, jBase-jStr-jR, cx+jR, jBase);
  rim.addColorStop(0, 'rgba(255,255,255,0.86)');
  rim.addColorStop(0.3, 'rgba(206,232,250,0.30)');
  rim.addColorStop(0.6, 'rgba(255,255,255,0.10)');
  rim.addColorStop(1, 'rgba(236,246,255,0.72)');
  x.strokeStyle = rim; x.lineWidth = S*0.0085; x.stroke();

  x.restore();
  // ---- vignette ----
  const vg = x.createRadialGradient(S*0.5, S*0.46, S*0.16, S*0.5, S*0.5, S*0.74);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.60)');
  x.fillStyle = vg; x.fillRect(0, 0, S, S);
  return c.toDataURL('image/png');
}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
await page.setContent('<canvas id="c"></canvas>');
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false], ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true], ['icon-1024.png', 1024, false],
  ['apple-touch-icon.png', 180, false],
]) {
  const url = await page.evaluate(([fn, S, m]) => eval('(' + fn + ')')(S, m), [DRAW, size, maskable]);
  fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', name, size);
}
await browser.close();
process.exit(0);
