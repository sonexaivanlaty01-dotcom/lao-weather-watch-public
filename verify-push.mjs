// Phone alerts (Web Push, 28 Oct 2026): encryption as a browser decrypts it (RFC 8291), the VAPID
// signature, alert texts, who gets which alert, the D1 queue (real SQL on node:sqlite), gone
// subscriptions, the routes, and the page/service-worker files. Push services are fakes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {PROVINCES} from './worker/seo-provinces.mjs';
import {KINDS,STATION_PROVINCES,BATCH,encryptPayload,vapidHeader,b64u,unb64u,stormPush,riverPush,weatherPush,dailyPush,addAlerts,sendBatch,kickPush,pushTick,pushRoute,validSubscription,runToken,pushReady,_resetPush,pruneDead,DEAD_SENDS,DEAD_DAYS} from './worker/push.mjs';
import {sameKey} from './worker/feedback.mjs';
import {RAIN_ALERT,HEAT_ALERT,HOT_FEELS} from './worker/fb-bot.mjs';
import {provinceSlug} from './dist/app-shell.js';

function sqliteD1(){
 const db=new DatabaseSync(':memory:');
 const prep=sql=>{const st=db.prepare(sql.replace(/\?(\d)/g,'?')),order=[...sql.matchAll(/\?(\d)/g)].map(m=>+m[1]-1),args=a=>order.map(i=>a[i]);
  const bound=a=>({run:async()=>({success:true,meta:{changes:Number(st.run(...args(a)).changes)}}),all:async()=>({results:st.all(...args(a)).map(r=>({...r}))}),first:async()=>{const r=st.get(...args(a));return r?{...r}:null}});
  return {...bound([]),bind:(...a)=>bound(a)}};
 return {db,prepare:prep};
}
const enc=new TextEncoder(),concat=(...p)=>{const o=new Uint8Array(p.reduce((n,x)=>n+x.length,0));let i=0;for(const x of p){o.set(x,i);i+=x.length}return o};
async function hkdf(salt,ikm,info,len){const k=await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},k,len*8))}
// A browser: its own key pair and auth secret; decrypts what the Worker sends.
async function browser(){
 const kp=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),pub=new Uint8Array(await crypto.subtle.exportKey('raw',kp.publicKey)),auth=crypto.getRandomValues(new Uint8Array(16));
 const decrypt=async bytes=>{const salt=bytes.slice(0,16),rs=new DataView(bytes.buffer,bytes.byteOffset+16,4).getUint32(0),idlen=bytes[20],asPub=bytes.slice(21,21+idlen),ct=bytes.slice(21+idlen);
  assert.equal(rs,4096);assert.equal(idlen,65);
  const asKey=await crypto.subtle.importKey('raw',asPub,{name:'ECDH',namedCurve:'P-256'},false,[]),shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:asKey},kp.privateKey,256));
  const ikm=await hkdf(auth,shared,concat(enc.encode('WebPush: info\0'),pub,asPub),32),cek=await hkdf(salt,ikm,enc.encode('Content-Encoding: aes128gcm\0'),16),nonce=await hkdf(salt,ikm,enc.encode('Content-Encoding: nonce\0'),12);
  const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']),ct));
  assert.equal(plain.at(-1),2,'last record delimiter');return new TextDecoder().decode(plain.slice(0,-1))};
 return {keys:{p256dh:b64u(pub),auth:b64u(auth)},decrypt};
}

// Keys: one secret, the public key is rebuilt from it.
const vk=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const env0={VAPID_PRIVATE_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',vk.privateKey))};
assert(pushReady(env0));assert(!pushReady({}));assert(!pushReady({VAPID_PRIVATE_JWK:'{"x":1}'}));

// Encryption round trip (Lao text survives).
const b=await browser(),text=JSON.stringify({title:'🌊 ນ້ຳຂຶ້ນຮອດລະດັບເຕືອນໄພ',body:'ທົດສອບ'});
assert.equal(await b.decrypt(await encryptPayload(b.keys,text)),text);

// VAPID header: ES256 JWT for the push service origin, signed by our key, with our public key.
const now=Date.parse('2026-10-28T10:05:00Z');
const hdr=await vapidHeader(env0,'https://fcm.googleapis.com/fcm/send/abc',now),m=hdr.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);assert(m,'vapid header shape');
const claims=JSON.parse(new TextDecoder().decode(unb64u(m[2])));assert.equal(claims.aud,'https://fcm.googleapis.com');assert.equal(claims.exp,Math.floor(now/1000)+43200);assert.match(claims.sub,/^https:\/\//);
assert(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},vk.publicKey,unb64u(m[3]),enc.encode(m[1]+'.'+m[2])),'signature verifies');
assert.equal(m[4],b64u(new Uint8Array(await crypto.subtle.exportKey('raw',vk.publicKey))));

// Province slugs: the page builds them with provinceSlug(name_en) from provinces.geojson; the server uses PROVINCES.
const geo=JSON.parse(fs.readFileSync('dist/data/admin/provinces.geojson','utf8'));
assert.deepEqual(geo.features.map(f=>provinceSlug(f.properties.name_en)).sort(),PROVINCES.map(p=>p.slug).sort());
for(const list of Object.values(STATION_PROVINCES))for(const s of list)assert(PROVINCES.some(p=>p.slug===s),'station province '+s);

