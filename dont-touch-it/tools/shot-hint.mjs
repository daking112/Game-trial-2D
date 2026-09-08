// The conservator's note — the hint — at native scale, where it has to work.
import { serve, launch, ROOT } from './harness.mjs';
import path from 'node:path';
const { srv, port } = await serve();
const lvl = process.argv[2] || '3';
const s = await launch({ device: process.env.DEVICE || 'phone', url: `http://127.0.0.1:${port}/?level=${lvl}&quality=high` });
await s.wait(2600);
// sit still until the idle hint arrives
for (let i = 0; i < 40; i++) {
  await s.wait(1000);
  const n = await s.page.evaluate(() => window.__DTI__.game.set._noteText || null);
  if (n) { console.log('note:', JSON.stringify(n)); break; }
}
await s.page.evaluate(() => window.__DTI__.pause());
await s.page.screenshot({ path: path.join(ROOT, 'shots/hint.png'), timeout: 60000 });
if (s.errors.length) console.log('ERRORS:\n' + s.errors.join('\n'));
await s.browser.close(); srv.close(); process.exit(0);
