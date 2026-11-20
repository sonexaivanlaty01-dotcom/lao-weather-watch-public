// Phone alerts by Web Push (28 Oct 2026, owner's choice: top banner "option 2" + settings in the News
// tab "option 5"). People pick one province. Four kinds, all chosen by the owner:
//  storm  JMA/JTWC storm at "watch"/"near" (same rule as the Facebook bot) → everyone who wants storms
//  river  MRC station at alarm/flood level → people in that station's province
//  rain   forecast ≥ RAIN_ALERT mm tomorrow → that province (checked in the 17:00 Lao run)
//  heat   feels-like ≥ HEAT_ALERT °C tomorrow → that province (same run)
//  daily  today's weather summary at 06:00 Lao (owner's choice 28 Oct 2026) → that province; opt-in on
//         the page, never in the recent-alerts list (it would push the real alerts out)
// Each alert is stored once (push_alerts.key), so it is sent once. Payloads are encrypted (RFC 8291,
// aes128gcm) and signed with VAPID (RFC 8292) using only Web Crypto. The key pair is the single secret
// VAPID_PRIVATE_JWK; without it every push route answers 404 and the page hides the banner.
// Workers Free allows 50 outside requests per invocation, so sends wait in the D1 table push_queue and
// each cron run hands batches of BATCH to fresh invocations of this Worker (service binding SELF).
import {PROVINCES} from './seo-provinces.mjs';
import {stormSummary} from './storm-share.mjs';
import {fetchProvinceForecast,dayRows,HEAT_ALERT,RAIN_ALERT,RAIN_LIKELY,HOT_FEELS} from './fb-bot.mjs';

export const KINDS=['storm','river','rain','heat','daily'];
export const BATCH=40,MAX_RUNS=20,MAX_TRIES=3;
const SLUGS=new Set(PROVINCES.map(p=>p.slug));
// MRC stations in Laos → provinces on that bank (stations on a border list both).
export const STATION_PROVINCES={'010901':['oudomxay'],'011200':['luang-prabang'],'011201':['luang-prabang'],'011901':['vientiane-capital'],'012703':['bolikhamsai'],'013102':['khammouane'],'013401':['savannakhet'],'013806':['salavan','champasak'],'013901':['champasak'],'013903':['champasak'],'013905':['champasak'],'260101':['bolikhamsai'],'270502':['bolikhamsai'],'320101':['khammouane'],'320107':['khammouane'],'350101':['savannakhet'],'390102':['salavan'],'430106':['attapeu']};
// Push services the browsers use. Other addresses are refused (the Worker must not call arbitrary hosts).
const PUSH_HOSTS=[/^fcm\.googleapis\.com$/,/^updates\.push\.services\.mozilla\.com$/,/^[a-z0-9-]+\.notify\.windows\.com$/,/^web\.push\.apple\.com$/,/^[a-z0-9.-]+\.push\.apple\.com$/];
const LAO_MS=7*3600000,r0=v=>Math.round(v);
const json=(data,status=200,cache='no-store')=>Response.json(data,{status,headers:{'Cache-Control':cache,'X-Content-Type-Options':'nosniff'}});

const enc=new TextEncoder();
export const b64u=buf=>{let s='';for(const b of new Uint8Array(buf))s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
export const unb64u=s=>Uint8Array.from(atob(String(s).replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(String(s).length/4)*4,'=')),c=>c.charCodeAt(0));
const concat=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out};
async function hkdf(salt,ikm,info,length){const key=await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,length*8))}

// RFC 8291: one record, padding delimiter 2. `local` and `salt` are only passed in by the tests.
export async function encryptPayload({p256dh,auth},text,{local,salt=crypto.getRandomValues(new Uint8Array(16))}={}){
 const ua=unb64u(p256dh),secret=unb64u(auth);
 const kp=local||await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const asPub=new Uint8Array(await crypto.subtle.exportKey('raw',kp.publicKey));
 const uaKey=await crypto.subtle.importKey('raw',ua,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:uaKey},kp.privateKey,256));
 const ikm=await hkdf(secret,shared,concat(enc.encode('WebPush: info\0'),ua,asPub),32);
 const cek=await hkdf(salt,ikm,enc.encode('Content-Encoding: aes128gcm\0'),16),nonce=await hkdf(salt,ikm,enc.encode('Content-Encoding: nonce\0'),12);
 const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
 const body=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,concat(enc.encode(text),new Uint8Array([2]))));
 const rs=new Uint8Array(4);new DataView(rs.buffer).setUint32(0,4096);
 return concat(salt,rs,new Uint8Array([asPub.length]),asPub,body);
}