// Alert texts.
const storm={id:'IO0226',name:'Arnab',category:'SCS',agency:'JTWC',level:'watch',points:[{laoKm:1250,w:30,course:45}],closest:{km:900,h:60}};
const sp=stormPush(storm);assert.equal(sp.key,'storm:IO0226:watch');assert.equal(sp.provinces,'*');assert.match(sp.title,/ເຝົ້າລະວັງພາຍຸ/);assert.match(sp.body,/1,250 km.*~900 km ໃນອີກ ~2\.5 ວັນ.*JTWC/);assert.equal(sp.url,'/storm/IO0226');
assert.equal(stormPush({...storm,level:'far'}),null);
const stations=[{id:'011901',name:'Vientiane KM4',river:'Mekong',lat:17.9,lon:102.6,level:11.8,alarm:11.5,flood:12.5,status:'alarm',rise24:0.6,stale:false},{id:'013901',name:'Pakse',status:'flood',level:12.3,alarm:11,flood:12,stale:true},{id:'013806',name:'Ban Mai Singsamphan',river:'Mekong',status:'flood',level:13.2,alarm:12,flood:13,stale:false},{id:'999999',name:'New',lat:21.0,lon:101.2,status:'alarm',level:5,alarm:4,flood:6,stale:false},{id:'011201',status:'normal'}];
const rp=riverPush(stations,now);assert.equal(rp.length,3,'stale and normal stations skipped');
assert.equal(rp[0].key,'river:2026-10-28:011901:alarm');assert.equal(rp[0].provinces,'vientiane-capital');assert.match(rp[0].body,/Mekong 11\.8 ມ\. \(ລະດັບເຕືອນ 11\.5 ມ\.\) · ຂຶ້ນ 0\.6 ມ\./);
assert.equal(rp[1].provinces,'salavan,champasak');assert.match(rp[1].title,/ລະດັບນ້ຳຖ້ວມ/);assert.equal(rp[2].provinces,'luang-namtha','unknown station → nearest province');
const rows=[{slug:'xaignabouli',name:'ໄຊຍະບູລີ',date:'2026-10-29',rain:RAIN_ALERT+12,feels:33},{slug:'attapeu',name:'ອັດຕະປື',date:'2026-10-29',rain:3,feels:HEAT_ALERT+1.4},{slug:'bokeo',name:'ບໍ່ແກ້ວ',date:'2026-10-29',rain:RAIN_ALERT-1,feels:HEAT_ALERT-1}];
const wp=weatherPush(rows);assert.deepEqual(wp.map(a=>a.key),['rain:2026-10-29:xaignabouli','heat:2026-10-29:attapeu']);assert.match(wp[0].title,/ມື້ອື່ນ ຝົນຕົກໜັກ: ແຂວງໄຊຍະບູລີ/);assert.match(wp[1].body,/42°C/);assert.equal(wp[1].url,'/weather/attapeu');
// Morning summary (06:00): one per province; words follow chance and amount.
const dp=dailyPush([{slug:'xaignabouli',name:'ໄຊຍະບູລີ',date:'2026-10-28',tmin:22.4,tmax:31.6,feels:34,rain:RAIN_ALERT+5,pop:90,uv:6},{slug:'attapeu',name:'ອັດຕະປື',date:'2026-10-28',tmin:24,tmax:37,feels:HEAT_ALERT+1,rain:0,pop:5,uv:10},{slug:'bokeo',name:'ບໍ່ແກ້ວ',date:'2026-10-28',tmin:18,tmax:29,feels:30,rain:2,pop:100,uv:5},{slug:'salavan',name:'ສາລະວັນ',date:'2026-10-28',tmin:21,tmax:30,feels:HOT_FEELS,rain:1,pop:40,uv:7}]);
assert.deepEqual(dp.map(a=>[a.key,a.kind,a.provinces,a.url]),[['daily:2026-10-28:xaignabouli','daily','xaignabouli','/weather/xaignabouli'],['daily:2026-10-28:attapeu','daily','attapeu','/weather/attapeu'],['daily:2026-10-28:bokeo','daily','bokeo','/weather/bokeo'],['daily:2026-10-28:salavan','daily','salavan','/weather/salavan']]);
assert.equal(dp[0].title,'🌧 ອາກາດມື້ນີ້: ແຂວງໄຊຍະບູລີ');assert.equal(dp[0].body,`22–32°C · ຝົນຕົກໜັກ (ໂອກາດ 90% · ~${RAIN_ALERT+5} mm) · ລະວັງນ້ຳຖ້ວມສັ້ນ · ທີ່ມາ Open-Meteo`);
assert.equal(dp[1].title,'☀️ ອາກາດມື້ນີ້: ແຂວງອັດຕະປື');assert.equal(dp[1].body,`24–37°C · ສ່ວນຫຼາຍແດດ ຝົນໜ້ອຍ · ຮ້ອນຈັດ ຮູ້ສຶກ ${HEAT_ALERT+1}°C ດື່ມນ້ຳຫຼາຍໆ · UV ສູງ ທາຄີມກັນແດດ · ທີ່ມາ Open-Meteo`);
assert.equal(dp[2].title,'🌦 ອາກາດມື້ນີ້: ແຂວງບໍ່ແກ້ວ');assert.match(dp[2].body,/ຝົນເລັກນ້ອຍ \(ໂອກາດ 100% · ~2 mm\) · ພົກຄັນຮົ່ມ/,'100 % of 2 mm is light rain');
assert.equal(dp[3].title,'🌦 ອາກາດມື້ນີ້: ແຂວງສາລະວັນ');assert.match(dp[3].body,new RegExp(`ອາດມີຝົນ \\(ໂອກາດ 40%\\) · ຮູ້ສຶກຮ້ອນ ${HOT_FEELS}°C`));
assert.equal(dailyPush([{slug:'vientiane-capital',name:'ນະຄອນຫຼວງວຽງຈັນ',date:'2026-10-28',tmin:23,tmax:31,feels:33,rain:0,pop:0,uv:5}])[0].title,'☀️ ອາກາດມື້ນີ້: ນະຄອນຫຼວງວຽງຈັນ','the capital is not a ແຂວງ');
assert.equal(weatherPush([{slug:'vientiane-capital',name:'ນະຄອນຫຼວງວຽງຈັນ',date:'2026-10-29',rain:RAIN_ALERT,feels:30}])[0].title,'🌧 ມື້ອື່ນ ຝົນຕົກໜັກ: ນະຄອນຫຼວງວຽງຈັນ');
for(const a of dp)assert(new TextEncoder().encode(JSON.stringify(a)).length<1000,'short enough for a phone');

