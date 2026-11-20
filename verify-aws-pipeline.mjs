// Synthetic HSD pipeline check: parallel segment download, retry, latest-first
// priority, background warm-up and timing headers. The fixture is a tiny
// synthetic Band 13 file (uniform rows), not real Himawari data.
import assert from 'node:assert/strict';
const FIXTURE={"3": "QlpoOTFBWSZTWWgLDC0AACd////6FlC/Svho5lIAEKkBAITCDonwQABgaMJHBAEEUUBNsAEVksNqpT0RtRiZGg00yZNNME9RoYmhkxoamJ6AmEYhJoh6EAMg0ANAaADQ0AAAAAIqkJo0AyA009TQ0aBkMRoMjI0YjIBk0ahsTBdZdExp6LLk8CgITiCAggQfc3EURZIJ8I58Y4Y0AKST29XcoN5am2DK7ZXhWfqrX+qj5iZPoPmfLfZ+dn2kgQIEIzKoiiiMRVEUURgpKoiiiNmEVFEVWJSpqoiiiO7l9UFSAiwRtbAXa2P0dYmntcUy1zw3uyIAIEIAL2rgf5MDiadXrc5HMciXVGvzqdZ4mFtp4WtN+Doeyt2jO1CbAQgQIRpya9eyHqw7m1D/4c4AUUUR0PRxSSTXkRT9xSABRRQQFNZAPrr8Qv8xQVkmU1luamtBAAAApSkCAEAAAEBAAABAQAAgAHAwAKUhpucgQKdClKS8FKUltUlKS0lQiM1QqVKXzFBWSZTWbxskgAG3cZqQQBAAwBAAABAQABAACAAcEMAJqoGmthIiTCFKVcqiIk7VERJ6qIiTCCJS9QiKSskKUq38xQVkmU1l9IL/4AAAAsFKBgEAAQAAAQEAAAEAgAHBDACaqBpm+0ipU9VERJgSIk6EiJNZKqSheVVJQsSpEiXzFBWSZTWdZILikDbuM0pACAQAAAQEAAAEBAACAAchgAmqhk5CUR2qIiT1UREmVRESapUUU2KhCI8xQVkmU1mClRlwANbYqUVAwABAQAAAQEAAAEAgAJAhgQJqkhtTOBIiTc2KVS4EiJM9CREm52qIiTQkRJ5BErOgVCJokKqPzFBWSZTWTQUZ7ACexigSgBAAEBAAABAIABQZpoJqptTcqRIpgkRJwSIk9lRUQV8XckU4UJCIXFFJ", "4": "QlpoOTFBWSZTWTS1StoA1v9////6EjC/Svho5lBAEKkBCMTCDonwQABgaMJHBAEEUUBNsAEahCEhAGgADQAGgNA0AA0ANGmj0TQ5o0aGmEA0wJpoAyGhiANGI0MEZABFSmhGT1AAGhoGQANNNGjBNGTQABoNm9GUJ1COZMozauJJIhNiAF+CMuDI17EWgqiKKAgJBHKQZJIbswUIoIqeDE1K9vyky9py7RoT8CezQk3JWRsHG3cCKtZkACiiiO4AKKKI9AAooojZVRFFEdEUQRQhPlVIccCKFLKogCiiiPyWqfdSuQ1mpZNWtfxfGf1/UuT5XLZg3TLAFFFEbWPb751imzPDP27sYAooojKqwPyVem++B63dVfWKzp+IiAgAgIgC6pSsH/S0Jsxor7sLKAQNTk0GGXiBwfj2iG/zFBWSZTWY29ae4A1tikFIBwQABAAABAQAAgAHBDACapQ8pngSIk7NUVCqcEiJPQkRJmhIiTkKIrNQoiuUFKhX5igrJMprM28ZsEBt3GSlIAIIAAAICAAACAgABAAOBgAUqGTlEAU6FKUl4KUpLApSktIkStUKlSl8xQVkmU1ke1u7mAXNeakEAQAAYQAAAQEAAQAAgAHBDACapTGpnwSIk2iqUKzgSIk3PVRESaEiJOKSEVnZKoQNoqlCvzFBWSZTWScWtWkD0DuwUoAMQABAAABAQAAAQCAAcEMAFKgaZ1QEQ8FKUllUlKS5VJSktYFJBewKSC3uSFKC+YoKyTKay4D/b5gAAAWlIAAiAAACAgAAAgIAAQADgYAJqkNNzgBJHaoiJPVRESaEiJNiIpGbFQhE+YoKyTKazy89RNAd6uVAKgAwAgIAAAIBAAOBgAmqQ0zgSIk3agFUwJESZ6qIiTaiIk8oiJNqSKhXxdyRThQkEJGgp0A=", "5": "QlpoOTFBWSZTWdrzvzQAACd/7//6EhK/Svho5lAAEOkBAITCTonwYGjCRwRBBFFATbABFYMQqbU0BoGQMjQNGIANDIAABiGgAgqekHqNPUABpoBoAAAAAAADQCKlRpptIaNABoNAAA0aAxNGTTTTRpptEJuxMFlFkHPMa3kJAYBCWQgIMSFeVjMIGILpDBJ2dgKj0KvVkrDsVst3PhlBKwQFsGdK2XDKTpKlktPiZM0yUAAIgIgIgI94AooojUAFFFEbCqIoojOFRRFVhKow54EqHRmfh5UIuatCe9VMxqKoiiiOx4X5FrX870mR8VqpKrlSbVyQBRRRGzqeNBi99Kvh9kDBLAFFFEeOxL+/TIuWrd2jJgXIscAUUURu24478y9HP1tX+jmWXBOMqaqiiKrTikAv8TiJB9R+I38xQVkmU1lQjKkMAS748oJAAAADAEBAAABAAEAgAHBDACapTGpnwSIk1VSqizgSIk3PVRESaEiJOUhUpWdSQAq1VSqi/MUFZJlNZtUX7dAQUoSCUgEGAQEAAAEBAACAAcEMAJqoGmtkESlnSFKVeqiIkwJEScCREmsoESlklKUovmKCskymszV5sywAYjRKUACBgAAAgIAAAIBAAOBgAmqQ0xIqVMKKlTc7VERJ6qIiTQkRJ5VUlCzZShBT5igrJMprM8tYuCC9Kv9BIAgAABgACAAACAAICAAEAA4IYATVKM0z4JESbqJRGBIiTOVRESdqiIk2pUUU6oUKkzUIqQ8YoKyTKazkweWrAAS4CSlwAAAgIAAAICAAACAQADghgBNVA0zWwRK4KVS7VERJ6qIiTAkRJgSIk1kVCET5igrJMprMmD86wAAAAKQDAAACAgABAAKDNNBNUGKkSKdqpEinBIiTQkRJnVUREni7kinChIKtR42A"};
const segment=n=>Uint8Array.from(atob(FIXTURE[n]),c=>c.charCodeAt(0));
const stampAt=t=>new Date(t).toISOString().replace(/[-:T]/g,'').slice(0,12);
const base=Math.floor(Date.now()/600000)*600000-600000,stamps=Array.from({length:8},(_,i)=>stampAt(base-(7-i)*600000)),latest=stamps.at(-1);
const row=(stamp,seg)=>{const day=stamp.slice(0,8),clock=stamp.slice(8);return `<Contents><Key>AHI-L1b-FLDK/${day.slice(0,4)}/${day.slice(4,6)}/${day.slice(6)}/${clock}/HS_H09_${day}_${clock}_B13_FLDK_R20_S0${seg}10.DAT.bz2</Key><LastModified>${new Date().toISOString()}</LastModified><Size>3000000</Size></Contents>`};
const listing=`<ListBucketResult><IsTruncated>false</IsTruncated>${stamps.flatMap(s=>[3,4,5].map(n=>row(s,n))).join('')}</ListBucketResult>`;
let delay=0,active=0,peak=0;const calls=new Map(),failOnce=new Set(),missing=new Set(),done=[];
const originalFetch=globalThis.fetch,originalCaches=Object.getOwnPropertyDescriptor(globalThis,'caches');
globalThis.fetch=async (u,options)=>{
 options.signal?.throwIfAborted();
 assert.equal(options.redirect,'manual');const url=new URL(u);assert.equal(url.hostname,'noaa-himawari9.s3.amazonaws.com');
 if(url.searchParams.get('list-type'))return new Response(listing);
 const m=/HS_H09_(\d{8})_(\d{4})_B13_FLDK_R20_S0([345])10/.exec(url.pathname);assert.ok(m);const key=m[1]+m[2]+':'+m[3];calls.set(key,(calls.get(key)||0)+1);
 active++;peak=Math.max(peak,active);try{await new Promise((r,j)=>{const timer=setTimeout(r,delay);options.signal?.addEventListener('abort',()=>{clearTimeout(timer);j(options.signal.reason)},{once:true})});
  if(missing.has(m[1]+m[2]))return new Response('missing',{status:404});
  if(failOnce.delete(key))return new Response('busy',{status:503});
  return new Response(segment(m[3]));
 }finally{active--}
};
try{
 Object.defineProperty(globalThis,'caches',{value:{get default(){throw new Error('optional cache denied')}},configurable:true});
 const worker=(await import('./dist/server/index.js?aws-pipeline')).default;
 const call=(path,ctx={})=>worker.fetch(new Request('https://site.test'+path,{headers:{'oai-authenticated-user-id':'owner'}}),{},ctx);
 const frame=stamp=>call(`/api/satellite/aws/frame/${stamp}.png`);
 const timing=r=>Object.fromEntries((r.headers.get('Server-Timing')||'').split(', ').map(p=>{const [n,d]=p.split(';dur=');return [n,Number(d)]}));
 assert.equal((await call('/api/satellite/aws/times')).status,200);
 // Three segments download together; one transient 503 is retried once.
 delay=300;failOnce.add(stamps[0]+':4');
 let r=await frame(stamps[0]);assert.equal(r.status,200);const t=timing(r);
 const png=new Uint8Array(await r.arrayBuffer());assert.deepEqual([...png.slice(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(new DataView(png.buffer).getUint32(16),1024);assert.equal(new DataView(png.buffer).getUint32(20),1260);
 assert.equal(calls.get(stamps[0]+':4'),2,'transient segment failure retried once');assert.equal(calls.get(stamps[0]+':3'),1);
 assert.ok(t.download<1700,'segments download in parallel: '+t.download);for(const k of ['queue','download','decode','render','encode'])assert.ok(Number.isFinite(t[k]),'Server-Timing '+k);
 console.log('Synthetic frame timing (ms):',JSON.stringify(t));
 // Same observation again comes from Worker memory, never a different time.
 r=await frame(stamps[0]);assert.equal(r.headers.get('Server-Timing'),'cache;desc="worker memory"');assert.equal(r.headers.get('X-Observation-Time'),new Date(Date.parse(stamps[0].replace(/(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)/,'$1-$2-$3T$4:$5:00Z'))).toISOString());
 // A permanently missing file is not retried and is not cached as success.
 missing.add(stamps[1]);delay=0;assert.equal((await frame(stamps[1])).status,502);assert.equal(calls.get(stamps[1]+':3'),1,'404 not retried');
 // Latest observation overtakes queued history.
 delay=250;peak=0;const order=[];
 const jobs=[stamps[2],stamps[3],stamps[4],stamps[5],latest].map(s=>frame(s).then(res=>{assert.equal(res.status,200);order.push(s)}));
 await Promise.all(jobs);
 assert.ok(order.indexOf(latest)<order.indexOf(stamps[5]),'latest before queued history: '+order.join(','));
 assert.ok(peak<=6,'at most two frames download at once (peak '+peak+')');
 // Publication check warms the newest uncached observation in the background.
 delay=0;await call('/api/satellite/aws/times',{waitUntil:p=>done.push(p)});assert.equal(done.length,1,'one warm-up per check');await Promise.all(done);
 r=await frame(stamps[6]);assert.equal(r.status,200);assert.equal(r.headers.get('Server-Timing'),'cache;desc="worker memory"','warmed frame served from memory');
}finally{globalThis.fetch=originalFetch;if(originalCaches)Object.defineProperty(globalThis,'caches',originalCaches);else delete globalThis.caches}
console.log('AWS pipeline: parallel segments, single transient retry, no retry on 404, latest-first priority, bounded concurrency, warm-up and Server-Timing passed.');
