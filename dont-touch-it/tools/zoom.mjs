// THROWAWAY: crop a region from a list of PNGs, magnify, tile, and report diffs.
// node zoom.mjs out.png x y w h scale file1 file2 ...
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out, X, Y, W, H, S, ...files] = process.argv.slice(2);
const x=+X,y=+Y,w=+W,h=+H,s=+S;
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width: Math.min(files.length,6)*(w*s+6)+12, height: Math.ceil(files.length/6)*(h*s+22)+12}, deviceScaleFactor:1});
const imgs = files.map(f=>({d:'data:image/png;base64,'+fs.readFileSync(f).toString('base64'), n:f.split('/').pop().replace('.png','')}));
await p.setContent(`<style>body{margin:0;background:#111;color:#8f8;font:9px monospace}
.g{display:flex;flex-wrap:wrap;gap:0}.c{width:${w*s}px;margin:2px}
canvas{image-rendering:pixelated;display:block;border:1px solid #333}</style>
<div class="g" id="g"></div><script>
window.done=(async()=>{const list=${JSON.stringify(imgs)};const g=document.getElementById('g');
const res=[];let prev=null;
for(const it of list){const im=new Image();im.src=it.d;await im.decode();
const cv=document.createElement('canvas');cv.width=${w*s};cv.height=${h*s};
const c=cv.getContext('2d');c.imageSmoothingEnabled=false;
c.drawImage(im,${x*2},${y*2},${w*2},${h*2},0,0,${w*s},${h*s});
const d=document.createElement('div');d.className='c';d.appendChild(cv);
const lb=document.createElement('div');lb.textContent=it.n;d.appendChild(lb);g.appendChild(d);
const tmp=document.createElement('canvas');tmp.width=${w*2};tmp.height=${h*2};
const tc=tmp.getContext('2d');tc.drawImage(im,${x*2},${y*2},${w*2},${h*2},0,0,${w*2},${h*2});
const px=tc.getImageData(0,0,${w*2},${h*2}).data;
let diff=0;if(prev){for(let i=0;i<px.length;i+=4)diff+=Math.abs(px[i]-prev[i])+Math.abs(px[i+1]-prev[i+1])+Math.abs(px[i+2]-prev[i+2]);diff/=(px.length/4)*3;}
res.push(it.n+' meanAbsDiffPrev='+diff.toFixed(3));prev=px;}
return res;})();</script>`);
const res = await p.evaluate(()=>window.done);
console.log(res.join('\n'));
await p.screenshot({path:out, fullPage:true});
await b.close();