// Routes + queue on real SQL.
_resetPush();const d1=sqliteD1(),env={...env0,FEEDBACK_DB:d1};
const req=(path,o={})=>new Request('https://x.test'+path,o),post=(path,data)=>req(path,{method:'POST',body:JSON.stringify(data)});
const call=r=>pushRoute(r,env,{now,sameKey});
assert.equal((await pushRoute(req('/api/push/key'),{FEEDBACK_DB:d1},{now,sameKey})).status,404,'off without the secret');
const key=await (await call(req('/api/push/key'))).json();assert.equal(key.key,m[4]);
const people={};let n=0;
async function join(province,kinds,host='fcm.googleapis.com'){const br=await browser(),endpoint=`https://${host}/fcm/send/dev${++n}`;const r=await call(post('/api/push/subscribe',{subscription:{endpoint,keys:br.keys},province,kinds}));people[endpoint]=br;return {r,endpoint}}
const vte=await join('vientiane-capital',KINDS),cps=await join('champasak',['river','storm']),xyb=await join('xaignabouli',['rain']),att=await join('attapeu',['storm'],'web.push.apple.com');
for(const x of [vte,cps,xyb,att])assert.equal(x.r.status,200);
assert.equal((await join('vientiane-capital',KINDS,'evil.example.com')).r.status,400,'only real push services');
assert.equal((await join('nowhere',KINDS)).r.status,400);assert.equal((await join('bokeo',['spam'])).r.status,400);
assert.equal((await call(req('/api/push/subscribe',{method:'POST',body:'x'.repeat(5000)}))).status,400);
assert(!validSubscription({endpoint:'http://fcm.googleapis.com/x',keys:people[vte.endpoint].keys}));
// Changing province keeps one row.
await call(post('/api/push/subscribe',{subscription:{endpoint:cps.endpoint,keys:people[cps.endpoint].keys},province:'salavan',kinds:['river','storm']}));
assert.equal(d1.db.prepare('SELECT COUNT(*) n FROM push_subs').get().n,4);assert.equal(d1.db.prepare('SELECT province FROM push_subs WHERE endpoint=?').get(cps.endpoint).province,'salavan');

const made=await addAlerts(env,[sp,...rp.slice(0,2),...wp],now);assert.equal(made.length,5);
assert.deepEqual(await addAlerts(env,[sp],now),[],'same alert never twice');
const queued=Object.fromEntries(d1.db.prepare('SELECT key,queued FROM push_alerts').all().map(r=>[r.key,r.queued]));
assert.deepEqual(queued,{'storm:IO0226:watch':3,'river:2026-10-28:011901:alarm':1,'river:2026-10-28:013806:flood':1,'rain:2026-10-29:xaignabouli':1,'heat:2026-10-29:attapeu':0});

// Sending: Apple says "gone" (410) → that subscription is removed; one FCM send fails (500) → retried later.
const got=[];let failOnce=true;
const fakePush=async(url,init)=>{const u=String(url);assert.equal(init.headers['Content-Encoding'],'aes128gcm');assert.match(init.headers.Authorization,/^vapid t=/);
 if(u.includes('web.push.apple.com'))return new Response(null,{status:410});
 const msg=JSON.parse(await people[u].decrypt(new Uint8Array(init.body)));if(failOnce&&msg.tag.startsWith('rain')){failOnce=false;return new Response(null,{status:500})}
 got.push([u,msg.tag,init.headers.Urgency]);return new Response(null,{status:201})};
const r1=await sendBatch(env,{now,fetchImpl:fakePush});assert.deepEqual(r1,{sent:4,failed:1,gone:1});
assert.equal(d1.db.prepare('SELECT COUNT(*) n FROM push_subs').get().n,3,'gone subscription deleted');
const r2=await sendBatch(env,{now:now+11*60000,fetchImpl:fakePush});assert.deepEqual(r2,{sent:1,failed:0,gone:0},'retry after the claim expires');
assert.deepEqual(got.map(g=>g[1]).sort(),['rain:2026-10-29:xaignabouli','river:2026-10-28:011901:alarm','river:2026-10-28:013806:flood','storm:IO0226:watch','storm:IO0226:watch']);
assert(got.every(([,tag,u])=>u===(tag.startsWith('storm')||tag.startsWith('river')?'high':'normal')));
assert.equal(d1.db.prepare('SELECT COUNT(*) n FROM push_queue').get().n,0);

