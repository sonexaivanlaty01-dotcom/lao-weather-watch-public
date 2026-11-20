import assert from 'node:assert/strict';
import {parseFrames,radarRoute} from './worker/radar.mjs';
assert.equal(parseFrames('thailand','background.png "2026-10-06 02:15" overlay=zr/23.png')[0].time,Date.parse('2026-10-06T02:15:00Z')/1000);
assert.equal(parseFrames('vietnam','tentimesett[0] = "202610061940";')[0].time,Date.parse('2026-10-06T19:40:00Z')/1000);
assert.equal(parseFrames('china','data-img="https://evil.example/x.PNG"').length,0);
assert.equal(parseFrames('china','data-img="https://image.nmc.cn/product/2026/10/06/RDCP/medium/TEST_20261006194000000.PNG?v=1"')[0].time,Date.parse('2026-10-06T19:40:00Z')/1000);
for(const p of ['/api/radar/unknown','/api/radar/china/image?path=https://evil.example','/api/radar/vietnam/image/evil','/api/radar/thailand/image/99/extra']){
 const r=await radarRoute(new Request('https://site.example'+p));assert.ok([400,404].includes(r.status));
}
if(process.argv.includes('--live')){
 for(const provider of ['thailand','vietnam','china']){
  const r=await radarRoute(new Request('https://site.example/api/radar/'+provider));assert.equal(r.status,200,provider+' metadata');const data=await r.json();assert.ok(data.frames.length>1);assert.ok(data.frames.every(f=>Number.isFinite(f.time)));
  const image=await radarRoute(new Request('https://site.example'+data.frames.at(-1).url));assert.equal(image.status,200,provider+' image');assert.equal(image.headers.get('content-type'),'image/png');const bytes=new Uint8Array(await image.arrayBuffer());assert.ok(bytes.length>1000);console.log(provider,data.frames.length,'frames',new Date(data.frames.at(-1).time*1000).toISOString(),'PNG',bytes.length);
 }
}
console.log('Country radar checks passed');
