// Visitor counts: ping validation, anonymous storage, online window, Lao day, admin stats,
// pruning and page wiring. Runs the real SQL on node:sqlite through a small D1 adapter.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {validateVisit,visitRoute,visitStatsRoute,pruneVisits,laoDay,VISIT_ONLINE_MS,VISIT_PING_MS} from './worker/visits.mjs';
import {visitorId,visitPayload} from './dist/visits.js';
function sqliteD1(){
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('cloudflare-site/feedback-schema.sql','utf8'));
 return {db,prepare(sql){const st=db.prepare(sql.replace(/\?(\d)/g,'?'));const order=[...sql.matchAll(/\?(\d)/g)].map(m=>+m[1]-1);
  const run=a=>order.map(i=>a[i]);return {bind(...a){return {run:async()=>{st.run(...run(a));return {success:true}},all:async()=>({results:st.all(...run(a)).map(r=>({...r}))})}}}}};
}
const id='0123456789abcdef01234567',site='https://lao-weather-watch.example.workers.dev';
// Validation.
assert.deepEqual(validateVisit({id,view:'map',device:'mobile'}),{id,view:'map',device:'mobile'});
assert.deepEqual(validateVisit({id:id.toUpperCase(),view:'<x>',device:'tv'}),{id,view:null,device:null});
assert.equal(validateVisit({id:'short'}),null);assert.equal(validateVisit({id:'zz'.repeat(12)}),null);assert.equal(validateVisit(null),null);
// Lao day (UTC+7): 17:30 UTC on the 16th is already the 17th in Vientiane.
assert.equal(laoDay(Date.parse('2026-10-16T17:30:00Z')),'2026-10-17');assert.equal(laoDay(Date.parse('2026-10-16T16:59:00Z')),'2026-10-16');
assert.equal(laoDay(Date.parse('2026-10-16T17:30:00Z'),1),'2026-10-16');
// Route.
const d1=sqliteD1(),env={FEEDBACK_DB:d1,ADMIN_KEY:'test-admin-key-123456'},t0=Date.parse('2026-10-17T03:00:00Z');
const ping=(body,{origin=site,now=t0,ip='1.2.3.4'}={})=>visitRoute(new Request(site+'/api/visits',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':ip,...(origin?{Origin:origin}:{})},body:typeof body==='string'?body:JSON.stringify(body)}),env,{now});
assert.equal((await ping({id,view:'map',device:'mobile'})).status,200);
assert.equal((await ping({id,view:'news',device:'mobile'},{now:t0+VISIT_PING_MS})).status,200,'same browser again');
let rows=d1.db.prepare('SELECT * FROM visits').all();assert.equal(rows.length,1,'one row per browser per day');
assert.equal(rows[0].pings,2);assert.equal(rows[0].view,'news');assert.equal(rows[0].day,'2026-10-17');assert.match(rows[0].visitor,/^[0-9a-f]{24}$/);
assert(!JSON.stringify(rows).includes(id)&&!JSON.stringify(rows).includes('1.2.3.4'),'neither the browser id nor the IP is stored');
assert.equal((await ping({id:'f'.repeat(24),view:'weather',device:'desktop'},{now:t0+1000})).status,200);
assert.equal((await ping({id:'e'.repeat(24),view:'map',device:'mobile'},{now:t0-VISIT_ONLINE_MS-60000})).status,200,'left the site earlier today');
assert.equal((await ping({id:'d'.repeat(24),view:'map',device:'desktop'},{now:t0-86400000})).status,200,'yesterday');
assert.equal((await ping({id:'short'})).status,400);assert.equal((await ping('nope')).status,400);
assert.equal((await ping({id},{origin:'https://evil.example'})).status,403);
assert.equal((await visitRoute(new Request(site+'/api/visits'),env)).status,405);
assert.equal((await visitRoute(new Request(site+'/api/visits',{method:'POST',body:'{}'}),{})).status,503);
// Same id on the next Lao day is a new, unlinkable row.
const next=Date.parse('2026-10-17T17:05:00Z');await ping({id,view:'map',device:'mobile'},{now:next});
const hashes=d1.db.prepare('SELECT day,visitor FROM visits WHERE day IN (?,?)').all('2026-10-17','2026-10-18');
const [a,b]=['2026-10-17','2026-10-18'].map(day=>hashes.filter(r=>r.day===day).map(r=>r.visitor));assert(b.length===1&&!a.includes(b[0]),'daily hash changes');
d1.db.prepare('DELETE FROM visits WHERE day=?').run('2026-10-18');
// Admin stats.
const stats=key=>visitStatsRoute(new Request(site+'/api/visits/stats',{headers:key?{'X-Admin-Key':key}:{}}),env,{now:t0+VISIT_PING_MS+1000});
assert.equal((await stats()).status,401);assert.equal((await stats('wrong-key-wrong-key')).status,401);
const s=await (await stats(env.ADMIN_KEY)).json();
assert.equal(s.onlineNow,2,'two browsers pinged in the last 5 minutes');assert.deepEqual(s.onlineByView,{news:1,weather:1});
assert.equal(s.today,3);assert.equal(s.yesterday,1);assert.equal(s.last30.length,30);assert.equal(s.last30.at(-1).day,'2026-10-17');assert.equal(s.last30.at(-1).visitors,3);
assert.deepEqual(s.todayDevices,{mobile:2,desktop:1});assert.equal(s.onlineWindowMinutes,5);
// Pruning keeps 90 days.
d1.db.prepare("INSERT INTO visits (day,visitor,first_seen,last_seen) VALUES ('2026-01-01','old','x','x')").run();
await pruneVisits(env,t0);assert.equal(d1.db.prepare("SELECT COUNT(*) n FROM visits WHERE visitor='old'").get().n,0);assert.equal(d1.db.prepare('SELECT COUNT(*) n FROM visits').get().n,4);
// Page side: stable random id, payload.
const mem=new Map(),storage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,v)};
const first=visitorId(storage,()=>new Uint8Array(12).fill(171));assert.equal(first,'ab'.repeat(12));assert.equal(visitorId(storage,()=>new Uint8Array(12)),first,'kept in the browser');
assert.equal(visitorId({getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')}},()=>new Uint8Array(12).fill(1)),'01'.repeat(12),'works without storage');
assert.deepEqual(visitPayload(first,'map',375),{id:first,view:'map',device:'mobile'});assert.equal(visitPayload(first,null,1280).device,'desktop');
assert.equal(validateVisit(visitPayload(first,'map',375)).id,first,'page payload passes server validation');
// Wiring.
const app=fs.readFileSync('dist/app.js','utf8'),admin=fs.readFileSync('dist/admin.html','utf8'),worker=fs.readFileSync('cloudflare-site/worker.mjs','utf8');
assert(app.includes("startVisits({currentView:()=>$('workspace').dataset.view})"));
assert(admin.includes("fetch('/api/visits/stats'")&&admin.includes('กำลังใช้งานตอนนี้'));
assert(worker.includes("if(path==='/api/visits')return visitRoute(request,env)")&&worker.includes("if(path==='/api/visits/stats')return visitStatsRoute(request,env)")&&worker.includes('pruneVisits(env)'));
assert(worker.indexOf("path==='/api/visits'")<worker.indexOf('const signed=withUser('),'visits route reads the body, so it runs before withUser()');
{const {default:entry}=await import('./cloudflare-site/worker.mjs');const d=sqliteD1();
 const res=await entry.fetch(new Request(site+'/api/visits',{method:'POST',headers:{Origin:site},body:JSON.stringify({id,view:'map',device:'mobile'})}),{PUBLIC_SITE:'true',FEEDBACK_DB:d},{waitUntil(){}});
 assert.equal(res.status,200);assert.equal(d.db.prepare('SELECT COUNT(*) n FROM visits').get().n,1);}
console.log('Visits: validation, anonymous daily hash, online window, Lao day, admin stats, pruning and page wiring passed.');
