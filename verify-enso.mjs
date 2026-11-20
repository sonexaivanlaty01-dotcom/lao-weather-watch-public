// El Niño / La Niña page (29 Oct 2026): NOAA CPC ONI + ENSO discussion parsing, gauge, Lao page,
// cache, failure page, and the monthly Facebook post. Weekly Niño-3.4 needle and automatic urgent
// posts (status / strength level changes) added the same day. Every outside service is a fake.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {parseOni,parseDiscussion,parseWeekly,statusKey,strength,signedLevel,levelChange,levelNews,seasonLao,gaugeSVG,ensoPageHTML,ensoCardHTML,ensoCaption,ensoUpdates,ensoRoute,ensoData,_resetEnso,ONI_URL,DISC_URL,WKS_URL} from './worker/enso.mjs';
import {checkEnso,botTick,_resetBot} from './worker/fb-bot.mjs';

const ONI=`  SEAS  YR   TOTAL   ANOM
  DJF 2025  26.24  -0.52
  MAM 2026  28.09   0.46
  JJA 2026  29.09   1.80
  JAS 2026  29.12   2.16
`;
// Same wording and entities as the real page of 8 October 2026.
const DISC=`<html><body><p>EL NI&Ntilde;O/SOUTHERN OSCILLATION (ENSO) DIAGNOSTIC DISCUSSION</p><p>issued by<br>CLIMATE PREDICTION CENTER/NCEP/NWS<br>8 October 2026</p>
<p><b>ENSO Alert System Status:</b>&nbsp;El Ni&ntilde;o Advisory</p><p><b>Synopsis:</b>&nbsp; El Ni&ntilde;o continues to strengthen, with a strong-to-very strong El Ni&ntilde;o likely through January-March 2027 (remaining greater than an 83&#37; chance).</p>
<p>Most Ni&ntilde;o indices increased in the past month, reaching +2.1&deg;C in Ni&ntilde;o-3.4, +3.0&deg;C in Ni&ntilde;o-3.</p><p>The next ENSO Diagnostics Discussion is scheduled for 12 November 2026.</p></body></html>`;

// Parsing.
const rows=parseOni(ONI);assert.equal(rows.length,4);assert.deepEqual(rows.at(-1),{season:'JAS',year:2026,anom:2.16});
assert.equal(seasonLao('JAS',2026),'ກ.ລ.–ກ.ຍ. 2026');assert.equal(seasonLao('DJF',2026),'ທ.ວ.–ກ.ພ. 2026');
const disc=parseDiscussion(DISC);
assert.deepEqual(disc,{status:'El Niño Advisory',key:'elnino-advisory',issued:'2026-10-08',next:'2026-11-12',synopsis:disc.synopsis,outlook:{from:0,to:2,year:2027,chance:83,strong:true},nino34:2.1});
assert.equal(parseDiscussion('<html>maintenance</html>'),null,'page changed → no status, never a guess');
assert.equal(statusKey('La Niña Watch'),'lanina-watch');assert.equal(statusKey('Final El Niño Advisory'),'elnino-final');assert.equal(statusKey('Not Active'),'none');
assert.deepEqual(strength(2.16),{side:'ເອລນີໂຍ',word:'ແຮງຫຼາຍ',level:4});assert.deepEqual(strength(-0.7),{side:'ລານີຍາ',word:'ອ່ອນ',level:1});assert.equal(strength(0.3).side,null);
// Weekly Niño-3.4 file (same layout as NOAA's wksst9120.for, numbers can touch).
const WKS=` Weekly SST data starts week centered on 2Sept1981
                Nino1+2      Nino3        Nino34        Nino4
 Week          SST SSTA     SST SSTA     SST SSTA     SST SSTA
 02SEP1981     20.6-0.1     24.8-0.1     26.5-0.2     28.3-0.3
 14OCT2026     26.2 5.2     29.2 4.2     30.0 3.3     29.7 1.1
 21OCT2026     26.3 5.2     29.4 4.3     30.1 3.4     29.8 1.1
`;
assert.deepEqual(parseWeekly(WKS),[{week:'1981-09-02',anom:-0.2},{week:'2026-10-14',anom:3.3},{week:'2026-10-21',anom:3.4}]);
assert.deepEqual(strength(3.4),{side:'ເອລນີໂຍ',word:'ຮຸນແຮງຫຼາຍ',level:5});assert.equal(signedLevel(-1.6),-3);
// Level changes need 0.1 °C past the threshold (no weekly flip-flop on 2.98 ↔ 3.02).
assert.equal(levelChange(3.05,4),null);assert.equal(levelChange(3.1,4),5);assert.equal(levelChange(2.95,5),null);assert.equal(levelChange(2.9,5),4);assert.equal(levelChange(3.4,5),null);assert.equal(levelChange(3.4,null),null);
assert.equal(levelNews(4,5),'ປະກາດດ່ວນ: ເອລນີໂຍ ແຮງຂຶ້ນ — ຈາກ "ເອລນີໂຍ ແຮງຫຼາຍ" ເປັນ "ເອລນີໂຍ ຮຸນແຮງຫຼາຍ"');assert(levelNews(5,4).startsWith('ເອລນີໂຍ ອ່ອນລົງ'));assert(levelNews(1,0).startsWith('ປ່ຽນແປງ'));
// Gauge: needle right of centre for El Niño, left for La Niña; scale ±4 (weekly +3.4 fits), clamped.
const needle=v=>{const m=/<line x1="160" y1="160" x2="([\d.]+)" y2="([\d.]+)"/.exec(gaugeSVG(v));return [+m[1],+m[2]]};
assert(needle(2.16)[0]>160);assert(needle(-1.5)[0]<160);assert.equal(needle(0)[0],160);assert.deepEqual(needle(9),needle(4));assert(needle(3.4)[0]>needle(3)[0]);

