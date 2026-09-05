import { serve, launch } from './harness.mjs';
const { srv, port } = await serve();
const s = await launch({ url: `http://127.0.0.1:${port}/?level=1&debug=1` });
await s.wait(4000);
console.log('errors:', s.errors.slice(0,5));
console.log('state', await s.page.evaluate(() => ({ st: window.__DTI__?.state, lv: window.__DTI__?.level, fps: window.__DTI__?.fps(), draw: window.__DTI__?.game.drawMs })).catch(e=>e.message));
await s.browser.close(); srv.close(); process.exit(0);
