// Province weather pages for search engines and sharing (20 Oct 2026), design 3 (dark, map on top).
//   /weather          list of the 18 provinces with today's outlook
//   /weather/<slug>   one province: today, "will it rain today / tomorrow", 7 days, nearest MRC
//                     river level, districts, link into the live map
// Text is rendered on the server so Google can read it. Forecast: one Open-Meteo request for all 18
// provincial capitals (worker/province-towns.mjs, cached 30 min). River level: the same cached MRC data the map uses.
import {PROVINCES,LAOS} from './seo-provinces.mjs';
import {forecastPoint} from './province-towns.mjs';
import {logoSVG,FAVICON_LINKS} from './brand.mjs';
import {readOptionalCache,writeOptionalCache} from './optional-cache.mjs';
import {shareRowHTML,SHARE_CSS} from '../dist/share.js';
export const SEO_SITE='https://lao-weather-watch.sonexaivanlaty01.workers.dev',FORECAST_TTL=30*60000;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DAYS=['ອາທິດ','ຈັນ','ອັງຄານ','ພຸດ','ພະຫັດ','ສຸກ','ເສົາ'],MONTHS=['ມ.ກ.','ກ.ພ.','ມ.ນ.','ມ.ສ.','ພ.ພ.','ມິ.ຖ.','ກ.ລ.','ສ.ຫ.','ກ.ຍ.','ຕ.ລ.','ພ.ຈ.','ທ.ວ.'];
const dayParts=iso=>{const d=new Date(iso+'T12:00:00Z');return {wd:DAYS[d.getUTCDay()],day:d.getUTCDate(),mon:MONTHS[d.getUTCMonth()]}};
// WMO weather codes → Lao words + symbol.
export function sky(code){const c=Number(code);
 if(c===0)return ['☀','ທ້ອງຟ້າແຈ່ມໃສ'];if(c<=2)return ['⛅','ມີເມກບາງສ່ວນ'];if(c===3)return ['☁','ມີເມກຫຼາຍ'];if(c<=48)return ['🌫','ມີໝອກ'];
 if(c<=57)return ['🌦','ຝົນປອຍໆ'];if(c<=67)return ['🌧','ມີຝົນ'];if(c<=82)return ['🌧','ຝົນຊູ'];if(c<=86)return ['🌨','ຝົນ/ລູກເຫັບ'];return ['⛈','ພາຍຸຟ້າຮ້ອງ'];}
// Plain answer to "will it rain?" from the day's rain probability and amount.
export function rainAnswer(prob,mm){const p=Number(prob)||0,m=Number(mm)||0;
 if(p<15&&m<.2)return 'ບໍ່ຄາດວ່າຈະມີຝົນ';if(m<2)return p>=60?'ມີຝົນປອຍໆ':'ອາດມີຝົນປອຍໆ';if(p<40)return 'ອາດມີຝົນປອຍໆ';if(m<10)return 'ມີໂອກາດຝົນຕົກ';if(m<35)return 'ຝົນຕົກໜັກບາງບ່ອນ';return 'ຝົນຕົກໜັກຫຼາຍ · ເຝົ້າລະວັງ';}
