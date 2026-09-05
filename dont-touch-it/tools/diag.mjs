// THROWAWAY diagnostics.
import { serve, launch, ROOT } from './harness.mjs';
const { srv, port } = await serve();
const q = process.env.QUALITY || 'high';
const s = await launch({ url: `http://127.0.0.1:${port}/?quality=${q}` });
const W = s.device.width, H = s.device.height;
await s.wait(1200); await s.tap(W/2, H*0.55); await s.wait(3500);
const mode = process.argv[2];

if (mode === 'l3nan') {
  await s.goto(2); await s.wait(2500);
  const c = await s.page.evaluate(()=>{const b=window.__DTI__.game.level.blobs[0];return {x:b.cx,y:b.cy,r:b.r};});
  for (let k=0;k<10;k++){
    await s.tap(c.x,c.y,120); await s.wait(150);
    await s.pinch(c.x,c.y,c.r*2.0,c.r*0.18,1100);
    await s.wait(600);
    const st = await s.page.evaluate(()=>{
      const l=window.__DTI__.game.level;
      const bad = l.world.points.filter(p=>!isFinite(p.x)||!isFinite(p.y)).length;
      return { splits:l.splits, bursts:l.bursts, blobs:l.blobs.length,
        badPts:bad, pts:l.world.points.length,
        blobState:l.blobs.map(b=>({cx:+b.cx, cy:+b.cy, r:+b.r, comp:+b.comp, area:b.area? +b.area.rest:null,
          nanCx:!isFinite(b.cx), nanR:!isFinite(b.r)})),
        solved:l.solved };
    });
    console.log(k, JSON.stringify(st).slice(0,600));
    if (st.badPts || st.blobState.some(b=>b.nanCx||b.nanR)) { console.log('*** NaN APPEARED at iteration', k); break; }
    if (st.solved) break;
  }
  console.log('ERRS', s.errors.filter(e=>!/vibrate/.test(e)).slice(0,3).map(e=>e.split('\n')[0]));
}

if (mode === 'l1btn') {
  // A: finger already down when the switch is exposed
  await s.goto(1); await s.wait(2000);
  await s.page.evaluate(()=>{ const l=window.__DTI__.game.level;
    for(const sc of l.screws){ sc.turned=sc.target; }
  });
  await s.wait(300);
  await s.page.evaluate(()=>{ const l=window.__DTI__.game.level;
    for(const sc of l.screws) if(!sc.free) l._freeScrew(sc,null);
  });
  await s.wait(1500);
  const b = await s.page.evaluate(()=>{const l=window.__DTI__.game.level,g=l.g;
    return {x:g.cx, y:g.btnBaseY-g.bezelH-g.collarH-g.travel-g.capBulge*0.5};});
  // lift the jar off and drop it while KEEPING a finger down afterwards
  const j = await s.page.evaluate(()=>{const g=window.__DTI__.game.level.g;return {x:g.cx,y:g.jarBaseY-g.jarStraight*0.6};});
  await s.touchStart([{x:j.x,y:j.y}]);
  for(let i=1;i<=34;i++){ await s.touchMove([{x:j.x,y:j.y-i*7}]); await s.wait(16); }
  await s.touchEnd(); await s.wait(2600);
  console.log('phaseA', JSON.stringify(await s.probe()));
  // now: put the finger down BEFORE expose completes is hard to time; instead
  // directly test: press down, then force expose, then keep holding.
  await s.page.evaluate(()=>{ const l=window.__DTI__.game.level; l.exposed=false; l.phase='jarfall'; });
  await s.touchStart([{x:b.x,y:b.y}]);
  await s.wait(200);
  await s.page.evaluate(()=>{ const l=window.__DTI__.game.level; l.exposed=true; l.phase='button'; });
  for(let t=0;t<3000;t+=32){ await s.touchMove([{x:b.x,y:b.y}]); await s.wait(32); }
  console.log('A held-through-expose:', JSON.stringify(await s.probe()));
  await s.touchEnd(); await s.wait(400);
  // B: fresh press
  await s.touchStart([{x:b.x,y:b.y}]);
  for(let t=0;t<2600;t+=32){ await s.touchMove([{x:b.x,y:b.y}]); await s.wait(32); }
  console.log('B fresh press:', JSON.stringify(await s.probe()));
  await s.touchEnd(); await s.wait(1200);
  console.log('after:', JSON.stringify(await s.probe()));
  // C: land off-cap then slide onto it
  await s.page.evaluate(()=>{const l=window.__DTI__.game.level; l.btn.press=0;l.btn.target=0;l.btn.committed=false;l.btn.pressed=false;l.btn.down=false;l.btn.resist=0;});
  await s.touchStart([{x:b.x, y:b.y+120}]);
  for(let i=1;i<=20;i++){ await s.touchMove([{x:b.x,y:b.y+120-i*6}]); await s.wait(20); }
  for(let t=0;t<2600;t+=32){ await s.touchMove([{x:b.x,y:b.y}]); await s.wait(32); }
  console.log('C slide-on:', JSON.stringify(await s.probe()));
  await s.touchEnd();
}

if (mode === 'perf') {
  const count = await s.page.evaluate(()=>window.__DTI__.game.levelClasses.length);
  for (const qq of ['high','medium','low']) {
    await s.page.evaluate(x=>{window.__DTI__.quality(x); window.__DTI__.game.gov.locked=true;}, qq);
    for (let i=1;i<=count;i++){
      await s.goto(i);
      await s.page.evaluate(()=>{window.__DTI__.game.drawMs=0;});
      await s.wait(2500);
      const ms = await s.page.evaluate(()=>+window.__DTI__.game.drawMs.toFixed(2));
      console.log(qq, 'ch'+i, ms);
    }
  }
}

if (mode === 'ring') {
  await s.goto(1); await s.wait(2500);
  const dir = ROOT + '/shots/c2/ring';
  await s.page.evaluate(()=>{window.__DTI__.game.cam.trauma=0;});
  await s.shot('ring0', dir);
  await s.page.evaluate(()=>{window.__DTI__.game.level.jar.ringT=1; window.__DTI__.game.cam.trauma=0;});
  await s.shot('ring1', dir);
  await s.page.evaluate(()=>{window.__DTI__.game.level.jar.ringT=0;window.__DTI__.game.level.flinch.fire();window.__DTI__.game.cam.trauma=0;});
  await s.wait(60);
  await s.shot('flinch', dir);
}

await s.browser.close(); srv.close(); process.exit(0);
