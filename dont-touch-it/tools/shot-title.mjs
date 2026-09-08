import { serve, launch, ROOT } from './harness.mjs';
import path from 'node:path';
const { srv, port } = await serve();
const s = await launch({ device: process.env.DEVICE || 'phone', url: `http://127.0.0.1:${port}/?quality=high` });
await s.wait(+(process.argv[2] || 4500));
await s.page.evaluate(() => window.__DTI__.pause());
await s.page.screenshot({ path: path.join(ROOT, 'shots/title.png'), timeout: 60000 });
if (s.errors.length) console.log('ERRORS:\n' + s.errors.join('\n'));
await s.browser.close(); srv.close(); process.exit(0);
