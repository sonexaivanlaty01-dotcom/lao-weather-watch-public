import assert from 'node:assert/strict';
import {jmaFrames,jmaTimestamp,jmaTilePlan,jmaDirectURL,discoverCloudFrames} from './dist/jma-satellite.js';
import {viewportSpec} from './dist/frame-renderer.js';
import {jmaUpstream,satelliteRoute} from './worker/satellite.mjs';
const now=Date.parse('2026-10-08T10:00:00Z'),compact=t=>new Date(t).toISOString().slice(0,19).replace(/\D/g,''),rows=Array.from({length:40},(_,i)=>{const t=compact(now-i*600000);return {basetime:t,validtime:t}});
rows.push({basetime:compact(now+600000),validtime:compact(now+600000)},rows[0],{basetime:'20260230000000',validtime:'20260230000000'});
const frames=jmaFrames(rows,now);assert.equal(frames.length,31);assert.equal(Date.parse(frames.at(-1).time),now);assert.equal(Date.parse(frames[0].time),now-5*3600000);assert(Number.isNaN(jmaTimestamp('20260230000000')));
const gap=jmaFrames(rows.filter(r=>r.validtime!==compact(now-600000)),now);assert.equal(gap.length,30);assert(!gap.some(f=>Date.parse(f.time)===now-600000));
let backupCalls=0;const loadPrimary=async()=>rows,loadBackup=async()=>{backupCalls++;return [new Date(now-20*60000).toISOString()]};
assert.equal((await discoverCloudFrames({loadPrimary,loadBackup,now})).at(-1).provider,'jma');assert.equal(backupCalls,0);
const failure=async()=>{throw new Error('offline')};
const backup=await discoverCloudFrames({loadPrimary:failure,loadBackup,now});assert.equal(backup[0].provider,'nasa');assert.equal(Date.parse(backup[0].time),now-20*60000);
const staleRows=rows.filter(r=>jmaTimestamp(r.validtime)<=now-40*60000);
assert.equal((await discoverCloudFrames({loadPrimary:async()=>staleRows,loadBackup,now})).at(-1).provider,'nasa');
assert.equal((await discoverCloudFrames({loadPrimary:async()=>staleRows,loadBackup:failure,now})).at(-1).provider,'jma');
assert.equal((await discoverCloudFrames({loadPrimary,loadBackup,now,forceBackup:true})).at(-1).provider,'nasa');
await assert.rejects(discoverCloudFrames({loadPrimary:failure,loadBackup:failure,now}));
for(const zoom of [2,4,8,12]){const spec=viewportSpec([100,15,108,23],1000,700,zoom,2),plan=jmaTilePlan(spec,frames.at(-1));assert(plan.jobs.length>0&&plan.jobs.length<=40);assert(plan.crop.every(Number.isFinite));for(const job of plan.jobs){const endpoint=jmaUpstream(job.url);assert(endpoint?.url.startsWith('https://www.jma.go.jp/bosai/himawari/data/satimg/'));assert(endpoint.url.includes('/B13/TBB/'))}}
for(const path of ['/api/satellite/jma/tile/20260230000000/20261008100000/5/24/14','/api/satellite/jma/tile/20261008100000/20261008100000/5/99/14','/api/satellite/jma/tile/20261008100000/20261008100000/9/1/1','/api/satellite/jma/https://evil.test'])assert.equal(jmaUpstream(path),null);
assert.equal(jmaDirectURL('/api/satellite/jma/times'),'https://www.jma.go.jp/bosai/himawari/data/satimg/targetTimes_fd.json');
assert.equal(jmaDirectURL('/api/satellite/jma/tile/20261008100000/20261008100000/5/25/14'),jmaUpstream('/api/satellite/jma/tile/20261008100000/20261008100000/5/25/14').url);
assert.equal(jmaDirectURL('https://evil.test'),null);assert.equal(jmaDirectURL('/api/satellite/jma/tile/20261008100000/20261008100000/5/99/14'),null);
const original=globalThis.fetch;try{globalThis.fetch=async()=>new Response('not image',{status:404});const r=await satelliteRoute(new Request('https://site.test'+jmaTilePlan(viewportSpec([100,15,108,23]),frames.at(-1)).jobs[0].url));assert.equal(r.status,502);assert.equal(r.headers.get('Cache-Control'),'no-store');const denied=await satelliteRoute(new Request('https://site.test/api/satellite/jma/times',{method:'POST'}));assert.equal(denied.status,405)}finally{globalThis.fetch=original}
console.log('JMA: real observation times, 5-hour history, missing/future dates, bounded source zoom, fixed origin and uncached upstream failures passed');
