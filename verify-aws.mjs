import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseAWSListing,awsFrameStamp} from './worker/aws-satellite.mjs';
import {awsFrames,awsFrameURL} from './dist/aws-satellite.js';
import {bunzipBytes} from './worker/vendor/bzip2.mjs';
import {readHSD} from './worker/himawari-hsd.mjs';
const now=Date.parse('2026-10-09T00:18:00Z');
const row=(stamp,seg)=>{const day=stamp.slice(0,8),clock=stamp.slice(8);return `<Contents><Key>AHI-L1b-FLDK/${day.slice(0,4)}/${day.slice(4,6)}/${day.slice(6)}/${clock}/HS_H09_${day}_${clock}_B13_FLDK_R20_S0${seg}10.DAT.bz2</Key><LastModified>2026-10-09T00:15:00Z</LastModified><Size>3000000</Size></Contents>`};
const list=rows=>`<ListBucketResult><IsTruncated>false</IsTruncated>${rows}</ListBucketResult>`;
assert.equal(parseAWSListing(list(row('202610082350',3)+row('202610082350',4))).length,0,'partially published frame must stay unavailable');
const frames=parseAWSListing(list([3,4,5].map(s=>row('202610082350',s)+row('202610090000',s)+row('202610090020',s)).join('')));
assert.equal(frames.length,3);
const valid=awsFrames({provider:'aws',frames},now);
assert.deepEqual(valid.map(f=>f.stamp),['202610082350','202610090000'],'UTC midnight and future-frame rejection');
assert.equal(awsFrameURL(valid[1]),'/api/satellite/aws/frame/202610090000.png');
assert.ok(Number.isNaN(awsFrameStamp('202602300010')));
assert.ok(Number.isNaN(awsFrameStamp('202610090013')));
assert.throws(()=>parseAWSListing('<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>'));
assert.throws(()=>awsFrames({provider:'aws',frames:valid},now+2*3600000));
assert.throws(()=>awsFrameURL({...valid[0],stamp:'202610090000'}));
const originalFetch=globalThis.fetch,originalCaches=Object.getOwnPropertyDescriptor(globalThis,'caches');
try{
 Object.defineProperty(globalThis,'caches',{value:{get default(){throw new Error('optional cache denied')}},configurable:true});
 const worker=(await import('./dist/server/index.js?aws-verification')).default;
 const latest=new Date(Math.floor(Date.now()/600000)*600000-600000).toISOString().replace(/[-:T]/g,'').slice(0,12);
 let upstream=0;globalThis.fetch=async (u,options)=>{assert.equal(new URL(u).hostname,'noaa-himawari9.s3.amazonaws.com');assert.equal(options.redirect,'manual','edge-supported redirect policy');upstream++;return new Response(list([3,4,5].map(s=>row(latest,s)).join('')))};
 const call=(path,method='GET',auth=true)=>worker.fetch(new Request('https://site.test'+path,{method,headers:auth?{'oai-authenticated-user-id':'owner'}:{}}),{},{});
 assert.equal((await call('/api/satellite/aws/times','GET',false)).status,401);
 const responses=await Promise.all([call('/api/satellite/aws/times'),call('/api/satellite/aws/times')]);
 const payload=await responses[0].json();assert.equal(responses[0].status,200);assert.equal(payload.frames.at(-1).stamp,latest);
 const count=upstream;assert.equal((await call('/api/satellite/aws/times')).status,200);assert.equal(upstream,count,'metadata concurrency and short cache');
 assert.equal((await call('/api/satellite/aws/frame/../../escape.png')).status,404);
 assert.equal((await call('/api/satellite/aws/frame/202602300010.png')).status,404);
 assert.equal((await call('/api/satellite/aws/times','POST')).status,405);
 if(process.argv[2]){
  const fixture=await readFile(process.argv[2]+'/HS_H09_20261008_1450_B13_FLDK_R20_S0310.DAT.bz2');
  const hsd=readHSD(fixture);assert.equal(hsd.cols,5500);assert.equal(hsd.rows,550);assert.equal(hsd.first,1100);
  const corrupt=new Uint8Array(fixture);corrupt[15]^=1;assert.throws(()=>bunzipBytes(corrupt),'corrupt streams must not render');
  globalThis.fetch=async (u,options)=>{assert.equal(options.redirect,'manual');const segment=/S(0[345])10/.exec(String(u))?.[1];assert.ok(segment);return new Response(await readFile(process.argv[2]+`/HS_H09_20261008_1450_B13_FLDK_R20_S${segment}10.DAT.bz2`))};
  const image=await call(`/api/satellite/aws/frame/${latest}.png`);assert.equal(image.status,200);const bytes=new Uint8Array(await image.arrayBuffer());assert.deepEqual([...bytes.slice(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(new DataView(bytes.buffer).getUint32(16),1024);assert.equal(new DataView(bytes.buffer).getUint32(20),1260);
  const head=await call(`/api/satellite/aws/frame/${latest}.png`,'HEAD');assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);assert.equal(head.headers.get('X-Observation-Time'),payload.latest);
 }
}finally{globalThis.fetch=originalFetch;if(originalCaches)Object.defineProperty(globalThis,'caches',originalCaches);else delete globalThis.caches}
console.log('AWS partial publication, midnight/future/stale times, source URL validation, owner authentication, deduplication and optional-cache denial passed.');
