// Facebook Page bot (22 Oct 2026): captions from forecast numbers, warnings, drafts in D1, the owner's
// approve step, posting through the Graph API, and the cron times. Real SQL on node:sqlite; every
// outside service (Open-Meteo, Browser Run, Facebook) is a fake.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {PROVINCES} from './worker/seo-provinces.mjs';
import {PROVINCE_PATHS} from './worker/lao-province-paths.mjs';
import {fetchProvinceForecast,REGIONS,laoDate,dayRows,regionSummary,dailyCaption,weeklyCaption,weatherAlerts,stormAlert,riverAlert,dailyCardHTML,weeklyCardHTML,makeDrafts,checkEvents,publishDue,botTick,retryImages,shootCard,fbAdminRoute,postToPage,_resetBot,HEAT_ALERT,RAIN_ALERT} from './worker/fb-bot.mjs';

function sqliteD1(){
 const db=new DatabaseSync(':memory:');
 const prep=sql=>{const st=db.prepare(sql.replace(/\?(\d)/g,'?')),order=[...sql.matchAll(/\?(\d)/g)].map(m=>+m[1]-1),args=a=>order.map(i=>a[i]);
  const bound=a=>({run:async()=>({success:true,meta:{changes:Number(st.run(...args(a)).changes)}}),all:async()=>({results:st.all(...args(a)).map(r=>({...r}))}),first:async()=>{const r=st.get(...args(a));return r?{...r}:null}});
  return {...bound([]),bind:(...a)=>bound(a)}};
 return {db,prepare:prep};
}
const kvStore=()=>{const m=new Map();return {m,put:async(k,v)=>{m.set(k,v)},get:async(k,t)=>{const v=m.get(k)??null;return t==='json'&&v!=null?JSON.parse(v):v},delete:async k=>{m.delete(k)}}};
// Every province, every region, all 18 slugs have a map shape.
assert.equal(Object.values(REGIONS).flat().length,18);assert.deepEqual(Object.values(REGIONS).flat().sort(),PROVINCES.map(p=>p.slug).sort());
assert.deepEqual(Object.keys(PROVINCE_PATHS).sort(),PROVINCES.map(p=>p.slug).sort());
assert.equal(laoDate('2026-10-23'),'ວັນສຸກ 23 ຕ.ລ. 2026');assert.equal(laoDate('2026-10-25',{year:false}),'ວັນອາທິດ 25 ຕ.ລ.');

// Fake Open-Meteo: 18 locations × 8 days. Attapeu hot, Xaignabouli wet on day 1.
const days=['2026-10-22','2026-10-23','2026-10-24','2026-10-25','2026-10-26','2026-10-27','2026-10-28','2026-10-29'];
const om=(over={})=>PROVINCES.map(p=>{const o=over[p.slug]||{};return {daily:{time:days,weather_code:days.map(()=>3),temperature_2m_max:days.map(()=>o.tmax??32),temperature_2m_min:days.map(()=>21),apparent_temperature_max:days.map(()=>o.feels??35),precipitation_sum:days.map(()=>o.rain??0.4),precipitation_probability_max:days.map(()=>o.pop??15),uv_index_max:days.map(()=>7.6)}}});
let omCalls=0;const fakeFetch=over=>async url=>{const u=String(url);if(u.startsWith('https://api.open-meteo.com/')){omCalls++;assert.match(u,/timezone=Asia%2FVientiane/);return Response.json(om(over))}throw new Error('unexpected '+u)};
const over={attapeu:{feels:42.3,tmax:35},salavan:{feels:39.1},xaignabouli:{pop:100,rain:62},houaphan:{pop:90,rain:4}};
const fc={at:'2026-10-22T10:00:00Z',provinces:PROVINCES.map((p,i)=>({slug:p.slug,name:p.name_lo,region:Object.keys(REGIONS).find(k=>REGIONS[k].includes(p.slug)),daily:om(over)[i].daily}))};
const rows=dayRows(fc,1);assert.equal(rows.length,18);assert.equal(rows[0].date,'2026-10-23');
const north=regionSummary(rows,'north');assert.equal(north.wet.length,2);assert.equal(north.text,'ມີຝົນຕົກໜັກບາງບ່ອນ');
assert.equal(regionSummary(rows.map(r=>r.region==='north'?{...r,pop:100,rain:2}:r),'north').text,'ມີຝົນເລັກນ້ອຍຫຼາຍບ່ອນ','high chance, little rain');assert.equal(north.maxRain,62);
assert.equal(regionSummary(rows,'central').text,'ສ່ວນຫຼາຍແດດ ຝົນໜ້ອຍ');

