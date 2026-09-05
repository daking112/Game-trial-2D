// THROWAWAY critic rig — drives real touch AND advances the game together.
import { serve, launch, ROOT, contactSheet } from './harness.mjs';
import path from 'node:path'; import fs from 'node:fs';

const which = process.argv[2] || '1';
const OUT = path.join(ROOT, 'shots/c2', 'ch' + which);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const { srv, port } = await serve();
const q = process.env.QUALITY || 'high';
const s = await launch({ url: `http://127.0.0.1:${port}/?quality=${q}` });
const W = s.device.width, H = s.device.height;
const files = [];
let n = 0;
const shot = async (name) => {
  const f = path.join(OUT, `${String(n++).padStart(2,'0')}-${name}.png`);
  await s.page.evaluate(() => window.__DTI__.pause());
  await s.page.screenshot({ path: f, timeout: 60000 });
  await s.page.evaluate(() => window.__DTI__.resume());
  files.push(f); return f;
};
const P = () => s.probe();
const draw = () => s.page.evaluate(() => +window.__DTI__.game.drawMs.toFixed(2));
const log = async (tag) => console.log(tag, JSON.stringify(await P()), 'draw', await draw());

// hold at (x,y) for `ms` of GAME time, capturing `caps` frames spread across it
async function holdFilm(x, y, ms, caps, name) {
  await s.touchStart([{ x, y }]);
  const step = 30, iters = Math.round(ms / step);
  const every = Math.max(1, Math.floor(iters / caps));
  for (let i = 0; i < iters; i++) {
    await s.touchMove([{ x, y }]);
    await s.wait(step);
    if (i % every === 0 && files.length < 400) await shot(`${name}-${i}`);
  }
  await s.touchEnd();
}
async function circleFilm(cx, cy, r, turns, ms, caps, name, dir = -1) {
  const steps = Math.round(ms / 22);
  const every = Math.max(1, Math.floor(steps / caps));
  await s.touchStart([{ x: cx + r, y: cy }]);
  for (let i = 1; i <= steps; i++) {
    const a = turns * Math.PI * 2 * dir * (i / steps);
    await s.touchMove([{ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }]);
    await s.wait(22);
    if (i % every === 0) await shot(`${name}-${i}`);
  }
  await s.touchEnd(); await s.wait(60);
}
async function dragFilm(x0, y0, x1, y1, ms, caps, name, release = true) {
  const steps = Math.round(ms / 24);
  const every = Math.max(1, Math.floor(steps / caps));
  await s.touchStart([{ x: x0, y: y0 }]);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await s.touchMove([{ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t }]);
    await s.wait(24);
    if (i % every === 0) await shot(`${name}-${i}`);
  }
  if (release) await s.touchEnd();
}
async function pinchFilm(cx, cy, from, to, ms, caps, name) {
  const steps = Math.round(ms / 24);
  const every = Math.max(1, Math.floor(steps / caps));
  const mk = d => ([{ x: cx - d/2, y: cy, id: 0 }, { x: cx + d/2, y: cy, id: 1 }]);
  await s.touchStart(mk(from));
  for (let i = 1; i <= steps; i++) {
    await s.touchMove(mk(from + (to - from) * (i / steps)));
    await s.wait(24);
    if (i % every === 0) await shot(`${name}-${i}`);
  }
  await s.touchEnd();
}
async function twoFilm(x0,y0,x1,y1,ms,caps,name){
  await s.touchStart([{x:x0,y:y0,id:0},{x:x1,y:y1,id:1}]);
  const step=30, iters=Math.round(ms/step), every=Math.max(1,Math.floor(iters/caps));
  for(let i=0;i<iters;i++){
    await s.touchMove([{x:x0,y:y0,id:0},{x:x1,y:y1,id:1}]);
    await s.wait(step);
    if(i%every===0) await shot(`${name}-${i}`);
  }
  await s.touchEnd();
}
async function settle(ms, caps, name) {
  const step = ms / caps;
  for (let i = 0; i < caps; i++) { await s.wait(step); await shot(`${name}-${i}`); }
}

await s.wait(1200);
await shot('title');
await s.tap(W/2, H*0.55);
await s.wait(3500);

