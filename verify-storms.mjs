// Storm tracker (22 Oct 2026): JMA bosai JSON → /api/storms, distance to the Lao border, the /storm
// page and the banner on the map page.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseStorm,laoBorderKm,stormsRoute,_resetStorms,STORM_NEAR_KM} from './worker/storms.mjs';
// Distance is to the nearest point of the Lao border, not to Vientiane.
assert(laoBorderKm([102.6,17.97])<30,'Vientiane is at the border (Mekong)');
assert(Math.abs(laoBorderKm([126.5,20.2])-2062)<25,'Typhoon Champi analysis point ≈ 2,062 km from the border');
assert(laoBorderKm([105,15.5])<120&&laoBorderKm([110,17])>200);
// JMA's two files for one storm (shape as published, values from TC2636 on 22 Oct 2026).
const spec=[{part:'title',issue:{UTC:'2026-10-21T21:45:00Z'},typhoonNumber:'2630',name:{en:'Champi'},category:{en:'TY'}},
 {advancedHours:0,pressure:'905',maximumWind:{sustained:{'m/s':'55'},gust:{'m/s':'80'}},course:'西北西',speed:{'km/h':'20'},category:{en:'TY'},galeWarning:[{range:{km:650}},{range:{km:500}}],stormWarning:[{range:{km:280}},{range:{km:220}}],validtime:{UTC:'2026-10-21T21:00:00Z'}},
 {advancedHours:24,pressure:'940',maximumWind:{sustained:{'m/s':'45'}},category:{en:'TY'}},
 {advancedHours:117,pressure:'1004',maximumWind:{sustained:{'m/s':'0'}},category:{en:'LOW'}}];
const fc=[{part:'title'},{advancedHours:0,validtime:{UTC:'2026-10-21T21:00:00Z'},center:[20.2,126.5],track:{preTyphoon:[[9.5,160]],typhoon:[[19.9,127.0],[20.2,126.5]]}},
 {advancedHours:24,validtime:{UTC:'2026-10-22T21:00:00Z'},center:[22.1,124.1],probabilityCircle:{radius:77784}},
 {advancedHours:117,validtime:{UTC:'2026-10-26T18:00:00Z'},center:[37.0,135.9],probabilityCircle:{radius:463000}}];