// Caption: real numbers, advice, source, disclaimer, link, hashtags.
const cap=dailyCaption(rows,{label:'ມື້ອື່ນ',issuedAt:fc.at});
for(const s of ['ພະຍາກອນອາກາດ ມື້ອື່ນ ວັນສຸກ 23 ຕ.ລ. 2026','ພາກເໜືອ: ມີຝົນຕົກໜັກບາງບ່ອນ (ສູງສຸດ ~62 mm)','ໄຊຍະບູລີ 100%','ຫົວພັນ 90%','ຮູ້ສຶກເຖິງ 42°C','ອັດຕະປື','UV ສູງສຸດ 8 (ສູງຫຼາຍ)','ພົກຄັນຮົ່ມ','ດິນເຈື່ອນ','ຫຼີກລ່ຽງການອອກແຮງ','ທາຄີມກັນແດດ','Open-Meteo','ບໍ່ແມ່ນປະກາດທາງການ','https://lao-weather-watch.sonexaivanlaty01.workers.dev','#ລາວປອດໄພ','ດຶງເມື່ອ 22/10 17:00'])assert(cap.includes(s),'caption has '+s);
assert(cap.includes('#ອາກາດມື້ອື່ນ')&&!cap.includes('#ອາກາດມື້ນີ້'),'tomorrow post: tomorrow hashtag');assert(dailyCaption(rows,{label:'ມື້ນີ້',issuedAt:fc.at}).includes('#ອາກາດມື້ນີ້'));
// A calm day gets no rain/heat advice.
const calm=dailyCaption(dayRows({...fc,provinces:fc.provinces.map((p,i)=>({...p,daily:om()[i].daily}))},1),{label:'ມື້ອື່ນ',issuedAt:fc.at});
assert(!calm.includes('ຄັນຮົ່ມ')&&!calm.includes('ຮ້ອນອົບເອົ້າ'));assert(calm.includes('ສ່ວນຫຼາຍແດດ'));
const wk=weeklyCaption(fc,{issuedAt:fc.at});assert(wk.includes('ແນວໂນ້ມອາກາດ 7 ວັນ')&&wk.includes('ມີຝົນ 7 ໃນ 7 ວັນ')&&wk.includes('ແຫ້ງເກືອບທັງອາທິດ')&&wk.includes('ບໍ່ແມ່ນປະກາດທາງການ'));