const scripts = {
'1': async () => {
  await s.goto(1); await s.wait(2500);
  await shot('idle');
  console.log('drawMs idle', await draw());
  // tap the glass — capture the flinch
  await s.touchStart([{x: W/2, y: H*0.45}]); await s.wait(40); await s.touchEnd();
  for (let i=0;i<6;i++){ await s.wait(60); await shot(`glasstap-${i}`); }
  const screws = await s.page.evaluate(() => window.__DTI__.game.level.screws.map(x=>({x:x.x,y:x.y,r:x.r})));
  console.log('screws', JSON.stringify(screws));
  // FIRST screw: film the turning
  await circleFilm(screws[0].x, screws[0].y, Math.max(30, screws[0].r*3.4), 1.4, 900, 8, 'screwturn');
  await log('after 1 circle');
  for (let a=0;a<12 && (await P()).freed<1;a++)
    await s.circle(screws[0].x, screws[0].y, Math.max(30, screws[0].r*3.4), 1.4, 700, -1);
  await settle(900, 4, 'screwpop');
  // screws 2,3 fast
  for (let i=1;i<3;i++)
    for (let a=0;a<12 && (await P()).freed<=i;a++)
      await s.circle(screws[i].x, screws[i].y, Math.max(30,screws[i].r*3.4), 1.4, 700, -1);
  await log('3 freed'); await shot('three-out');
  // the SHEAR: haul on the jar
  const j = await s.page.evaluate(() => { const g=window.__DTI__.game.level.g; return {x:g.cx, y:g.jarBaseY-g.jarStraight*0.6}; });
  await dragFilm(j.x, j.y, j.x, j.y-260, 1600, 10, 'shear', false);
  await shot('shear-peak');
  await s.touchEnd();
  await settle(1400, 6, 'shear-after');
  await log('after shear');
  // lift and DROP the jar
  const st = await P();
  if (!st.jarGone) {
    await dragFilm(j.x, j.y, j.x, j.y-300, 900, 6, 'lift');
    await settle(2200, 8, 'drop');
  }
  await log('jar down');
  // the button, held
  const b = await s.page.evaluate(()=>{const l=window.__DTI__.game.level,g=l.g;return {x:g.cx,y:g.btnBaseY-g.bezelH-g.collarH-g.capBulge*0.5};});
  await shot('button-exposed');
  await holdFilm(b.x, b.y, 2600, 12, 'btn');
  await settle(3000, 8, 'aftermath');
  await log('end');
},
'2': async () => {
  await s.goto(2); await s.wait(2500);
  await shot('idle'); console.log('drawMs idle', await draw());
  const c = await s.page.evaluate(()=>{const l=window.__DTI__.game.level;const b=l.blobs?l.blobs[0]:null;const g=l.g||{};return {x:(b&&b.cx)||g.cx,y:(b&&b.cy)||g.cy,r:(b&&b.r)||g.R};});
  console.log('blob',JSON.stringify(c));
  // poke
  await holdFilm(c.x, c.y, 900, 6, 'poke');
  await settle(800, 4, 'poke-rebound');
  await log('after poke');
  // slow squeeze
  await pinchFilm(c.x, c.y, c.r*2.0, c.r*0.18, 1600, 10, 'squeeze');
  await settle(900, 4, 'squeeze-rel');
  await log('after squeeze1');
  for (let k=0;k<14 && !(await P()).solved;k++){
    await s.tap(c.x,c.y,120); await s.wait(150);
    await pinchFilm(c.x,c.y,c.r*2.0,c.r*0.18,1100,3,`sq${k}`);
    await s.wait(400);
  }
  await settle(2200, 8, 'divide');
  await log('end');
},
'3': async () => {
  await s.goto(3); await s.wait(2500);
  await shot('idle'); console.log('drawMs idle', await draw());
  const c = await s.page.evaluate(()=>{const P=window.__DTI__.game.level.g.panes[0];return {x:P.cx,y:(P.y0+P.y1)/2,w:P.w,h:P.h};});
  console.log('pane',JSON.stringify(c));
  await holdFilm(c.x, c.y, 2000, 12, 'stress');
  await settle(900, 4, 'stress-rel');
  await log('after stress');
  for (let k=0;k<12 && !(await P()).solved;k++){
    await s.press(c.x,c.y,1200); await s.wait(250);
    await twoFilm(c.x-c.w*0.28,c.y,c.x+c.w*0.28,c.y,2600,6,`two${k}`);
    await s.wait(500);
  }
  await settle(3000, 10, 'break');
  await log('after break');
  // probe the mirror behind
  await holdFilm(c.x, c.y, 1200, 5, 'mirror');
  await settle(1500, 5, 'mirror2');
  await log('end');
},
'4': async () => {
  await s.goto(4); await s.wait(2500);
  await shot('idle'); console.log('drawMs idle', await draw());
  const a = await s.page.evaluate(()=>{const l=window.__DTI__.game.level;return {x:l.acorn.x,y:l.acorn.y,bx:l.g.bellX,by:l.g.bellY};});
  console.log('acorn',JSON.stringify(a));
  await dragFilm(a.x,a.y,a.x,a.y+150,900,8,'pull');
  await settle(2600, 8, 'dark');
  await log('dark');
  // finger becomes the torch: sweep with capture
  await dragFilm(W*0.5,H*0.6,W*0.25,H*0.66,900,8,'torch');
  await dragFilm(W*0.25,H*0.66,W*0.78,H*0.6,900,8,'torch2', false);
  await shot('torch-end');
  await s.touchEnd();
  await s.wait(400);
  await holdFilm(a.bx, a.by-12, 1500, 6, 'bell');
  await s.tap(a.bx, a.by-18, 70);
  await settle(3000, 10, 'ring');
  await log('end');
},
};

await scripts[which]();
console.log('ERRORS', s.errors.filter(e=>!/vibrate/.test(e)).slice(0,6));
// sheet skipped
await s.browser.close(); srv.close(); process.exit(0);
