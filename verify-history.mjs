// Station history: rows from MRC rain/level data, the three storage layers (raw / hourly /
// daily), idempotent upserts, pruning, the read route and the cron wiring. Real SQL on node:sqlite.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {rainRows,levelRows,saveHistory,pruneHistory,historyQuery,historyRoute,dayComplete,laoDayOf,laoHourOf,HISTORY_RAW_DAYS,HISTORY_HOURLY_DAYS} from './worker/history.mjs';
function sqliteD1(){
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('cloudflare-site/feedback-schema.sql','utf8'));
 const prep=sql=>{const st=db.prepare(sql.replace(/\?(\d)/g,'?')),order=[...sql.matchAll(/\?(\d)/g)].map(m=>+m[1]-1),args=a=>order.map(i=>a[i]);
  const bound=a=>({run:async()=>(st.run(...args(a)),{success:true}),all:async()=>({results:st.all(...args(a)).map(r=>({...r}))}),first:async()=>{const r=st.get(...args(a));return r?{...r}:null},_run:()=>st.run(...args(a))});
  return {...bound([]),bind:(...a)=>bound(a)}};
 return {db,prepare:prep,batch:async list=>{db.exec('BEGIN');try{for(const s of list)s._run();db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}return list.map(()=>({success:true}))}};
}
const count=(d,t)=>d.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
// Lao time helpers (UTC+7).
assert.equal(laoDayOf(Date.parse('2026-10-18T17:30:00Z')),'2026-10-19');assert.equal(laoHourOf(Date.parse('2026-10-18T17:30:00Z')),'2026-10-19T00');
assert.equal(dayComplete('2026-10-18','2026-10-18T16:45:00.000Z'),true,'23:45 Lao');assert.equal(dayComplete('2026-10-18','2026-10-18T15:45:00.000Z'),false,'22:45 Lao');
// Rain rows: fresh stations only; values passed through.
const rain=t=>({stations:[{id:'011901',name:'Vientiane',river:'Mekong',lat:17.9,lon:102.6,time:t,rain1h:2.4,rain6h:5,rain24h:12.6,stale:false},{id:'011201',name:'Luang Prabang',time:t,rain1h:1,rain24h:3,stale:true},{id:'bad',time:t,rain1h:1}]});
const rr=rainRows(rain('2026-10-18T16:45:00.000Z'));assert.equal(rr.length,1,'stale and invalid stations skipped');
assert.deepEqual(rr[0].hourly,[{hour:'2026-10-18T23',v:2.4,t:'2026-10-18T16:45:00.000Z'}]);assert.equal(rr[0].daily[0].total,12.6);
// Level rows: newest 3 hourly medians, grouped per Lao day.
const hourly=Array.from({length:25},(_,i)=>8+i/100);hourly[23]=null;
const lev=t=>({stations:[{id:'013901',name:'Pakse',river:'Mekong',lat:15.1,lon:105.8,time:t,level:8.25,alarm:11,flood:12,hourly,stale:false}]});
const lr=levelRows(lev('2026-10-18T17:15:00.000Z'));assert.equal(lr[0].hourly.length,2,'gap (null) is not saved');
assert.deepEqual(lr[0].hourly.map(h=>h.hour),['2026-10-18T22','2026-10-19T00']);assert.deepEqual(lr[0].daily.map(d=>d.day),['2026-10-18','2026-10-19']);
assert.equal(levelRows(lev('2026-10-18T17:15:00.000Z'),25)[0].hourly.length,24);
// Storage: idempotent, latest wins, daily max/min accumulate.
const d1=sqliteD1();
await saveHistory(d1,rr);await saveHistory(d1,rr);assert.equal(count(d1,'obs_raw'),1);assert.equal(count(d1,'obs_hourly'),1);assert.equal(count(d1,'obs_daily'),1);assert.equal(count(d1,'stations'),1);
const later=rainRows({stations:[{...rain('').stations[0],time:'2026-10-18T16:55:00.000Z',rain1h:3,rain24h:13.2}]});await saveHistory(d1,later);
let day=d1.db.prepare("SELECT * FROM obs_daily WHERE kind='rain'").get();assert.equal(day.total,13.2);assert.equal(day.vmax,3);assert.equal(day.vmin,2.4);assert.equal(d1.db.prepare("SELECT v FROM obs_hourly").get().v,3);
await saveHistory(d1,rr);day=d1.db.prepare("SELECT * FROM obs_daily WHERE kind='rain'").get();assert.equal(day.total,13.2,'an older reading never overwrites a newer total');
await saveHistory(d1,levelRows(lev('2026-10-18T17:15:00.000Z'),25));
const lvDays=d1.db.prepare("SELECT * FROM obs_daily WHERE kind='level' ORDER BY day").all();assert.equal(lvDays.length,2);assert.equal(lvDays[0].vmax,8.22);assert.equal(lvDays[0].vmin,8,'reading 24 h earlier is 00:15 Lao on the same day');
assert.equal(d1.db.prepare("SELECT alarm FROM stations WHERE kind='level'").get().alarm,11);
// Pruning: raw > 10 days and hourly > 90 days go; daily stays.
const now=Date.parse('2026-10-19T00:00:00Z');
d1.db.prepare("INSERT INTO obs_raw VALUES ('011901','rain','2026-10-01T00:00:00.000Z',1)").run();d1.db.prepare("INSERT INTO obs_hourly VALUES ('011901','rain','2026-07-01T00',1,'x')").run();d1.db.prepare("INSERT INTO obs_daily (id,kind,day,total) VALUES ('011901','rain','2025-01-01',5)").run();
await pruneHistory(d1,now);assert.equal(d1.db.prepare("SELECT COUNT(*) n FROM obs_raw WHERE t<'2026-10-09'").get().n,0);assert.equal(d1.db.prepare("SELECT COUNT(*) n FROM obs_hourly WHERE hour<'2026-07-21'").get().n,0);assert.equal(d1.db.prepare("SELECT COUNT(*) n FROM obs_daily WHERE day='2025-01-01'").get().n,1);
assert.equal(HISTORY_RAW_DAYS,10);assert.equal(HISTORY_HOURLY_DAYS,90);
// Query validation and limits.
const p=s=>new URLSearchParams(s);
assert.equal(historyQuery(p('id=011901&kind=rain&res=raw&days=11')),null,'raw ≤ 10 days');assert.equal(historyQuery(p('id=011901&kind=rain&res=hourly&days=91')),null);
assert.equal(historyQuery(p('id=x;drop&kind=rain')),null);assert.equal(historyQuery(p('id=011901&kind=wind')),null);assert(historyQuery(p('id=011901&kind=rain&res=daily&days=3650')));
// Route.
const env={FEEDBACK_DB:d1},get=path=>historyRoute(new Request('https://x'+path),env,{},{now});
let r=await get('/api/history?id=011901&kind=rain&res=daily&days=30');assert.equal(r.status,200);let j=await r.json();
assert.equal(j.unit,'mm');assert.equal(j.station.name,'Vientiane');assert.equal(j.points.length,1);assert.equal(j.points[0].total,13.2);assert.equal(j.points[0].complete,true);assert.match(r.headers.get('Cache-Control'),/max-age=600/);
r=await get('/api/history?id=013901&kind=level&res=hourly&days=2');j=await r.json();assert.equal(j.unit,'m');assert.equal(j.points.length,24);
r=await get('/api/history/stations');j=await r.json();assert.equal(j.stations.length,2);assert.equal(j.keep.rawDays,10);assert(j.stations.find(s=>s.kind==='level').days>=2);
assert.equal((await get('/api/history?id=1&kind=rain')).status,400);assert.equal((await historyRoute(new Request('https://x/api/history',{method:'POST'}),env)).status,405);assert.equal((await historyRoute(new Request('https://x/api/history'),{})).status,503);
// Cron wiring: three schedules, history jobs under the 50-request limit by being separate.
const toml=fs.readFileSync('cloudflare-site/wrangler.toml','utf8'),worker=fs.readFileSync('cloudflare-site/worker.mjs','utf8');
assert(toml.includes('crons = ["*/30 * * * *", "10,40 * * * *", "20,50 * * * *"]'));
assert(worker.includes("if(path==='/api/history'||path==='/api/history/stations')return historyRoute(request,env,ctx)")&&worker.includes("cron.startsWith('10,40')"));
{const {default:entry}=await import('./cloudflare-site/worker.mjs');const d=sqliteD1();
 const res=await entry.fetch(new Request('https://site/api/history/stations'),{PUBLIC_SITE:'true',FEEDBACK_DB:d},{waitUntil(){}});assert.equal(res.status,200);
 let waited=0;await entry.scheduled({cron:'20,50 * * * *'},{},{waitUntil(){waited++}});assert.equal(waited,0,'no database, nothing to do');}