// A very long text is cut so the encrypted message stays one record under the ~4 KB push limit.
await addAlerts(env,[{key:'storm:LONG:near',kind:'storm',provinces:'*',title:'ທ'.repeat(500),body:'ນ້ຳ'.repeat(3000),url:'/'}],now);
let longSize=0;const longOk=await sendBatch(env,{now,fetchImpl:async(u,init)=>{longSize=init.body.length;const msg=JSON.parse(await people[u].decrypt(new Uint8Array(init.body)));assert.equal(msg.title.length,120);return new Response(null,{status:201})}});
assert(longOk.sent>=1&&longSize>0&&longSize<4096,'payload '+longSize+' bytes');d1.db.prepare('DELETE FROM push_queue').run();d1.db.prepare("DELETE FROM push_alerts WHERE key='storm:LONG:near'").run();
// Batches: no more than BATCH per run; parallel runs never share rows.
for(let i=0;i<BATCH+15;i++)d1.db.prepare('INSERT INTO push_queue (alert_key,endpoint,created_at) VALUES (?,?,?)').run('storm:IO0226:watch',vte.endpoint,new Date(now).toISOString());
let calls=0;const counting=async()=>{calls++;return new Response(null,{status:201})};
const [x,y]=await Promise.all([sendBatch(env,{now,fetchImpl:counting}),sendBatch(env,{now,fetchImpl:counting})]);
assert.equal(x.sent+y.sent,BATCH+15);assert(x.sent<=BATCH&&y.sent<=BATCH);assert.equal(calls,BATCH+15);

// Cron: without SELF one batch goes directly; with SELF the cron only knocks on /api/push/drain.
for(let i=0;i<3;i++)d1.db.prepare('INSERT INTO push_queue (alert_key,endpoint,created_at) VALUES (?,?,?)').run('storm:IO0226:watch',vte.endpoint,new Date(now).toISOString());
const knocks=[];const envSelf={...env,SELF:{fetch:async(u,init)=>{knocks.push([u,init.headers['X-Push-Run']]);return new Response('{}')}}};
assert.deepEqual(await kickPush(envSelf),{kicked:true});assert.equal(knocks[0][0],'https://push.internal/api/push/drain');assert.equal(knocks[0][1],await runToken(env));
assert.equal((await pushRoute(req('/api/push/drain',{method:'POST',headers:{'X-Push-Run':'guess-guess-guess'}}),envSelf,{now,sameKey})).status,401);
const dr=await (await pushRoute(req('/api/push/drain',{method:'POST',headers:{'X-Push-Run':knocks[0][1]}}),envSelf,{now,sameKey})).json();assert.deepEqual(dr,{queued:3,runs:1});assert.equal(knocks.at(-1)[0],'https://push.internal/api/push/run');
d1.db.prepare('DELETE FROM push_queue').run();assert.equal(await kickPush(envSelf),null,'empty queue: nothing to do');

// pushTick: storms every run, tomorrow's rain/heat only in the 17:00 Lao run, rivers when levels are given.
let om=0;const omFetch=async u=>{om++;assert.match(String(u),/api\.open-meteo\.com/);return Response.json(PROVINCES.map(p=>({daily:{time:['2026-10-28','2026-10-29'],weather_code:[3,3],temperature_2m_max:[32,33],temperature_2m_min:[21,21],apparent_temperature_max:[35,p.slug==='salavan'?43:35],precipitation_sum:[1,p.slug==='bokeo'?70:1],precipitation_probability_max:[10,90],uv_index_max:[7,7]}})))};
const at=(h,mi)=>Date.parse('2026-10-28T00:00:00Z')+((h-7)*60+mi)*60000;   // Lao time (UTC+7) on 28 Oct
assert.deepEqual(await pushTick(env,{now:at(15,0),storms:async()=>[{...storm,level:'near'}],fetchImpl:omFetch}),['storm:IO0226:near']);assert.equal(om,0);
assert.deepEqual((await pushTick(env,{now:at(17,0),storms:async()=>[],fetchImpl:omFetch})).sort(),['heat:2026-10-29:salavan','rain:2026-10-29:bokeo']);assert.equal(om,1);
assert.deepEqual(await pushTick(env,{now:at(17,30),storms:async()=>[],fetchImpl:omFetch}),[],'second 17:xx run: nothing new');
// 06:00 run: today's summary for all 18 provinces, queued only for people who turned it on.
const morning=await pushTick(env,{now:at(6,0),storms:async()=>[],fetchImpl:omFetch});
assert.equal(morning.length,PROVINCES.length);assert(morning.every(k=>k.startsWith('daily:2026-10-28:')));
assert.deepEqual(d1.db.prepare("SELECT key,queued FROM push_alerts WHERE kind='daily' AND queued>0").all().map(r=>({...r})),[{key:'daily:2026-10-28:vientiane-capital',queued:1}],'only the subscriber with "daily" on');
assert.match(d1.db.prepare("SELECT body FROM push_alerts WHERE key='daily:2026-10-28:bokeo'").get().body,/^21–32°C · ສ່ວນຫຼາຍແດດ ຝົນໜ້ອຍ/);
assert.deepEqual(await pushTick(env,{now:at(6,30),storms:async()=>[],fetchImpl:omFetch}),[],'06:30 run: nothing new');
assert.deepEqual(await pushTick(env,{now:at(7,0),storms:async()=>[],fetchImpl:omFetch}),[]);assert.equal(om,4,'Open-Meteo only in the 17:00/17:30 and 06:00/06:30 runs');
// A morning summary waits at most 4 h; it is useless in the evening.
const ttl={};await sendBatch(env,{now:at(6,1),fetchImpl:async(u,init)=>{const msg=JSON.parse(await people[u].decrypt(new Uint8Array(init.body)));ttl[msg.tag.split(':')[0]]=[init.headers.TTL,init.headers.Urgency];return new Response(null,{status:201})}});
assert.deepEqual(ttl.daily,[String(4*3600),'normal']);
assert.deepEqual(await pushTick(env,{now,riverLevels:{stations:[stations[0]]}}),[],'already sent today');
assert.deepEqual(await pushTick({FEEDBACK_DB:d1},{now,storms:async()=>[storm]}),[],'no secret: nothing');