const s=parseStorm('TC2636',spec,fc);
assert.equal(s.name,'Champi');assert.equal(s.category,'TY');assert.equal(s.issued,'2026-10-21T21:45:00Z');
assert.deepEqual(s.points.map(p=>[p.h,p.lat,p.lon,p.p,p.w]),[[0,20.2,126.5,905,55],[24,22.1,124.1,940,45],[117,37,135.9,1004,0]],'JMA values unchanged');
assert.equal(s.points[1].r,77784);assert.deepEqual(s.wind,{gale:{max:650,min:500},storm:{max:280,min:220}});
assert.deepEqual(s.past[0],[160,9.5],'past track as [lon,lat]');assert.equal(s.points[2].cat,'LOW');
assert.equal(s.level,'far');assert(s.closest.km>1500);
// A storm whose 24 h point is near Laos is "near".
const near=parseStorm('X',spec,fc.map(f=>f.advancedHours===24?{...f,center:[17.5,107.6]}:f));assert.equal(near.level,'near');assert(near.closest.km<=STORM_NEAR_KM);
assert.equal(parseStorm('X',[],[]),null);
// Route: one download serves 10 minutes; no storms → empty list; failure → 503.
// JTWC North Indian Ocean warning (Cyclone Arnab, 26 Oct 2026, header lines as published).
const TCW=`WTIO51 PGTW 261500
WARNING    ATCG MIL 02B NIO 261026133109
2026102612 02B ARNAB      003  01 300 13 SATL 040
T000 159N 0872E 080 R064 015 NE QD 015 SE QD 015 SW QD 015 NW QD R050 025 NE QD 025 SE QD 025 SW QD 025 NW QD R034 060 NE QD 050 SE QD 050 SW QD 050 NW QD
T012 161N 0848E 100 R064 015 NE QD 015 SE QD 015 SW QD 015 NW QD
T024 161N 0830E 105
T048 176N 0819E 050
T072 218N 0817E 020
AMP
   MAX SUSTAINED WINDS - 080 KT, GUSTS 100 KT
   MAX SUSTAINED WINDS - 100 KT, GUSTS 125 KT
`;
const NOW=Date.UTC(2026,9,26,16);  // 4 h after the fixture's warning position (26 Oct 12Z)
let calls=0,jtwc=0;const fake=async url=>{const u=String(url);if(u.includes('metoc.navy.mil')){jtwc++;return new Response(u.endsWith('jtwc.rss')?'<link>https://www.metoc.navy.mil/jtwc/products/io0226.tcw</link>':TCW)}calls++;if(u.endsWith('targetTc.json'))return Response.json([{tropicalCyclone:'TC2636'}]);if(u.endsWith('specifications.json'))return Response.json(spec);return Response.json(fc)};
_resetStorms();let r=await stormsRoute(new Request('https://x.test/api/storms'),{},{now:NOW,fetchImpl:fake});let d=await r.json();
assert.equal(r.status,200);assert.equal(d.storms.length,2,'JMA + JTWC');assert.match(d.source,/JMA/);assert.match(d.source,/JTWC/);assert.equal(calls,3);assert.equal(jtwc,2);
{const a=d.storms.find(x=>x.id==='IO0226');assert.equal(a.agency,'JTWC');assert.equal(a.name,'Arnab');assert.equal(a.number,'02B');assert.equal(a.windAvgMin,1);assert.equal(a.issued,'2026-10-26T13:31:09Z');
 assert.deepEqual(a.points.map(p=>[p.h,p.lat,p.lon,p.w,p.cat]),[[0,15.9,87.2,41,'SCS'],[12,16.1,84.8,51,'SCS'],[24,16.1,83,54,'SCS'],[48,17.6,81.9,26,'CS'],[72,21.8,81.7,10,'TD']],'JTWC values (kt → m/s)');
 assert.equal(a.points[0].g,51);assert.equal(a.points[0].course,300);assert.equal(a.points[0].kmh,24);assert.deepEqual(a.wind.gale,{max:111,min:93});assert.deepEqual(a.wind.storm,{max:46,min:46});
 assert.equal(a.level,'far');assert(a.closest.km>1400&&a.closest.km<1500,'Arnab ~1,446 km from the Lao border');assert.equal(d.storms.find(x=>x.id==='TC2636').agency,'JMA')}