// Data with fake NOAA; cached 6 hours; one source down → the others still shown.
let calls=0;const fake=(o=ONI,d=DISC,w=WKS)=>async url=>{calls++;const body={[ONI_URL]:o,[DISC_URL]:d,[WKS_URL]:w}[url];if(body===undefined)throw new Error('unexpected '+url);return body===null?new Response('',{status:500}):new Response(body)};
const now=Date.parse('2026-10-29T03:00:00Z');_resetEnso();
const data=await ensoData({},{fetchImpl:fake(),now});assert.equal(data.latest.anom,2.16);assert.deepEqual(data.now,{value:3.4,week:'2026-10-21'});assert.equal(data.disc.key,'elnino-advisory');assert.equal(data.sstDate,null,'fake NOAA only: no NASA date');assert.equal(calls,4);
await ensoData({},{fetchImpl:fake(),now:now+3600000});assert.equal(calls,4,'cached');
_resetEnso();const noDisc=await ensoData({},{fetchImpl:fake(ONI,null,null),now});assert.equal(noDisc.disc,null);assert.deepEqual(noDisc.now,{value:2.16,week:null},'no weekly file → official ONI');
_resetEnso();const old=await ensoData({},{fetchImpl:fake(),now:Date.parse('2026-12-01T00:00:00Z')});assert.equal(old.now.week,null,'weekly value older than 3 weeks is not shown as now');

