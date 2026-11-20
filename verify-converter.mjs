// Portable converter: folder storage, stateless restore from the published
// CDN on a fresh runner, incremental update and static headers. Synthetic HSD.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {convertOnce} from './converter/convert.mjs';
import {PREFIX,INDEX_KEY} from './cloudflare/src/index.mjs';
const FIXTURE={"3": "QlpoOTFBWSZTWWgLDC0AACd////6FlC/Svho5lIAEKkBAITCDonwQABgaMJHBAEEUUBNsAEVksNqpT0RtRiZGg00yZNNME9RoYmhkxoamJ6AmEYhJoh6EAMg0ANAaADQ0AAAAAIqkJo0AyA009TQ0aBkMRoMjI0YjIBk0ahsTBdZdExp6LLk8CgITiCAggQfc3EURZIJ8I58Y4Y0AKST29XcoN5am2DK7ZXhWfqrX+qj5iZPoPmfLfZ+dn2kgQIEIzKoiiiMRVEUURgpKoiiiNmEVFEVWJSpqoiiiO7l9UFSAiwRtbAXa2P0dYmntcUy1zw3uyIAIEIAL2rgf5MDiadXrc5HMciXVGvzqdZ4mFtp4WtN+Doeyt2jO1CbAQgQIRpya9eyHqw7m1D/4c4AUUUR0PRxSSTXkRT9xSABRRQQFNZAPrr8Qv8xQVkmU1luamtBAAAApSkCAEAAAEBAAABAQAAgAHAwAKUhpucgQKdClKS8FKUltUlKS0lQiM1QqVKXzFBWSZTWbxskgAG3cZqQQBAAwBAAABAQABAACAAcEMAJqoGmthIiTCFKVcqiIk7VERJ6qIiTCCJS9QiKSskKUq38xQVkmU1l9IL/4AAAAsFKBgEAAQAAAQEAAAEAgAHBDACaqBpm+0ipU9VERJgSIk6EiJNZKqSheVVJQsSpEiXzFBWSZTWdZILikDbuM0pACAQAAAQEAAAEBAACAAchgAmqhk5CUR2qIiT1UREmVRESapUUU2KhCI8xQVkmU1mClRlwANbYqUVAwABAQAAAQEAAAEAgAJAhgQJqkhtTOBIiTc2KVS4EiJM9CREm52qIiTQkRJ5BErOgVCJokKqPzFBWSZTWTQUZ7ACexigSgBAAEBAAABAIABQZpoJqptTcqRIpgkRJwSIk9lRUQV8XckU4UJCIXFFJ", "4": "QlpoOTFBWSZTWTS1StoA1v9////6EjC/Svho5lBAEKkBCMTCDonwQABgaMJHBAEEUUBNsAEahCEhAGgADQAGgNA0AA0ANGmj0TQ5o0aGmEA0wJpoAyGhiANGI0MEZABFSmhGT1AAGhoGQANNNGjBNGTQABoNm9GUJ1COZMozauJJIhNiAF+CMuDI17EWgqiKKAgJBHKQZJIbswUIoIqeDE1K9vyky9py7RoT8CezQk3JWRsHG3cCKtZkACiiiO4AKKKI9AAooojZVRFFEdEUQRQhPlVIccCKFLKogCiiiPyWqfdSuQ1mpZNWtfxfGf1/UuT5XLZg3TLAFFFEbWPb751imzPDP27sYAooojKqwPyVem++B63dVfWKzp+IiAgAgIgC6pSsH/S0Jsxor7sLKAQNTk0GGXiBwfj2iG/zFBWSZTWY29ae4A1tikFIBwQABAAABAQAAgAHBDACapQ8pngSIk7NUVCqcEiJPQkRJmhIiTkKIrNQoiuUFKhX5igrJMprM28ZsEBt3GSlIAIIAAAICAAACAgABAAOBgAUqGTlEAU6FKUl4KUpLApSktIkStUKlSl8xQVkmU1ke1u7mAXNeakEAQAAYQAAAQEAAQAAgAHBDACapTGpnwSIk2iqUKzgSIk3PVRESaEiJOKSEVnZKoQNoqlCvzFBWSZTWScWtWkD0DuwUoAMQABAAABAQAAAQCAAcEMAFKgaZ1QEQ8FKUllUlKS5VJSktYFJBewKSC3uSFKC+YoKyTKay4D/b5gAAAWlIAAiAAACAgAAAgIAAQADgYAJqkNNzgBJHaoiJPVRESaEiJNiIpGbFQhE+YoKyTKazy89RNAd6uVAKgAwAgIAAAIBAAOBgAmqQ0zgSIk3agFUwJESZ6qIiTaiIk8oiJNqSKhXxdyRThQkEJGgp0A=", "5": "QlpoOTFBWSZTWdrzvzQAACd/7//6EhK/Svho5lAAEOkBAITCTonwYGjCRwRBBFFATbABFYMQqbU0BoGQMjQNGIANDIAABiGgAgqekHqNPUABpoBoAAAAAAADQCKlRpptIaNABoNAAA0aAxNGTTTTRpptEJuxMFlFkHPMa3kJAYBCWQgIMSFeVjMIGILpDBJ2dgKj0KvVkrDsVst3PhlBKwQFsGdK2XDKTpKlktPiZM0yUAAIgIgIgI94AooojUAFFFEbCqIoojOFRRFVhKow54EqHRmfh5UIuatCe9VMxqKoiiiOx4X5FrX870mR8VqpKrlSbVyQBRRRGzqeNBi99Kvh9kDBLAFFFEeOxL+/TIuWrd2jJgXIscAUUURu24478y9HP1tX+jmWXBOMqaqiiKrTikAv8TiJB9R+I38xQVkmU1lQjKkMAS748oJAAAADAEBAAABAAEAgAHBDACapTGpnwSIk1VSqizgSIk3PVRESaEiJOUhUpWdSQAq1VSqi/MUFZJlNZtUX7dAQUoSCUgEGAQEAAAEBAACAAcEMAJqoGmtkESlnSFKVeqiIkwJEScCREmsoESlklKUovmKCskymszV5sywAYjRKUACBgAAAgIAAAIBAAOBgAmqQ0xIqVMKKlTc7VERJ6qIiTQkRJ5VUlCzZShBT5igrJMprM8tYuCC9Kv9BIAgAABgACAAACAAICAAEAA4IYATVKM0z4JESbqJRGBIiTOVRESdqiIk2pUUU6oUKkzUIqQ8YoKyTKazkweWrAAS4CSlwAAAgIAAAICAAACAQADghgBNVA0zWwRK4KVS7VERJ6qIiTAkRJgSIk1kVCET5igrJMprMmD86wAAAAKQDAAACAgABAAKDNNBNUGKkSKdqpEinBIiTQkRJnVUREni7kinChIKtR42A"},segment=n=>Uint8Array.from(atob(FIXTURE[n]),c=>c.charCodeAt(0));
const stampAt=t=>new Date(t).toISOString().replace(/[-:T]/g,'').slice(0,12),slot=Math.floor(Date.now()/600000)*600000;
let stamps=Array.from({length:31},(_,i)=>stampAt(slot-600000*(31-i)));
const row=(s,n)=>`<Contents><Key>AHI-L1b-FLDK/${s.slice(0,4)}/${s.slice(4,6)}/${s.slice(6,8)}/${s.slice(8)}/HS_H09_${s.slice(0,8)}_${s.slice(8)}_B13_FLDK_R20_S0${n}10.DAT.bz2</Key><LastModified>${new Date().toISOString()}</LastModified><Size>3000000</Size></Contents>`;
const A=await mkdtemp(path.join(os.tmpdir(),'himawari-a-')),B=await mkdtemp(path.join(os.tmpdir(),'himawari-b-'));let aws=0,cdn=0;
globalThis.fetch=async (u,options={})=>{const url=new URL(u);
 if(url.hostname==='noaa-himawari9.s3.amazonaws.com'){aws++;if(url.searchParams.get('list-type')){const prefix=url.searchParams.get('prefix');return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated>${stamps.flatMap(s=>[3,4,5].map(n=>row(s,n))).filter(r=>r.includes('<Key>'+prefix)).join('')}</ListBucketResult>`)}return new Response(segment(Number(/S(0[345])10/.exec(url.pathname)[1])))}
 if(url.hostname==='cdn.test'){cdn++;try{return new Response(await readFile(path.join(A,url.pathname.slice(1))))}catch{return new Response('nf',{status:404})}}
 throw new Error('unexpected host '+url.hostname)};
try{
 let r=await convertOnce({out:A,maxFrames:6});assert.equal(r.converted.length,6);assert.ok(r.changed);
 assert.match(await readFile(path.join(A,'_headers'),'utf8'),/index\.json\n  Cache-Control: public, max-age=15/);
 for(let i=0;i<6&&r.converted.length;i++)r=await convertOnce({out:A,maxFrames:6});
 const index=JSON.parse(await readFile(path.join(A,INDEX_KEY),'utf8'));assert.equal(index.frames.length,31);assert.equal(index.source,'cdn');
 assert.equal((await readdir(path.join(A,PREFIX))).filter(f=>f.endsWith('.png')).length,31);assert.ok(!existsSync(path.join(A,PREFIX,'lock.json')),'no lock left in the published folder');
 r=await convertOnce({out:A});assert.equal(r.changed,false,'nothing new: no redeploy needed');
 // Fresh runner: restore the published frames instead of reconverting them.
 const before=aws;r=await convertOnce({out:B,base:'https://cdn.test/'});assert.equal(r.restored,31);assert.equal(r.converted.length,0);
 assert.equal(aws-before<=8,true,'only listings, no segment downloads on restore');
 assert.deepEqual(await readFile(path.join(B,PREFIX,stamps.at(-1)+'.png')),await readFile(path.join(A,PREFIX,stamps.at(-1)+'.png')));
 // A newly published observation is converted and the window stays at 31.
 stamps=[...stamps,stampAt(slot)];r=await convertOnce({out:B});assert.deepEqual(r.converted,[stamps.at(-1)]);
 const after=JSON.parse(await readFile(path.join(B,INDEX_KEY),'utf8'));assert.equal(after.frames.length,31);assert.equal(after.frames.at(-1).stamp,stamps.at(-1));
}finally{await rm(A,{recursive:true,force:true});await rm(B,{recursive:true,force:true})}
console.log('Converter: folder storage, 31-frame window, static headers, no redeploy without changes, stateless restore from the CDN and incremental update passed.');
