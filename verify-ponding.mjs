import assert from 'node:assert/strict';
import {demPlan,assembleDEM,simulatePonding,pondingRaster,TERRARIUM} from './dist/ponding.js';
import {imergRate,imergDayTimes,imergFrameURL,accumulate,accumulationAt,accumulationRaster,ACCUM_REGION} from './dist/imerg-accumulation.js';
import {IMERG_PALETTE} from './dist/imerg-palette.js';
// DEM window: ~10 km square around the place, whole terrarium tiles, Mercator corners.
const plan=demPlan(102.63,17.97);assert(plan.cell>35&&plan.cell<38);assert(Math.abs(plan.width*plan.cell-10000)<80);assert.equal(plan.width,plan.height);
assert(plan.tiles.length>=1&&plan.tiles.length<=9);assert(plan.tiles.every(t=>t.url.startsWith(TERRARIUM+'/12/')));
const [w,s,e,n]=plan.bounds;assert(w<102.63&&e>102.63&&s<17.97&&n>17.97);assert.throws(()=>demPlan(NaN,1));
// Terrarium decode: R*256+G+B/256-32768.
const tiles=new Map(plan.tiles.map(t=>{const rgba=new Uint8ClampedArray(256*256*4);for(let i=0;i<rgba.length;i+=4){rgba[i]=128;rgba[i+1]=170;rgba[i+2]=128;rgba[i+3]=255}return [t.x+'/'+t.y,rgba]}));
const flat=assembleDEM(plan,tiles);assert.equal(flat.length,plan.width*plan.height);assert.equal(flat[0],170.5);
// Synthetic terrain: tilted plane draining east, with a 3 m bowl upstream of a small 1 m bowl.
const W=60,H=40,cell=30,elev=new Float32Array(W*H);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){let z=100-x*.05;const d1=Math.hypot(x-15,y-20),d2=Math.hypot(x-40,y-20);if(d1<6)z-=3*(1-d1/6);if(d2<4)z-=1*(1-d2/4);elev[y*W+x]=z}
const none=simulatePonding(elev,W,H,cell,{rainMm:0});assert.equal(none.stats.stored,0);assert.equal(none.ponds.length,0);
const small=simulatePonding(elev,W,H,cell,{rainMm:20,runoff:.5}),big=simulatePonding(elev,W,H,cell,{rainMm:200,runoff:.5});
for(const r of [small,big]){
 // Mass balance: everything generated is either stored or leaves through the window edge.
 let out=0;for(let i=0;i<W*H;i++){const x=i%W,y=(i-x)/W;if(x===0||y===0||x===W-1||y===H-1){/* edge cells drain out */}}
 const exits=[...Array(W*H).keys()].filter(i=>{const x=i%W,y=(i-x)/W;return x===0||y===0||x===W-1||y===H-1});
 // Edge cells are tree roots: their accumulated water is what leaves the window.
 out=exits.reduce((s,i)=>s+r.water[i],0);
 assert(Math.abs(r.stats.generated-r.stats.stored-out)<r.stats.generated*1e-6);
 assert(r.depth.every(v=>v>=0&&v<=3.0001));
}
assert(big.stats.stored>small.stats.stored);assert(big.ponds.length>=1);assert(big.depth[20*W+15]>small.depth[20*W+15]);
// The upstream bowl fills first; with heavy rain both bowls hold water and the downstream one is full.
assert(small.depth[20*W+15]>0);assert(big.ponds.some(p=>p.full));
assert.throws(()=>simulatePonding(elev,W,H,cell,{rainMm:-1}));assert.throws(()=>simulatePonding(elev,W,H,cell,{rainMm:10,runoff:0}));
// A one-cell pit is DEM noise: it stores nothing; water passes on.
const pit=Float32Array.from({length:W*H},(_,i)=>100-(i%W)*.05);pit[20*W+30]-=5;const noisy=simulatePonding(pit,W,H,cell,{rainMm:100,smooth:false});assert.equal(noisy.stats.stored,0);assert.equal(noisy.ponds.length,0);
const raster=pondingRaster(big);assert.equal(raster.length,W*H*4);assert(raster[(20*W+15)*4+3]>0);
// IMERG: colour → mm/h class, 24-hour sums, missing half-hours counted (not filled).
const [r,g,b,low,high]=IMERG_PALETTE[50];assert(Math.abs(imergRate(r,g,b,255)-Math.sqrt(low*high))<1e-9);assert.equal(imergRate(0,0,0,0),0);assert.equal(imergRate(1,2,3,255),null);
const day=imergDayTimes('2026-10-08T00:00:00Z/2026-10-09T07:30:00Z/PT30M');assert.equal(day.times.length,48);assert.equal(day.latest,Date.parse('2026-10-09T07:30:00Z'));assert.equal(day.first,Date.parse('2026-10-08T08:00:00Z'));
assert.equal(imergDayTimes('2026-10-09T00:00:00Z/2026-10-09T07:30:00Z/PT30M').times.length,16);assert.throws(()=>imergDayTimes(''));
const url=new URL(imergFrameURL(day.latest));assert.equal(url.hostname,'gibs.earthdata.nasa.gov');assert.equal(url.searchParams.get('SRS'),'EPSG:4326');assert.equal(url.searchParams.get('TIME'),'2026-10-09T07:30:00Z');
const px=ACCUM_REGION.width*ACCUM_REGION.height,frame=new Uint8ClampedArray(px*4);for(let i=0;i<px;i++){frame.set([r,g,b,255],i*4)}
const acc=accumulate([frame,frame,null,frame]);assert.equal(acc.loaded,3);assert.equal(acc.complete,false);assert(Math.abs(acc.mm[0]-3*.5*Math.sqrt(low*high))<1e-4);
assert(Math.abs(accumulationAt(acc,102.6,18)-acc.mm[0])<1e-6);assert.equal(accumulationAt(acc,50,18),null);assert.equal(accumulationRaster(acc).length,px*4);
console.log('Ponding: DEM window/tiles, terrarium decode, fill-and-spill mass balance, depth bounds and display; IMERG 24 h colour decoding, half-hour coverage and point lookup passed. Screening only.');
