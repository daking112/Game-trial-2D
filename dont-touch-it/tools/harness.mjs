// ============================================================
// harness.mjs — boots the REAL game in Chromium and drives it
// with real touch events, so critics judge the artifact, not a
// description of it.
// ============================================================
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

export function serve(root = ROOT, port = 0) {
  return new Promise((res) => {
    const srv = http.createServer((req, rq) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const f = path.join(root, p);
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rq.writeHead(404); rq.end('nope'); return;
      }
      rq.writeHead(200, {
        'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(f).pipe(rq);
    });
    srv.listen(port, '127.0.0.1', () => res({ srv, port: srv.address().port }));
  });
}

export const DEVICES = {
  phone:   { width: 393, height: 852, dpr: 2 },     // iPhone 15 Pro (dpr trimmed for CPU raster in CI)
  small:   { width: 360, height: 740, dpr: 2 },     // budget Android
  tall:    { width: 412, height: 915, dpr: 2.6 },   // Pixel 8 Pro
  tablet:  { width: 820, height: 1180, dpr: 2 },
};

export class Session {
  constructor(page, cdp, opts) { this.page = page; this.cdp = cdp; this.opts = opts; this.errors = []; this.shots = []; }

  // ---------- touch ----------
  _pts(list) {
    return list.map((p, i) => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id ?? i, radiusX: 12, radiusY: 12, force: p.force ?? 1 }));
  }
  async touchStart(pts) { await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: this._pts(pts) }); }
  async touchMove(pts)  { await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',  touchPoints: this._pts(pts) }); }
  async touchEnd()      { await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd',   touchPoints: [] }); }

  async tap(x, y, hold = 60) {
    await this.touchStart([{ x, y }]);
    await this.wait(hold);
    await this.touchEnd();
    await this.wait(60);
  }

  async press(x, y, ms) {
    await this.touchStart([{ x, y }]);
    const step = 32;
    for (let t = 0; t < ms; t += step) { await this.touchMove([{ x, y }]); await this.wait(step); }
    await this.touchEnd();
  }

  async swipe(x0, y0, x1, y1, ms = 400, release = true) {
    const steps = Math.max(6, Math.round(ms / 16));
    await this.touchStart([{ x: x0, y: y0 }]);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await this.touchMove([{ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t }]);
      await this.wait(ms / steps);
    }
    if (release) await this.touchEnd();
  }

  /** Circle a finger around (cx,cy) — used for screws. dir -1 = counter-clockwise. */
  async circle(cx, cy, r, turns = 1, ms = 900, dir = -1) {
    const steps = Math.max(18, Math.round(ms / 14));
    const total = turns * Math.PI * 2 * dir;
    let a = 0;
    await this.touchStart([{ x: cx + r, y: cy }]);
    for (let i = 1; i <= steps; i++) {
      a = total * (i / steps);
      await this.touchMove([{ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }]);
      await this.wait(ms / steps);
    }
    await this.touchEnd();
    await this.wait(60);
  }

  async pinch(cx, cy, from, to, ms = 500) {
    const steps = Math.max(8, Math.round(ms / 16));
    const mk = (d) => ([{ x: cx - d / 2, y: cy, id: 0 }, { x: cx + d / 2, y: cy, id: 1 }]);
    await this.touchStart(mk(from));
    for (let i = 1; i <= steps; i++) {
      await this.touchMove(mk(from + (to - from) * (i / steps)));
      await this.wait(ms / steps);
    }
    await this.touchEnd();
  }

  async twoFingerHold(x0, y0, x1, y1, ms) {
    await this.touchStart([{ x: x0, y: y0, id: 0 }, { x: x1, y: y1, id: 1 }]);
    for (let t = 0; t < ms; t += 32) {
      await this.touchMove([{ x: x0, y: y0, id: 0 }, { x: x1, y: y1, id: 1 }]);
      await this.wait(32);
    }
    await this.touchEnd();
  }

  wait(ms) { return this.page.waitForTimeout(ms); }

  async probe() { return this.page.evaluate(() => window.__DTI__ && window.__DTI__.probe()); }
  async state() {
    return this.page.evaluate(() => ({
      state: window.__DTI__?.state, level: window.__DTI__?.level,
      fps: Math.round(window.__DTI__?.fps() || 0),
      probe: window.__DTI__?.probe?.() ?? null,
    }));
  }

  /** Freeze the game, grab the frame, resume — reliable under software raster. */
  async shot(name, dir) {
    const f = path.join(dir, `${String(this.shots.length).padStart(2, '0')}-${name}.png`);
    fs.mkdirSync(dir, { recursive: true });
    await this.page.evaluate(() => window.__DTI__ && window.__DTI__.pause());
    await this.page.screenshot({ path: f, timeout: 60000, animations: 'disabled' });
    await this.page.evaluate(() => window.__DTI__ && window.__DTI__.resume());
    this.shots.push({ name, file: f });
    return f;
  }

  /** Deterministic filmstrip: pause, then step N frames, capturing each. */
  async strip(name, dir, frames, dt = 1 / 60, every = 1) {
    fs.mkdirSync(dir, { recursive: true });
    await this.page.evaluate(() => window.__DTI__.pause());
    const out = [];
    for (let i = 0; i < frames; i++) {
      await this.page.evaluate(([d, n]) => { for (let k = 0; k < n; k++) window.__DTI__.step(d); }, [dt, every]);
      const f = path.join(dir, `${String(this.shots.length).padStart(2, '0')}-${name}-${i}.png`);
      await this.page.screenshot({ path: f, timeout: 60000 });
      this.shots.push({ name: `${name}-${i}`, file: f });
      out.push(f);
    }
    await this.page.evaluate(() => window.__DTI__.resume());
    return out;
  }

  /** Capture N frames over `ms` — for judging motion, not just poses. */
  async film(name, dir, frames, ms) {
    const out = [];
    for (let i = 0; i < frames; i++) {
      out.push(await this.shot(`${name}-f${i}`, dir));
      await this.wait(ms / frames);
    }
    return out;
  }
}