await stormsRoute(new Request('https://x.test/api/storms'),{},{now:NOW,fetchImpl:fake});assert.equal(calls,3,'cached');
// One source down never hides the other.
_resetStorms();d=await (await stormsRoute(new Request('https://x.test/api/storms'),{},{now:NOW,fetchImpl:async u=>String(u).includes('metoc')?new Response('x',{status:503}):fake(u)})).json();assert.equal(d.storms.length,1);assert.equal(d.sources.JTWC,false);
_resetStorms();d=await (await stormsRoute(new Request('https://x.test/api/storms'),{},{now:NOW,fetchImpl:async u=>String(u).includes('jma.go.jp')?new Response('x',{status:503}):fake(u)})).json();assert.deepEqual(d.storms.map(s=>s.id),['IO0226']);
const {parseTcw,downloadNioStorms}=await import('./worker/storms-nio.mjs');assert.equal(parseTcw('nothing','IO0126'),null);
// The WARNING line's stamp is YYMMDDHHMMSS (bug 28 Oct 2026: read as DDMMYY, so 261028… showed as 2028-10-26).
assert.equal(parseTcw(TCW.replace('261026133109','261028031126'),'IO0226').issued,'2026-10-28T03:11:26Z');
assert.equal(parseTcw(TCW.replace('261026133109','261130235959'),'IO0226').issued,'2026-11-30T23:59:59Z');
// JTWC warns every 6 h: a warning position older than 12 h (two missed warnings) is dropped, never shown as current.
{const rss=async u=>new Response(String(u).endsWith('jtwc.rss')?'<link>https://www.metoc.navy.mil/jtwc/products/io0226.tcw</link>':TCW),t0=Date.UTC(2026,9,26,12);
 assert.equal((await downloadNioStorms(rss,t0+11*3600000)).length,1,'11 h old: kept');
 assert.equal((await downloadNioStorms(rss,t0+13*3600000)).length,0,'13 h old: dropped')}
{const {stormIdOk}=await import('./worker/storm-share.mjs');assert(stormIdOk('IO0226')&&stormIdOk('TC2636')&&!stormIdOk('IO02')&&!stormIdOk('../x'))}
_resetStorms();d=await (await stormsRoute(new Request('https://x.test/api/storms'),{},{now:NOW,fetchImpl:async()=>Response.json([])})).json();assert.deepEqual(d.storms,[]);
_resetStorms();assert.equal((await stormsRoute(new Request('https://x.test/api/storms'),{},{now:NOW,fetchImpl:async()=>new Response('x',{status:500})})).status,503);
assert.equal((await stormsRoute(new Request('https://x.test/api/storms',{method:'POST'}))).status,405);
// Wiring: Worker route, page, banner.
const worker=fs.readFileSync('cloudflare-site/worker.mjs','utf8'),shell=fs.readFileSync('dist/app-shell.js','utf8'),css=fs.readFileSync('dist/app-ui.css','utf8'),app=fs.readFileSync('dist/app.js','utf8'),layer=fs.readFileSync('dist/storm-layer.js','utf8');
assert(worker.includes("if(path==='/api/storms')return stormsRoute(request,ctx);"));
// Storm tracking = a mode of the main map (owner's choice, 22 Oct 2026, with the screenshot): no
// separate /storm page; top menus and panels hidden; storm strip attached on top of the time bar.
assert(!fs.existsSync('dist/storm.html')&&!fs.existsSync('dist/storm.js'),'no separate storm page');
assert(app.includes('window.stormMode=setupStormLayer(map,{homeBounds:REGION_BOUNDS,markerClass:maplibregl.Marker,cloudOn:')&&app.includes('...STORM_LAYERS].forEach'),'storm mode wired, drawn above imagery');
assert(app.includes('window.stormMode?.enter(s.id)'),'alert button opens storm mode');
assert(layer.includes("document.querySelector('.workspace .timeline')")&&css.includes('.app-storm-mode{position:absolute;left:-1px;right:-1px;bottom:100%')&&css.includes('body.storm-mode .app-top,body.storm-mode .app-weather'),'strip on top of the time bar; menus hidden');
assert(css.includes('body.storm-mode .workspace .timeline .timeline-freshness'),'slimmer time bar in storm mode');
assert(layer.includes('map.setMaxBounds(STORM_BOUNDS)')&&layer.includes("get('storm')"),'wide panning; /?storm=<id> link');assert(!shell.includes('stormBar'),'no storm banner on the map: storms live in the alerts (22 Oct 2026)');
{const {stormGeometry,stormView}=await import('./dist/storm-layer.js');const g=stormGeometry(s);assert.equal(g.points.features.length,3);assert.equal(g.track.geometry.coordinates.length,2,'0–72 h firm track');assert(g.trackFar,'after 72 h: faint track');assert(g.gale);
 assert.equal(g.points.features.at(-1).properties.label,'+117 ຊມ · ສະຫຼາຍ','end point marked as dissipating');
 const [[w,so],[e,n]]=stormView(s);assert(w<=100.1&&e>=124.1&&so<=13.9&&n>=22.5,'view holds Laos and the 0–72 h track')}


assert(app.includes("!frameRenderer?.covers('cloud',frameRenderer.spec())"),'zoomed-out view falls back to the previous complete cloud image');
assert(!/[฀-๿]/.test(shell+layer),'no Thai text');// Heading, speed and gust as JMA gives them; Lao wording; towards / away from Laos.
assert.equal(s.points[0].course,292.5,'西北西 = WNW');assert.equal(s.points[0].kmh,20);assert.equal(s.points[0].g,80);
{const {headingLao,towardsLaos,stormDetailsHTML}=await import('./dist/storm-layer.js');
 assert.equal(headingLao(315),'ທິດຕາເວັນຕົກສ່ຽງເໜືອ');assert.equal(headingLao(0),'ທິດເໜືອ');assert.equal(headingLao(270),'ທິດຕາເວັນຕົກ');
 assert.equal(towardsLaos({lon:112,lat:16,course:290}),'towards');assert.equal(towardsLaos({lon:112,lat:16,course:90}),'away');assert.equal(towardsLaos({lon:126,lat:20,course:315}),'side');
 const html=stormDetailsHTML(s);assert(html.includes('198 km/h (55 m/s)')&&html.includes('288 km/h (80 m/s)')&&html.includes('20 km/h')&&html.includes('ລັດສະໝີ 500–650 km')&&html.includes('ບໍ່ແມ່ນປະກາດທາງການຂອງລາວ'),'details card')}