export const RIVER_LAO={normal:'ປົກກະຕິ',rising:'ນ້ຳຂຶ້ນໄວ',alarm:'ເຖິງລະດັບເຕືອນ',flood:'ເຖິງລະດັບນ້ຳຖ້ວມ'};
export function esriHero(frame,w=780,h=600){return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${frame.join(',')}&bboxSR=3857&imageSR=3857&size=${w},${h}&format=jpg&f=image`}
let cached=null;const RIVER_WAIT_MS=4000;
async function forecastAll(ctx,{fetchImpl=fetch,now=Date.now()}={}){
 if(cached&&now-cached.at<FORECAST_TTL)return cached.data;
 const key=new Request('https://seo.internal/forecast-v2')   // v2: capital towns, not province centres;
 const hit=await readOptionalCache(key);if(hit){try{const c=await hit.json();if(now-c.at<FORECAST_TTL){cached=c;return c.data}}catch{/* ignore */}}
 const pts=PROVINCES.map(p=>forecastPoint(p.slug,p.center));
 const qs=new URLSearchParams({latitude:pts.map(p=>p[0]).join(','),longitude:pts.map(p=>p[1]).join(','),current:'temperature_2m,weather_code',daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',forecast_days:'7',timezone:'Asia/Vientiane'});
 const r=await fetchImpl('https://api.open-meteo.com/v1/forecast?'+qs,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('forecast');
 const list=await r.json(),rows=Array.isArray(list)?list:[list];if(rows.length!==PROVINCES.length)throw new Error('forecast_count');
 const data=Object.fromEntries(PROVINCES.map((p,i)=>[p.id,rows[i]]));cached={at:now,data};
 writeOptionalCache(key,Response.json(cached,{headers:{'Cache-Control':'public,max-age=1800'}}),ctx);return data;
}
const km=(a,b)=>{const r=Math.PI/180,dl=(b[1]-a[1])*r,dn=(b[0]-a[0])*r,x=Math.sin(dl/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dn/2)**2;return 12742*Math.asin(Math.sqrt(x))};
export function nearestStation(province,stations,maxKm=90){
 let best=null;for(const s of stations||[]){if(s.stale||!Number.isFinite(s.level))continue;const d=km(province.center,[s.lon,s.lat]);if(d<=maxKm&&(!best||d<best.d))best={s,d}}return best;
}
export function summaryOf(f){const d=f.daily,today={code:d.weather_code[0],max:d.temperature_2m_max[0],min:d.temperature_2m_min[0],mm:d.precipitation_sum[0],p:d.precipitation_probability_max[0]};
 const tomorrow={mm:d.precipitation_sum[1],p:d.precipitation_probability_max[1]};let wettest=0;for(let i=1;i<d.time.length;i++)if((d.precipitation_probability_max[i]??0)>(d.precipitation_probability_max[wettest]??0))wettest=i;
 return {today,tomorrow,wettest,now:f.current?.temperature_2m,updated:f.current?.time};}
const n0=v=>Number.isFinite(Number(v))?Math.round(Number(v)):'–',mm1=v=>(Number(v)||0).toFixed(1);
const CSS=`*{box-sizing:border-box;margin:0;padding:0}html{background:#0b1424}body{max-width:560px;margin:0 auto;background:#0b1424;color:#e9eef6;font:15px/1.55 'Noto Sans Lao',Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}.m{color:#9fb0c6}.n{font-feature-settings:'tnum'}
.hero{position:relative;height:0;padding-bottom:76.9%;background:#13213a center/cover no-repeat}.hero svg{position:absolute;inset:0;width:100%;height:100%}
.hero .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,20,36,.4),rgba(11,20,36,.05) 38%,#0b1424 96%)}
.brand{position:absolute;left:14px;top:14px;display:flex;align-items:center;gap:8px;background:rgba(13,21,35,.78);border-radius:14px;padding:6px 10px;text-decoration:none;font-weight:700;font-size:13px}
.logo{width:24px;height:24px;border-radius:7px;background:#2563eb;display:grid;place-items:center;color:#fff}
.title{position:absolute;left:16px;right:16px;bottom:12px}.title h1{font-size:30px;line-height:1.15;font-weight:800}
.now{display:flex;align-items:flex-end;gap:12px;margin-top:6px}.now b{font-size:54px;font-weight:300;letter-spacing:-2px;line-height:1}
.card{margin:12px;border-radius:18px;padding:14px 16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09)}
.answer{background:#14233c;border-color:#24406b}.answer strong{display:block;font-size:20px;font-weight:800}
.days{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}.day{min-width:68px;text-align:center;background:rgba(255,255,255,.05);border-radius:12px;padding:8px 4px;font-size:12px}
.day.today{background:rgba(59,130,246,.2);border:1px solid #3b82f6}.day.trend{border:1px dashed rgba(255,255,255,.18);background:transparent;opacity:.8}.day i{display:block;font-style:normal;font-size:20px}.day b{font-size:15px}.p{color:#7fb4ff}
.pill{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700;background:rgba(52,211,153,.15);color:#6ee7b7}.pill.warn{background:rgba(245,158,11,.18);color:#fcd34d}.pill.bad{background:rgba(239,68,68,.2);color:#fca5a5}
.btn{display:block;margin:12px;padding:14px;border-radius:14px;background:#2563eb;color:#fff;text-align:center;font-weight:700;text-decoration:none}
h2{font-size:16px;margin-bottom:6px}.q{font-weight:700;margin-top:10px}.q:first-of-type{margin-top:0}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.chips a{border-radius:999px;padding:5px 11px;font-size:13px;background:rgba(255,255,255,.07);color:#cfe0f5;text-decoration:none}
.crumb{font-size:12px;padding:4px 16px 0}.foot{font-size:11.5px;padding:6px 16px 28px}
.list a{display:flex;justify-content:space-between;gap:10px;padding:11px 0;border-top:1px solid rgba(255,255,255,.08);text-decoration:none}.list a:first-child{border-top:0}`+SHARE_CSS;
const shareCard=(path,text)=>`<div class="card"><h2>ແບ່ງປັນໃຫ້ໝູ່</h2>${shareRowHTML(SEO_SITE+path,text)}</div><script type="module">import {bindShareRows} from '/share.js?v=20261021fb';bindShareRows()</script>`;
function head({title,description,path,image,jsonld}){
 return `<!doctype html><html lang="lo" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b1424">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${SEO_SITE}${path}"><meta name="robots" content="index,follow,max-image-preview:large">${FAVICON_LINKS}
<meta property="og:type" content="website"><meta property="og:locale" content="lo_LA"><meta property="og:site_name" content="ລາວປອດໄພ"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${SEO_SITE}${path}"><meta property="og:image" content="${SEO_SITE}${image}?v=3"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/jpeg"><meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Lao:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style><script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g,'\\u003c')}</script></head><body>`;
}
const FOOT=`<p class="foot m">ຕົ້ນແບບເພື່ອຊຸມຊົນ · ບໍ່ແມ່ນປະກາດເຕືອນໄພທາງການ · ພະຍາກອນ: Open-Meteo (NOAA GFS, CC BY 4.0) · ລະດັບນ້ຳ: MRC · ພາບດາວທຽມ: Esri World Imagery · ເຂດແດນ: NGD / geoBoundaries (ODbL) · <a href="/about">ກ່ຽວກັບ</a></p></body></html>`;
export function provinceHTML(p,f,station,{now=Date.now()}={}){
 const s=summaryOf(f),d=f.daily,[ic,word]=sky(s.today.code),ans=rainAnswer(s.today.p,s.today.mm),ansTomorrow=rainAnswer(s.tomorrow.p,s.tomorrow.mm),w=dayParts(d.time[s.wettest]),t=dayParts(d.time[0]);
 const updated=String(s.updated||'').slice(11,16);
 const title=`ສະພາບອາກາດ ແຂວງ${p.name_lo} ມື້ນີ້ · ພະຍາກອນ 7 ມື້ | ລາວປອດໄພ`;
 const description=`ມື້ນີ້ ${p.name_lo}: ${word} ${n0(s.today.min)}–${n0(s.today.max)}°C, ${ans} (ໂອກາດ ${n0(s.today.p)}%). ມື້ອື່ນ: ${ansTomorrow} (${n0(s.tomorrow.p)}%). ພະຍາກອນ 7 ມື້ ແລະ ລະດັບນ້ຳ.`;
 const faq=[[`ມື້ນີ້${p.name_lo}ຝົນຕົກບໍ່?`,`${ans} · ໂອກາດ ${n0(s.today.p)}% · ປະມານ ${mm1(s.today.mm)} mm`],[`ມື້ອື່ນຝົນຕົກບໍ່?`,`${ansTomorrow} · ໂອກາດ ${n0(s.tomorrow.p)}% · ປະມານ ${mm1(s.tomorrow.mm)} mm`],[`ອາທິດນີ້ມື້ໃດຝົນຫຼາຍທີ່ສຸດ?`,`ວັນ${w.wd} ${w.day} ${w.mon} · ໂອກາດ ${n0(d.precipitation_probability_max[s.wettest])}% · ປະມານ ${mm1(d.precipitation_sum[s.wettest])} mm`]];
 if(station)faq.push([`ນ້ຳຂອງ/ແມ່ນ້ຳ ທີ່ ${station.s.name} ສູງເທົ່າໃດ?`,`${station.s.level.toFixed(2)} m · ${RIVER_LAO[station.s.status]||'ປົກກະຕິ'} (ສະຖານີ MRC)`]);
 const jsonld={'@context':'https://schema.org','@graph':[{'@type':'WebPage',name:title,inLanguage:'lo-LA',url:SEO_SITE+'/weather/'+p.slug,dateModified:new Date(now).toISOString(),description},{'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'ລາວປອດໄພ',item:SEO_SITE+'/'},{'@type':'ListItem',position:2,name:'ສະພາບອາກາດທຸກແຂວງ',item:SEO_SITE+'/weather'},{'@type':'ListItem',position:3,name:p.name_lo,item:SEO_SITE+'/weather/'+p.slug}]},{'@type':'FAQPage',mainEntity:faq.map(([q,a])=>({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}}))}]};
 const days=d.time.map((iso,i)=>{const dp=dayParts(iso),[di]=sky(d.weather_code[i]);return `<div class="day${i===0?' today':i>3?' trend':''}"><b style="font-size:12px">${i===0?'ມື້ນີ້':dp.wd}</b><div class="m" style="font-size:11px">${dp.day} ${dp.mon}</div><i>${di}</i><b class="n">${n0(d.temperature_2m_max[i])}°</b><div class="m n">${n0(d.temperature_2m_min[i])}°</div><div class="p n">${n0(d.precipitation_probability_max[i])}%</div></div>`}).join('');
 const river=station?`<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><b>ລະດັບນ້ຳ · ${esc(station.s.name)}</b><div class="m" style="font-size:12px">${esc(station.s.river||'')} · ສະຖານີ MRC · ວັດ ${esc(new Date(Date.parse(station.s.time)+7*3600000).toISOString().slice(11,16))} · ຫ່າງ ~${Math.round(station.d)} km</div></div><div style="text-align:right"><b class="n" style="font-size:20px">${station.s.level.toFixed(2)} m</b><div><span class="pill${station.s.status==='rising'||station.s.status==='alarm'?' warn':station.s.status==='flood'?' bad':''}">${RIVER_LAO[station.s.status]||'ປົກກະຕິ'}</span></div></div></div>`:'';
 return head({title,description,path:'/weather/'+p.slug,image:'/og/'+p.slug+'.jpg',jsonld})+
 `<div class="hero" style="background-image:url('${esri(p)}')"><svg viewBox="0 0 780 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path d="${p.districtLines}" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1.2" stroke-dasharray="4 3"/><path d="${p.outline}" fill="rgba(36,164,255,.12)" stroke="#ffe066" stroke-width="3"/></svg><div class="shade"></div>
<a class="brand" href="/"><span class="logo" style="background:none">${logoSVG(24,6)}</span>ລາວປອດໄພ</a>
<div class="title"><div class="m" style="font-size:12px">ສະພາບອາກາດ ແຂວງ</div><h1>${esc(p.name_lo)}</h1><div class="now"><b class="n">${n0(s.now)}°</b><span style="font-size:13px;padding-bottom:6px">${ic} ${word} · ສູງ ${n0(s.today.max)}° · ຕ່ຳ ${n0(s.today.min)}°<br><span class="p" style="font-weight:700">ໂອກາດຝົນ ${n0(s.today.p)}%</span></span></div></div></div>
<p class="crumb m"><a href="/">ໜ້າຫຼັກ</a> › <a href="/weather">ແຂວງ</a> › ${esc(p.name_lo)} · ອັບເດດ ${esc(updated)} ວັນ${t.wd} ${t.day} ${t.mon}</p>
<div class="card answer"><div class="m" style="font-size:12px">ມື້ນີ້ຝົນຕົກບໍ່?</div><strong>${ans}</strong><div class="m" style="font-size:13px;margin-top:4px">ມື້ອື່ນ: ${ansTomorrow} (${n0(s.tomorrow.p)}%) · ຝົນຫຼາຍສຸດ ວັນ${w.wd} ${w.day} (${n0(d.precipitation_probability_max[s.wettest])}%)</div></div>
<div class="card"><h2>ພະຍາກອນ 7 ມື້</h2><div class="days">${days}</div><p class="m" style="font-size:11px;margin-top:6px">ມື້ທີ 1–3 ພະຍາກອນ · ມື້ທີ 4–7 ເປັນແນວໂນ້ມ ຄວາມແມ່ນຫຼຸດລົງ</p></div>
${river}<a class="btn" href="/?place=${encodeURIComponent(p.id)}">ເປີດແຜນທີ່ສົດ · ເມກ ເຣດາ ຝົນ ›</a>
${shareCard('/weather/'+p.slug,`ສະພາບອາກາດ ແຂວງ${p.name_lo} ມື້ນີ້: ${ans}`)}
<div class="card"><h2>ຄຳຖາມ</h2>${faq.map(([q,a])=>`<div class="q">${esc(q)}</div><div class="m">${esc(a)}</div>`).join('')}</div>
<div class="card"><h2>ເມືອງໃນແຂວງ${esc(p.name_lo)}</h2><div class="chips">${p.districts.map(x=>`<a href="/?place=${encodeURIComponent(x.id)}">${esc(x.name_lo.replace(/^ມ\.\s*/,''))}</a>`).join('')}</div>
<h2 style="margin-top:14px">ແຂວງອື່ນ</h2><div class="chips">${PROVINCES.filter(o=>o.id!==p.id).map(o=>`<a href="/weather/${o.slug}">${esc(o.name_lo)}</a>`).join('')}</div></div>`+FOOT;
}
const esri=p=>esriHero(p.frame);
export function indexHTML(all,{now=Date.now()}={}){
 const title='ສະພາບອາກາດລາວ ມື້ນີ້ ທຸກແຂວງ · ພະຍາກອນ 7 ມື້ | ລາວປອດໄພ',description='ສະພາບອາກາດ ແລະ ພະຍາກອນຝົນ ມື້ນີ້ ຂອງ 18 ແຂວງໃນລາວ · ມື້ນີ້ຝົນຕົກບໍ່ · ພະຍາກອນ 7 ມື້ · ລະດັບນ້ຳຂອງ.';
 const rows=PROVINCES.map(p=>{const f=all[p.id];if(!f)return '';const s=summaryOf(f),[ic]=sky(s.today.code);return `<a href="/weather/${p.slug}"><span><b>${esc(p.name_lo)}</b><br><span class="m" style="font-size:12.5px">${rainAnswer(s.today.p,s.today.mm)}</span></span><span style="text-align:right;white-space:nowrap">${ic} <b class="n">${n0(s.today.min)}–${n0(s.today.max)}°</b><br><span class="p n" style="font-size:12.5px">ຝົນ ${n0(s.today.p)}%</span></span></a>`}).join('');
 const jsonld={'@context':'https://schema.org','@type':'CollectionPage',name:title,inLanguage:'lo-LA',url:SEO_SITE+'/weather',dateModified:new Date(now).toISOString(),description};
 return head({title,description,path:'/weather',image:'/og/home.jpg',jsonld})+
 `<div class="hero" style="background-image:url('${esriHero(LAOS.frame,780,600)}')"><svg viewBox="0 0 780 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path d="${LAOS.lines}" fill="rgba(36,164,255,.10)" stroke="#ffe066" stroke-width="1.6"/></svg><div class="shade"></div><a class="brand" href="/"><span class="logo" style="background:none">${logoSVG(24,6)}</span>ລາວປອດໄພ</a><div class="title"><h1>ສະພາບອາກາດລາວ ມື້ນີ້</h1><div class="m">ທຸກແຂວງ · ກົດເພື່ອເບິ່ງພະຍາກອນ 7 ມື້</div></div></div>
<div class="card list">${rows}</div><a class="btn" href="/">ເປີດແຜນທີ່ສົດ · ເມກ ເຣດາ ຝົນ ›</a>`+shareCard('/weather','ສະພາບອາກາດລາວ ມື້ນີ້ ທຸກແຂວງ')+FOOT;
}
const html=(body,status=200)=>new Response(body,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':status===200?'public,max-age=900':'no-store','X-Content-Type-Options':'nosniff'}});
export async function seoRoute(request,ctx={},{riverLevels=async()=>null,fetchImpl=fetch,now=Date.now()}={}){
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const path=new URL(request.url).pathname.replace(/\/+$/,'')||'/';
 try{
  const all=await forecastAll(ctx,{fetchImpl,now});
  if(path==='/weather')return html(indexHTML(all,{now}));
  const p=PROVINCES.find(x=>'/weather/'+x.slug===path);if(!p)return html(notFound(),404);
  // The river card is optional: never let a slow MRC refresh hold the page (link previews time out).
  let timer;const levels=await Promise.race([riverLevels().catch(()=>null),new Promise(ok=>timer=setTimeout(()=>ok(null),RIVER_WAIT_MS))]);clearTimeout(timer);
  return html(provinceHTML(p,all[p.id],nearestStation(p,levels?.stations),{now}));
 }catch{return html(head({title:'ລາວປອດໄພ',description:'ສະພາບອາກາດລາວ',path,image:'/og/home.jpg',jsonld:{}})+'<div class="card"><h1 style="font-size:20px">ໂຫຼດພະຍາກອນບໍ່ສຳເລັດ</h1><p class="m">ລອງໃໝ່ພາຍຫຼັງ · <a href="/">ເປີດແຜນທີ່</a></p></div>'+FOOT,503)}
}
function notFound(){return head({title:'ບໍ່ພົບໜ້ານີ້ | ລາວປອດໄພ',description:'ບໍ່ພົບໜ້ານີ້',path:'/weather',image:'/og/home.jpg',jsonld:{}})+`<div class="card"><h1 style="font-size:20px">ບໍ່ພົບແຂວງນີ້</h1><div class="chips">${PROVINCES.map(o=>`<a href="/weather/${o.slug}">${esc(o.name_lo)}</a>`).join('')}</div></div>`+FOOT}
export function _resetSeoCache(){cached=null}
