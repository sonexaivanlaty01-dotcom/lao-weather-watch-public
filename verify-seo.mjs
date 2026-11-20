// Province weather pages, Thai landing page, link-preview cards, sitemap and home links (SEO, 20 Oct 2026).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PROVINCES,LAOS} from './worker/seo-provinces.mjs';
import {seoRoute,rainAnswer,sky,nearestStation,summaryOf,provinceHTML,_resetSeoCache} from './worker/seo-pages.mjs';
import {heroFrame,svgPath,slugOf} from './build-seo.mjs';
// Data: 18 provinces, unique slugs, outlines present (closed rings must not collapse), districts listed.
assert.equal(PROVINCES.length,18);assert.equal(new Set(PROVINCES.map(p=>p.slug)).size,18);
assert(PROVINCES.every(p=>/^[a-z-]+$/.test(p.slug)&&p.outline.length>500&&p.districts.length>=4&&/^[຀-໿]/.test(p.name_lo)));
assert.equal(slugOf('Vientiane Capital'),'vientiane-capital');assert(LAOS.lines.length>2000);
{const ring=[[100,18],[101,18],[101,19],[100,19],[100,18]];assert(svgPath({type:'Polygon',coordinates:[ring]},heroFrame([100,18,101,19]),1).split('L').length>=4,'closed ring keeps its corners')}
{const [x0,y0,x1,y1]=heroFrame([101,19,103,21]);assert(Math.abs((x1-x0)/(y1-y0)-780/600)<.01,'hero frame has the 780×600 aspect')}
// Rain wording follows probability and amount.
assert.equal(rainAnswer(2,0),'ບໍ່ຄາດວ່າຈະມີຝົນ');assert.equal(rainAnswer(30,.5),'ອາດມີຝົນປອຍໆ');assert.equal(rainAnswer(84,1),'ມີຝົນປອຍໆ');
assert.equal(rainAnswer(70,6),'ມີໂອກາດຝົນຕົກ');assert.equal(rainAnswer(90,20),'ຝົນຕົກໜັກບາງບ່ອນ');assert.match(rainAnswer(95,50),/ເຝົ້າລະວັງ/);
assert.deepEqual(sky(0),['☀','ທ້ອງຟ້າແຈ່ມໃສ']);assert.equal(sky(95)[0],'⛈');
// Fake Open-Meteo answer for all 18 centres (one request).
let calls=0;const day=i=>`2026-10-${20+i}`;
const fake=async url=>{calls++;const u=new URL(url);assert.equal(u.hostname,'api.open-meteo.com');assert.equal(u.searchParams.get('latitude').split(',').length,18);
 return Response.json(PROVINCES.map((p,k)=>({current:{time:'2026-10-20T04:00',temperature_2m:21+k%3,weather_code:2},daily:{time:[0,1,2,3,4,5,6].map(day),weather_code:[2,53,51,51,51,3,61],temperature_2m_max:[31,30,30,31,32,33,29],temperature_2m_min:[20,21,18,20,21,22,21],precipitation_sum:[.3,.8,0,0,.1,0,9],precipitation_probability_max:[45,42,18,20,5,10,70]}})))};