// Warnings: thresholds.
const al=weatherAlerts(rows,'ມື້ອື່ນ');assert.deepEqual(al.map(a=>a.key),['heat:2026-10-23','rain:2026-10-23']);
assert(al[0].caption.includes('ອັດຕະປື 42°C')&&!al[0].caption.includes('ສາລະວັນ'),'heat list only ≥ '+HEAT_ALERT);assert(al[1].caption.includes('ໄຊຍະບູລີ ~62 mm')&&!al[1].caption.includes('ຫົວພັນ'),'rain list only ≥ '+RAIN_ALERT);
assert.equal(weatherAlerts(dayRows({...fc,provinces:fc.provinces.map((p,i)=>({...p,daily:om()[i].daily}))},1),'x').length,0);
const storm={id:'TC2640',name:'Kajiki',category:'TS',issued:'2026-10-22T09:45:00Z',level:'watch',closest:{h:60,km:420},points:[{h:0,laoKm:880,w:25,p:990,course:270,kmh:18}]};
const sa=stormAlert(storm);assert.equal(sa.key,'storm:TC2640:watch');assert(sa.caption.includes('ເຝົ້າລະວັງ: ພາຍຸໂຊນຮ້ອນ Kajiki')&&sa.caption.includes('880 km')&&sa.caption.includes('90 km/h')&&sa.caption.includes('ທິດຕາເວັນຕົກ 18 km/h')&&sa.caption.includes('~420 km ໃນອີກ ~2.5 ວັນ')&&sa.caption.includes('/storm/TC2640')&&sa.caption.includes('JMA'));
assert.equal(stormAlert({...storm,level:'far'}),null,'far storms are not posted');
const ra=riverAlert([{id:'A',name:'Vientiane',river:'Mekong',status:'alarm',level:11.6,alarm:11.5,flood:12.5,rise24:0.4},{id:'B',name:'Pakse',status:'normal'},{id:'C',name:'Old',status:'flood',stale:true}],Date.parse('2026-10-22T10:00:00Z'));
assert(ra.caption.includes('Vientiane (Mekong): 11.6 m ≥ ລະດັບເຕືອນ 11.5 m · ຂຶ້ນ 0.4 m')&&!ra.caption.includes('Pakse')&&!ra.caption.includes('Old')&&ra.caption.includes('MRC'));
assert.equal(riverAlert([{status:'normal'}],0),null);

// Cards: every province drawn, lists, no script, escaped.
// Forecast points are the 18 capital towns (28 Oct 2026), in the same order as PROVINCES.
{const {TOWNS}=await import('./worker/province-towns.mjs'),{PROVINCES}=await import('./worker/seo-provinces.mjs');
 assert.deepEqual(Object.keys(TOWNS).sort(),PROVINCES.map(p=>p.slug).sort(),'a town for every province');
 for(const [s,t] of Object.entries(TOWNS))assert(t.lat>13.9&&t.lat<22.5&&t.lon>100&&t.lon<107.7&&t.town,s);
 let url='';await fetchProvinceForecast(async u=>{url=String(u);return Response.json(PROVINCES.map(()=>({daily:{time:['2026-10-28']}})))});
 const q=new URL(url).searchParams,lat=q.get('latitude').split(','),lon=q.get('longitude').split(','),i=PROVINCES.findIndex(p=>p.slug==='xaignabouli');
 assert.equal(lat[i],'19.25');assert.equal(lon[i],'101.75','Xaignabouli town, not the mountain centre');
 const seo=fs.readFileSync('worker/seo-pages.mjs','utf8');assert(seo.includes('forecastPoint(p.slug,p.center)')&&seo.includes('forecast-v2'),'province pages use the towns too');}
const card=dailyCardHTML(rows,'ມື້ອື່ນ');assert.equal((card.match(/stroke="#0b1220"/g)||[]).length,18,'18 province shapes');
// TV option 2 (28 Oct): a tag on every province, all 18 in the table with low–high, rain mm and chance.
assert.equal((card.match(/class="tag"/g)||[]).length,18,'icon + temperature on every province');assert.equal((card.match(/<div class="r">/g)||[]).length,18,'18 table rows');
assert(card.includes('ພະຍາກອນອາກາດ ມື້ອື່ນ')&&card.includes('ພາກເໜືອ')&&card.includes('ພາກໃຕ້')&&/ໄຊຍະບູລີ<\/span>.*?mm<\/span>/.test(card));assert(!/[\u{1F300}-\u{1FAFF}]/u.test(card)&&!/[\u{1F300}-\u{1FAFF}]/u.test(weeklyCardHTML(fc)),'no emoji on the pictures');// Fonts travel inside the card: Browser Run did not load Google Fonts and broke Lao marks (28 Oct).
// New logo (cloud + rain, 28 Oct): no more ≋ mark on the cards.
for(const html of [card,weeklyCardHTML(fc)])assert(!html.includes('≋')&&html.includes('M19 36a9 9 0 0 1-1.5-17.9'),'logo on card');
for(const html of [card,weeklyCardHTML(fc)])assert(!html.includes('fonts.googleapis')&&html.includes("font-family:'Noto Sans Lao';src:url(data:font/woff2;base64,")&&html.includes("font-family:'Inter';src:url(data:font/woff2"),'embedded fonts');
assert(/ໄຊຍະບູລີ<\/span>.*?<span class="num p">100%<\/span>/.test(card)&&card.includes('ບໍ່ແມ່ນປະກາດທາງການ')&&!/<script/i.test(card));
assert(weeklyCardHTML(fc).includes('ແນວໂນ້ມ 7 ວັນ'));