// Page: Lao text, weekly needle value + official ONI, status, outlook, effects, source, not-official note.
const page=ensoPageHTML(data);
for(const s of ['<html lang="lo"','+3.4','ເອລນີໂຍ ຮຸນແຮງຫຼາຍ','ຄ່າລ່າສຸດ ອາທິດ 21 ຕ.ລ. 2026','ຄ່າທາງການ NOAA (ONI ສະເລ່ຍ 3 ເດືອນ)','+2.2','ກຳລັງເກີດເອລນີໂຍ','ຮອດ ມ.ກ.–ມ.ນ. 2027 (ໂອກາດຫຼາຍກວ່າ 83%)','ກ.ລ.–ກ.ຍ. 2026','NOAA ປະກາດ 8 ຕ.ລ. 2026','ຄັ້ງຕໍ່ໄປ 12 ພ.ຈ. 2026','ຜົນກະທົບຕໍ່ລາວ','ຄວນກຽມຕົວແນວໃດ','ນີໂນ 3.4 ລາຍອາທິດ','ບໍ່ແມ່ນປະກາດທາງການ','ບໍ່ແມ່ນພະຍາກອນ','href="/"'])assert(page.includes(s),'page has '+s);
assert(!page.includes('undefined')&&!page.includes('NaN'));
const pageNoDisc=ensoPageHTML(noDisc);assert(pageNoDisc.includes('ເອລນີໂຍ ແຮງຫຼາຍ')&&!pageNoDisc.includes('NOAA ປະກາດ')&&!pageNoDisc.includes('ຄ່າລ່າສຸດ ອາທິດ'),'ONI only');
const neutral=ensoPageHTML({...data,now:{value:0.1,week:'2026-10-21'},disc:{...disc,key:'none',status:'Not Active',outlook:null}});assert(neutral.includes('ຕອນນີ້ບໍ່ມີເອລນີໂຍ ຫຼື ລານີຍາ'));
const lanina=ensoPageHTML({...data,now:{value:-1.2,week:'2026-10-21'},disc:{...disc,key:'lanina-advisory',status:'La Niña Advisory',outlook:null}});assert(lanina.includes('ສ່ຽງນ້ຳຖ້ວມ')&&lanina.includes('ລານີຍາ ປານກາງ'));

// /elnino page: NASA globe above the gauge when NASA's newest day is known; turns by horizontal drag only.
{const withGlobe=ensoPageHTML({...data,sstDate:'2026-10-27'});
 for(const s of ['id="globe"','ພາບດາວທຽມ NASA 27 ຕ.ລ. 2026','img.src="/api/enso/sst/2026-10-27.jpg"',"crossOrigin='anonymous'",'touch-action:pan-y','function drawGlobe','ລາກຊ້າຍ–ຂວາ'])assert(withGlobe.includes(s),'globe page has '+s);
 assert(withGlobe.includes('class="card hero"')&&withGlobe.includes('class="ring"')&&withGlobe.indexOf('class="col"')>withGlobe.indexOf('id="globe"'),'option C: ring + text column beside the globe');assert(withGlobe.includes("getElementById('fbk').style.display='block'"),'picture fails → needle gauge in its place');assert(!page.includes('class="card hero"')&&page.includes('class="card gauge"'),'no NASA date → plain gauge card');
 assert(!page.includes('id="globe"'),'no NASA date → no globe');}// Routes: page, JSON, failure page (503, no stale guess), method.
_resetEnso();let r=await ensoRoute(new Request('https://x.test/elnino'),{},{fetchImpl:fake(),now});assert.equal(r.status,200);assert.match(r.headers.get('Content-Type'),/text\/html/);assert((await r.text()).includes('ກຳລັງເກີດເອລນີໂຍ'));
r=await ensoRoute(new Request('https://x.test/api/enso'),{},{fetchImpl:fake(),now});assert.equal((await r.json()).now.value,3.4);
_resetEnso();r=await ensoRoute(new Request('https://x.test/elnino'),{},{fetchImpl:fake(null,null,null),now});assert.equal(r.status,503);assert((await r.text()).includes('ບໍ່ພ້ອມຊົ່ວຄາວ'));
assert.equal((await ensoRoute(new Request('https://x.test/elnino',{method:'POST'}),{})).status,405);