export async function launch({ device = 'phone', url = '', slow = 0, reducedMotion = false } = {}) {
  const d = DEVICES[device] || DEVICES.phone;
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required', '--font-render-hinting=none',
           '--force-color-profile=srgb', '--disable-lcd-text'],
  });
  const ctx = await browser.newContext({
    viewport: { width: d.width, height: d.height },
    deviceScaleFactor: d.dpr,
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}\n${e.stack || ''}`));
  page.on('requestfailed', r => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' }).catch(() => {});
  if (url) await page.goto(url, { waitUntil: 'load' });
  const s = new Session(page, cdp, d);
  s.errors = errors;
  s.browser = browser;
  s.device = d;
  return s;
}

/** Build a labelled contact sheet from PNGs so a critic can see a whole run at once. */
export async function contactSheet(files, out, { cols = 4, cellW = 300, title = '' } = {}) {
  const browser = await chromium.launch();
  const rows = Math.ceil(files.length / cols);
  const imgs = files.map(f => ({
    src: 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'),
    label: path.basename(f, '.png'),
  }));
  const cellH = Math.round(cellW * 852 / 393) + 22;
  const page = await browser.newPage({
    viewport: { width: cols * cellW + 24, height: rows * cellH + 60 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<style>
    body{margin:0;background:#111;color:#ddd;font:11px ui-monospace,monospace;padding:12px}
    h1{font:600 13px ui-sans-serif;margin:0 0 10px;letter-spacing:.1em;text-transform:uppercase;color:#888}
    .g{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:0}
    .c{width:${cellW}px}
    img{width:${cellW - 6}px;display:block;border:1px solid #222}
    .l{padding:3px 0 6px;color:#7c7;white-space:nowrap;overflow:hidden}
  </style><h1>${title}</h1><div class="g">${
    imgs.map(i => `<div class="c"><img src="${i.src}"><div class="l">${i.label}</div></div>`).join('')
  }</div>`);
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  return out;
}
