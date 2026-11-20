// Link-preview cards (21 Oct 2026, option C: satellite map in the centre with the name over its
// lower edge, so everything survives Facebook's centre-square crop), 1200x630 JPEG, rendered with local Chrome:
//   dist/og/home.jpg and dist/og/<province-slug>.jpg (18). Map: Esri World Imagery + NGD/geoBoundaries outline.
// No live numbers on the card: Facebook and others keep the first image they fetch.
// Run after build-seo.mjs: node build-og.mjs
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {PROVINCES,LAOS} from './worker/seo-provinces.mjs';
import {esriHero} from './worker/seo-pages.mjs';
import {logoSVG} from './worker/brand.mjs';
const out=path.resolve('dist/og');fs.mkdirSync(out,{recursive:true});
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function card({kicker,title,accent,frame,lines,thin}){
 return `<!doctype html><html lang="lo"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Lao:wght@500;700;800&display=swap" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;background:#0f1d30;color:#fff;font-family:'Noto Sans Lao',sans-serif;position:relative;overflow:hidden}
.map{position:absolute;left:300px;width:600px;top:0;bottom:0;overflow:hidden;background:#203048 url('${esriHero(frame)}') center/cover}
.map svg{position:absolute;inset:0;width:100%;height:100%}
.top{position:absolute;left:300px;width:600px;top:26px;display:flex;justify-content:center}
.logo{display:flex;align-items:center;gap:12px;font-size:28px;font-weight:800;background:rgba(8,16,30,.72);padding:8px 18px 8px 8px;border-radius:18px}.logo i{width:50px;height:50px;border-radius:14px;background:#2563eb;color:#fff;display:grid;place-items:center;font-style:normal;font-size:28px}
.bar{position:absolute;left:300px;width:600px;bottom:0;padding:60px 30px 30px;background:linear-gradient(transparent,rgba(8,16,30,.92) 45%);text-align:center}
.k{font-size:24px;color:#cfe0f5;font-weight:500}
.t{font-size:${title.length>14?50:56}px;font-weight:800;line-height:1.15}.a{font-size:38px;font-weight:800;color:#7fb4ff}</style></head><body>
<div class="map"><svg viewBox="0 0 780 600" preserveAspectRatio="xMidYMid slice"><path d="${lines}" fill="rgba(36,164,255,.14)" stroke="#ffe066" stroke-width="${thin?2:4}"/></svg></div>
<div class="top"><div class="logo"><i style="background:none">${logoSVG(50)}</i>ລາວປອດໄພ</div></div>
<div class="bar">${kicker?`<div class="k">${esc(kicker)}</div>`:''}<div class="t">${esc(title)}</div><div class="a">${esc(accent)}</div></div></body></html>`;
}
const jobs=[{file:'home.jpg',html:card({kicker:'',title:'ສະພາບອາກາດລາວ',accent:'ມື້ນີ້ ແລະ 7 ມື້',frame:LAOS.frame,lines:LAOS.lines,thin:true})},
 ...PROVINCES.map(p=>({file:p.slug+'.jpg',html:card({kicker:'ສະພາບອາກາດ ແຂວງ',title:p.name_lo,accent:'ມື້ນີ້ ແລະ 7 ມື້',frame:p.frame,lines:p.outline})}))];
// Minimal Chrome DevTools session (same approach as the other render scripts).
const port=9400+Math.floor(Math.random()*400),profile=path.resolve('.og-chrome-'+Date.now()),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--hide-scrollbars',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let ws;for(let i=0;i<60&&!ws;i++){await sleep(250);try{const p=(await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.type==='page');if(p)ws=new WebSocket(p.webSocketDebuggerUrl)}catch{}}
await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}};
const send=(method,params={})=>new Promise(r=>{const i=++id;pending.set(i,r);ws.send(JSON.stringify({id:i,method,params}))});
try{
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1200,height:630,deviceScaleFactor:1,mobile:false});
 const tmp=path.join(out,'_card.html');
 for(const j of jobs){
  fs.writeFileSync(tmp,j.html);await send('Page.navigate',{url:'file:///'+tmp.replace(/\\/g,'/')});
  // Wait for the font and the satellite image.
  for(let i=0;i<40;i++){await sleep(250);const r=await send('Runtime.evaluate',{expression:"document.fonts.status==='loaded'&&(()=>{const u=getComputedStyle(document.querySelector('.map')).backgroundImage.slice(5,-2);const im=new Image();im.src=u;return im.complete&&im.naturalWidth>0})()",returnByValue:true});if(r.result?.result?.value)break}
  await sleep(300);const shot=await send('Page.captureScreenshot',{format:'jpeg',quality:84});fs.writeFileSync(path.join(out,j.file),Buffer.from(shot.result.data,'base64'));
  console.log(j.file,Math.round(fs.statSync(path.join(out,j.file)).size/1024)+' KB');
 }
 fs.rmSync(tmp,{force:true});
}finally{ws.close();chrome.kill();await sleep(800);try{fs.rmSync(profile,{recursive:true,force:true})}catch{}}
process.exit(0);