// Facebook: caption, card, and what is posted.
const cap=ensoCaption(data);assert(cap.includes('ຄ່າລ່າສຸດ (ອາທິດ 21 ຕ.ລ. 2026): +3.4')&&cap.includes('ONI ສະເລ່ຍ 3 ເດືອນ): +2.2')&&cap.includes('/elnino')&&cap.includes('ບໍ່ແມ່ນປະກາດທາງການ'));
assert(ensoCardHTML(data).includes('width:1080px'));assert(ensoCardHTML(data,'','ປະກາດດ່ວນ: ເອລນີໂຍ ແຮງຂຶ້ນ').includes('ປະກາດດ່ວນ'));
// First run: monthly post, remembers level 5, no level news.
let u=ensoUpdates(data,null);assert.deepEqual(u.posts.map(p=>p.key),['enso:2026-10-08']);assert.equal(u.posts[0].headline,'');assert.deepEqual(u.state,{key:'elnino-advisory',level:5});
assert.deepEqual(ensoUpdates(noDisc,null).posts,[],'no discussion → no monthly post');assert.deepEqual(ensoUpdates({...data,disc:{...disc,key:'none'}},null).posts,[],'nothing active, nothing changed');
// Weekly level up 4 → 5: urgent post with Lao headline.
u=ensoUpdates(data,{key:'elnino-advisory',level:4});assert.deepEqual(u.posts.map(p=>p.key),['enso:2026-10-08','enso-level:2026-10-21']);assert(u.posts[1].caption.startsWith('⚠️ ປະກາດດ່ວນ: ເອລນີໂຍ ແຮງຂຶ້ນ'));assert.equal(u.state.level,5);
// NOAA status changes (watch → advisory, advisory → final): the monthly post carries the urgent headline.
u=ensoUpdates(data,{key:'elnino-watch',level:5});assert(u.posts[0].caption.startsWith('⚠️ ປະກາດດ່ວນ: NOAA ຢືນຢັນ ເກີດເອລນີໂຍແລ້ວ'));assert.equal(u.posts.length,1);
u=ensoUpdates({...data,disc:{...disc,key:'none',status:'Not Active'}},{key:'elnino-final',level:5});assert(u.posts[0].caption.startsWith('📢 NOAA ປະກາດ: ກັບສູ່ສະພາບປົກກະຕິ'));
function sqliteD1(){const db=new DatabaseSync(':memory:');const prep=sql=>{const st=db.prepare(sql.replace(/\?(\d)/g,'?')),order=[...sql.matchAll(/\?(\d)/g)].map(m=>+m[1]-1),args=a=>order.map(i=>a[i]);
 const bound=a=>({run:async()=>({success:true,meta:{changes:Number(st.run(...args(a)).changes)}}),all:async()=>({results:st.all(...args(a)).map(x=>({...x}))}),first:async()=>{const x=st.get(...args(a));return x?{...x}:null}});return {...bound([]),bind:(...a)=>bound(a)}};return {db,prepare:prep}}
const noNet=async u=>{throw new Error('offline '+u)};
const kv=()=>{const m=new Map();return {m,put:async(k,v)=>{m.set(k,v)},get:async k=>m.get(k)??null}};
const env={FEEDBACK_DB:sqliteD1(),FORECAST_KV:kv(),BROWSER:{quickAction:async()=>new Response(new Uint8Array(30000))}};
_resetBot();await botTick(env,{now:Date.parse('2026-10-29T02:00:00Z'),enso:async()=>data,fetchImpl:fake()});
let list=env.FEEDBACK_DB.db.prepare('SELECT key,kind,status,has_image FROM fb_posts').all().map(x=>({...x}));assert.deepEqual(list,[{key:'enso:2026-10-08',kind:'enso',status:'approved',has_image:1}],'09:00 Lao check → one automatic post');
assert.deepEqual(JSON.parse(env.FORECAST_KV.m.get('enso:state')),{key:'elnino-advisory',level:5});
assert.deepEqual(await checkEnso(env,{now,fetchImpl:noNet,enso:async()=>data}),[],'once per discussion');
// Next week the value drops to 2.8 → level 4 → automatic "weaker" post.
const weaker={...data,now:{value:2.8,week:'2026-10-28'}};assert.deepEqual(await checkEnso(env,{now,fetchImpl:noNet,enso:async()=>weaker}),['enso-level:2026-10-28']);
assert.equal(env.FEEDBACK_DB.db.prepare("SELECT status FROM fb_posts WHERE key='enso-level:2026-10-28'").get().status,'approved');assert.equal(JSON.parse(env.FORECAST_KV.m.get('enso:state')).level,4);
_resetBot();const e2={FEEDBACK_DB:sqliteD1(),FORECAST_KV:kv()};let ran=0;await botTick(e2,{fetchImpl:noNet,now:Date.parse('2026-10-29T05:00:00Z'),enso:async()=>{ran++;return data}});assert.equal(ran,0,'only the 09:00 and 15:00 Lao runs check NOAA');
await botTick(e2,{fetchImpl:noNet,now:Date.parse('2026-10-29T08:00:00Z'),enso:async()=>data});assert.equal(e2.FEEDBACK_DB.db.prepare('SELECT status FROM fb_posts').get().status,'draft','15:00 run; no picture → waits for the owner');
// NOAA discussion page failing from Cloudflare (29 Oct 2026): the last one read is kept in KV and used,
// a missing one is retried after 30 min instead of 6 h, and the reason is recorded.
{const store=kv();_resetEnso();const good=await ensoData({},{fetchImpl:fake(),now,store});assert.equal(good.discSaved,undefined);assert.equal(JSON.parse(store.m.get('enso:disc')).issued,'2026-10-08');
 _resetEnso();const later=now+7*3600000,saved=await ensoData({},{fetchImpl:fake(ONI,'<html>Access denied</html>'),now:later,store});
 assert.equal(saved.disc.key,'elnino-advisory');assert.equal(saved.discSaved,true);assert.match(saved.discError,/discussion_unreadable/);
 _resetEnso();const bare=await ensoData({},{fetchImpl:fake(ONI,null),now,store:kv()});assert.equal(bare.disc,null);assert.match(bare.discError,/500/);
 let n=0;const counting=async u=>{n++;return fake(ONI,null)(u)};await ensoData({},{fetchImpl:counting,now:now+20*60000,store:kv()});assert.equal(n,0,'cached 20 min');
 await ensoData({},{fetchImpl:counting,now:now+31*60000,store:kv()});assert.equal(n,4,'missing discussion retried after 30 min');
 _resetEnso();const tooOld=await ensoData({},{fetchImpl:fake(ONI,null),now:Date.parse('2026-12-01T00:00:00Z'),store});assert.equal(tooOld.disc,null,'saved discussion older than 45 days is not used');}