// Page side: chart series and summaries.
const {seriesFrom,summary,RANGES}=await import('./dist/history-chart.js');
assert.deepEqual(RANGES.map(r=>r[0]),['10d','90d','1y','all']);
const rs=seriesFrom({res:'daily',points:[{day:'2026-10-17',total:4,complete:true},{day:'2026-10-18',total:12.6,complete:false},{day:'2026-10-19',total:null}]},'rain');
assert.equal(rs.length,2,'missing days are not drawn as zero');assert.equal(rs[1].partial,true);
assert.deepEqual(summary(rs,'rain'),{total:16.6,max:12.6,maxKey:'2026-10-18',wet:2});
const ls=seriesFrom({res:'daily',points:[{day:'a',last:8,vmax:8.4,vmin:7.9},{day:'b',last:8.6,vmax:8.9,vmin:8.1}]},'level');
assert.deepEqual(summary(ls,'level'),{max:8.9,maxKey:'b',min:7.9,minKey:'a',last:8.6});assert.equal(summary([],'rain'),null);
assert(fs.readFileSync('dist/index.html','utf8').includes('id="historyDialog"')&&fs.readFileSync('dist/app.js','utf8').includes("historyDialog.open({id:s.id"));
console.log('History: rain/level rows, raw/hourly/daily layers, idempotent upserts, pruning (10 d / 90 d / keep daily), route and cron wiring passed.');