// Recent list: storms for everyone, province alerts only there, never the morning summaries.
const recent=await (await call(req('/api/push/recent?province=salavan'))).json();
assert.deepEqual(recent.alerts.map(a=>a.key).sort(),['heat:2026-10-29:salavan','river:2026-10-28:013806:flood','storm:IO0226:near','storm:IO0226:watch']);
assert.equal((await call(req('/api/push/recent?province=x'))).status,400);
// Unsubscribe removes the row and its waiting sends.
await addAlerts(env,[{...sp,key:'storm:TEST:near'}],now);assert(d1.db.prepare('SELECT COUNT(*) n FROM push_queue WHERE endpoint=?').get(vte.endpoint).n>0);
assert.equal((await call(post('/api/push/unsubscribe',{endpoint:vte.endpoint}))).status,200);
assert.equal(d1.db.prepare('SELECT COUNT(*) n FROM push_queue WHERE endpoint=?').get(vte.endpoint).n,0);assert.equal(d1.db.prepare('SELECT COUNT(*) n FROM push_subs WHERE endpoint=?').get(vte.endpoint).n,0);

// Owner test from admin.html (1 Nov 2026, owner's request): admin key only; sent at once (never queued,
// never stored, so never in the recent list); today's real summary or a marked emergency test; a device the
// push service calls gone is removed; devices shown by a short id, never by their push address.
{const apl=await join('bokeo',['storm'],'web.push.apple.com');let omA=0;const sent=[];
 const fakeA=async(u,init)=>{u=String(u);if(u.includes('open-meteo')){omA++;return omFetch(u)}if(u===apl.endpoint)return new Response(null,{status:410});
  sent.push({u,urgency:init.headers.Urgency,msg:JSON.parse(await people[u].decrypt(new Uint8Array(init.body)))});return new Response(null,{status:201})};
 const isAdmin=r=>sameKey(r.headers.get('X-Admin-Key'),'owner-key-123');
 const adm=(path,data,k='owner-key-123')=>pushRoute(req(path,{method:data?'POST':'GET',headers:{'X-Admin-Key':k},body:data?JSON.stringify(data):undefined}),env,{now,sameKey,isAdmin,fetchImpl:fakeA});
 assert.equal((await adm('/api/push/admin/devices',null,'wrong-key')).status,401);
 assert.equal((await pushRoute(req('/api/push/admin/devices'),env,{now,sameKey})).status,401,'no admin check given: locked');
 const dev=(await (await adm('/api/push/admin/devices')).json()).devices,by=p=>dev.find(d=>d.province===p);
 assert.equal(dev.length,3);assert(dev.every(d=>/^[\w-]{10}$/.test(d.id)&&!('endpoint' in d)&&!('auth' in d)),'short id only');
 assert.equal(by('bokeo').platform,'iphone');assert.equal(by('salavan').platform,'android');assert.equal(by('salavan').provinceName,'ສາລະວັນ');assert.deepEqual(by('salavan').kinds,['river','storm']);
 const count=t=>d1.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n,queueBefore=count('push_queue'),alertsBefore=count('push_alerts');
 const t1=await (await adm('/api/push/admin/test',{type:'daily',ids:[by('salavan').id,by('xaignabouli').id]})).json();
 assert.deepEqual(t1.results.map(r=>r.status),['sent','sent']);
 const sal=sent.find(s=>s.u===cps.endpoint).msg;assert.equal(sal.title,'🧪 ທົດສອບ · '+d1.db.prepare("SELECT title FROM push_alerts WHERE key='daily:2026-10-28:salavan'").get().title);
 assert.equal(sal.url,'/weather/salavan');assert.match(sal.tag,/^test:/);assert(sent.every(s=>s.urgency==='normal'));assert.equal(omA,0,'summary already made today');
 sent.length=0;
 const t2=await (await adm('/api/push/admin/test',{type:'emergency',ids:dev.map(d=>d.id)})).json();
 assert.deepEqual(Object.fromEntries(t2.results.map(r=>[r.province,r.status])),{bokeo:'gone',salavan:'sent',xaignabouli:'sent'});
 assert(sent.length===2&&sent.every(s=>s.urgency==='high'&&s.msg.title.includes('ບໍ່ແມ່ນເຫດການຈິງ')),'emergency = high urgency, clearly a test');
 assert.equal(d1.db.prepare('SELECT COUNT(*) n FROM push_subs WHERE endpoint=?').get(apl.endpoint).n,0,'gone device removed');
 assert.equal(count('push_queue'),queueBefore,'never queued');assert.equal(count('push_alerts'),alertsBefore,'never stored');
 assert.equal((await adm('/api/push/admin/test',{type:'spam',ids:[by('salavan').id]})).status,400);
 assert.equal((await adm('/api/push/admin/test',{type:'daily',ids:[]})).status,400);
 assert.equal((await adm('/api/push/admin/test',{type:'daily',ids:Array.from({length:11},(_,i)=>'id'+i)})).status,400,'at most 10 at once');
 assert.deepEqual((await (await adm('/api/push/admin/test',{type:'daily',ids:['nobody0000']})).json()).results,[{id:'nobody0000',status:'missing'}]);
 // Before 06:00 there is no summary yet: today's forecast is fetched once and used.
 d1.db.prepare("DELETE FROM push_alerts WHERE key='daily:2026-10-28:salavan'").run();sent.length=0;
 const t3=await (await adm('/api/push/admin/test',{type:'daily',ids:[by('salavan').id]})).json();
 assert.equal(t3.results[0].status,'sent');assert.equal(omA,1);assert.match(sent[0].msg.title,/^🧪 ທົດສອບ · .+ອາກາດມື້ນີ້: ແຂວງສາລະວັນ$/);
 assert(t3.results[0].key.startsWith('test:'),'result names its test key (the admin page waits for that receipt)');
 // Delete one device by hand (owner only).
 assert.equal((await pushRoute(req('/api/push/admin/delete',{method:'POST',body:JSON.stringify({id:by('xaignabouli').id})}),env,{now,sameKey})).status,401);
 assert.deepEqual(await (await adm('/api/push/admin/delete',{id:by('xaignabouli').id})).json(),{ok:true,deleted:1});
 assert.equal(d1.db.prepare('SELECT COUNT(*) n FROM push_subs WHERE endpoint=?').get(xyb.endpoint).n,0);
 assert.deepEqual(await (await adm('/api/push/admin/delete',{id:'nobody0000'})).json(),{ok:true,deleted:0});
 const ah=fs.readFileSync('dist/admin.html','utf8');
 assert(ah.includes("'/api/push/admin/devices'")&&ah.includes("'/api/push/admin/test'")&&ah.includes('id="pushTest"'),'admin page has the test box');
 assert(!/innerHTML\s*=\s*[^'"`]/.test(ah.split('pushTest')[1]||''),'device rows built with textContent');
 assert(ah.includes("'/api/push/admin/delete'")&&ah.includes('ackKey')&&ah.includes('pendingCount'),'admin page: delete button, receipt wait, silent count')}

// Receipts and automatic clean-up (1 Nov 2026, owner's request): a phone answers /api/push/ack after showing
// an alert; opening the app (subscribe) also counts as alive. A device is removed only after DEAD_SENDS
// accepted sends over DEAD_DAYS days with no sign of life; one sign of life starts the count again.
{_resetPush();const dz=sqliteD1(),envZ={...env0,FEEDBACK_DB:dz},callZ=(r,t=now)=>pushRoute(r,envZ,{now:t,sameKey});
 // An old table (before 1 Nov) gains the new columns on first use.
 dz.db.exec('CREATE TABLE push_subs (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, province TEXT NOT NULL, kinds TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
 const brs={},sub=async(name,t=now)=>{const br=await browser(),endpoint='https://fcm.googleapis.com/fcm/send/'+name;brs[endpoint]=br;assert.equal((await callZ(post('/api/push/subscribe',{subscription:{endpoint,keys:br.keys},province:'bokeo',kinds:['storm','daily']}),t)).status,200);return endpoint};
 const live=await sub('live'),dead=await sub('dead'),quiet=await sub('quiet');
 const cols=dz.db.prepare('PRAGMA table_info(push_subs)').all().map(c=>c.name);for(const c of ['last_seen','last_ack_key','pending_since','pending_count'])assert(cols.includes(c),'column '+c);
 const row=e=>({...dz.db.prepare('SELECT last_seen,last_ack_key,pending_since,pending_count FROM push_subs WHERE endpoint=?').get(e)});
 assert.equal(row(live).last_seen,new Date(now).toISOString(),'sign-up = alive');
 const DAY=86400000,ok=async()=>new Response(null,{status:201});
 // One alert a day for DEAD_DAYS days; only "live" answers each time, "quiet" never gets one (warnings only, nothing happened).
 for(let i=0;i<DEAD_DAYS;i++){const t=now+i*DAY;
  for(const e of [live,dead])dz.db.prepare('INSERT INTO push_queue (alert_key,endpoint,created_at) VALUES (?,?,?)').run('daily:x'+i,e,new Date(t).toISOString());
  dz.db.prepare('INSERT OR IGNORE INTO push_alerts (key,kind,provinces,title,body,url,created_at) VALUES (?,?,?,?,?,?,?)').run('daily:x'+i,'daily','bokeo','t','b','/',new Date(t).toISOString());
  await sendBatch(envZ,{now:t,fetchImpl:ok});
  assert.equal((await callZ(post('/api/push/ack',{endpoint:live,key:'daily:x'+i}),t+60000)).status,200);
  if(i===DEAD_DAYS-2)assert.equal(await pruneDead(envZ,t),0,'not yet: too early')}
 assert.equal(row(live).pending_count,0);assert.equal(row(live).last_ack_key,'daily:x'+(DEAD_DAYS-1));
 assert.equal(row(dead).pending_count,DEAD_DAYS);assert.equal(row(dead).pending_since,new Date(now).toISOString());
 assert.equal(row(quiet).pending_count,0);
 assert.equal(await pruneDead(envZ,now+(DEAD_DAYS-1)*DAY),0,'13 days of silence: kept');
 assert.equal(await pruneDead(envZ,now+DEAD_DAYS*DAY),1,'14 days and 14 unanswered sends: removed');
 const left=dz.db.prepare('SELECT endpoint FROM push_subs').all().map(r=>r.endpoint).sort();assert.deepEqual(left,[live,quiet].sort(),'live and quiet devices kept');
 // Fewer than DEAD_SENDS unanswered sends is never enough, however long.
 dz.db.prepare('UPDATE push_subs SET pending_count=?,pending_since=? WHERE endpoint=?').run(DEAD_SENDS-1,new Date(now-100*DAY).toISOString(),quiet);
 assert.equal(await pruneDead(envZ,now),0,'5 sends in 100 days: kept');
 // Opening the app (the page re-sends its subscription) resets the count.
 dz.db.prepare('UPDATE push_subs SET pending_count=?,pending_since=? WHERE endpoint=?').run(DEAD_SENDS+3,new Date(now-100*DAY).toISOString(),quiet);
 await sub('quiet',now+5);assert.equal(row(quiet).pending_count,0);assert.equal(row(quiet).pending_since,null);assert.equal(await pruneDead(envZ,now),0);
 // A receipt for an unknown address changes nothing; a bad body is refused.
 assert.equal((await callZ(post('/api/push/ack',{endpoint:'https://fcm.googleapis.com/fcm/send/nobody',key:'x'}))).status,200);
 assert.equal((await callZ(post('/api/push/ack',{key:'x'}))).status,400);
 // pushTick runs the clean-up (every */30 run).
 dz.db.prepare('UPDATE push_subs SET pending_count=?,pending_since=? WHERE endpoint=?').run(DEAD_SENDS,new Date(now-DEAD_DAYS*DAY).toISOString(),quiet);
 await pushTick(envZ,{now,storms:async()=>[],fetchImpl:omFetch});assert.equal(dz.db.prepare('SELECT COUNT(*) n FROM push_subs WHERE endpoint=?').get(quiet).n,0,'pushTick prunes');
 // Admin list shows the signs of life.
 const devZ=(await (await pushRoute(req('/api/push/admin/devices'),envZ,{now,sameKey,isAdmin:()=>true})).json()).devices;
 assert.deepEqual(Object.keys(devZ[0]).filter(k=>['lastSeen','pendingCount','pendingSince','ackKey'].includes(k)).sort(),['ackKey','lastSeen','pendingCount','pendingSince']);
 // The service worker answers after showing the alert, with its own subscription address.
 const swz=fs.readFileSync('dist/sw.js','utf8');assert(swz.includes("'/api/push/ack'")&&/showNotification\([\s\S]*\)\.then\(/.test(swz)&&swz.includes('pushManager.getSubscription()'),'sw sends a receipt after showing');
 _resetPush()}

// Worker wiring: route, rate limit on sign-up, crons, SELF binding.
const w=fs.readFileSync('cloudflare-site/worker.mjs','utf8'),toml=fs.readFileSync('cloudflare-site/wrangler.toml','utf8');
assert(w.includes("path.startsWith('/api/push/'))return pushRoute(request,env,{sameKey,isAdmin})"));assert(w.includes("path==='/api/push/subscribe'||path==='/api/push/unsubscribe')?env.WRITE_LIMIT"));
assert(w.includes("path.startsWith('/api/push/admin/')"),'owner push routes count against ADMIN_LIMIT');
assert(w.includes("path==='/api/push/ack'||path==='/api/push/subscribe'"),'receipts count against WRITE_LIMIT');
assert(w.includes('pushTick(env,{storms:')&&w.includes('pushTick(env,{riverLevels:levels})')&&(w.match(/kickPush\(env\)/g)||[]).length>=3);
assert(/\[\[services\]\]\s*binding = "SELF"\s*service = "lao-weather-watch"/.test(toml));assert(!/VAPID_PRIVATE_JWK\s*=/.test(toml),'the key is a secret, never in wrangler.toml');

// Page side: manifest, icons, service worker, banner + News settings.
const html=fs.readFileSync('dist/index.html','utf8'),man=JSON.parse(fs.readFileSync('dist/manifest.webmanifest','utf8')),sw=fs.readFileSync('dist/sw.js','utf8'),pj=fs.readFileSync('dist/push.js','utf8');
assert(html.includes('<link rel="manifest" href="./manifest.webmanifest">')&&html.includes('rel="apple-touch-icon"'));
assert.equal(man.display,'standalone');assert.equal(man.start_url,'/');assert.equal(man.lang,'lo');
for(const ic of man.icons){const f='dist'+ic.src.split('?')[0];assert(fs.existsSync(f),f);const png=fs.readFileSync(f),[w2,h2]=[png.readUInt32BE(16),png.readUInt32BE(20)];assert.equal(`${w2}x${h2}`,ic.sizes,f)}
assert(man.icons.some(i=>i.sizes==='192x192')&&man.icons.some(i=>i.sizes==='512x512')&&man.icons.some(i=>i.purpose==='maskable'));
// Favicon as real files (30 Oct 2026): Google Search showed a grey globe because the only favicon was a data: URL.
{const FAV='<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon.svg" type="image/svg+xml">';
 assert(!/rel="icon"[^>]*href="data:/.test(html),'no data: favicon');
 for(const f of ['dist/index.html','dist/about.html'])assert(fs.readFileSync(f,'utf8').includes(FAV),f+' favicon links');
 const {FAVICON_LINKS}=await import('./worker/brand.mjs');assert.equal(FAVICON_LINKS,FAV);
 for(const f of ['worker/seo-pages.mjs','worker/enso.mjs'])assert(fs.readFileSync(f,'utf8').includes('${FAVICON_LINKS}'),f+' favicon links');
 const ico=fs.readFileSync('dist/favicon.ico');assert.equal(ico.readUInt16LE(2),1,'ICO type');const n=ico.readUInt16LE(4),sizes=[];
 for(let i=0;i<n;i++){const e=6+16*i,len=ico.readUInt32LE(e+8),off=ico.readUInt32LE(e+12);sizes.push(ico[e]);assert.equal(ico.readUInt32BE(off),0x89504e47,'PNG inside ICO');assert(off+len<=ico.length);assert.equal(ico.readUInt32BE(off+16),ico[e])}
 assert(sizes.includes(48),'48 px for Google');
 // Privacy page (30 Oct 2026): linked from the map and /about, and its numbers match the code.
 const pv=fs.readFileSync('dist/privacy.html','utf8'),{VISIT_KEEP_DAYS}=await import('./worker/visits.mjs');
 assert(pv.includes(FAV)&&pv.includes(`ລຶບເອງຫຼັງ ${VISIT_KEEP_DAYS} ມື້`)&&pv.includes('ບໍ່ເກັບ</b> ຕຳແໜ່ງ GPS')&&pv.includes('ປິດແຈ້ງເຕືອນ'),'privacy page');
 for(const f of ['dist/index.html','dist/about.html'])assert(fs.readFileSync(f,'utf8').includes('<a href="/privacy">ຄວາມເປັນສ່ວນຕົວ</a>'),f+' links the privacy page');
 // The map's old prototype bar is hidden in the app layout, so the link also sits in the map credits, the feedback form and the alert settings (owner could not find it, 30 Oct).
 assert(fs.readFileSync('dist/app.js','utf8').includes('Open-Meteo (CC BY 4.0) · <a href="/privacy">')&&html.includes('IP (<a href="/privacy">')&&pj.includes('ບໍ່ແມ່ນລະບົບເຕືອນໄພທາງການ · <a href="/privacy">'),'visible privacy links');assert(fs.readFileSync('dist/favicon.svg','utf8').startsWith('<svg xmlns="http://www.w3.org/2000/svg"'))}
assert(sw.includes("addEventListener('push'")&&sw.includes('showNotification')&&sw.includes("addEventListener('notificationclick'"));
assert(!/addEventListener\('fetch'/.test(sw),'no offline caching yet: data must always be live');
assert(pj.includes("'/api/push/key'")&&pj.includes('push-banner')&&pj.includes('push-settings')&&pj.includes('userVisibleOnly:true'));
assert(!/AbortSignal\.(any|timeout)/.test(pj),'older iPhones');
const css=fs.readFileSync('dist/push.css','utf8');assert(css.includes('#workspace:not([data-view=map]) .push-banner'),'banner only on the map, never over a panel');
assert(html.includes('push.css?v=')&&/app\.js\?v=2026(1029|1030)/.test(html));assert(fs.readFileSync('dist/app.js','utf8').includes("import {setupPush} from './push.js?v="));
assert(pj.includes("if(isIOS()&&!standalone())return 'ios-install'"),'iPhone Safari tab: install steps, never the switch');
// Owner (28 Oct): once installed / alerts on / turned off on purpose, the bar must not come back.
assert(pj.includes("(m==='ready'||m==='ios-install')&&!store.get(DONE)"),'bar hidden for on/denied/unsupported and after DONE');
assert(pj.includes("push-banner-done')")&&/store\.set\(PREF,null\);store\.set\(DONE,true\)/.test(pj),'"already installed" and turning off both stop the bar');
// Morning summary is opt-in: unchecked switch in News, and the one-tap bar turns on only the 4 warnings.
assert(pj.includes("['daily','ສະຫຼຸບອາກາດທຸກເຊົ້າ'")&&pj.includes("${opt?'':' checked'}")&&pj.includes('await turnOn(chosen,WARNINGS)'));
assert(pj.includes('const WARNINGS=KINDS.filter(k=>!k[3]).map(k=>k[0]);'));
console.log('push OK: daily summary, encryption, VAPID, alert texts, per-province queue, retries, routes, crons, page files');