// Drafts in D1 (+ picture in KV); a second run makes no duplicates.
const now=Date.parse('2026-10-22T10:00:00Z');let shots=0;
const env={FEEDBACK_DB:sqliteD1(),FORECAST_KV:kvStore(),BROWSER:{quickAction:async(kind,o)=>{shots++;assert.equal(kind,'screenshot');assert.equal(o.viewport.width,1080);return new Response(new Uint8Array(30000))}}};
_resetBot();let made=await makeDrafts(env,'evening',{now,fetchImpl:fakeFetch(over)});
assert.deepEqual(made,['daily:2026-10-23:evening','heat:2026-10-23','rain:2026-10-23']);assert.equal(shots,1,'one picture for the day');
let list=env.FEEDBACK_DB.db.prepare('SELECT * FROM fb_posts ORDER BY id').all();
assert.equal(list[0].post_at,'2026-10-22T11:00:00.000Z','evening post at 18:00 Lao');assert.equal(list[0].status,'approved','daily forecast with a picture is approved by itself');
assert.deepEqual(list.slice(1).map(p=>p.status),['draft','draft'],'heat/rain warnings still wait for the owner');assert.equal(list[0].has_image,1);assert(env.FORECAST_KV.m.has('fbpost:daily:2026-10-23:evening'));
assert.deepEqual(await makeDrafts(env,'evening',{now,fetchImpl:fakeFetch(over)}),[],'no duplicates');
made=await makeDrafts(env,'morning',{now,fetchImpl:fakeFetch(over)});assert.deepEqual(made,['daily:2026-10-22:morning','heat:2026-10-22','rain:2026-10-22'],'warnings are per day');
assert.equal(env.FEEDBACK_DB.db.prepare("SELECT post_at FROM fb_posts WHERE key='daily:2026-10-22:morning'").get().post_at,'2026-10-21T23:00:00.000Z','morning post at 06:00 Lao');
// Without Browser Run the draft still exists (text only).
const env2={FEEDBACK_DB:sqliteD1(),FORECAST_KV:kvStore()};_resetBot();await makeDrafts(env2,'weekly',{now,fetchImpl:fakeFetch(over)});
assert.deepEqual({...env2.FEEDBACK_DB.db.prepare('SELECT has_image,status FROM fb_posts').get()},{has_image:0,status:'draft'},'no picture → not posted by itself');
// Browser Run over its 10 free minutes (30 Oct 2026, owner's option A): the card is kept and shot on a later
// run, and the forecast then posts by itself again. Cards are shot once drawn (fonts ready), not after
// network silence; the El Niño globe still waits for the network.
{let ok=false,calls=[];const e={FEEDBACK_DB:sqliteD1(),FORECAST_KV:kvStore(),BROWSER:{quickAction:async(k,o)=>{calls.push(o);return ok?new Response(new Uint8Array(30000)):new Response('Browser time limit exceeded for today',{status:429})}}};
 _resetBot();await makeDrafts(e,'evening',{now,fetchImpl:fakeFetch(over)});
 const row=k=>({...e.FEEDBACK_DB.db.prepare('SELECT has_image,status FROM fb_posts WHERE key=?').get(k)});
 assert.deepEqual(row('daily:2026-10-23:evening'),{has_image:0,status:'draft'});assert(e.FORECAST_KV.m.has('fbcard:daily:2026-10-23:evening'),'card kept for later');
 const o=calls[0];assert.equal(o.gotoOptions.waitUntil,'load');assert.equal(o.waitForSelector.selector,'html[data-card-ready]');assert(o.html.includes('document.fonts')&&o.html.includes('data-card-ready'));
 assert.deepEqual(await retryImages(e,{now:now+1800000}),[],'still over the limit');assert.equal(calls.length,2,'stops at the first failure');
 ok=true;assert.deepEqual(await retryImages(e,{now:now+3600000}),['daily:2026-10-23:evening','heat:2026-10-23'],'two a run');
 assert.deepEqual(row('daily:2026-10-23:evening'),{has_image:1,status:'approved'},'auto post approved once it has its picture');
 assert.deepEqual(row('heat:2026-10-23'),{has_image:1,status:'draft'},'warnings still wait for the owner');
 assert(!e.FORECAST_KV.m.has('fbcard:daily:2026-10-23:evening')&&e.FORECAST_KV.m.has('fbpost:daily:2026-10-23:evening'));
 assert.deepEqual(await retryImages(e,{now:now+5400000}),['rain:2026-10-23']);assert.deepEqual(await retryImages(e,{now:now+5400000}),[],'nothing left');
 calls=[];await shootCard(e,'<body><script>document.body.dataset.ready=1</script></body>');assert.equal(calls[0].gotoOptions.waitUntil,'networkidle0');assert(!calls[0].waitForSelector);
 const s=fs.readFileSync('worker/storm-share.mjs','utf8');assert(s.includes("shootCard(env,cardHTML(")&&!s.includes('networkidle0'),'storm card uses the same quick shot');
 assert(fs.readFileSync('worker/fb-bot.mjs','utf8').includes('await retryImages(env,{now})'),'cron retries')}
