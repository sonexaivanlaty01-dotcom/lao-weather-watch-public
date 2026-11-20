import assert from 'node:assert/strict';
import {ImageBlobCache} from './dist/image-cache.js';
import {FrameRenderer} from './dist/frame-renderer.js';
const cache=new ImageBlobCache({maxBytes:12,maxEntries:3});let loads=0;
const load=async()=>{loads++;return new Blob(['1234'])};
await Promise.all([cache.get('one',load),cache.get('one',load)]);assert.equal(loads,1);
await cache.get('two',load);await cache.get('three',load);await cache.get('one',load);await cache.get('four',load);
assert(!cache.entries.has('two'));assert(cache.entries.has('one'));assert(cache.bytes<=12);
await assert.rejects(cache.get('failed',async()=>{throw Error('unavailable')}));assert(!cache.entries.has('failed'));await cache.get('failed',load);
cache.remove('failed');assert(!cache.entries.has('failed'));assert(cache.bytes<=12);
const huge=new ImageBlobCache({maxBytes:2});await huge.get('big',load);assert.equal(huge.bytes,0);assert.equal(huge.entries.size,0);
const nativeFetch=globalThis.fetch,nativeBitmap=globalThis.createImageBitmap;let requests=0,closed=0;
try{
 globalThis.fetch=async()=>{requests++;return new Response('pixel',{headers:{'Content-Type':'image/png'}})};
 globalThis.createImageBitmap=async()=>({width:1024,height:512,close(){closed++}});
 const renderer=new FrameRenderer({}),coords=[[100,20],[101,20],[101,19],[100,19]],frames=Array.from({length:31},(_,i)=>({id:'radar',kind:'image',smooth:false,url:'https://cache.test/frame-'+i,coordinates:coords}));
 for(let round=0;round<3;round++)for(const d of frames)await renderer.load(d);
 assert.equal(requests,31);assert.equal(renderer.cache.size,31);assert.equal(closed,0);
 // Evict decoded frames, then recover them from exact cached source bytes.
 renderer.cacheBytes=3*1024*512*4;renderer.trim();assert.equal(renderer.cache.size,3);assert.equal(closed,28);
 await renderer.load(frames[0]);assert.equal(requests,31);
 globalThis.fetch=async()=>{requests++;return new Response('missing',{status:404})};
 const missing={...frames[0],url:'https://cache.test/missing'};await assert.rejects(renderer.load(missing));const count=requests;await assert.rejects(renderer.load(missing));assert.equal(requests,count);
 renderer.failures.clear();await assert.rejects(renderer.load(missing));assert.equal(requests,count+1);
}finally{globalThis.fetch=nativeFetch;globalThis.createImageBitmap=nativeBitmap}
console.log('31 frames replay three times with 31 source loads; exact-URL reuse, byte limits, retries and failed-frame cooldown passed.');
