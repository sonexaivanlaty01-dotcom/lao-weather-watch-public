// River levels and KPL news served from the last copy in KV (owner, 29 Oct 2026: "โหลดช้า";
// MRC took ~6 s and KPL ~5 s). Offline: fetch is replaced and counted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {riverLevelsRoute,LEVELS_KV} from './worker/river-levels.mjs';
import {weatherNewsRoute,NEWS_KV} from './worker/weather-news.mjs';
import {readSnapshot,saveSnapshot} from './worker/snapshot-store.mjs';
let calls=0;globalThis.fetch=async u=>{calls++;throw new Error('offline '+u)};
const kv=()=>{const m=new Map();return {m,put:async(k,v,o)=>{m.set(k,{v,o})},get:async(k,t)=>{const x=m.get(k);return x?(t==='json'?JSON.parse(x.v):x.v):null}}};
const req=p=>new Request('https://x.test'+p,{headers:{'oai-authenticated-user-id':'t'}}),min=60000,now=Date.now();
const station={id:'011901',name:'Vientiane',river:'Mekong',level:5.1,status:'normal',time:new Date(now).toISOString()};
const levels=age=>({kind:'river_levels',fetchedAt:now-age,stations:[station]});

// Snapshot helpers: kept 2 days, unreadable or missing → null.
{const s=kv();await saveSnapshot(s,'a',{fetchedAt:1});assert.equal(s.m.get('a').o.expirationTtl,2*86400);assert.deepEqual(await readSnapshot(s,'a'),{fetchedAt:1});
 assert.equal(await readSnapshot(s,'b'),null);assert.equal(await readSnapshot(null,'a'),null);assert.equal(saveSnapshot(null,'a',{}),null);
 assert.equal(await readSnapshot({get:async()=>{throw new Error('kv down')}},'a'),null);await saveSnapshot(s,'c',{x:1});assert.equal(await readSnapshot(s,'c'),null,'no fetchedAt → ignored')}

// Rivers. Older than 2 h: not shown; MRC down → 503 as before.
{const s=kv();s.m.set(LEVELS_KV,{v:JSON.stringify(levels(3*60*min))});
 let r=await riverLevelsRoute(req('/api/rivers/levels'),{},{store:s});assert.equal(r.status,503);assert(calls>0,'too old → asks MRC');}
// Fresh copy in KV (5 min): served without asking MRC.
{const s=kv();s.m.set(LEVELS_KV,{v:JSON.stringify(levels(5*min))});calls=0;
 const r=await riverLevelsRoute(req('/api/rivers/levels'),{},{store:s});assert.equal(r.status,200);assert.equal((await r.json()).stations[0].name,'Vientiane');assert.equal(calls,0);
 // The cron always asks MRC (refresh), and keeps the copy when MRC fails.
 const waits=[];const c=await riverLevelsRoute(req('/api/rivers/levels'),{waitUntil:p=>waits.push(p)},{store:s,refresh:true});await Promise.all(waits);
 assert.equal(c.status,200);assert(calls>0,'cron refresh asked MRC');assert.equal((await c.json()).stations[0].level,5.1);}

// News: a 1 h old list is shown at once (no 5 s wait); KPL is asked in the background.
{const s=kv();s.m.set(NEWS_KV,{v:JSON.stringify({kind:'weather_news',fetchedAt:now-60*min,items:[{id:'1',lang:'lo',title:'ພະຍາກອນອາກາດ',date:new Date(now).toISOString().slice(0,10),url:'https://kpl.gov.la/detail.aspx?id=1'}]})});
 calls=0;const waits=[],t0=Date.now();const r=await weatherNewsRoute(req('/api/news/weather'),{waitUntil:p=>waits.push(p)},{store:s});
 assert.equal(r.status,200);assert.equal((await r.json()).items[0].title,'ພະຍາກອນອາກາດ');assert(Date.now()-t0<1000);assert.equal(waits.length,1,'refresh runs in the background');
 await Promise.all(waits);assert(calls>0,'KPL asked');}

// Wiring: Cloudflare passes KV; the 20,50 cron refreshes the shared copy; the local bundle includes the helper.
const w=fs.readFileSync('cloudflare-site/worker.mjs','utf8');
assert(w.includes("riverLevelsRoute(signed,ctx,{store:env.FORECAST_KV})")&&w.includes("weatherNewsRoute(signed,ctx,{store:env.FORECAST_KV})")&&w.includes("riverLevelsRoute(internal('/api/rivers/levels'),ctx,{store:env.FORECAST_KV,refresh:true})"));
assert(fs.readFileSync('build-radar-site.mjs','utf8').includes('worker/snapshot-store.mjs'));
console.log('snapshots ok');
