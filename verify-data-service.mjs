import assert from 'node:assert/strict';
import {serviceTime,fetchResponse} from './dist/data-service.js';
assert.equal(serviceTime('2026-10-06T18:40:00.000Z'),'2026-10-06T18:40:00Z');
assert.equal(serviceTime('2026-10-07T01:40:00+07:00'),'2026-10-06T18:40:00Z');
const original=globalThis.fetch;
try{
 let calls=0;globalThis.fetch=async()=>new Response('{}',{status:++calls===1?503:200});
 assert.equal((await fetchResponse('https://example.invalid')).status,200);assert.equal(calls,2);
 calls=0;globalThis.fetch=async()=>{calls++;return new Response('bad',{status:400})};
 await assert.rejects(fetchResponse('https://example.invalid'),/HTTP 400/);assert.equal(calls,1);
 const controller=new AbortController();controller.abort();calls=0;
 await assert.rejects(fetchResponse('https://example.invalid',{signal:controller.signal}));assert.equal(calls,0);
 let requestedCache;globalThis.fetch=async(url,options)=>{requestedCache=options.cache;return new Response('{}')};
 await fetchResponse('https://example.invalid/live-frames',{cache:'no-store'});assert.equal(requestedCache,'no-store');
 // Older iPhones (25 Oct 2026): no AbortSignal.any (before iOS 17.4) and no AbortSignal.timeout (before
 // iOS 16). Downloads must still work, time out, and stop when the page cancels them.
 const any=AbortSignal.any,timeout=AbortSignal.timeout;delete AbortSignal.any;delete AbortSignal.timeout;
 try{
  assert.equal(AbortSignal.any,undefined);
  globalThis.fetch=async()=>new Response('{}');
  assert.equal((await fetchResponse('https://example.invalid',{signal:new AbortController().signal})).status,200,'works without AbortSignal.any');
  globalThis.fetch=(url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason)));
  await assert.rejects(fetchResponse('https://example.invalid',{timeout:30,attempts:1}),e=>e.name==='TimeoutError','time limit still applies');
  const page=new AbortController();setTimeout(()=>page.abort(),20);
  await assert.rejects(fetchResponse('https://example.invalid',{signal:page.signal,timeout:5000}));assert(page.signal.aborted,'page cancel still stops the request');
 }finally{AbortSignal.any=any;AbortSignal.timeout=timeout}
}finally{globalThis.fetch=original}
// No browser code may call AbortSignal.any / AbortSignal.timeout directly (they break older iPhones).
import fs from 'node:fs';
for(const f of fs.readdirSync('dist').filter(f=>f.endsWith('.js'))){const t=fs.readFileSync('dist/'+f,'utf8');assert(!/AbortSignal\.any\(/.test(t),f+' uses AbortSignal.any');assert(!/AbortSignal\.timeout\(/.test(t),f+' calls AbortSignal.timeout without a fallback')}
console.log('GIBS timestamps, transient retry, permanent failure, cancellation, fresh metadata requests and old-iPhone signals passed.');