// Storm + river events, each once.
_resetBot();const ev=await checkEvents(env,{now,storms:async()=>[storm,{...storm,id:'TC2641',level:'far'}],stormCard:async()=>new Uint8Array(40000).buffer,riverLevels:async()=>({stations:[{id:'A',name:'Vientiane',status:'flood',level:12.6,alarm:11.5,flood:12.5}]})});
assert.equal(ev.length,2);assert.deepEqual(await checkEvents(env,{now,storms:async()=>[storm]}),[]);
assert.equal(env.FEEDBACK_DB.db.prepare("SELECT has_image FROM fb_posts WHERE kind='storm'").get().has_image,1);

// Nothing is posted without approval, and nothing without the Page secrets.
let graph=[];const fb=async(url,init)=>{if(String(url).startsWith('https://api.open-meteo.com/'))return fakeFetch(over)(url);graph.push({url:String(url),init});return Response.json(String(url).endsWith('/photos')?{id:'p1',post_id:'123_456'}:{id:'123_789'})};
assert.deepEqual(await publishDue({...env},{now:now+86400000,fetchImpl:fb}),[]);assert.equal(graph.length,0);
const envFB={...env,FB_PAGE_ID:'123',FB_PAGE_TOKEN:'test-page-token'};
assert.deepEqual(await publishDue(envFB,{now,fetchImpl:fb}),[]);assert.equal(graph.length,0,'drafts are never posted by themselves');
// Automatic daily post: made 05:00 Lao, posted 06:00 Lao with no click; the warnings of that day are not.
{const g=[],e={FEEDBACK_DB:sqliteD1(),FORECAST_KV:kvStore(),BROWSER:env.BROWSER,FB_PAGE_ID:'123',FB_PAGE_TOKEN:'test-page-token'},f=async(u,i)=>{g.push(String(u));return Response.json({id:'p',post_id:'9_9'})};
 _resetBot();await makeDrafts(e,'morning',{now:Date.parse('2026-10-21T22:00:00Z'),fetchImpl:fakeFetch(over)});
 assert.deepEqual(await publishDue(e,{now:Date.parse('2026-10-21T22:59:00Z'),fetchImpl:f}),[],'not before 06:00');
 const out=await publishDue(e,{now:Date.parse('2026-10-21T23:00:00Z'),fetchImpl:f});assert.equal(out.length,1);assert(out[0].ok);assert(g[0].endsWith('/123/photos'));
 assert.deepEqual(e.FEEDBACK_DB.db.prepare('SELECT kind,status FROM fb_posts ORDER BY id').all().map(p=>p.kind+':'+p.status),['daily:posted','heat:draft','rain:draft']);
// Page not connected at 06:00 → the post is not sent late the next day once it is connected.
 const e2={FEEDBACK_DB:sqliteD1(),FORECAST_KV:kvStore(),BROWSER:env.BROWSER};_resetBot();await makeDrafts(e2,'morning',{now:Date.parse('2026-10-21T22:00:00Z'),fetchImpl:fakeFetch(over)});
 await publishDue(e2,{now:Date.parse('2026-10-21T23:00:00Z')});const late=Date.parse('2026-10-22T18:00:00Z');await publishDue(e2,{now:late});
 assert.equal(await publishDue({...e2,FB_PAGE_ID:'1',FB_PAGE_TOKEN:'t'},{now:late,fetchImpl:f}).then(r=>r.length),0);assert.equal(g.length,1,'old forecast never posted late');
 assert.equal(e2.FEEDBACK_DB.db.prepare("SELECT status FROM fb_posts WHERE kind='daily'").get().status,'expired');}