// NASA globe card (owner's choice C): newest NASA day from GIBS DescribeDomains, picture loaded by the
// card browser with CORS, gauge fallback when the picture fails, gauge card when NASA's date is unknown.
{const {newestSstDate,ensoGlobeCardHTML,ensoCardFor,sstImageURL}=await import('./worker/enso.mjs');
 const dom=async u=>{assert.match(u,/GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies\/default\/1km\/all\/2026-09-29--2026-10-29\.xml$/);return new Response("<Domains><DimensionDomain><Domain>2026-10-01/2026-10-27/P1D</Domain></DimensionDomain></Domains>")};
 assert.equal(await newestSstDate(dom,now),'2026-10-27');assert.equal(await newestSstDate(noNet,now),null);assert.equal(await newestSstDate(async()=>new Response('',{status:503}),now),null);
 assert(sstImageURL('2026-10-27').includes('TIME=2026-10-27')&&sstImageURL('2026-10-27').includes('BlueMarble_NextGeneration,GHRSST_L4_MUR'));
 const g=ensoGlobeCardHTML(data,{date:'2026-10-27'});
 for(const s of ["crossOrigin='anonymous'",'ພາບດາວທຽມ NASA · 27 ຕ.ລ. 2026','ເອລນີໂຍ<br>ຮຸນແຮງຫຼາຍ','+3.4°C','ຮ້ອນກວ່າປົກກະຕິ','ຄ່າລ່າສຸດ ອາທິດ 21 ຕ.ລ. 2026','ໄຟປ່າ ຝຸ່ນ PM2.5','NASA GIBS (GHRSST MUR)','ບໍ່ແມ່ນປະກາດທາງການ','id="fb"','src.onerror=fail','catch{fail()}'])assert(g.includes(s),'globe card has '+s);
 assert(ensoGlobeCardHTML(data,{date:'2026-10-27',headline:levelNews(4,5)}).includes('ປະກາດດ່ວນ: ເອລນີໂຍ ແຮງຂຶ້ນ<small>ຈາກ'));
 assert(ensoGlobeCardHTML({...data,now:{value:-1.2,week:'2026-10-21'},disc:{...disc,key:'lanina-advisory'}},{date:'2026-10-27'}).includes('ເຢັນກວ່າປົກກະຕິ</span>'));
 // Owner's choice C (29 Oct 2026, after A–D): 3D globe with Laos and the warm Pacific joined by a line.
 const {ensoLaosCardHTML}=await import('./worker/enso.mjs'),lc=ensoLaosCardHTML(data,{date:'2026-10-27'});
 for(const s of ['TIME=2026-10-27','function globe3d','globe3d(document.getElementById(\'g\'),globeSource(i),-170,12,860,380)','>ລາວ</text>','ນ້ຳທະເລຮ້ອນ','→ ລະດູແລ້ງ ຮ້ອນ ຝົນໜ້ອຍ','ເອລນີໂຍ<br>ຮຸນແຮງຫຼາຍ','+3.4°C','NASA GIBS (GHRSST MUR) 27 ຕ.ລ. 2026','ບໍ່ແມ່ນປະກາດທາງການ','id="fb"','i.onerror=fail'])assert(lc.includes(s),'Laos card has '+s);
 const pin=lc.match(/<circle cx="(\d+)" cy="(\d+)" r="14" fill="#facc15"/).slice(1).map(Number);assert(Math.hypot(pin[0]-680,pin[1]-580)<=385,'Laos pin on the globe (at its west edge, as in the chosen picture)');
 assert(lc.includes("document.body.classList.add('nog')")&&lc.includes('.nog .leg,.nog .pic{display:none}'),'NASA picture fails → gauge, no NASA wording or colour bar');
 assert(ensoLaosCardHTML({...data,now:{value:-1.2,week:'2026-10-21'},disc:{...disc,key:'lanina-advisory'}},{date:'2026-10-27'}).includes('ນ້ຳທະເລເຢັນ'));
 assert(ensoLaosCardHTML(data,{date:'2026-10-27',headline:levelNews(4,5)}).includes('ປະກາດດ່ວນ: ເອລນີໂຍ ແຮງຂຶ້ນ<small>ຈາກ'));
 assert((await ensoCardFor(data,{fetchImpl:dom,now})).includes('<svg id="o"'));assert(!(await ensoCardFor(data,{fetchImpl:noNet,now})).includes('<canvas'),'no NASA date → gauge card');}// Admin "เอลนีโญ" button: a draft made now (waits for approve), card rendered.
{const {fbAdminRoute}=await import('./worker/fb-bot.mjs');const e3={FEEDBACK_DB:sqliteD1(),FORECAST_KV:kv(),BROWSER:env.BROWSER};_resetBot();
 const call=(enso)=>fbAdminRoute(new Request('https://x.test/api/fb/make',{method:'POST',headers:{'X-Admin-Key':'k'},body:'{"slot":"enso"}'}),e3,{isAdmin:()=>true,now,enso,fetchImpl:noNet});
 const j=await(await call(async()=>data)).json();assert.equal(j.made.length,1);assert(j.made[0].startsWith('enso:manual'));
 assert.deepEqual({...e3.FEEDBACK_DB.db.prepare('SELECT kind,status,has_image FROM fb_posts').get()},{kind:'enso',status:'draft',has_image:1});
 assert.equal((await call(async()=>null)).status,502);}
