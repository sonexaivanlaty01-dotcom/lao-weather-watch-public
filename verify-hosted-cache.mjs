import assert from 'node:assert/strict';
import {forecastPoints} from './dist/forecast-data.js';
import {readOptionalCache,writeOptionalCache} from './worker/optional-cache.mjs';
const originalFetch=globalThis.fetch,originalCaches=Object.getOwnPropertyDescriptor(globalThis,'caches');
const scenarios=[{get default(){throw new Error('This Worker is not permitted to access the default cache.')}},{default:{async match(){throw new Error('cache denied')},async put(){throw new Error('cache denied')}}},{default:{async match(){return undefined},put(){throw new Error('cache denied')}}}];
const time='20261008095000',key=new Request('https://site.test/api/satellite/jma/times');
try{
 for(let i=0;i<scenarios.length;i++){
  Object.defineProperty(globalThis,'caches',{value:scenarios[i],configurable:true});
  assert.equal(await readOptionalCache(key),null);const pending=[];
  await writeOptionalCache(key,new Response('cache optional'),{waitUntil:p=>pending.push(p)});await Promise.all(pending);
  const worker=(await import('./dist/server/index.js?cache-case='+i)).default;let jmaCalls=0;
  globalThis.fetch=async (url,options)=>{
   assert.equal(options?.cache,undefined,'hosted request cache modes are optional and can be unsupported');
   const u=new URL(url);
   if(u.hostname==='www.jma.go.jp'){jmaCalls++;return u.pathname.endsWith('.json')?Response.json([{basetime:time,validtime:time}]):new Response('jpeg',{headers:{'Content-Type':'image/jpeg'}})}
   if(u.hostname==='hymetnet.gov.vn')return new Response('tentimesett[0] = "202610080950";');
   if(u.hostname==='api.open-meteo.com'){const start=Math.floor(Date.now()/3600000)*3600,times=Array.from({length:12},(_,j)=>start+j*3600);return Response.json(forecastPoints().map(()=>({hourly_units:{precipitation:'mm'},hourly:{time:times,precipitation:times.map(()=>0)}})))}
   throw new Error('Unexpected upstream '+u.hostname);
  };
  const call=path=>worker.fetch(new Request('https://site.test'+path,{headers:{'oai-authenticated-user-id':'owner'}}),{}, {waitUntil:p=>pending.push(p)});
  const first=await call('/api/satellite/jma/times');assert.equal(first.status,200);assert.equal((await first.json())[0].validtime,time);
  assert.equal((await call('/api/satellite/jma/times')).status,200);assert.equal(jmaCalls,1,'process cache still avoids repeated metadata requests');
  assert.equal((await call(`/api/satellite/jma/tile/${time}/${time}/5/25/14`)).status,200);
  assert.equal((await call('/api/radar/vietnam')).status,200);
  assert.equal((await call('/api/forecast/grid')).status,200);
  await Promise.all(pending);
 }
 Object.defineProperty(globalThis,'caches',{value:{default:{async match(){return new Response('cached')},async put(){}}},configurable:true});assert.equal(await (await readOptionalCache(key)).text(),'cached');
}finally{globalThis.fetch=originalFetch;if(originalCaches)Object.defineProperty(globalThis,'caches',originalCaches);else delete globalThis.caches}
console.log('Built hosted Worker serves JMA metadata/tiles, radar and forecast when cache getter, reads or writes are denied; optional caching and process metadata reuse passed.');