const levels={stations:[{id:'011201',name:'Luang Prabang',river:'Mekong',lat:19.89,lon:102.14,time:'2026-10-19T20:45:00.000Z',level:8.21,status:'normal',stale:false},{id:'x',name:'Far',lat:15,lon:106,time:'2026-10-19T20:45:00.000Z',level:3,status:'alarm',stale:false}]};
_resetSeoCache();const get=path=>seoRoute(new Request('https://site'+path),{},{fetchImpl:fake,riverLevels:async()=>levels});
let r=await get('/weather/luang-prabang');assert.equal(r.status,200);let t=await r.text();
assert(t.includes('<html lang="lo" translate="no">')&&t.includes('<h1>ຫຼວງພະບາງ</h1>'));
assert(t.includes('<title>ສະພາບອາກາດ ແຂວງຫຼວງພະບາງ ມື້ນີ້'),'title targets Lao searches');
assert(t.includes('ມື້ນີ້ຝົນຕົກບໍ່?')&&t.includes('ອາດມີຝົນປອຍໆ')&&t.includes('ມື້ອື່ນຝົນຕົກບໍ່?'),'answers in the page text');
assert(t.includes('"@type":"FAQPage"')&&t.includes('"@type":"BreadcrumbList"'),'structured data');
assert(t.includes('og:image" content="https://lao-weather-watch.sonexaivanlaty01.workers.dev/og/luang-prabang.jpg?v=3"'));
assert(t.includes('8.21 m')&&t.includes('ປົກກະຕິ')&&!t.includes('Far'),'nearest MRC station only');
assert(t.includes('href="/?place=LA-LP"')&&(t.match(/href="\/weather\/[a-z-]+"/g)||[]).length===17,'links to the live map and the other 17 provinces');
assert(t.includes('server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox='),'satellite hero');
assert(t.includes('ບໍ່ແມ່ນປະກາດເຕືອນໄພທາງການ'),'disclaimer');assert.equal(r.headers.get('Cache-Control'),'public,max-age=900');
r=await get('/weather');t=await r.text();assert.equal(r.status,200);assert.equal((t.match(/href="\/weather\/[a-z-]+"/g)||[]).length,18);
assert.equal((await get('/weather/nowhere')).status,404);assert.equal((await get('/weather/')).status,200);
assert.equal(calls,1,'one forecast request serves every page for 30 minutes');
assert.equal((await seoRoute(new Request('https://site/weather',{method:'POST'}),{})).status,405);
_resetSeoCache();assert.equal((await seoRoute(new Request('https://site/weather/luang-prabang'),{},{fetchImpl:async()=>new Response('x',{status:500})})).status,503);
assert.equal(nearestStation(PROVINCES.find(p=>p.slug==='attapeu'),levels.stations),null,'no station within 90 km → no river card');
// Escaping: a hostile station name cannot inject markup.
{const p=PROVINCES[0];const f=await (await fake('https://api.open-meteo.com/v1/forecast?latitude='+PROVINCES.map(()=>1).join(','))).json();
 const h=provinceHTML(p,f[0],{s:{...levels.stations[0],name:'<script>x</script>'},d:5});assert(!h.includes('<script>x')&&h.includes('&lt;script&gt;'))}
