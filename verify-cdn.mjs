// Cloudflare image CDN: convert-once cron, R2 index, static serving with CORS,
// and the page's CDN URL handling. Uses a tiny synthetic HSD fixture.
import assert from 'node:assert/strict';
import worker,{updateFrames,PREFIX,INDEX_KEY,LOCK_KEY} from './cloudflare/src/index.mjs';
import {awsFrames,awsFrameURL,cdnIndexURL} from './dist/aws-satellite.js';
const FIXTURE={"3": "QlpoOTFBWSZTWWgLDC0AACd////6FlC/Svho5lIAEKkBAITCDonwQABgaMJHBAEEUUBNsAEVksNqpT0RtRiZGg00yZNNME9RoYmhkxoamJ6AmEYhJoh6EAMg0ANAaADQ0AAAAAIqkJo0AyA009TQ0aBkMRoMjI0YjIBk0ahsTBdZdExp6LLk8CgITiCAggQfc3EURZIJ8I58Y4Y0AKST29XcoN5am2DK7ZXhWfqrX+qj5iZPoPmfLfZ+dn2kgQIEIzKoiiiMRVEUURgpKoiiiNmEVFEVWJSpqoiiiO7l9UFSAiwRtbAXa2P0dYmntcUy1zw3uyIAIEIAL2rgf5MDiadXrc5HMciXVGvzqdZ4mFtp4WtN+Doeyt2jO1CbAQgQIRpya9eyHqw7m1D/4c4AUUUR0PRxSSTXkRT9xSABRRQQFNZAPrr8Qv8xQVkmU1luamtBAAAApSkCAEAAAEBAAABAQAAgAHAwAKUhpucgQKdClKS8FKUltUlKS0lQiM1QqVKXzFBWSZTWbxskgAG3cZqQQBAAwBAAABAQABAACAAcEMAJqoGmthIiTCFKVcqiIk7VERJ6qIiTCCJS9QiKSskKUq38xQVkmU1l9IL/4AAAAsFKBgEAAQAAAQEAAAEAgAHBDACaqBpm+0ipU9VERJgSIk6EiJNZKqSheVVJQsSpEiXzFBWSZTWdZILikDbuM0pACAQAAAQEAAAEBAACAAchgAmqhk5CUR2qIiT1UREmVRESapUUU2KhCI8xQVkmU1mClRlwANbYqUVAwABAQAAAQEAAAEAgAJAhgQJqkhtTOBIiTc2KVS4EiJM9CREm52qIiTQkRJ5BErOgVCJokKqPzFBWSZTWTQUZ7ACexigSgBAAEBAAABAIABQZpoJqptTcqRIpgkRJwSIk9lRUQV8XckU4UJCIXFFJ", "4": "QlpoOTFBWSZTWTS1StoA1v9////6EjC/Svho5lBAEKkBCMTCDonwQABgaMJHBAEEUUBNsAEahCEhAGgADQAGgNA0AA0ANGmj0TQ5o0aGmEA0wJpoAyGhiANGI0MEZABFSmhGT1AAGhoGQANNNGjBNGTQABoNm9GUJ1COZMozauJJIhNiAF+CMuDI17EWgqiKKAgJBHKQZJIbswUIoIqeDE1K9vyky9py7RoT8CezQk3JWRsHG3cCKtZkACiiiO4AKKKI9AAooojZVRFFEdEUQRQhPlVIccCKFLKogCiiiPyWqfdSuQ1mpZNWtfxfGf1/UuT5XLZg3TLAFFFEbWPb751imzPDP27sYAooojKqwPyVem++B63dVfWKzp+IiAgAgIgC6pSsH/S0Jsxor7sLKAQNTk0GGXiBwfj2iG/zFBWSZTWY29ae4A1tikFIBwQABAAABAQAAgAHBDACapQ8pngSIk7NUVCqcEiJPQkRJmhIiTkKIrNQoiuUFKhX5igrJMprM28ZsEBt3GSlIAIIAAAICAAACAgABAAOBgAUqGTlEAU6FKUl4KUpLApSktIkStUKlSl8xQVkmU1ke1u7mAXNeakEAQAAYQAAAQEAAQAAgAHBDACapTGpnwSIk2iqUKzgSIk3PVRESaEiJOKSEVnZKoQNoqlCvzFBWSZTWScWtWkD0DuwUoAMQABAAABAQAAAQCAAcEMAFKgaZ1QEQ8FKUllUlKS5VJSktYFJBewKSC3uSFKC+YoKyTKay4D/b5gAAAWlIAAiAAACAgAAAgIAAQADgYAJqkNNzgBJHaoiJPVRESaEiJNiIpGbFQhE+YoKyTKazy89RNAd6uVAKgAwAgIAAAIBAAOBgAmqQ0zgSIk3agFUwJESZ6qIiTaiIk8oiJNqSKhXxdyRThQkEJGgp0A=", "5": "QlpoOTFBWSZTWdrzvzQAACd/7//6EhK/Svho5lAAEOkBAITCTonwYGjCRwRBBFFATbABFYMQqbU0BoGQMjQNGIANDIAABiGgAgqekHqNPUABpoBoAAAAAAADQCKlRpptIaNABoNAAA0aAxNGTTTTRpptEJuxMFlFkHPMa3kJAYBCWQgIMSFeVjMIGILpDBJ2dgKj0KvVkrDsVst3PhlBKwQFsGdK2XDKTpKlktPiZM0yUAAIgIgIgI94AooojUAFFFEbCqIoojOFRRFVhKow54EqHRmfh5UIuatCe9VMxqKoiiiOx4X5FrX870mR8VqpKrlSbVyQBRRRGzqeNBi99Kvh9kDBLAFFFEeOxL+/TIuWrd2jJgXIscAUUURu24478y9HP1tX+jmWXBOMqaqiiKrTikAv8TiJB9R+I38xQVkmU1lQjKkMAS748oJAAAADAEBAAABAAEAgAHBDACapTGpnwSIk1VSqizgSIk3PVRESaEiJOUhUpWdSQAq1VSqi/MUFZJlNZtUX7dAQUoSCUgEGAQEAAAEBAACAAcEMAJqoGmtkESlnSFKVeqiIkwJEScCREmsoESlklKUovmKCskymszV5sywAYjRKUACBgAAAgIAAAIBAAOBgAmqQ0xIqVMKKlTc7VERJ6qIiTQkRJ5VUlCzZShBT5igrJMprM8tYuCC9Kv9BIAgAABgACAAACAAICAAEAA4IYATVKM0z4JESbqJRGBIiTOVRESdqiIk2pUUU6oUKkzUIqQ8YoKyTKazkweWrAAS4CSlwAAAgIAAAICAAACAQADghgBNVA0zWwRK4KVS7VERJ6qIiTAkRJgSIk1kVCET5igrJMprMmD86wAAAAKQDAAACAgABAAKDNNBNUGKkSKdqpEinBIiTQkRJnVUREni7kinChIKtR42A"},segment=n=>Uint8Array.from(atob(FIXTURE[n]),c=>c.charCodeAt(0));
const stampAt=t=>new Date(t).toISOString().replace(/[-:T]/g,'').slice(0,12),now=Math.floor(Date.now()/600000)*600000+5*60000;
const stamps=Array.from({length:40},(_,i)=>stampAt(now-5*60000-(39-i)*600000)),partial=stampAt(now-5*60000+600000);
const row=(s,n)=>`<Contents><Key>AHI-L1b-FLDK/${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)}/${s.slice(8)}/HS_H09_${s.slice(0,8)}_${s.slice(8)}_B13_FLDK_R20_S0${n}10.DAT.bz2</Key><LastModified>${new Date(now).toISOString()}</LastModified><Size>3000000</Size></Contents>`;
let segmentFetches=0;
globalThis.fetch=async (u,options)=>{assert.equal(options.redirect,'manual');const url=new URL(u);assert.equal(url.hostname,'noaa-himawari9.s3.amazonaws.com');
 if(url.searchParams.get('list-type')){const prefix=url.searchParams.get('prefix'),rows=[...stamps.flatMap(s=>[3,4,5].map(n=>row(s,n))),row(partial,3)].filter(r=>r.includes('<Key>'+prefix));return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated>${rows.join('')}</ListBucketResult>`)}
 segmentFetches++;const m=/S(0[345])10/.exec(url.pathname);return new Response(segment(Number(m[1])))};
class Bucket{constructor(){this.items=new Map()}
 async get(key){const item=this.items.get(key);if(!item)return null;return {body:new Blob([item.value]).stream(),json:async()=>JSON.parse(new TextDecoder().decode(item.value)),httpEtag:'"e"',customMetadata:item.options?.customMetadata||{},writeHttpMetadata:h=>{const m=item.options?.httpMetadata||{};if(m.contentType)h.set('Content-Type',m.contentType);if(m.cacheControl)h.set('Cache-Control',m.cacheControl)}}}
 async put(key,value,options){this.items.set(key,{value:typeof value==='string'?new TextEncoder().encode(value):value,options})}
 async delete(keys){for(const k of [].concat(keys))this.items.delete(k)}}
const env={FRAMES:new Bucket(),MAX_FRAMES_PER_RUN:'4'};
// First run: newest four complete observations, never the partial one.
let r=await updateFrames(env,{now});assert.deepEqual(r.converted,stamps.slice(-4).reverse());assert.ok(!env.FRAMES.items.has(PREFIX+partial+'.png'));
let index=JSON.parse(new TextDecoder().decode(env.FRAMES.items.get(INDEX_KEY).value));assert.equal(index.source,'cdn');assert.equal(index.latest,new Date(Date.parse(stamps.at(-1).replace(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)/,'$1-$2-$3T$4:$5:00Z'))).toISOString());
assert.deepEqual(index.frames.map(f=>f.stamp),stamps.slice(-4));assert.ok(!env.FRAMES.items.has(LOCK_KEY),'lease released');
// Later runs fill history once; a converted frame is never converted again.
for(let i=0;i<10;i++)r=await updateFrames(env,{now,maxFrames:4});
index=JSON.parse(new TextDecoder().decode(env.FRAMES.items.get(INDEX_KEY).value));assert.equal(index.frames.length,31,'five hours = 31 observations');
assert.equal(segmentFetches,31*3,'each observation downloaded and converted exactly once');assert.equal(r.converted.length,0);
// An active lease from another run is respected.
await env.FRAMES.put(LOCK_KEY,JSON.stringify({until:now+60000}));assert.deepEqual(await updateFrames(env,{now}),{skipped:'locked'});await env.FRAMES.delete(LOCK_KEY);
// Frames older than six hours are deleted from storage.
await env.FRAMES.put(PREFIX+stamps[0]+'.png',new Uint8Array(4));const old=JSON.parse(new TextDecoder().decode(env.FRAMES.items.get(INDEX_KEY).value));old.frames.unshift({stamp:stamps[0],time:new Date(now-7*3600000).toISOString(),provider:'aws'});await env.FRAMES.put(INDEX_KEY,JSON.stringify(old));
await updateFrames(env,{now});assert.ok(!env.FRAMES.items.has(PREFIX+stamps[0]+'.png'),'expired frame removed');
// Static serving: CORS, cache headers, observation time, validation.
const ctx={waitUntil(){}},get=(path,method='GET')=>worker.fetch(new Request('https://cdn.test/'+path,{method}),env,ctx);
let res=await get(INDEX_KEY);assert.equal(res.status,200);assert.equal(res.headers.get('Access-Control-Allow-Origin'),'*');assert.equal(res.headers.get('Cache-Control'),'public, max-age=15');
const latest=index.frames.at(-1);res=await get(PREFIX+latest.stamp+'.png');assert.equal(res.status,200);assert.equal(res.headers.get('Content-Type'),'image/png');assert.match(res.headers.get('Cache-Control'),/immutable/);assert.equal(res.headers.get('X-Observation-Time'),latest.time);
const png=new Uint8Array(await res.arrayBuffer());assert.deepEqual([...png.slice(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(png[25],3,'palette PNG');
assert.equal((await get(PREFIX+latest.stamp+'.png','HEAD')).status,200);assert.equal((await get(PREFIX+'../secret.png')).status,404);assert.equal((await get(PREFIX+'202602300010.png')).status,404);assert.equal((await get(PREFIX+partial+'.png')).status,404);
assert.equal((await get(INDEX_KEY,'POST')).status,405);assert.equal((await get(INDEX_KEY,'OPTIONS')).status,204);
// The page uses CDN URLs only for CDN-listed frames; Worker frames keep the same-origin route.
const base='https://himawari.example.org',frames=awsFrames({...index,frames:index.frames.map(f=>({...f}))},now);
assert.equal(frames.at(-1).source,'cdn');assert.equal(awsFrameURL(frames.at(-1),base),base+'/'+PREFIX+latest.stamp+'.png');
assert.equal(awsFrameURL({...frames.at(-1),source:'worker'},base),'/api/satellite/aws/frame/'+latest.stamp+'.png');
assert.throws(()=>cdnIndexURL('http://insecure.example'));assert.throws(()=>cdnIndexURL(''));assert.throws(()=>cdnIndexURL('https://x.example/path'));
console.log('CDN: convert-once cron (newest first, complete frames only, 31-frame window, lease, expiry), static serving with CORS/immutable caching and page URL selection passed.');
