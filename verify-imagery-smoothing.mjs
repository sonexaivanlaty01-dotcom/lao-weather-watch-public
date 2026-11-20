import assert from 'node:assert/strict';
import {softenRGBA,smoothingSize,resampleRGBA} from './dist/imagery-smoothing.js';
const w=32,h=16,pixels=new Uint8ClampedArray(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;pixels[i]=x<16?0:255;pixels[i+3]=255}
const soft=softenRGBA(pixels,w,h,2);
const row=Array.from({length:w},(_,x)=>soft[(8*w+x)*4]);assert(row[14]>0&&row[14]<128);assert(row[17]>128&&row[17]<255);assert(row.every((v,i)=>!i||v>=row[i-1]));assert.equal(row[0],0);assert.equal(row.at(-1),255);assert(Array.from({length:w*h},(_,i)=>soft[i*4+3]).every(a=>a===255));
const transparent=new Uint8ClampedArray(4*9);transparent.set([255,0,0,255],4*4);const filtered=softenRGBA(transparent,9,1,1);assert(filtered[4*3]>240);assert.equal(filtered[4*3+1],0);const masked=softenRGBA(transparent,9,1,1,{preserveGaps:true});assert.equal(masked[4*3+3],0);
assert(softenRGBA(new Uint8ClampedArray(64),4,4,2).every(v=>v===0));assert.throws(()=>softenRGBA(new Uint8ClampedArray(5),2,2));assert.equal(pixels[(8*w+15)*4],0);
const size=smoothingSize(1024,640,120);assert(size.width<40&&size.height<30);assert(size.radius<=3);console.log('Display filtering removes stair-step edges, preserves monotonic colours, transparent colour and calculated unknown areas; source pixels remain unchanged.');
const enlarged=resampleRGBA(pixels,w,h,256,128);
const edge=Array.from({length:256},(_,x)=>enlarged[(64*256+x)*4]);
assert(edge.every((v,i)=>!i||v>=edge[i-1]));assert.equal(edge[100],0);assert.equal(edge[150],255);assert(edge.slice(120,136).some(v=>v>0&&v<255));
assert(Array.from({length:256*128},(_,i)=>enlarged[i*4+3]).every(a=>a===255));
assert.deepEqual(resampleRGBA(pixels,w,h,w,h),pixels);
const coloured=resampleRGBA(transparent,9,1,72,8);for(let i=0;i<coloured.length;i+=4)if(coloured[i+3]){assert.equal(coloured[i],255);assert.equal(coloured[i+1],0)}
assert(resampleRGBA(new Uint8ClampedArray(64),4,4,64,64).every(v=>v===0));
const crop=resampleRGBA(pixels,w,h,64,32,{crop:[12,6,8,4]});assert.equal(crop[0],0);assert.equal(crop[63*4],255);
// Adjacent viewports sample the same source coordinates at their shared edge.
const whole=resampleRGBA(pixels,w,h,128,64),half=resampleRGBA(pixels,w,h,64,64,{crop:[16,0,16,16]});
for(let y=0;y<64;y++)assert.deepEqual(whole.slice((y*128+64)*4,(y*128+128)*4),half.slice(y*64*4,(y+1)*64*4));
console.log('Radar cubic enlargement preserves colour plateaus, monotonic edges, transparent colours and consistent neighbouring viewports.');