assert(app.includes("const loadStorms=()=>fetch('/api/storms')")&&app.includes("b.textContent='ຕິດຕາມພາຍຸ ›'")&&css.includes('.alert-storm-go::before'),'storms listed in alerts (storm line icon, no emoji: 26 Oct 2026)');
assert(app.includes('items.push(...calm)'),'every active storm counts in the alert badge');
// Sharing a storm: /storm/<id> = map page with that storm's preview tags; card = real Himawari photo.
{const {stormPageHTML,stormSummary,cardBBox,stormCardRoute,stormIdOk}=await import('./worker/storm-share.mjs');
 const home='<html><head><title>Home</title><meta name="description" content="d"><meta property="og:title" content="t"><meta property="og:description" content="x"><meta property="og:url" content="u"><meta property="og:image" content="i"><meta property="og:image:type" content="image/jpeg"></head><body><script type="module" src="./app.js"></script></body></html>';
 const h=stormPageHTML(home,s);assert(h.includes('<head><base href="/">'),'relative assets keep working under /storm/');
 assert(h.includes('og:url" content="https://lao-weather-watch.sonexaivanlaty01.workers.dev/storm/TC2636"')&&h.includes('/api/storm-card/TC2636.jpg')&&h.includes('Champi')&&h.includes('ຫ່າງຊາຍແດນລາວ'),'preview tags: name, distance, real photo card');
 assert(stormSummary(s).description.includes('198 km/h')&&stormIdOk('TC2636')&&!stormIdOk('../x'));
 const [x0,y0,x1,y1]=cardBBox(126.5,20.2);assert(Math.abs((x1-x0)/(y1-y0)-1200/630)<.01,'1200×630 box');
 let asked=0,html='';const fetchImpl=async url=>{asked++;assert(String(url).includes('Himawari_AHI_Band13_Clean_Infrared')&&String(url).includes('WIDTH=1200&HEIGHT=630'));return new Response(new Uint8Array(asked<2?3000:90000))};
 const stored={};const env={BROWSER:{quickAction:async(a,o)=>{assert.equal(a,'screenshot');html=o.html;assert.deepEqual(o.viewport,{width:1200,height:630});return new Response(new Uint8Array(50000))}},FORECAST_KV:{getWithMetadata:async k=>({value:stored[k]||null}),put:async(k,v)=>{stored[k]=v}}};
 let card=await stormCardRoute(new Request('https://x.test/api/storm-card/TC2636.jpg'),{waitUntil:p=>p},{storms:async()=>[s],env,fetchImpl});
 assert.equal(card.headers.get('Content-Type'),'image/jpeg');assert.equal(asked,2,'a blank (small) frame is skipped');assert.equal((await card.arrayBuffer()).byteLength,50000,'rendered card');
 assert(html.includes('Champi')&&html.includes('ກຳລັງໄປທິດຕາເວັນຕົກ ຄ່ອນໄປທາງເໜືອ')&&html.includes('ຫ່າງລາວ')&&html.includes('Himawari-9 / NASA GIBS')&&html.includes("url('data:image/jpeg;base64,"),'card: name, heading, distance, source; photo embedded');
 await new Promise(r=>setTimeout(r,0));assert(Object.keys(stored)[0]?.startsWith('storm-card2:TC2636:'),'kept per bulletin');
 card=await stormCardRoute(new Request('https://x.test/api/storm-card/TC2636.jpg'),{},{storms:async()=>[s],fetchImpl,env:{}});assert.equal((await card.arrayBuffer()).byteLength,90000,'no Browser Run: plain real photo');
 assert.equal((await stormCardRoute(new Request('https://x.test/api/storm-card/TC9999.jpg'),{},{storms:async()=>[s]})).status,404);
 const w=fs.readFileSync('cloudflare-site/worker.mjs','utf8');assert(w.includes("path.startsWith('/storm/')||path.startsWith('/api/storm-card/')"));
 assert(layer.includes("shareRowHTML(location.origin+'/storm/'+s.id,shareText(s))")&&layer.includes("history.replaceState(null,'','/storm/'+s.id)")&&layer.includes("location.pathname.match(/^\\/storm\\/((?:TC|IO)\\d{4})/)"),'share row in the report; /storm/<id> opens storm mode')}
console.log('Storms: JMA parsing, Lao border distance, levels, cache/503, storm mode on the main map and banner passed.');