assert(fs.readFileSync('dist/admin.html','utf8').includes('data-make="enso">เอลนีโญ</button>'));
// "โหลดภาพช้า" (29 Oct 2026): the page's NASA picture comes through us. KV first (no NASA call), NASA
// otherwise (not written to KV by visitors), a week in the browser; bad dates and NASA errors never cached.
{const {sstRoute,sstImage}=await import('./worker/enso.mjs');const jpg=new Uint8Array([255,216,255,1,2,3]);let calls=0;
 const nasa=async u=>{calls++;assert(u.includes('WIDTH=1024')&&u.includes('TIME=2026-10-27'));return new Response(jpg,{headers:{'Content-Type':'image/jpeg'}})};
 const store={m:new Map(),put:async(k,v,o)=>{store.m.set(k,{v,o})},get:async(k,t)=>{assert.equal(t,'arrayBuffer');return store.m.get(k)?.v??null}};
 const req=p=>new Request('https://x.test/api/enso/sst/'+p);
 let r=await sstRoute(req('2026-10-27.jpg'),{},{fetchImpl:nasa,now,store});assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'image/jpeg');assert.match(r.headers.get('Cache-Control'),/max-age=604800/);
 assert.deepEqual(new Uint8Array(await r.arrayBuffer()),jpg);assert.equal(calls,1);assert.equal(store.m.size,0,'a visitor never writes KV');
 await sstImage('2026-10-27',{fetchImpl:nasa,store,keep:true});assert.equal(store.m.get('enso:sst:2026-10-27').o.expirationTtl,4*86400);
 r=await sstRoute(req('2026-10-27.jpg'),{},{fetchImpl:noNet,now,store});assert.equal(r.status,200,'from KV, NASA not asked');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),jpg);
 for(const p of ['2025-01-01.jpg','2026-11-05.jpg','x.jpg','2026-10-27.png'])assert.equal((await sstRoute(req(p),{},{fetchImpl:nasa,now,store})).status,404,p);
 r=await sstRoute(req('2026-10-26.jpg'),{},{fetchImpl:async()=>new Response('<xml>error</xml>',{headers:{'Content-Type':'text/xml'}}),now,store});assert.equal(r.status,502);assert.equal(r.headers.get('Cache-Control'),'no-store');
 assert.equal((await sstRoute(new Request('https://x.test/api/enso/sst/2026-10-27.jpg',{method:'POST'}),{})).status,405);
 // A data refresh puts the newest picture in KV ahead of visitors.
 _resetEnso();const st2={...store,m:new Map()};st2.put=async(k,v,o)=>{st2.m.set(k,{v,o})};st2.get=async k=>st2.m.get(k)?.v??null;const waits=[];
 const withSst=async u=>/DescribeDomains|\/1km\/all\//.test(u)?new Response('<Domain>2026-10-01/2026-10-27/P1D</Domain>'):/wms\.cgi/.test(u)?nasa(u):fake()(u);
 const d=await ensoData({waitUntil:p=>waits.push(p)},{fetchImpl:withSst,now,store:st2});assert.equal(d.sstDate,'2026-10-27');await Promise.all(waits);assert(st2.m.has('enso:sst:2026-10-27'),'warmed into KV');_resetEnso();}