// VAPID: the public key is rebuilt from the private JWK (x, y), so only one secret is needed.
let vapidCache=null;
async function vapidKeys(env){
 if(vapidCache?.src===env.VAPID_PRIVATE_JWK)return vapidCache;
 const jwk=JSON.parse(env.VAPID_PRIVATE_JWK);
 const key=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y,d:jwk.d},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 return vapidCache={src:env.VAPID_PRIVATE_JWK,key,pub:b64u(concat(new Uint8Array([4]),unb64u(jwk.x),unb64u(jwk.y)))};
}
export const pushReady=env=>{try{const j=JSON.parse(env.VAPID_PRIVATE_JWK||'');return !!(j.x&&j.y&&j.d)}catch{return false}};
export async function vapidHeader(env,endpoint,now){
 const v=await vapidKeys(env),part=o=>b64u(enc.encode(JSON.stringify(o)));
 const unsigned=part({typ:'JWT',alg:'ES256'})+'.'+part({aud:new URL(endpoint).origin,exp:Math.floor(now/1000)+12*3600,sub:'https://lao-weather-watch.sonexaivanlaty01.workers.dev'});
 const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},v.key,enc.encode(unsigned));
 return `vapid t=${unsigned}.${b64u(sig)}, k=${v.pub}`;
}

// Storage (created on first use, same D1 database as feedback and the Facebook drafts).
// Signs of life (1 Nov 2026): last_seen = last receipt or app open, last_ack_key = alert that receipt was for,
// pending_* = sends the push service accepted since then with no receipt (see pruneDead).
const SCHEMA=['CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, province TEXT NOT NULL, kinds TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_seen TEXT, last_ack_key TEXT, pending_since TEXT, pending_count INTEGER NOT NULL DEFAULT 0)',
 'CREATE TABLE IF NOT EXISTS push_alerts (key TEXT PRIMARY KEY, kind TEXT NOT NULL, provinces TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, url TEXT NOT NULL, created_at TEXT NOT NULL, queued INTEGER NOT NULL DEFAULT 0)',
 'CREATE TABLE IF NOT EXISTS push_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, alert_key TEXT NOT NULL, endpoint TEXT NOT NULL, claim TEXT, tries INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)'];
// Tables made before 1 Nov 2026 get the new columns; "duplicate column" errors mean they are already there.
const MIGRATE=['ALTER TABLE push_subs ADD COLUMN last_seen TEXT','ALTER TABLE push_subs ADD COLUMN last_ack_key TEXT','ALTER TABLE push_subs ADD COLUMN pending_since TEXT','ALTER TABLE push_subs ADD COLUMN pending_count INTEGER NOT NULL DEFAULT 0'];
let schemaReady=null;
const ensure=db=>schemaReady??=(async()=>{for(const s of SCHEMA)await db.prepare(s).run();for(const s of MIGRATE)try{await db.prepare(s).run()}catch{}})().catch(e=>{schemaReady=null;throw e});
export function _resetPush(){schemaReady=null;vapidCache=null}