// Admin route: key required; list; approve (future → waits for the cron; past → posts now); skip.
const admin=(path,body,e=envFB,key='good')=>fbAdminRoute(new Request('https://x.test'+path,{method:body?'POST':'GET',headers:{'X-Admin-Key':key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),e,{isAdmin:r=>r.headers.get('X-Admin-Key')==='good',now,fetchImpl:fb});
assert.equal((await admin('/api/fb/posts',null,envFB,'bad')).status,401);
let r=await admin('/api/fb/posts');let d=await r.json();assert.equal(d.configured,true);assert.equal(d.posts.length,8,'3 evening + 3 morning + storm + river');assert(d.posts[0].id>d.posts[1].id,'newest first');
const id=k=>env.FEEDBACK_DB.db.prepare('SELECT id FROM fb_posts WHERE key=?').get(k).id,st=k=>env.FEEDBACK_DB.db.prepare('SELECT status,caption,fb_id,error FROM fb_posts WHERE key=?').get(k);
r=await admin('/api/fb/image/'+id('daily:2026-10-23:evening'));assert.equal(r.headers.get('Content-Type'),'image/jpeg');
// Evening post (18:00 Lao = 11:00Z, now is 10:00Z): approved with an edited caption, posted later by the cron.
d=await(await admin('/api/fb/posts/'+id('daily:2026-10-23:evening'),{action:'approve',caption:list[0].caption+'\nແກ້ໄຂໂດຍເຈົ້າຂອງ'})).json();
assert.equal(d.posted,false);assert.equal(st('daily:2026-10-23:evening').status,'approved');assert.equal(graph.length,0);
let res=await publishDue(envFB,{now:Date.parse('2026-10-22T11:00:00Z'),fetchImpl:fb});assert.equal(res.length,1);assert(res[0].ok);
assert.equal(graph.length,1);assert(graph[0].url.endsWith('/v23.0/123/photos'));const fd=graph[0].init.body;assert(fd.get('message').endsWith('ແກ້ໄຂໂດຍເຈົ້າຂອງ'));assert.equal(fd.get('access_token'),'test-page-token');assert.equal(fd.get('source').type,'image/jpeg');
assert.deepEqual(st('daily:2026-10-23:evening').status,'posted');assert.equal(st('daily:2026-10-23:evening').fb_id,'123_456');
assert.equal((await admin('/api/fb/posts/'+id('daily:2026-10-23:evening'),{action:'approve'})).status,409,'posted once only');
// River warning (no picture, time already passed) → posted straight away as a link post.
d=await(await admin('/api/fb/posts/'+id(ev.find(k=>k.startsWith('river:'))),{action:'approve'})).json();assert.equal(d.posted,true);
assert(graph[1].url.endsWith('/123/feed'));assert.equal(graph[1].init.body.get('link'),'https://lao-weather-watch.sonexaivanlaty01.workers.dev');
// Skip; bad action; too-short caption; cross-site POST.
d=await(await admin('/api/fb/posts/'+id('heat:2026-10-23'),{action:'skip'})).json();assert.equal(st('heat:2026-10-23').status,'skipped');
assert.equal((await admin('/api/fb/posts/'+id('rain:2026-10-23'),{action:'delete'})).status,400);
assert.equal((await admin('/api/fb/posts/'+id('rain:2026-10-23'),{action:'approve',caption:'x'})).status,400);
assert.equal((await fbAdminRoute(new Request('https://x.test/api/fb/posts/1',{method:'POST',headers:{'X-Admin-Key':'good',Origin:'https://evil.test'},body:'{"action":"approve"}'}),envFB,{isAdmin:()=>true})).status,403);
// Facebook error → failed with the message, can be approved again.
const bad=await postToPage(envFB,{caption:'hello world',link:null},null,async()=>Response.json({error:{message:'(#200) permission denied'}},{status:403}));assert.deepEqual(bad,{ok:false,error:'(#200) permission denied'});
assert.deepEqual(await postToPage({},{caption:'x'},null,fb),{ok:false,error:'not_configured'});
// Manual "make a draft now" button.
d=await(await admin('/api/fb/make',{slot:'evening'},{...envFB,FEEDBACK_DB:env.FEEDBACK_DB})).json();assert.equal(d.made.length,3);assert(d.made[0].startsWith('daily:2026-10-23:evening:manual'));assert.equal(st(d.made[0]).status,'draft','test drafts from the button are never posted by themselves');
assert.equal((await admin('/api/fb/make',{slot:'noon'})).status,400);
// Unapproved drafts expire 18 h after their time.
await publishDue(envFB,{now:Date.parse('2026-10-23T12:00:00Z'),fetchImpl:fb});assert.equal(st('rain:2026-10-23').status,'expired');

// Cron times (Lao = UTC+7): 05:00 → morning, 17:00 → evening (+ weekly on Sunday), other runs only events.
const cronEnv=()=>({FEEDBACK_DB:sqliteD1(),FORECAST_KV:kvStore()});
const kinds=async iso=>{_resetBot();const e=cronEnv();const out=await botTick(e,{now:Date.parse(iso),fetchImpl:fakeFetch({})});return out.made};
assert.deepEqual(await kinds('2026-10-21T22:00:00Z'),['daily:2026-10-22:morning'],'05:00 Lao');
assert.deepEqual(await kinds('2026-10-22T10:00:00Z'),['daily:2026-10-23:evening'],'17:00 Lao');
assert.deepEqual(await kinds('2026-10-25T10:00:00Z'),['daily:2026-10-23:evening','weekly:2026-10-23'],'Sunday 17:00 Lao (fake data starts 22 Oct)');
omCalls=0;assert.deepEqual(await kinds('2026-10-22T10:30:00Z'),[]);assert.deepEqual(await kinds('2026-10-22T03:00:00Z'),[]);assert.equal(omCalls,0,'no forecast download outside 05:00/17:00');

// Worker wiring.
const w=fs.readFileSync('cloudflare-site/worker.mjs','utf8');
assert(w.includes("path.startsWith('/api/fb/')")&&w.includes('sameKey(r.headers.get(\'X-Admin-Key\'),env.ADMIN_KEY)')&&w.includes('facebookBot(env,ctx)')&&w.includes('checkEvents({FEEDBACK_DB:db}'));
const a=fs.readFileSync('dist/admin.html','utf8');assert(a.includes("fbApi('/api/fb/posts')")&&a.includes('data-make="evening"')&&a.includes('ข่าวประจำวันและสรุป 7 วันโพสต์เองอัตโนมัติ')&&a.includes('คำเตือนยังต้องกด'));
console.log('fb bot ok');