// Wiring.
const w=fs.readFileSync('cloudflare-site/worker.mjs','utf8');assert(w.includes("path==='/elnino'")&&w.includes('enso:()=>ensoData(ctx,{store:env.FORECAST_KV})')&&w.includes('ensoRoute(request,ctx,{store:env.FORECAST_KV})')&&w.includes("path.startsWith('/api/enso/sst/'))return sstRoute(request,ctx,{store:env.FORECAST_KV})"));
assert(fs.readFileSync('dist/index.html','utf8').includes('href="/elnino"'));assert(fs.readFileSync('dist/admin.html','utf8').includes("enso:'เอลนีโญ ประจำเดือน'"));
// Map chip (owner's option 1): links to /elnino, hidden until data says active, map view only, bumped assets.
const shell=fs.readFileSync('dist/app-shell.js','utf8'),css=fs.readFileSync('dist/app-ui.css','utf8');
assert(shell.includes("enso.href='/elnino'")&&shell.includes("fetch('/api/enso')")&&shell.includes('enso.hidden=true'));assert(!/AbortSignal\.(any|timeout)/.test(shell),'iOS 15–16 safe');
assert(css.includes('body.app-c .app-enso{')&&css.includes('.workspace:not([data-view=map]) .app-enso')&&css.includes('body.storm-mode .app-enso'));
for(const f of ['dist/app.js','dist/push.js'])assert(fs.readFileSync(f,'utf8').includes('app-shell.js?v=20261029-zoom'));assert(fs.readFileSync('dist/index.html','utf8').includes('app-ui.css?v=20261029-gps4'));
// Same release: tapping the map outside the 4 DEM pilot areas shows nothing (owner, 29 Oct 2026).
const app=fs.readFileSync('dist/app.js','utf8');assert(app.includes('const cell=terrainReadout(e.lngLat.lng,e.lngLat.lat);if(!cell)return;')&&!app.includes('ຢູ່ນອກພື້ນທີ່ DEM ນຳຮ່ອງ'));
console.log('enso ok');
