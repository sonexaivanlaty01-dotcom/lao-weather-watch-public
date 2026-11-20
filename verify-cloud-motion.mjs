import assert from 'node:assert/strict';
import {cloudFutureSlots,validCloudTimes,estimateCloudFlow,completeCloudFlow,cloudFlowAt,advectCloudImage,fadeCloudEdges} from './dist/cloud-motion-math.js';
import {cloudMotionURL,buildCloudNowcast} from './dist/cloud-nowcast.js';
const step=600000,now=Date.UTC(2026,9,7,6,21),base=Date.UTC(2026,9,7,6,10);
// 10-minute steps for the first hour after now, then 20-minute steps to 3 hours; at most 4 h from the image.
const slots=cloudFutureSlots(base,now);assert.equal(slots.length,12);assert(slots.every(s=>s.time>now&&s.lead<=24));assert.equal(slots[1].time-slots[0].time,step);assert.equal(slots[7].time-slots[6].time,2*step);
assert.deepEqual(slots.map(s=>s.far),[...Array(6).fill(false),...Array(6).fill(true)],'frames beyond the first hour are marked as a trend');assert(slots.at(-1).time-now<=3*3600000);
assert.equal(cloudFutureSlots(now-4.5*3600000,now).length,0);assert(cloudFutureSlots(now-3*3600000,now).length<12);assert.equal(cloudFutureSlots(now+step,now).length,0);
assert(validCloudTimes([base-2*step,base-step,base]));assert(!validCloudTimes([base-3*step,base-step,base]));
await assert.rejects(buildCloudNowcast([base,base],{now}),/history/);await assert.rejects(buildCloudNowcast([base-4*3600000-2*step,base-4*3600000-step,base-4*3600000],{now}),/stale/);
const url=new URL(cloudMotionURL(base));assert.equal(url.hostname,'gibs.earthdata.nasa.gov');assert.equal(url.searchParams.get('WIDTH'),'512');assert.equal(url.searchParams.get('SRS'),'EPSG:3857');assert(!url.searchParams.get('TIME').includes('.000'));assert.equal(url.searchParams.get('LAYERS'),'Himawari_AHI_Band13_Clean_Infrared');
const n=96,texture=(x,y)=>128+50*Math.sin(x*.37+y*.11)+40*Math.cos(y*.41-x*.07)+20*Math.sin(x*.27-y*.29);
const images=[0,1,2].map(t=>Float32Array.from({length:n*n},(_,i)=>texture(i%n-2*t,Math.floor(i/n)-t)));
const flow=estimateCloudFlow(images,n,{spacing:12,radius:6,search:4}),v=cloudFlowAt(flow,48,48);assert(flow.valid>12);assert(v);assert(Math.abs(v.dx-2)<.2);assert(Math.abs(v.dy-1)<.2);
const empty=estimateCloudFlow([new Float32Array(n*n),new Float32Array(n*n),new Float32Array(n*n)],n);assert.equal(empty.valid,0);assert.equal(cloudFlowAt(empty,48,48),null);
const fixed={size:n,start:10,spacing:10,cols:8,nodes:Array.from({length:64},()=>({dx:2,dy:1}))},rgba=new Uint8ClampedArray(n*n*4);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const p=(y*n+x)*4;rgba[p]=x;rgba[p+1]=y;rgba[p+2]=100;rgba[p+3]=255}
const moved=advectCloudImage(rgba,n,fixed,3),p=(48*n+48)*4;assert.equal(moved[p],42);assert.equal(moved[p+1],45);assert.equal(moved[p+3],255);assert.equal(moved[3],0);assert.throws(()=>advectCloudImage(rgba,n,fixed,25),/invalid_lead/);assert.equal(advectCloudImage(rgba,n,fixed,18).length,rgba.length);
const before=new Uint8ClampedArray(moved),faded=fadeCloudEdges(moved,n);for(let i=0;i<moved.length;i++){if(i%4!==3)assert.equal(faded[i],before[i]);else assert(faded[i]<=before[i])}assert.equal(faded[p+3],255);assert.equal(faded[3],0);
// Unmatched nodes take nearby matched motion (bounded distance); isolated outliers are dropped.
const holes={size:n,start:10,spacing:10,cols:8,nodes:Array.from({length:64},(_,i)=>i%8<3?{dx:2,dy:1}:null)};holes.nodes[9]={dx:-9,dy:7};
const done=completeCloudFlow(holes,{maxSteps:6});assert.equal(done.valid,23);assert(done.nodes.every(Boolean));assert(done.nodes.every(v=>Math.abs(v.dx-2)<1e-9&&Math.abs(v.dy-1)<1e-9));
const near=completeCloudFlow(holes,{maxSteps:2});assert.equal(near.nodes.filter(Boolean).length,40);assert.equal(near.nodes[7],null);
assert.equal(completeCloudFlow(empty).nodes.filter(Boolean).length,0);
const edge=cloudFlowAt(done,0,0);assert(edge&&Math.abs(edge.dx-2)<1e-9);
console.log('Recovered known cloud-image motion; future-only 10-minute slots, stale/gap rejection, unknown-area masking, Mercator requests and displacement bounds passed. No meteorological accuracy claim.');