// Alerts. Text is short (a phone notification); the page linked from it has the details.
const HEAD=['ທິດເໜືອ','ທິດຕາເວັນອອກສ່ຽງເໜືອ','ທິດຕາເວັນອອກ','ທິດຕາເວັນອອກສ່ຽງໃຕ້','ທິດໃຕ້','ທິດຕາເວັນຕົກສ່ຽງໃຕ້','ທິດຕາເວັນຕົກ','ທິດຕາເວັນຕົກສ່ຽງເໜືອ'];
export function stormPush(s){
 if(!['watch','near'].includes(s.level))return null;
 const p=s.points[0],{name}=stormSummary(s),hd=Number.isFinite(p.course)?HEAD[Math.round(((p.course%360)+360)%360/45)%8]:null;
 const days=s.closest.h/24,when=s.closest.h<=0?'ຕອນນີ້':days<1?`ໃນອີກ ~${Math.max(1,r0(s.closest.h))} ຊມ.`:`ໃນອີກ ~${Math.round(days*10)/10} ວັນ`;
 return {key:`storm:${s.id}:${s.level}`,kind:'storm',provinces:'*',title:`🌀 ${s.level==='near'?'ເຕືອນພາຍຸ':'ເຝົ້າລະວັງພາຍຸ'}: ${name}`,
  body:`ຫ່າງຊາຍແດນລາວ ${p.laoKm.toLocaleString('en-US')} km${hd?` · ກຳລັງໄປ${hd}`:''} · ໃກ້ລາວທີ່ສຸດ ~${s.closest.km.toLocaleString('en-US')} km ${when} · ທີ່ມາ ${s.agency==='JTWC'?'JTWC':'JMA'}`,url:`/storm/${s.id}`};
}
const nearestProvince=(lat,lon)=>PROVINCES.reduce((best,p)=>{const d=(p.center[1]-lat)**2+(p.center[0]-lon)**2;return d<best.d?{d,slug:p.slug}:best},{d:Infinity,slug:null}).slug;
export function riverPush(stations,now){
 const day=new Date(now+LAO_MS).toISOString().slice(0,10),out=[];
 for(const s of stations||[]){if(s.stale||!['alarm','flood'].includes(s.status))continue;
  const provinces=STATION_PROVINCES[s.id]||[nearestProvince(s.lat,s.lon)].filter(Boolean);if(!provinces.length)continue;
  const flood=s.status==='flood';
  out.push({key:`river:${day}:${s.id}:${s.status}`,kind:'river',provinces:provinces.join(','),title:`🌊 ${flood?'ນ້ຳຂຶ້ນຮອດລະດັບນ້ຳຖ້ວມ':'ນ້ຳຂຶ້ນຮອດລະດັບເຕືອນໄພ'}: ${s.name}`,
   body:`${s.river?s.river+' ':''}${s.level} ມ. (${flood?'ລະດັບນ້ຳຖ້ວມ '+s.flood:'ລະດັບເຕືອນ '+s.alarm} ມ.)${Number.isFinite(s.rise24)&&s.rise24>0?` · ຂຶ້ນ ${s.rise24} ມ. ໃນ 24 ຊມ.`:''} · ຜູ້ຢູ່ແຄມນ້ຳ ຍ້າຍເຄື່ອງຂຶ້ນບ່ອນສູງ · ທີ່ມາ MRC`,url:'/'})}
 return out;
}
// The capital is not a province: 'ນະຄອນຫຼວງວຽງຈັນ', never 'ແຂວງນະຄອນຫຼວງວຽງຈັນ'.
const place=name=>name.startsWith('ນະຄອນຫຼວງ')?name:'ແຂວງ'+name;
// Tomorrow's rows (dayRows(fc,1)): one alert per province and kind.
export function weatherPush(rows){
 const out=[];
 for(const r of rows){const url='/weather/'+r.slug;
  if(r.rain>=RAIN_ALERT)out.push({key:`rain:${r.date}:${r.slug}`,kind:'rain',provinces:r.slug,title:`🌧 ມື້ອື່ນ ຝົນຕົກໜັກ: ${place(r.name)}`,body:`ພະຍາກອນຝົນ ~${r0(r.rain)} mm · ລະວັງນ້ຳຖ້ວມສັ້ນ ແລະ ດິນເຈື່ອນ · ທີ່ມາ Open-Meteo (ອາດຄາດເຄື່ອນ)`,url});
  if(r.feels>=HEAT_ALERT)out.push({key:`heat:${r.date}:${r.slug}`,kind:'heat',provinces:r.slug,title:`🔥 ມື້ອື່ນ ຮ້ອນຈັດ: ${place(r.name)}`,body:`ຮູ້ສຶກຮ້ອນເຖິງ ${r0(r.feels)}°C · ດື່ມນ້ຳຫຼາຍໆ ຫຼີກລ່ຽງແດດ 11:00–15:00 · ທີ່ມາ Open-Meteo`,url})}
 return out;
}
// Today's rows (dayRows(fc,0)): one morning summary per province. Rain words follow both the chance and
// the amount, like the Facebook captions (100 % of 2 mm is still light rain).
export function dailyPush(rows){
 return rows.map(r=>{
  const wet=r.pop>=RAIN_LIKELY,amount=r.rain>=35?'ຝົນຕົກໜັກ':r.rain>=10?'ຝົນປານກາງ':'ຝົນເລັກນ້ອຍ';
  const icon=wet&&r.rain>=10?'🌧':wet||r.pop>=30?'🌦':'☀️';
  const rain=wet?`${amount} (ໂອກາດ ${r0(r.pop)}% · ~${r0(r.rain)} mm)`:r.pop>=30?`ອາດມີຝົນ (ໂອກາດ ${r0(r.pop)}%)`:'ສ່ວນຫຼາຍແດດ ຝົນໜ້ອຍ';
  const tips=[r.rain>=RAIN_ALERT?'ລະວັງນ້ຳຖ້ວມສັ້ນ':wet?'ພົກຄັນຮົ່ມ':null,
   r.feels>=HEAT_ALERT?`ຮ້ອນຈັດ ຮູ້ສຶກ ${r0(r.feels)}°C ດື່ມນ້ຳຫຼາຍໆ`:r.feels>=HOT_FEELS?`ຮູ້ສຶກຮ້ອນ ${r0(r.feels)}°C`:null,
   r.uv>=8?'UV ສູງ ທາຄີມກັນແດດ':null].filter(Boolean);
  return {key:`daily:${r.date}:${r.slug}`,kind:'daily',provinces:r.slug,title:`${icon} ອາກາດມື້ນີ້: ${place(r.name)}`,
   body:[`${r0(r.tmin)}–${r0(r.tmax)}°C`,rain,...tips,'ທີ່ມາ Open-Meteo'].join(' · '),url:'/weather/'+r.slug};
 });
}

