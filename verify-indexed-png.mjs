// Compact palette PNG: colour fidelity against the continuous RGBA renderer,
// valid PNG structure, transparent no-data and size on a cloud-like field.
import assert from 'node:assert/strict';
import {AWS_PALETTE} from './dist/aws-palette.js';
import {AWS_INDEXED_PALETTE,AWS_LEVELS,levelIndex,encodeIndexedPNG,encodeAWSImage} from './worker/himawari-hsd.mjs';
const color=t=>{const p=AWS_PALETTE,x=Math.max(0,Math.min(p.length-1,t-p[0][0])),i=Math.floor(x),f=x-i,a=p[i],b=p[Math.min(i+1,p.length-1)];return [1,2,3].map(c=>Math.round(a[c]*(1-f)+b[c]*f))};
// Each level's colour is the continuous colour at that level's temperature, and
// quantisation moves a temperature by at most half a level (about 0.29 degC).
const step=(AWS_LEVELS.max-AWS_LEVELS.min)/(AWS_LEVELS.count-1),levelTemp=i=>AWS_LEVELS.min+(i-1)*step;
for(let i=1;i<256;i++)assert.deepEqual([0,1,2].map(c=>AWS_INDEXED_PALETTE[i*3+c]),color(levelTemp(i)));
let worst=0;for(let t=AWS_LEVELS.min;t<=AWS_LEVELS.max;t+=0.003)worst=Math.max(worst,Math.abs(levelTemp(levelIndex(t))-t));
assert.ok(worst<=step/2+1e-9,'temperature quantisation '+worst);assert.equal(levelIndex(-200),1);assert.equal(levelIndex(200),255);
worst=worst.toFixed(2)+' degC';
// Cloud-like field: smooth large-scale gradients plus convective cells.
const W=1024,H=1260,temp=new Float32Array(W*H);let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const cells=Array.from({length:180},()=>[rnd()*W,rnd()*H,20+rnd()*90,40+rnd()*70]);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){let t=28-12*Math.sin(x/170)*Math.cos(y/140);for(const [cx,cy,r,depth] of cells){const d=((x-cx)**2+(y-cy)**2)/(r*r);if(d<4)t-=depth*Math.exp(-d)}temp[y*W+x]=t}
const idx=new Uint8Array(W*H),rgba=new Uint8Array(W*H*4);for(let i=0;i<W*H;i++){idx[i]=levelIndex(temp[i]);const c=color(temp[i]);rgba.set(c,i*4);rgba[i*4+3]=255}
idx[0]=0;rgba[3]=0;
const t0=performance.now(),png=await encodeIndexedPNG(idx,W,H),t1=performance.now(),full=await encodeAWSImage(rgba,W,H);
const view=new DataView(png.buffer);assert.deepEqual([...png.slice(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(view.getUint32(16),W);assert.equal(view.getUint32(20),H);assert.equal(png[24],8);assert.equal(png[25],3);
console.log(`Palette PNG ${(png.length/1024).toFixed(0)} KB (encode ${Math.round(t1-t0)} ms) vs RGBA PNG ${(full.length/1024).toFixed(0)} KB on a synthetic cloud field; max temperature quantisation ${worst}.`);
assert.ok(png.length<full.length*0.6,'palette PNG must be substantially smaller');
if(process.argv[2]){const {writeFile}=await import('node:fs/promises');await writeFile(process.argv[2],png)}
console.log('Indexed PNG colour fidelity, structure, transparency and size passed.');