// Static files: cards, sitemap, home links and tags, Thai page, worker wiring.
for(const p of PROVINCES)assert(fs.existsSync(`dist/og/${p.slug}.jpg`),'card '+p.slug);assert(fs.existsSync('dist/og/home.jpg'));
const sm=fs.readFileSync('dist/sitemap.xml','utf8');assert.equal((sm.match(/<loc>/g)||[]).length,22);assert(sm.includes('/weather/luang-prabang')&&sm.includes('/th</loc>'));
const home=fs.readFileSync('dist/index.html','utf8');
assert(/<!--provinces--><div class="province-chips">(<a href="\/weather\/[a-z-]+">[^<]+<\/a>){18}<\/div><!--\/provinces-->/.test(home),'home links to all province pages');
assert(home.includes('og/home.jpg')&&home.includes('summary_large_image')&&home.includes('<title>ສະພາບອາກາດລາວ ມື້ນີ້'));
const th=fs.readFileSync('dist/th/index.html','utf8');assert(th.includes('<html lang="th">')&&th.includes('พยากรณ์อากาศลาว วันนี้')&&(th.match(/href="\/weather\/[a-z-]+"/g)||[]).length===18&&th.includes('ไม่ใช่ประกาศเตือนภัยทางการ'));
const worker=fs.readFileSync('cloudflare-site/worker.mjs','utf8'),toml=fs.readFileSync('cloudflare-site/wrangler.toml','utf8');
assert(worker.includes("path.startsWith('/weather/'))return seoRoute(")&&toml.includes('run_worker_first = ["/api/*", "/weather", "/weather/*", "/storm/*"]'));
assert(fs.readFileSync('dist/app-shell.js','utf8').includes("get('place')"),'map opens on ?place=');
// Share row (design 3): five targets with each service's public share URL.
{const {shareTargets,shareRowHTML,SHARE_TARGETS}=await import('./dist/share.js');const url='https://lao-weather-watch.sonexaivanlaty01.workers.dev/weather/luang-prabang';
 const s=shareTargets(url,'ສະພາບອາກາດ ຫຼວງພະບາງ');assert.deepEqual(SHARE_TARGETS,['facebook','messenger','whatsapp','line','copy']);
 assert.equal(s.facebook,'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(url));assert.equal(s.line,'https://social-plugins.line.me/lineit/share?url='+encodeURIComponent(url));
 assert(s.whatsapp.startsWith('https://wa.me/?text=')&&decodeURIComponent(s.whatsapp.split('=')[1]).endsWith(url));assert(s.messenger.startsWith('fb-messenger://share/?link='));assert.equal(s.copy,url);
 const row=shareRowHTML(url+'?a="x"','t');assert.equal((row.match(/class="share-btn"/g)||[]).length,5);assert(!row.includes('"x"'),'URL attribute escaped');
 _resetSeoCache();const page=await (await get('/weather/luang-prabang')).text();assert(page.includes('ແບ່ງປັນໃຫ້ໝູ່')&&page.includes('data-share-url="https://lao-weather-watch.sonexaivanlaty01.workers.dev/weather/luang-prabang"')&&page.includes("import {bindShareRows} from '/share.js"));
 const shell=fs.readFileSync('dist/app-shell.js','utf8');assert(shell.includes("updateShareRow(row,location.origin+'/weather/'+p.slug")&&shell.includes("$('weatherPanel')?.prepend(sharePanel)"));
 const {placeIndex}=await import('./dist/app-shell.js');const idx=placeIndex(JSON.parse(fs.readFileSync('dist/data/admin/provinces.geojson','utf8')).features,JSON.parse(fs.readFileSync('dist/data/admin/districts.geojson','utf8')).features);
 assert(idx.every(p=>PROVINCES.some(q=>q.slug===p.slug)),'map share links use the same slugs as the province pages');
 // Phones: Facebook must not open facebook.com/sharer in a new tab (the app grabs it and closes).
 assert(row.includes('data-share-text="t"'));const {bindShareRows,mobileFacebookSharer}=await import('./dist/share.js');
 const tap=async(ua,share)=>{const saved=Object.getOwnPropertyDescriptor(globalThis,'navigator'),savedLoc=globalThis.location,calls=[];let prevented=false,handler;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:ua,share:share&&(async d=>{calls.push(d);if(share==='cancel'){const e=new Error('x');e.name='AbortError';throw e}if(share==='fail')throw new Error('no')})}});globalThis.location={href:'about:blank'};
  const rowEl={dataset:{shareUrl:url,shareText:'ສະພາບອາກາດ'},querySelector:()=>({})},btn={dataset:{share:'facebook'},closest:()=>rowEl};
  bindShareRows({addEventListener:(t,f)=>handler=f});await handler({target:{closest:()=>btn},preventDefault:()=>prevented=true});
  const out={prevented,calls,href:globalThis.location.href};if(saved)Object.defineProperty(globalThis,'navigator',saved);else delete globalThis.navigator;globalThis.location=savedLoc;return out};
 const android='Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile';
 // Phones go straight to Facebook's mobile sharer in this tab (the share sheet did not reliably reach Facebook).
 let r=await tap(android,'ok');assert(r.prevented&&r.calls.length===0&&r.href===mobileFacebookSharer(url),'phone: Facebook sharer directly, no share sheet');
 r=await tap('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari',null);assert(r.prevented&&r.href===mobileFacebookSharer(url),'phone without Web Share → mobile sharer in this tab');
 r=await tap('Mozilla/5.0 (Windows NT 10.0) Chrome/130',async()=>{});assert(!r.prevented&&r.calls.length===0,'computer: normal sharer link');}
// A stuck river-level refresh must not hold the province page (Facebook previews time out → no picture).
{_resetSeoCache();const t0=Date.now();const r=await seoRoute(new Request('https://site/weather/luang-prabang'),{},{fetchImpl:fake,riverLevels:()=>new Promise(()=>{})});
 assert.equal(r.status,200);assert(Date.now()-t0<6000,'page answers without river data');const t=await r.text();assert(t.includes('og:image:type" content="image/jpeg"')&&!t.includes('8.21 m'))}
{const s=fs.readFileSync('dist/share.js','utf8');assert(s.includes("location.href=mobileFacebookSharer(url)")&&!s.includes('navigator.share'),'phones: Facebook button opens the Facebook sharer directly')}
console.log('SEO:18 province pages (live text, FAQ, structured data, nearest MRC level), index, 404/503, Thai page, link cards, sitemap and home links passed.');