// Stores new alerts and queues one send per matching subscriber. Returns the keys that were new.
export async function addAlerts(env,alerts,now=Date.now()){
 const db=env.FEEDBACK_DB;if(!db||!alerts.length)return [];await ensure(db);const iso=new Date(now).toISOString(),made=[];
 for(const a of alerts){
  const r=await db.prepare('INSERT OR IGNORE INTO push_alerts (key,kind,provinces,title,body,url,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)').bind(a.key,a.kind,a.provinces,a.title,a.body,a.url,iso).run();
  if(!((r.meta?.changes??1)>0))continue;made.push(a.key);
  const q=await db.prepare("INSERT INTO push_queue (alert_key,endpoint,created_at) SELECT ?1,endpoint,?2 FROM push_subs WHERE instr(','||kinds||',',','||?3||',')>0 AND (?4='*' OR instr(','||?4||',',','||province||',')>0)").bind(a.key,iso,a.kind,a.provinces).run();
  await db.prepare('UPDATE push_alerts SET queued=?2 WHERE key=?1').bind(a.key,q.meta?.changes??0).run();
 }
 return made;
}

// One encrypted send. `row` = subscriber (endpoint, p256dh, auth) + alert (key, kind, title, body, url, created_at).
async function pushOne(env,row,{now,fetchImpl}){
 // One record (rs 4096) and push services cap payloads near 4 KB; Lao letters are 3 bytes each.
 const payload=JSON.stringify({title:String(row.title).slice(0,120),body:String(row.body).slice(0,400),url:row.url,tag:row.key,at:row.created_at});
 const urgent=row.kind==='storm'||row.kind==='river';
 return fetchImpl(row.endpoint,{method:'POST',headers:{Authorization:await vapidHeader(env,row.endpoint,now),'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:String(urgent?6*3600:row.kind==='daily'?4*3600:12*3600),Urgency:urgent?'high':'normal'},body:await encryptPayload(row,payload),signal:AbortSignal.timeout(10000)});
}

// Automatic clean-up (1 Nov 2026, owner's request: remove phones that no longer get alerts, never one that
// still does). Apple keeps accepting sends to an abandoned subscription (e.g. the Home Screen icon was
// removed and added again) for weeks, so "accepted" proves nothing. Proof of life is a receipt from the
// service worker after it showed the alert (/api/push/ack) or the app being opened (subscribe). A device is
// removed only after DEAD_SENDS accepted sends over DEAD_DAYS days with neither. The long window covers
// phones whose old service worker (no receipts) has not updated yet, trips and switched-off phones; devices
// with warnings only get few sends and are practically never removed.
export const DEAD_SENDS=6,DEAD_DAYS=14;
async function markSent(db,endpoints,now){
 if(endpoints.length)await db.prepare('UPDATE push_subs SET pending_count=pending_count+1,pending_since=COALESCE(pending_since,?2) WHERE endpoint IN (SELECT value FROM json_each(?1))').bind(JSON.stringify([...new Set(endpoints)]),new Date(now).toISOString()).run();
}
const alive=(db,endpoint,now,key=null)=>db.prepare('UPDATE push_subs SET last_seen=?2,last_ack_key=COALESCE(?3,last_ack_key),pending_count=0,pending_since=NULL WHERE endpoint=?1').bind(endpoint,new Date(now).toISOString(),key).run();
export async function pruneDead(env,now=Date.now()){
 const db=env.FEEDBACK_DB;if(!db)return 0;await ensure(db);
 const {results=[]}=await db.prepare('SELECT endpoint FROM push_subs WHERE pending_count>=?1 AND pending_since<=?2').bind(DEAD_SENDS,new Date(now-DEAD_DAYS*86400000).toISOString()).all();
 const list=JSON.stringify(results.map(r=>r.endpoint));if(!results.length)return 0;
 await db.prepare('DELETE FROM push_subs WHERE endpoint IN (SELECT value FROM json_each(?1))').bind(list).run();await db.prepare('DELETE FROM push_queue WHERE endpoint IN (SELECT value FROM json_each(?1))').bind(list).run();
 return results.length;
}

// Sends one batch from the queue. Rows are claimed first, so parallel runs never send the same row.
// Gone subscriptions (404/410) are deleted; other failures are retried up to MAX_TRIES times.
export async function sendBatch(env,{now=Date.now(),fetchImpl=fetch,limit=BATCH}={}){
 const db=env.FEEDBACK_DB;if(!db||!pushReady(env))return {sent:0,failed:0,gone:0};await ensure(db);
 await db.prepare('DELETE FROM push_queue WHERE created_at<?1 OR tries>=?2').bind(new Date(now-12*3600000).toISOString(),MAX_TRIES).run();
 const claim=String(now)+'-'+crypto.randomUUID();
 await db.prepare('UPDATE push_queue SET claim=?1,tries=tries+1 WHERE id IN (SELECT id FROM push_queue WHERE (claim IS NULL OR claim<?2) AND tries<?3 ORDER BY id LIMIT ?4)').bind(claim,String(now-10*60000),MAX_TRIES,limit).run();
 const {results=[]}=await db.prepare('SELECT q.id,q.endpoint,s.p256dh,s.auth,a.key,a.kind,a.title,a.body,a.url,a.created_at FROM push_queue q JOIN push_subs s ON s.endpoint=q.endpoint JOIN push_alerts a ON a.key=q.alert_key WHERE q.claim=?1').bind(claim).all();
 const done=[],gone=[],accepted=[];let failed=0;
 await Promise.all(results.map(async row=>{
  try{
   const r=await pushOne(env,row,{now,fetchImpl});
   if(r.status===404||r.status===410){gone.push(row.endpoint);done.push(row.id)}
   else if(r.ok||r.status===400||r.status===413){done.push(row.id);if(r.ok)accepted.push(row.endpoint)}
   else failed++;
  }catch{failed++}
 }));
 if(done.length)await db.prepare('DELETE FROM push_queue WHERE id IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(done)).run();
 await markSent(db,accepted,now);
 if(gone.length){await db.prepare('DELETE FROM push_subs WHERE endpoint IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(gone)).run();await db.prepare('DELETE FROM push_queue WHERE endpoint IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(gone)).run()}
 return {sent:done.length-gone.length,failed,gone:gone.length};
}

// Cron side: one request to /api/push/drain (fresh invocation), which starts up to MAX_RUNS batch runs.
// Without the SELF binding (tests, local preview) one batch is sent directly.
export async function runToken(env){return b64u(await crypto.subtle.digest('SHA-256',enc.encode('push-run:'+env.VAPID_PRIVATE_JWK)))}
const pending=async db=>(await db.prepare('SELECT COUNT(*) AS n FROM push_queue WHERE tries<?1').bind(MAX_TRIES).first())?.n||0;
export async function kickPush(env,opts={}){
 const db=env.FEEDBACK_DB;if(!db||!pushReady(env))return null;await ensure(db);if(!await pending(db))return null;
 if(!env.SELF)return sendBatch(env,opts);
 await env.SELF.fetch('https://push.internal/api/push/drain',{method:'POST',headers:{'X-Push-Run':await runToken(env)}});return {kicked:true};
}
async function drain(env){
 const n=await pending(env.FEEDBACK_DB),runs=Math.min(MAX_RUNS,Math.ceil(n/BATCH)),token=await runToken(env);
 await Promise.allSettled(Array.from({length:runs},()=>env.SELF.fetch('https://push.internal/api/push/run',{method:'POST',headers:{'X-Push-Run':token}})));
 return {queued:n,runs};
}

// Called by the crons. storms: */30 run; tomorrow's rain/heat: the 17:00 Lao run; today's summary: the
// 06:00 Lao run (the 06:30 run only retries, keys are unique); rivers: 20,50 run.
export async function pushTick(env,{now=Date.now(),storms=async()=>[],riverLevels=null,fetchImpl=fetch}={}){
 if(!env.FEEDBACK_DB||!pushReady(env))return [];
 const alerts=[];
 if(riverLevels)alerts.push(...riverPush(riverLevels.stations,now));
 else{
  await pruneDead(env,now).catch(()=>{});
  for(const s of await storms().catch(()=>[])){const a=stormPush(s);if(a)alerts.push(a)}
  const hour=new Date(now+LAO_MS).getUTCHours();
  if(hour===17){const fc=await fetchProvinceForecast(fetchImpl).catch(()=>null);if(fc)alerts.push(...weatherPush(dayRows(fc,1)))}
  if(hour===6){const fc=await fetchProvinceForecast(fetchImpl).catch(()=>null);if(fc)alerts.push(...dailyPush(dayRows(fc,0)))}
 }
 return addAlerts(env,alerts,now);
}

// Owner test from admin.html (1 Nov 2026, owner's request: send a test now instead of waiting for a cron
// round). Sent directly, never queued and never stored in push_alerts, so real alert keys and the page's
// recent list stay untouched. Devices are named by a short hash of their address, never the address itself.
export const ADMIN_TEST_MAX=10;
const deviceId=async endpoint=>b64u(await crypto.subtle.digest('SHA-256',enc.encode(endpoint))).slice(0,10);
const platformOf=endpoint=>{const h=new URL(endpoint).hostname;return /push\.apple\.com$/.test(h)?'iphone':h==='fcm.googleapis.com'?'android':/mozilla\.com$/.test(h)?'firefox':/notify\.windows\.com$/.test(h)?'windows':'other'};
async function adminDevices(db){
 const {results=[]}=await db.prepare('SELECT endpoint,p256dh,auth,province,kinds,created_at,updated_at,last_seen,last_ack_key,pending_since,pending_count FROM push_subs ORDER BY created_at').all();
 return Promise.all(results.map(async s=>({id:await deviceId(s.endpoint),platform:platformOf(s.endpoint),province:s.province,provinceName:PROVINCES.find(p=>p.slug===s.province)?.name_lo||s.province,kinds:s.kinds.split(','),created_at:s.created_at,updated_at:s.updated_at,
  lastSeen:s.last_seen,ackKey:s.last_ack_key,pendingCount:s.pending_count||0,pendingSince:s.pending_since,_sub:s})));
}
const EMERGENCY_TEST={kind:'storm',title:'🧪 ທົດສອບລະບົບ · 🚨 ແຈ້ງເຕືອນສຸກເສີນ (ບໍ່ແມ່ນເຫດການຈິງ)',body:'ນີ້ແມ່ນການທົດສອບແຈ້ງເຕືອນສຸກເສີນ · ບໍ່ມີເຫດການຈິງ · ບໍ່ຕ້ອງເຮັດຫຍັງ',url:'/'};
export async function adminTest(env,{ids,type,now=Date.now(),fetchImpl=fetch}){
 const db=env.FEEDBACK_DB,all=await adminDevices(db),iso=new Date(now).toISOString(),day=new Date(now+LAO_MS).toISOString().slice(0,10);
 // Daily: today's stored summary (made at 06:00 Lao); before that, today's forecast fetched once.
 let fresh=null;const summary=async slug=>{
  const a=await db.prepare('SELECT title,body,url FROM push_alerts WHERE key=?1').bind(`daily:${day}:${slug}`).first();if(a)return a;
  fresh??=fetchProvinceForecast(fetchImpl).then(fc=>dailyPush(dayRows(fc,0))).catch(()=>[]);return (await fresh).find(x=>x.provinces===slug)||null};
 const gone=[],accepted=[];
 const results=await Promise.all(ids.map(async id=>{
  const d=all.find(x=>x.id===id);if(!d)return {id,status:'missing'};
  const out={id,platform:d.platform,province:d.province};
  const alert=type==='emergency'?EMERGENCY_TEST:await summary(d.province).then(a=>a&&{...a,kind:'daily',title:'🧪 ທົດສອບ · '+a.title});
  if(!alert)return {...out,status:'no_forecast'};
  const key=`test:${now}:${id}`;
  try{const r=await pushOne(env,{...d._sub,...alert,key,created_at:iso},{now,fetchImpl});
   if(r.status===404||r.status===410){gone.push(d._sub.endpoint);return {...out,status:'gone'}}
   if(r.ok)accepted.push(d._sub.endpoint);
   return r.ok?{...out,status:'sent',key}:{...out,status:'failed',code:r.status}}
  catch{return {...out,status:'failed'}}
 }));
 await markSent(db,accepted,now);
 if(gone.length){await db.prepare('DELETE FROM push_subs WHERE endpoint IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(gone)).run();await db.prepare('DELETE FROM push_queue WHERE endpoint IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(gone)).run()}
 return {results};
}

// Routes:
//  GET  /api/push/key           public VAPID key (404 = alerts not set up)
//  POST /api/push/subscribe     {subscription:{endpoint,keys:{p256dh,auth}},province,kinds:[...]}
//  POST /api/push/unsubscribe   {endpoint}
//  POST /api/push/ack           {endpoint,key} receipt from the service worker after showing an alert
//  GET  /api/push/recent?province=slug   alerts of the last 7 days for that province
//  POST /api/push/drain, /api/push/run   internal (X-Push-Run token), started by the cron
//  GET  /api/push/admin/devices          owner (X-Admin-Key): subscribed devices, short ids only
//  POST /api/push/admin/test             owner: {type:'daily'|'emergency', ids:[...]} sent at once
//  POST /api/push/admin/delete           owner: {id} remove one device
async function body(request){const t=await request.text();if(t.length>4000)throw new Error('too_big');return JSON.parse(t)}
export function validSubscription(sub){
 try{const u=new URL(sub.endpoint);if(u.protocol!=='https:'||!PUSH_HOSTS.some(re=>re.test(u.hostname))||sub.endpoint.length>800)return false;
  return unb64u(sub.keys?.p256dh||'').length===65&&unb64u(sub.keys?.auth||'').length===16}catch{return false}
}
export async function pushRoute(request,env,{now=Date.now(),sameKey,isAdmin=()=>false,fetchImpl=fetch}){
 const path=new URL(request.url).pathname,db=env.FEEDBACK_DB;
 if(!db||!pushReady(env))return json({error:'not_configured'},404);
 if(path==='/api/push/key'&&request.method==='GET')return json({key:(await vapidKeys(env)).pub},200,'public, max-age=3600');
 await ensure(db);
 if(path.startsWith('/api/push/admin/')){
  if(!isAdmin(request))return json({error:'unauthorized'},401);
  if(path==='/api/push/admin/devices'&&request.method==='GET')return json({devices:(await adminDevices(db)).map(({_sub,...d})=>d)});
  if(path==='/api/push/admin/test'&&request.method==='POST'){
   let data;try{data=await body(request)}catch{return json({error:'bad_request'},400)}
   const ids=Array.isArray(data?.ids)?[...new Set(data.ids.map(String))]:[];
   if(!['daily','emergency'].includes(data?.type)||!ids.length)return json({error:'bad_request'},400);
   if(ids.length>ADMIN_TEST_MAX)return json({error:'too_many'},400);
   return json(await adminTest(env,{ids,type:data.type,now,fetchImpl}));
  }
  if(path==='/api/push/admin/delete'&&request.method==='POST'){
   let data;try{data=await body(request)}catch{return json({error:'bad_request'},400)}
   const d=(await adminDevices(db)).find(x=>x.id===String(data?.id));if(!d)return json({ok:true,deleted:0});
   await db.prepare('DELETE FROM push_subs WHERE endpoint=?1').bind(d._sub.endpoint).run();await db.prepare('DELETE FROM push_queue WHERE endpoint=?1').bind(d._sub.endpoint).run();
   return json({ok:true,deleted:1});
  }
  return json({error:'not_found'},404);
 }
 if(path==='/api/push/recent'&&request.method==='GET'){
  const p=new URL(request.url).searchParams.get('province')||'';if(p&&!SLUGS.has(p))return json({error:'bad_province'},400);
  const {results=[]}=await db.prepare("SELECT key,kind,title,body,url,created_at FROM push_alerts WHERE created_at>=?1 AND kind!='daily' AND (provinces='*' OR ?2='' OR instr(','||provinces||',',','||?2||',')>0) ORDER BY created_at DESC LIMIT 10").bind(new Date(now-7*86400000).toISOString(),p).all();
  return json({alerts:results},200,'public, max-age=60');
 }
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 if(path==='/api/push/drain'||path==='/api/push/run'){
  if(!sameKey(request.headers.get('X-Push-Run'),await runToken(env)))return json({error:'unauthorized'},401);
  return json(path==='/api/push/drain'&&env.SELF?await drain(env):await sendBatch(env,{now}));
 }
 let data;try{data=await body(request)}catch{return json({error:'bad_request'},400)}
 if(path==='/api/push/subscribe'){
  const sub=data?.subscription,kinds=[...new Set((Array.isArray(data?.kinds)?data.kinds:[]).filter(k=>KINDS.includes(k)))];
  if(!validSubscription(sub))return json({error:'bad_subscription'},400);
  if(!SLUGS.has(data?.province))return json({error:'bad_province'},400);
  if(!kinds.length)return json({error:'no_kinds'},400);
  const iso=new Date(now).toISOString();
  // The page re-sends this at most once a day while open, so it doubles as "the app is still used".
  await db.prepare('INSERT INTO push_subs (endpoint,p256dh,auth,province,kinds,created_at,updated_at,last_seen) VALUES (?1,?2,?3,?4,?5,?6,?6,?6) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,province=excluded.province,kinds=excluded.kinds,updated_at=excluded.updated_at,last_seen=excluded.last_seen,pending_count=0,pending_since=NULL').bind(sub.endpoint,sub.keys.p256dh,sub.keys.auth,data.province,kinds.join(','),iso).run();
  return json({ok:true,province:data.province,kinds});
 }
 // Receipt from the service worker after it showed an alert. Same answer for unknown addresses.
 if(path==='/api/push/ack'){
  if(typeof data?.endpoint!=='string'||data.endpoint.length>800)return json({error:'bad_request'},400);
  await alive(db,data.endpoint,now,typeof data.key==='string'?data.key.slice(0,120):null);
  return json({ok:true});
 }
 if(path==='/api/push/unsubscribe'){
  if(typeof data?.endpoint!=='string')return json({error:'bad_request'},400);
  await db.prepare('DELETE FROM push_subs WHERE endpoint=?1').bind(data.endpoint).run();await db.prepare('DELETE FROM push_queue WHERE endpoint=?1').bind(data.endpoint).run();
  return json({ok:true});
 }
 return json({error:'not_found'},404);
}
