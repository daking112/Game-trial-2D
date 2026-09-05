// Fast single-frame capture for art iteration.
//   node still.mjs [level] [outfile] [waitMs]
import { serve, launch, ROOT } from './harness.mjs';
import path from 'node:path';
import fs from 'node:fs';

const level = process.argv[2] || '1';
const out = process.argv[3] || path.join(ROOT, 'shots/still.png');
const waitMs = +(process.argv[4] || 3200);
const { srv, port } = await serve();
// Pin the quality tier: this container rasterises on CPU, so the auto
// governor would settle on 'low' and every art review would be looking at
// a fallback image rather than what a phone actually renders.
const q = process.env.QUALITY || 'high';
const s = await launch({ device: process.env.DEVICE || 'phone', url: `http://127.0.0.1:${port}/?level=${level}&quality=${q}${process.env.DEBUG ? '&debug=1' : ''}` });
await s.wait(waitMs);
fs.mkdirSync(path.dirname(out), { recursive: true });
await s.page.evaluate(() => window.__DTI__.pause());
await s.page.screenshot({ path: out, timeout: 60000 });
await s.page.evaluate(() => window.__DTI__.resume());
console.log(JSON.stringify(await s.state()));
console.log('drawMs', await s.page.evaluate(() => +window.__DTI__.game.drawMs.toFixed(2)));
if (s.errors.length) console.log('ERRORS:\n' + s.errors.join('\n'));
console.log('->', out);
await s.browser.close(); srv.close(); process.exit(0);
