// THROWAWAY: look at the Chapter III mirror properly.
import { serve, launch, ROOT } from './harness.mjs';
import path from 'node:path'; import fs from 'node:fs';
const { srv, port } = await serve();
const s = await launch({ url: `http://127.0.0.1:${port}/?quality=high` });
const W=s.device.width,H=s.device.height;
const dir = ROOT+'/shots/c2/mir'; fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true});
await s.wait(1200); await s.tap(W/2,H*0.55); await s.wait(3500);
await s.goto(3); await s.wait(2500);
const c = await s.page.evaluate(()=>{const P=window.__DTI__.game.level.g.panes[0];return {x:P.cx,y:(P.y0+P.y1)/2,w:P.w,h:P.h};});
// break ONLY the front pane
for (let k=0;k<10;k++){
  const st = await s.probe(); if (st.paneBroken) break;
  await s.press(c.x,c.y,1200); await s.wait(250);
  await s.twoFingerHold(c.x-c.w*0.28,c.y,c.x+c.w*0.28,c.y,2600); await s.wait(500);
}
console.log('front broken', JSON.stringify(await s.probe()).slice(0,240));
for (let i=0;i<8;i++){ await s.wait(900); await s.shot('reveal'+i, dir); }
console.log('after reveal', JSON.stringify(await s.probe()).slice(0,240));
// now touch the mirror and hold, and film it
const M = await s.page.evaluate(()=>{const P=window.__DTI__.game.level.g.panes[1];return {x:P.cx,y:(P.y0+P.y1)/2,w:P.w,h:P.h};});
await s.touchStart([{x:M.x-30,y:M.y}]);
for(let i=0;i<12;i++){ await s.touchMove([{x:M.x-30,y:M.y}]); await s.wait(60); await s.shot('touch'+i, dir); }
await s.touchEnd();
console.log('mirror', JSON.stringify(await s.probe()).slice(0,300));
console.log('ERRS', s.errors.filter(e=>!/vibrate/.test(e)).slice(0,3));
await s.browser.close(); srv.close(); process.exit(0);
