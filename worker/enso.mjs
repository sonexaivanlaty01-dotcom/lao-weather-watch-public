// El Niño / La Niña (29 Oct 2026, owner's design A: needle gauge).
//   GET /api/enso  → NOAA CPC data as JSON     GET /elnino → Lao page (server-rendered)
// Sources (NOAA CPC, public domain, updated monthly):
//   ONI  www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt  (3-month mean Niño-3.4 anomaly, the official index)
//   ENSO Diagnostic Discussion …/enso_advisory/ensodisc.shtml (alert status, outlook, next issue date)
// The "effects on Laos" text is general knowledge of past El Niño / La Niña years, not a forecast:
// the page says so. Cached 6 hours (NOAA issues once a month, about the second Thursday).
import {readOptionalCache,writeOptionalCache} from './optional-cache.mjs';
import {logoSVG,FAVICON_LINKS} from './brand.mjs';
export const ENSO_TTL=6*3600000;
const CPC='https://www.cpc.ncep.noaa.gov/';
export const ONI_URL=CPC+'data/indices/oni.ascii.txt',DISC_URL=CPC+'products/analysis_monitoring/enso_advisory/ensodisc.shtml';
// Weekly Niño-3.4 (OISST, updated every Monday/Wednesday). The ONI is a 3-month mean and lags 1–2
// months, so the needle shows this weekly value and the page names the official ONI next to it.
export const WKS_URL=CPC+'data/indices/wksst9120.for';
const SITE='https://lao-weather-watch.sonexaivanlaty01.workers.dev';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EN_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const LO_MONTHS=['ມ.ກ.','ກ.ພ.','ມ.ນ.','ເມ.ສ.','ພ.ພ.','ມິ.ຖ.','ກ.ລ.','ສ.ຫ.','ກ.ຍ.','ຕ.ລ.','ພ.ຈ.','ທ.ວ.'];
// ONI season "JAS" = July–September; the middle month names it in Lao ("ກ.ລ.–ກ.ຍ.").
const SEASONS=['DJF','JFM','FMA','MAM','AMJ','MJJ','JJA','JAS','ASO','SON','OND','NDJ'];
export const seasonLao=(s,y)=>{const i=SEASONS.indexOf(s);return i<0?s+' '+y:`${LO_MONTHS[(i+11)%12]}–${LO_MONTHS[(i+1)%12]} ${y}`};

// "  JAS 2026  29.12   2.16" lines → [{season,year,anom}]
export function parseOni(text){
 return String(text||'').split('\n').map(l=>/^\s*([A-Z]{3})\s+(\d{4})\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s*$/.exec(l)).filter(Boolean)
  .map(m=>({season:m[1],year:+m[2],anom:+m[4]})).filter(r=>SEASONS.includes(r.season));
}
// " 21OCT2026     26.3 5.2     29.4 4.3     30.1 3.4     29.8 1.1" → {week:'2026-10-21',anom:3.4}
// (columns Niño1+2, 3, 3.4, 4 as SST + anomaly; numbers can touch: "20.6-0.1").
const MON3=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
export function parseWeekly(text){
 return String(text||'').split('\n').map(l=>{const m=/^\s*(\d{2})([A-Z]{3})(\d{4})\s(.*)$/.exec(l),i=m?MON3.indexOf(m[2]):-1;if(i<0)return null;
  const n=m[4].match(/-?\d+\.\d/g);return n?.length===8?{week:`${m[3]}-${String(i+1).padStart(2,'0')}-${m[1]}`,anom:+n[5]}:null}).filter(Boolean);
}
const decode=s=>s.replace(/&ntilde;/gi,'ñ').replace(/&deg;/g,'°').replace(/&#37;/g,'%').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
const isoDate=(d,m,y)=>{const i=EN_MONTHS.indexOf(m);return i<0?null:`${y}-${String(i+1).padStart(2,'0')}-${String(+d).padStart(2,'0')}`};
// Alert status, issue date, outlook ("likely through January-March 2027 (… 83% chance)"), next issue date.
export function parseDiscussion(html){
 const t=decode(String(html||'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ');
 const st=/ENSO Alert System Status:\s*(.+?)\s*Synopsis:/i.exec(t);if(!st)return null;
 const iss=/DISCUSSION issued by [A-Z/ ]+?(\d{1,2}) ([A-Z][a-z]+) (\d{4})/.exec(t),nx=/next ENSO Diagnostics? Discussion is scheduled for (\d{1,2}) ([A-Z][a-z]+) (\d{4})/i.exec(t);
 const syn=/Synopsis:\s*(.+?\.)\s/.exec(t)?.[1]||'';
 const thr=/through ([A-Z][a-z]+)-([A-Z][a-z]+) (\d{4})/.exec(syn),ch=/(\d{1,3})\s*% chance/.exec(syn),n34=/([+-]?\d+\.\d)\s*°C in Niño-3\.4/.exec(t);
 return {status:st[1].trim(),key:statusKey(st[1]),issued:iss?isoDate(iss[1],iss[2],iss[3]):null,next:nx?isoDate(nx[1],nx[2],nx[3]):null,
  synopsis:syn,outlook:thr?{from:EN_MONTHS.indexOf(thr[1]),to:EN_MONTHS.indexOf(thr[2]),year:+thr[3],chance:ch?+ch[1]:null,strong:/strong/i.test(syn)}:null,nino34:n34?+n34[1]:null};
}
// CPC's ENSO alert system: Not Active, El Niño/La Niña Watch, Advisory, Final Advisory.
export function statusKey(s){const v=String(s).toLowerCase(),side=/la ni/.test(v)?'lanina':/el ni/.test(v)?'elnino':null;
 if(!side)return 'none';return side+(/final/.test(v)?'-final':/advisory/.test(v)?'-advisory':/watch/.test(v)?'-watch':'')}
export const STATUS_LO={'elnino-advisory':'ກຳລັງເກີດເອລນີໂຍ','elnino-watch':'ເຝົ້າລະວັງ: ອາດເກີດເອລນີໂຍ','elnino-final':'ເອລນີໂຍ ສິ້ນສຸດແລ້ວ',
 'lanina-advisory':'ກຳລັງເກີດລານີຍາ','lanina-watch':'ເຝົ້າລະວັງ: ອາດເກີດລານີຍາ','lanina-final':'ລານີຍາ ສິ້ນສຸດແລ້ວ',none:'ປົກກະຕິ (ບໍ່ມີເອລນີໂຍ ຫຼື ລານີຍາ)'};
// Strength (NOAA thresholds ±0.5 / 1.0 / 1.5 / 2.0, plus ±3.0 for a record-class event such as 2026).
export function strength(v){const a=Math.abs(v),side=v>=0.5?'ເອລນີໂຍ':v<=-0.5?'ລານີຍາ':null;
 if(!side)return {side:null,word:'ປົກກະຕິ',level:0};const [word,level]=a>=3?['ຮຸນແຮງຫຼາຍ',5]:a>=2?['ແຮງຫຼາຍ',4]:a>=1.5?['ແຮງ',3]:a>=1?['ປານກາງ',2]:['ອ່ອນ',1];return {side,word,level}}
// Signed level (+5 … −5). A change counts only when it still holds 0.1 °C back toward the old level,
// so a value wobbling on a threshold (2.98 ↔ 3.02) does not post every week.
export const signedLevel=v=>{const s=strength(v);return s.side==='ລານີຍາ'?-s.level:s.level};
export function levelChange(v,prev){const now=signedLevel(v);if(prev==null||now===prev)return null;return signedLevel(v-0.099*Math.sign(now-prev))===now?now:null}
// Effects usually seen in Laos (general, not a forecast).
export const EFFECTS={
 elnino:{when:'ໃນປີເອລນີໂຍ ລາວມັກ:',items:['ລະດູແລ້ງ ຮ້ອນກວ່າປົກກະຕິ ແລະ ຝົນໜ້ອຍ','ນ້ຳຂອງ ແລະ ອ່າງເກັບນ້ຳ ຕ່ຳ · ນ້ຳອາດບໍ່ພໍສຳລັບນາແຊງ','ໄຟປ່າ ແລະ ຄວັນ/ຝຸ່ນ PM2.5 ຫຼາຍ ໂດຍສະເພາະພາກເໜືອ (ກ.ພ.–ເມ.ສ.)','ລະດູຝົນປີຕໍ່ໄປ ອາດມາຊ້າ'],
  short:['ລະດູແລ້ງ ຮ້ອນ ຝົນໜ້ອຍ','ນ້ຳຂອງຕ່ຳ','ໄຟປ່າ ຝຸ່ນ PM2.5'],
  advice:['ເກັບນ້ຳໄວ້ກ່ອນລະດູແລ້ງ · ໃຊ້ນ້ຳຢ່າງປະຢັດ','ວາງແຜນປູກພືດທີ່ໃຊ້ນ້ຳໜ້ອຍ · ປຶກສາເຈົ້າໜ້າທີ່ກະສິກຳ','ບໍ່ຈູດເຜົາປ່າ ຫຼື ຂີ້ເຫຍື້ອ · ລະວັງໄຟລາມ','ດື່ມນ້ຳຫຼາຍ · ຫຼີກລ່ຽງແດດແຮງ 11:00–15:00']},
 lanina:{when:'ໃນປີລານີຍາ ລາວມັກ:',items:['ລະດູຝົນ ຝົນຫຼາຍກວ່າປົກກະຕິ','ນ້ຳຂອງ ແລະ ແມ່ນ້ຳສາຂາ ສູງ · ສ່ຽງນ້ຳຖ້ວມ','ດິນເຈື່ອນ ໃນເຂດພູ','ລະດູໜາວ ອາດໜາວກວ່າປົກກະຕິ'],
  short:['ຝົນຫຼາຍກວ່າປົກກະຕິ','ນ້ຳຂອງສູງ ສ່ຽງນ້ຳຖ້ວມ','ດິນເຈື່ອນ ເຂດພູ'],
  advice:['ຕິດຕາມລະດັບນ້ຳ ແລະ ປະກາດເຕືອນ','ກຽມເສັ້ນທາງອົບພະຍົບ ແລະ ຂອງຈຳເປັນ','ລະວັງດິນເຈື່ອນ ຫຼັງຝົນຕົກໜັກຫຼາຍມື້','ຍົກເຄື່ອງໃຊ້ໄວ້ບ່ອນສູງ']}};
const nowValue=d=>d.now?.value??d.latest.anom;
const sideOf=d=>d.disc?.key?.startsWith('lanina')?'lanina':d.disc?.key?.startsWith('elnino')?'elnino':nowValue(d)>=0.5?'elnino':nowValue(d)<=-0.5?'lanina':null;

let cached=null,pending=null;
export function _resetEnso(){cached=null;pending=null}
const get=async(url,fetchImpl)=>{const r=await fetchImpl(url,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'Mozilla/5.0 (lao-weather-watch community site)'}});if(!r.ok)throw new Error('cpc '+r.status);return r.text()};
export async function downloadEnso(fetchImpl=fetch,now=Date.now()){
 const [oni,disc,wk,sst]=await Promise.allSettled([get(ONI_URL,fetchImpl).then(parseOni),get(DISC_URL,fetchImpl).then(h=>parseDiscussion(h)||Promise.reject(new Error('discussion_unreadable '+String(h).length+' chars'))),get(WKS_URL,fetchImpl).then(parseWeekly),newestSstDate(fetchImpl,now)]);
 const rows=oni.status==='fulfilled'?oni.value:[];if(!rows.length)throw new Error('oni_unavailable');
 // A weekly value older than 3 weeks is not "now" any more: fall back to the ONI.
 const weekly=wk.status==='fulfilled'?wk.value.slice(-12):[],w=weekly.at(-1),fresh=w&&now-Date.parse(w.week+'T00:00:00Z')<=21*86400000;
 return {kind:'enso',fetchedAt:new Date(now).toISOString(),source:'NOAA Climate Prediction Center (www.cpc.ncep.noaa.gov)',latest:rows.at(-1),history:rows.slice(-24),weekly,
  now:fresh?{value:w.anom,week:w.week}:{value:rows.at(-1).anom,week:null},disc:disc.status==='fulfilled'?disc.value:null,sstDate:sst.value||null,
  ...(disc.status==='rejected'?{discError:String(disc.reason?.message||disc.reason).slice(0,120)}:{})};
}
// NOAA's discussion page failed from Cloudflare on 29 Oct 2026 while the data files loaded. It is issued
// once a month, so the last one read (KV enso:disc, kept while under 45 days old) is used meanwhile,
// marked discSaved; the reason is logged for the owner's debugging.
export const DISC_KEEP_MS=45*86400000,ENSO_RETRY_MS=30*60000;  // no discussion at all → try again in 30 min
async function withSavedDisc(d,store,now){
 if(!store)return d;
 if(d.disc){await store.put('enso:disc',JSON.stringify(d.disc)).catch(()=>{});return d}
 console.log('enso: NOAA discussion not read:',d.discError||'unknown');
 const saved=await store.get('enso:disc').then(s=>JSON.parse(s||'null')).catch(()=>null);
 return saved?.issued&&now-Date.parse(saved.issued+'T00:00:00Z')<DISC_KEEP_MS?{...d,disc:saved,discSaved:true}:d;
}
export async function ensoData(ctx={},{fetchImpl=fetch,now=Date.now(),store=null}={}){
 const key=new Request('https://enso.internal/v4'),ttl=d=>d.disc?ENSO_TTL:ENSO_RETRY_MS;
 if(!cached){const hit=await readOptionalCache(key);if(hit){try{const d=await hit.json();if(now-Date.parse(d.fetchedAt)<ttl(d))cached=d}catch{/* ignore */}}}
 if(!cached||now-Date.parse(cached.fetchedAt)>=ttl(cached)){
  pending??=downloadEnso(fetchImpl,now).then(d=>withSavedDisc(d,store,now)).then(d=>{cached=d;writeOptionalCache(key,Response.json(d,{headers:{'Cache-Control':'public,max-age=21600'}}),ctx);
   if(store&&d.sstDate){const warm=sstImage(d.sstDate,{fetchImpl,store,keep:true}).catch(()=>{});ctx.waitUntil?.(warm)}return d}).finally(()=>pending=null);
  try{await pending}catch(e){if(!cached)throw e}
 }
 return cached;
}

// Needle gauge: −4 (left, La Niña) … +4 (right, El Niño); the weekly value reached +3.4 in Oct 2026.
// Shared by the page and the Facebook card.
export function gaugeSVG(v,{w=320}={}){
 const cx=160,cy=160,r=128,ang=x=>Math.PI*(1-(Math.max(-4,Math.min(4,x))+4)/8),pt=(x,rr=r)=>[cx+rr*Math.cos(ang(x)),cy-rr*Math.sin(ang(x))].map(n=>Math.round(n*10)/10);
 const arc=(a,b,c)=>{const [x1,y1]=pt(a),[x2,y2]=pt(b);return `<path d="M${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}" fill="none" stroke="${c}" stroke-width="22"/>`};
 const bands=[[-4,-3,'#172554'],[-3,-2,'#1e40af'],[-2,-1,'#2563eb'],[-1,-0.5,'#60a5fa'],[-0.5,0.5,'#64748b'],[0.5,1,'#fdba74'],[1,2,'#f97316'],[2,3,'#c2410c'],[3,4,'#7f1d1d']].map(([a,b,c])=>arc(a,b,c)).join('');
 const ticks=[-3,-2,-1,0,1,2,3].map(x=>{const [tx,ty]=pt(x,r+25);return `<text x="${tx}" y="${ty}" fill="#94a3b8" font-size="13" text-anchor="middle" dominant-baseline="central">${x>0?'+':''}${x}</text>`}).join('');
 const [nx,ny]=pt(v,r-8);
 return `<svg viewBox="0 0 320 190" width="${w}" role="img" aria-label="ONI ${v}">${bands}${ticks}<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="9" fill="#fff"/>
<text x="20" y="184" fill="#93c5fd" font-size="15" font-weight="700">ລານີຍາ</text><text x="300" y="184" fill="#fdba74" font-size="15" font-weight="700" text-anchor="end">ເອລນີໂຍ</text><text x="160" y="184" fill="#cbd5e1" font-size="13" text-anchor="middle">ປົກກະຕິ</text></svg>`;
}
const sign=v=>(v>0?'+':'')+v.toFixed(1);
const outlookLao=o=>o&&o.from>=0&&o.to>=0?`ຄາດວ່າຈະ${o.strong?'ຍັງແຮງ':'ສືບຕໍ່'}ຮອດ ${LO_MONTHS[o.from]}–${LO_MONTHS[o.to]} ${o.year}${o.chance?` (ໂອກາດຫຼາຍກວ່າ ${o.chance}%)`:''}`:null;
const dateLao=iso=>{if(!iso)return '';const [y,m,d]=iso.split('-');return `${+d} ${LO_MONTHS[+m-1]} ${y}`};
export function ensoSummary(d){
 const v=nowValue(d),s=strength(v),side=sideOf(d),status=STATUS_LO[d.disc?.key]||null;
 return {v,s,side,status,head:s.side?`${s.side} ${s.word}`:'ປົກກະຕິ',week:d.now?.week?dateLao(d.now.week):null,oni:d.latest.anom,season:seasonLao(d.latest.season,d.latest.year),
  outlook:outlookLao(d.disc?.outlook),issued:dateLao(d.disc?.issued),next:dateLao(d.disc?.next)};
}
const CSS=`*{box-sizing:border-box;margin:0;padding:0}html{background:#0b1424}body{max-width:560px;margin:0 auto;background:#0b1424;color:#e9eef6;font:15px/1.6 'Noto Sans Lao',Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}.m{color:#9fb0c6}.n{font-family:Inter,'Noto Sans Lao',sans-serif;font-feature-settings:'tnum'}
.top{display:flex;align-items:center;gap:8px;padding:14px 16px 0;text-decoration:none;font-weight:700;font-size:13px}
h1{font-size:26px;line-height:1.2;font-weight:800;padding:10px 16px 0}
.card{margin:12px;border-radius:18px;padding:14px 16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09)}
.gauge{text-align:center}.gauge svg{max-width:100%;height:auto}.val{font-size:44px;font-weight:800;line-height:1}.pill{display:inline-block;border-radius:999px;padding:3px 12px;font-size:14px;font-weight:700;margin-top:6px}
.hot{background:rgba(234,88,12,.22);color:#fdba74}.cold{background:rgba(37,99,235,.25);color:#93c5fd}.calm{background:rgba(148,163,184,.18);color:#cbd5e1}
h2{font-size:16px;margin-bottom:6px}ul{padding-left:20px}li{margin:4px 0}
.bars{display:flex;align-items:center;gap:3px;height:90px;margin-top:6px}.bars div{flex:1;position:relative;height:100%}.bars span{position:absolute;left:0;right:0;border-radius:2px}
.hero{background:#05070d}.hero .stage{position:relative;height:320px;margin:-14px -16px 0;overflow:hidden;border-radius:18px 18px 0 0}
#globe{position:absolute;top:22px;left:max(160px,calc(160px + (100% - 450px)/2));width:280px;height:280px;touch-action:pan-y;cursor:grab}.gl{position:absolute;left:160px;right:0;top:0;bottom:0;display:grid;place-items:center;color:#9fb0c6;font-size:13px}
#fbk{display:none;position:absolute;left:max(160px,calc(160px + (100% - 410px)/2));top:70px;width:200px}#fbk svg{width:100%;height:auto}
.col{position:absolute;left:16px;top:16px;width:136px}.k{font-size:11px;color:#fdba74;font-weight:700}.big{font-size:22px;font-weight:800;line-height:1.25;margin-top:4px}.ring{display:block;margin-top:10px}.rl{font-size:11px;text-align:center;width:118px}.hero .leg{position:absolute;left:16px;bottom:12px;margin:0}
.leg{display:flex;justify-content:center;align-items:center;gap:8px;font-size:12px;color:#cbd5e1;margin-top:8px;white-space:nowrap}.leg i{display:block;flex:0 1 140px;min-width:50px;height:10px;border-radius:5px;background:linear-gradient(90deg,#3b0a9e,#1e90ff,#7fffd4,#dcdcdc,#ffe066,#ff8c00,#e3001b,#c2006e,#7a0000)}
.btn{display:block;margin:12px;padding:14px;border-radius:14px;background:#2563eb;color:#fff;text-align:center;font-weight:700;text-decoration:none}.foot{font-size:11.5px;padding:6px 16px 28px}`;
function barsHTML(hist){
 const max=3,col=v=>v>=0.5?(v>=1.5?'#c2410c':'#f97316'):v<=-0.5?(v<=-1.5?'#1e40af':'#3b82f6'):'#64748b';
 return `<div class="bars">${hist.map(r=>{const h=Math.min(Math.abs(r.anom),max)/max*50;return `<div title="${esc(r.season+' '+r.year)}: ${sign(r.anom)}"><span style="${r.anom>=0?`bottom:50%`:`top:50%`};height:${Math.max(h,1)}%;background:${col(r.anom)}"></span></div>`}).join('')}</div>
<div class="m n" style="display:flex;justify-content:space-between;font-size:11px"><span>${esc(seasonLao(hist[0].season,hist[0].year))}</span><span>${esc(seasonLao(hist.at(-1).season,hist.at(-1).year))}</span></div>`;
}
export function ensoPageHTML(d){
 const x=ensoSummary(d),eff=EFFECTS[x.side],cls=x.v>=0.5?'hot':x.v<=-0.5?'cold':'calm';
 const title=`ເອລນີໂຍ ຕອນນີ້: ${x.head} · ຜົນກະທົບຕໍ່ລາວ | ລາວປອດໄພ`,description=`${x.status||x.head} · ${x.week?`ຄ່າລ່າສຸດ ${sign(x.v)} (ອາທິດ ${x.week})`:`ONI ${sign(x.v)} (${x.season})`}${x.outlook?' · '+x.outlook:''}. ຂໍ້ມູນ NOAA.`;
 return `<!doctype html><html lang="lo" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b1424">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${SITE}/elnino">${FAVICON_LINKS}<meta property="og:type" content="website"><meta property="og:locale" content="lo_LA"><meta property="og:site_name" content="ລາວປອດໄພ"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${SITE}/elnino">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Lao:wght@400;600;700;800&display=swap" rel="stylesheet"><style>${CSS}</style></head><body>
<a class="top" href="/">${logoSVG(24,6)}ລາວປອດໄພ</a><h1>ເອລນີໂຍ · ລານີຍາ ຕອນນີ້</h1>
${d.sstDate?heroHTML(d,x):`<div class="card gauge">${gaugeSVG(x.v)}<div class="val n">${sign(x.v)}</div><div><span class="pill ${cls}">${esc(x.head)}</span></div>`}
<p class="m" style="font-size:13px;margin-top:8px">${x.week?`ຄ່າລ່າສຸດ ອາທິດ ${esc(x.week)} · ອຸນຫະພູມນ້ຳທະເລປາຊີຟິກ (ເຂດ ນີໂນ 3.4) ສູງ/ຕ່ຳກວ່າປົກກະຕິ °C<br>ຄ່າທາງການ NOAA (ONI ສະເລ່ຍ 3 ເດືອນ): <b class="n">${sign(x.oni)}</b> · ${esc(x.season)}`:`ດັດຊະນີ ONI (ອຸນຫະພູມນ້ຳທະເລປາຊີຟິກ ສູງ/ຕ່ຳກວ່າປົກກະຕິ °C) · ${esc(x.season)}`}</p></div>
${x.status||x.outlook?`<div class="card"><h2>${esc(x.status||x.head)}</h2>${x.outlook?`<p>${esc(x.outlook)}</p>`:''}<p class="m" style="font-size:13px;margin-top:4px">NOAA ປະກາດ ${esc(x.issued)}${x.next?` · ຄັ້ງຕໍ່ໄປ ${esc(x.next)}`:''}</p></div>`:''}
${eff?`<div class="card"><h2>ຜົນກະທົບຕໍ່ລາວ</h2><p class="m" style="font-size:13px">${esc(eff.when)}</p><ul>${eff.items.map(i=>`<li>${esc(i)}</li>`).join('')}</ul></div>
<div class="card"><h2>ຄວນກຽມຕົວແນວໃດ</h2><ul>${eff.advice.map(i=>`<li>${esc(i)}</li>`).join('')}</ul></div>`:`<div class="card"><h2>ຜົນກະທົບຕໍ່ລາວ</h2><p>ຕອນນີ້ບໍ່ມີເອລນີໂຍ ຫຼື ລານີຍາ · ອາກາດຕາມລະດູການປົກກະຕິ</p></div>`}
<div class="card"><h2>ຍ້ອນຫຼັງ 2 ປີ</h2>${barsHTML(d.history)}<p class="m" style="font-size:12px;margin-top:6px">ສົ້ມ = ເອລນີໂຍ (ນ້ຳທະເລອຸ່ນ) · ຟ້າ = ລານີຍາ (ນ້ຳທະເລເຢັນ) · ເກີນ ±0.5 ນັບວ່າເກີດ</p></div>
<div class="card"><h2>ເອລນີໂຍ ແມ່ນຫຍັງ?</h2><p>ນ້ຳທະເລກາງມະຫາສະໝຸດປາຊີຟິກ ອຸ່ນຂຶ້ນກວ່າປົກກະຕິ ເຮັດໃຫ້ລົມ ແລະ ຝົນທົ່ວໂລກປ່ຽນ. ລານີຍາ ແມ່ນກົງກັນຂ້າມ (ນ້ຳທະເລເຢັນລົງ).</p></div>
<a class="btn" href="/">ເປີດແຜນທີ່ສົດ · ເມກ ເຣດາ ຝົນ ›</a>
<p class="foot m">ຂໍ້ມູນ: NOAA Climate Prediction Center (ນີໂນ 3.4 ລາຍອາທິດ, ONI, ENSO Diagnostic Discussion) · ຜົນກະທົບຕໍ່ລາວ ແມ່ນສິ່ງທີ່ມັກເກີດໃນອະດີດ ບໍ່ແມ່ນພະຍາກອນ · ຕົ້ນແບບເພື່ອຊຸມຊົນ · ບໍ່ແມ່ນປະກາດທາງການ · ຕິດຕາມປະກາດຂອງ ກົມອຸຕຸນິຍົມ ແລະ ອຸທົກກະສາດ</p></body></html>`;
}
// Facebook card 1080×1080 (rendered by Browser Run like the daily card).
export function ensoCardHTML(d,fonts='',headline=''){
 const x=ensoSummary(d),eff=EFFECTS[x.side],[h1,h2]=String(headline).split(' — ');
 return `<!doctype html><html lang="lo"><head><meta charset="utf-8"><style>${fonts}*{margin:0;box-sizing:border-box}body{width:1080px;height:1080px;overflow:hidden;background:#0b1220;color:#fff;font-family:'Noto Sans Lao',Inter,sans-serif;position:relative;padding:50px 60px}
h1{font-size:58px;font-weight:900}.sub{font-size:28px;color:#cbd5e1}.g{text-align:center;margin-top:10px}.v{font-size:84px;font-weight:900;font-family:Inter,'Noto Sans Lao';line-height:1;color:${x.v>=0.5?'#fdba74':x.v<=-0.5?'#93c5fd':'#e2e8f0'}}
.p{font-size:40px;font-weight:800;margin-top:6px}.o{font-size:28px;color:#e2e8f0;margin-top:8px}ul{font-size:30px;margin:16px 0 0 40px;line-height:1.5}.f{position:absolute;left:60px;right:60px;bottom:40px;display:flex;justify-content:space-between;font-size:22px;color:#94a3b8}</style></head><body>
<h1${h1?' style="color:#fdba74"':''}>${esc(h1||'ເອລນີໂຍ · ລານີຍາ')}</h1><div class="sub">${esc(h2||x.status||'ສະຖານະ')}${x.issued&&!h2?` · NOAA ${esc(x.issued)}`:''}</div>
<div class="g">${gaugeSVG(x.v,{w:540})}<div class="v">${sign(x.v)}</div><div class="p">${esc(x.head)}</div><div class="o">${x.week?`ຄ່າລ່າສຸດ ອາທິດ ${esc(x.week)} · ທາງການ (3 ເດືອນ) ${sign(x.oni)}`:`ONI · ${esc(x.season)}`}</div>${x.outlook?`<div class="o">${esc(x.outlook)}</div>`:''}</div>
${eff?`<ul>${eff.items.slice(0,h1?2:3).map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`:''}
<div class="f"><span>ລາວປອດໄພ · /elnino</span><span>NOAA CPC · ບໍ່ແມ່ນປະກາດທາງການ</span></div></body></html>`;
}
// Facebook card, owner's choice C (29 Oct 2026): NASA satellite globe of sea-surface temperature anomaly
// (GHRSST MUR over Blue Marble, from NASA GIBS, public domain) on the right, Lao text on the left.
// The browser that renders the card loads the picture itself (GIBS allows CORS) and draws the
// orthographic globe on a canvas; if the picture fails, the needle gauge is drawn there instead.
export const GIBS_WMS='https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi',SST_LAYER='GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies';
export const sstImageURL=(date,w=2048)=>`${GIBS_WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=${w}&HEIGHT=${w/2}&FORMAT=image/jpeg&TIME=${date}&LAYERS=BlueMarble_NextGeneration,${SST_LAYER},Coastlines_15m`;
// Newest day NASA has (about 2 days behind), from GIBS DescribeDomains: "2026-10-01/2026-10-27/P1D".
export async function newestSstDate(fetchImpl=fetch,now=Date.now()){
 const day=ms=>new Date(ms).toISOString().slice(0,10);
 try{const r=await fetchImpl(`https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/${SST_LAYER}/default/1km/all/${day(now-30*86400000)}--${day(now)}.xml`,{signal:AbortSignal.timeout(15000)});
  if(!r.ok)return null;const ends=[...(await r.text()).matchAll(/(\d{4}-\d{2}-\d{2})(?=\/P1D|<)/g)].map(m=>m[1]).sort();return ends.at(-1)||null}catch{return null}
}
// NASA sends the picture with no-store, so every visit waited 2–3 s for it (owner, 29 Oct 2026: "โหลดภาพช้า").
// The page asks us instead: Cloudflare's cache, then KV (newest day only, written when the data
// refreshes, 4 days), then NASA. A day's picture never changes, so browsers keep it a week.
export const sstPagePath=date=>`/api/enso/sst/${date}.jpg`;
export async function sstImage(date,{fetchImpl=fetch,store=null,keep=false}={}){
 const k='enso:sst:'+date,saved=store?await store.get(k,'arrayBuffer').catch(()=>null):null;if(saved)return saved;
 const r=await fetchImpl(sstImageURL(date,1024),{signal:AbortSignal.timeout(25000)});
 if(!r.ok||!/^image\/jpeg/.test(r.headers.get('content-type')||''))throw new Error('gibs '+r.status);
 const buf=await r.arrayBuffer();if(keep&&store)await store.put(k,buf,{expirationTtl:4*86400}).catch(()=>{});return buf;
}
export async function sstRoute(request,ctx={},{fetchImpl=fetch,now=Date.now(),store=null}={}){
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const m=new URL(request.url).pathname.match(/^\/api\/enso\/sst\/(\d{4}-\d{2}-\d{2})\.jpg$/),age=m?now-Date.parse(m[1]+'T00:00:00Z'):NaN;
 if(!(age>=-86400000&&age<=14*86400000))return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
 const key=new Request('https://enso.internal/sst/'+m[1]);let res=await readOptionalCache(key);
 if(!res){let buf;try{buf=await sstImage(m[1],{fetchImpl,store})}catch{return new Response('NASA picture unavailable',{status:502,headers:{'Cache-Control':'no-store'}})}
  res=new Response(buf,{headers:{'Content-Type':'image/jpeg','Cache-Control':'public,max-age=604800,immutable','X-Content-Type-Options':'nosniff'}});writeOptionalCache(key,res.clone(),ctx)}
 return request.method==='HEAD'?new Response(null,{headers:res.headers}):res;
}
// Orthographic globe from the equirectangular NASA picture, drawn pixel by pixel on a canvas. Runs in
// the card renderer and on the /elnino page (plain ES5 so older iPhones run it too).
export const GLOBE_JS=`function globeSource(img){var s=document.createElement('canvas');s.width=img.naturalWidth;s.height=img.naturalHeight;var x=s.getContext('2d');x.drawImage(img,0,0);return {w:s.width,h:s.height,d:x.getImageData(0,0,s.width,s.height).data}}
function drawGlobe(c,S,lonDeg,latDeg,W){c.width=W;c.height=W;var R=W/2,x=c.getContext('2d'),out=x.createImageData(W,W),D=out.data,l0=lonDeg*Math.PI/180,p0=latDeg*Math.PI/180,sp=Math.sin(p0),cp=Math.cos(p0),i,j;
 for(j=0;j<W;j++)for(i=0;i<W;i++){var X=(i-R)/R,Y=(R-j)/R,rho=Math.sqrt(X*X+Y*Y);if(rho>1)continue;var cc=Math.asin(rho),sc=Math.sin(cc),co=Math.cos(cc);
  var lat=rho?Math.asin(co*sp+Y*sc*cp/rho):p0,lon=l0+Math.atan2(X*sc,rho*cp*co-Y*sp*sc),u=((lon*180/Math.PI+180)%360+360)%360/360,v=(90-lat*180/Math.PI)/180;
  var si=(Math.min(S.h-1,v*S.h|0)*S.w+Math.min(S.w-1,u*S.w|0))*4,o=(j*W+i)*4,sh=.55+.45*co;D[o]=S.d[si]*sh;D[o+1]=S.d[si+1]*sh;D[o+2]=S.d[si+2]*sh;D[o+3]=255}
 x.putImageData(out,0,0)}`;
// /elnino hero, owner's choice C (29 Oct 2026): ring gauge and Lao text on the left, the NASA globe on
// the right (cut by the card edge on phones, whole on wide screens), nothing on top of the globe.
// Smaller picture than the card (1024 px, about 150 KB on phone data); drag left/right turns the globe
// (a quick 280 px draw while dragging, full size on release); vertical swipes still scroll the page.
// If the picture fails, the needle gauge is shown where the globe was.
export function ringSVG(v,s=118){
 const r=s/2-9,c=2*Math.PI*r,arc=c*.75,fill=arc*Math.max(0,Math.min(1,(v+4)/8)),col=v>=0.5?'#ea580c':v<=-0.5?'#2563eb':'#94a3b8',txt=v>=0.5?'#fdba74':v<=-0.5?'#93c5fd':'#e2e8f0';
 return `<svg class="ring" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" role="img" aria-label="${sign(v)} °C"><g transform="rotate(135 ${s/2} ${s/2})"><circle cx="${s/2}" cy="${s/2}" r="${r}" fill="none" stroke="#1e293b" stroke-width="11" stroke-dasharray="${arc.toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round"/><circle cx="${s/2}" cy="${s/2}" r="${r}" fill="none" stroke="${col}" stroke-width="11" stroke-dasharray="${fill.toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round"/></g><text x="${s/2}" y="${s/2+5}" text-anchor="middle" fill="${txt}" font-family="Inter,sans-serif" font-weight="800" font-size="${Math.round(s/4.2)}">${sign(v)}</text><text x="${s/2}" y="${s/2+24}" text-anchor="middle" fill="#94a3b8" font-size="11">°C</text></svg>`;
}
function heroHTML(d,x){
 const date=d.sstDate;
 return `<div class="card hero" id="hero"><div class="stage"><canvas id="globe" width="560" height="560" role="img" aria-label="ພາບໂລກ ອຸນຫະພູມນ້ຳທະເລ ຈາກດາວທຽມ NASA"></canvas><div class="gl" id="globeMsg">ກຳລັງໂຫຼດພາບ NASA…</div><div id="fbk">${gaugeSVG(x.v,{w:200})}</div>
<div class="col"><div class="k">ພາບດາວທຽມ NASA</div><div class="big">${x.s.side?`${esc(x.s.side)}<br>${esc(x.s.word)}`:'ປົກກະຕິ'}</div>${ringSVG(x.v)}<div class="m rl">ນ້ຳທະເລ${x.v>=0?'ຮ້ອນ':'ເຢັນ'}ກວ່າປົກກະຕິ</div></div>
<div class="leg"><span>ເຢັນກວ່າປົກກະຕິ</span><i></i><span>ຮ້ອນກວ່າ</span></div></div>
<p class="m" style="font-size:12px;margin-top:10px">ພາບດາວທຽມ NASA ${esc(dateLao(date))} · ອຸນຫະພູມນ້ຳທະເລ ສູງ/ຕ່ຳກວ່າປົກກະຕິ · ສີແດງເຂັ້ມກາງປາຊີຟິກ = ເອລນີໂຍ · ລາກຊ້າຍ–ຂວາ ເພື່ອໝຸນໂລກ</p>
<script>${GLOBE_JS}
(function(){var c=document.getElementById('globe'),msg=document.getElementById('globeMsg'),img=new Image(),S=null,lon=-140,busy=0,x0=null;
function paint(n){if(S)drawGlobe(c,S,lon,5,n)}
function fail(){c.style.display='none';msg.style.display='none';document.getElementById('fbk').style.display='block'}
img.crossOrigin='anonymous';img.onerror=fail;img.onload=function(){try{S=globeSource(img);paint(560);msg.style.display='none'}catch(e){fail()}};img.src=${JSON.stringify(sstPagePath(date))};
c.addEventListener('pointerdown',function(e){x0=e.clientX});
c.addEventListener('pointermove',function(e){if(x0===null||!S)return;lon-=(e.clientX-x0)*0.4;x0=e.clientX;if(!busy){busy=1;requestAnimationFrame(function(){paint(280);busy=0})}});
function end(){if(x0!==null){x0=null;paint(560)}}c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);c.addEventListener('pointerleave',end);
})()</script>`;
}
export function ensoGlobeCardHTML(d,{fonts='',headline='',date}){
 const x=ensoSummary(d),eff=EFFECTS[x.side],[h1,h2]=String(headline).split(' — '),warm=x.v>=0;
 const draw=`{const src=new Image();src.crossOrigin='anonymous';const done=()=>document.body.dataset.ready=1;
 const fail=()=>{document.getElementById('g').style.display='none';document.getElementById('fb').style.display='block';done()};src.onerror=fail;
 src.onload=()=>{try{drawGlobe(document.getElementById('g'),globeSource(src),-140,5,940);done()}catch{fail()}};src.src=${JSON.stringify(sstImageURL(date))}}`;
 return `<!doctype html><html lang="lo"><head><meta charset="utf-8"><style>${fonts}*{margin:0;box-sizing:border-box}body{width:1080px;height:1080px;overflow:hidden;background:#05070d;color:#fff;font-family:'Noto Sans Lao',Inter,sans-serif;position:relative}
.n{font-family:Inter,'Noto Sans Lao'}.t{position:absolute;left:50px;top:56px;width:560px;text-shadow:0 2px 8px #000,0 0 18px #000}.k{font-size:27px;color:#fdba74;font-weight:700}.k small{display:block;font-size:22px;color:#e2e8f0;font-weight:400}
h1{font-size:62px;font-weight:900;line-height:1.2;margin-top:12px}.v{display:flex;align-items:center;gap:14px;margin-top:22px}.v b{font-size:86px;font-weight:900;line-height:1;color:${warm?'#fdba74':'#93c5fd'}}.v span{font-size:27px;line-height:1.4}
.w{font-size:21px;color:#cbd5e1;margin-top:10px}ul{font-size:28px;margin:26px 0 0 30px;line-height:1.6}
.leg{position:absolute;left:50px;top:936px;display:flex;align-items:center;gap:12px;font-size:21px;color:#cbd5e1}.leg i{display:block;width:240px;height:14px;border-radius:7px;background:linear-gradient(90deg,#3b0a9e,#1e90ff,#7fffd4,#dcdcdc,#ffe066,#ff8c00,#e3001b,#c2006e,#7a0000)}
.f{position:absolute;left:50px;right:50px;bottom:30px;display:flex;justify-content:space-between;font-size:19px;color:#94a3b8}#fb{display:none;position:absolute;left:560px;top:300px}</style></head><body>
<canvas id="g" width="940" height="940" style="position:absolute;left:380px;top:30px"></canvas><div id="fb">${gaugeSVG(x.v,{w:480})}</div>
<div class="t"><div class="k">${h1?esc(h1)+(h2?`<small>${esc(h2)}</small>`:''):`ພາບດາວທຽມ NASA · ${esc(dateLao(date))}`}</div>
<h1>${x.s.side?`${esc(x.s.side)}<br>${esc(x.s.word)}`:'ປົກກະຕິ'}</h1>
<div class="v"><b class="n">${sign(x.v)}°C</b><span>ນ້ຳທະເລປາຊີຟິກ<br>${warm?'ຮ້ອນ':'ເຢັນ'}ກວ່າປົກກະຕິ</span></div>
<div class="w">${x.week?`ຄ່າລ່າສຸດ ອາທິດ ${esc(x.week)} · ທາງການ (3 ເດືອນ) ${sign(x.oni)}`:`ONI · ${esc(x.season)}`}</div>
${eff?`<ul>${eff.short.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`:''}</div>
<div class="leg"><span>ເຢັນກວ່າປົກກະຕິ</span><i></i><span>ຮ້ອນກວ່າ</span></div>
<div class="f"><span>ລາວປອດໄພ · /elnino</span><span>ພາບ: NASA GIBS (GHRSST MUR) ${esc(dateLao(date))} · ຄ່າ: NOAA · ບໍ່ແມ່ນປະກາດທາງການ</span></div>
<script>${GLOBE_JS}${draw}</script></body></html>`;
}
// Lit 3D globe for the cards: sun from the upper left, soft shine on the sea, blue air glow at the edge,
// smooth (bilinear) sampling of the NASA picture. Plain ES5 like GLOBE_JS.
export const GLOBE3D_JS=`function px3(S,u,v,k){var fx=u*S.w-.5,fy=v*S.h-.5,x0=Math.floor(fx),y0=Math.max(0,Math.min(S.h-1,Math.floor(fy))),y1=Math.min(S.h-1,y0+1),ax=fx-x0,ay=fy-Math.floor(fy),x1=((x0+1)%S.w+S.w)%S.w;x0=(x0%S.w+S.w)%S.w;
 var a=S.d[(y0*S.w+x0)*4+k],b=S.d[(y0*S.w+x1)*4+k],c=S.d[(y1*S.w+x0)*4+k],e=S.d[(y1*S.w+x1)*4+k];return (a*(1-ax)+b*ax)*(1-ay)+(c*(1-ax)+e*ax)*ay}
function globe3d(c,S,lonDeg,latDeg,size,R){c.width=size;c.height=size;var cx=size/2,x=c.getContext('2d'),out=x.createImageData(size,size),D=out.data,l0=lonDeg*Math.PI/180,p0=latDeg*Math.PI/180,sp=Math.sin(p0),cp=Math.cos(p0),L=[-.578,.473,.666],H=[-.346,.283,.894],i,j;
 for(j=0;j<size;j++)for(i=0;i<size;i++){var X=(i+.5-cx)/R,Y=(cx-j-.5)/R,rho=Math.sqrt(X*X+Y*Y),q=(j*size+i)*4;
  if(rho>1){var a=Math.max(0,1-(rho-1)/.08);if(a<=0)continue;D[q]=90;D[q+1]=165;D[q+2]=255;D[q+3]=a*a*190*(.4+.6*Math.max(0,(X*L[0]+Y*L[1])/rho));continue}
  var z=Math.sqrt(1-rho*rho),cc=Math.asin(rho),sc=Math.sin(cc),co=Math.cos(cc),lat=rho?Math.asin(co*sp+Y*sc*cp/rho):p0,lon=l0+Math.atan2(X*sc,rho*cp*co-Y*sp*sc),u=((lon*180/Math.PI+180)%360+360)%360/360,v=(90-lat*180/Math.PI)/180;
  var df=Math.max(0,X*L[0]+Y*L[1]+z*L[2]),li=.16+.84*Math.pow(df,.8),sh=Math.pow(Math.max(0,X*H[0]+Y*H[1]+z*H[2]),70)*.18*255,rim=Math.pow(1-z,2.2)*.6*(.35+.65*df),edge=Math.min(1,(1-rho)*R);
  D[q]=px3(S,u,v,0)*li*(1-rim)+110*rim+sh;D[q+1]=px3(S,u,v,1)*li*(1-rim)+175*rim+sh;D[q+2]=px3(S,u,v,2)*li*(1-rim)+255*rim+sh;D[q+3]=Math.max(255*edge,D[q+3])}
 x.putImageData(out,0,0)}`;
// Facebook card, owner's choice C (29 Oct 2026, after seeing A–D): one 3D globe turned so Laos and the
// warm (or cold) Pacific are both on it, joined by a dashed line, Lao text top left. Label and line
// positions are worked out here (same orthographic maths as the globe), so the card needs no guessing.
// If the NASA picture fails, the needle gauge is drawn instead.
const CARD_LON=-170,CARD_LAT=12,CARD_R=380,CARD_CX=680,CARD_CY=580;
function cardPoint(lon,lat){const r=Math.PI/180,l=(lon-CARD_LON)*r,p=lat*r,p0=CARD_LAT*r;
 return [CARD_CX+CARD_R*Math.cos(p)*Math.sin(l),CARD_CY-CARD_R*(Math.cos(p0)*Math.sin(p)-Math.sin(p0)*Math.cos(p)*Math.cos(l))].map(v=>Math.round(v))}
export function ensoLaosCardHTML(d,{fonts='',headline='',date}){
 const x=ensoSummary(d),eff=EFFECTS[x.side],[h1,h2]=String(headline).split(' — '),warm=x.v>=0,col=warm?'#fdba74':'#93c5fd';
 const [ax,ay]=cardPoint(102.6,18),[bx,by]=cardPoint(-130,0),mx=Math.round((ax+bx)/2),my=Math.round((ay+by)/2)-170,lab='paint-order:stroke;stroke:#000;stroke-width:6';
 const draw=`{const done=()=>document.body.dataset.ready=1,i=new Image();i.crossOrigin='anonymous';
 const fail=()=>{document.body.classList.add('nog');document.getElementById('fb').style.display='block';done()};i.onerror=fail;
 i.onload=()=>{try{globe3d(document.getElementById('g'),globeSource(i),${CARD_LON},${CARD_LAT},860,${CARD_R});done()}catch{fail()}};i.src=${JSON.stringify(sstImageURL(date))}}`;
 return `<!doctype html><html lang="lo"><head><meta charset="utf-8"><style>${fonts}*{margin:0;box-sizing:border-box}body{width:1080px;height:1080px;overflow:hidden;background:radial-gradient(circle at 63% 54%,#0c1a33 0,#05070d 62%);color:#fff;font-family:'Noto Sans Lao',Inter,sans-serif;position:relative}
.n{font-family:Inter,'Noto Sans Lao'}.sh{text-shadow:0 2px 8px #000,0 0 18px #000}.t{position:absolute;left:50px;top:50px;width:600px}.k{font-size:27px;color:#fdba74;font-weight:700}.k small{display:block;font-size:22px;color:#e2e8f0;font-weight:400}
h1{font-size:58px;font-weight:900;line-height:1.25;margin-top:10px}.v{font-size:80px;font-weight:900;color:${col};line-height:1.15}#g{position:absolute;left:250px;top:150px}#o{position:absolute;left:0;top:0}#o text{font-family:'Noto Sans Lao',sans-serif}
.leg{position:absolute;left:50px;top:948px;display:flex;align-items:center;gap:12px;font-size:21px;color:#cbd5e1}.leg i{display:block;width:240px;height:14px;border-radius:7px;background:linear-gradient(90deg,#3b0a9e,#1e90ff,#7fffd4,#dcdcdc,#ffe066,#ff8c00,#e3001b,#c2006e,#7a0000)}
.f{position:absolute;left:50px;right:50px;bottom:28px;display:flex;justify-content:space-between;font-size:19px;color:#94a3b8}#fb{display:none;position:absolute;left:520px;top:330px}.alt,.nog #g,.nog #o,.nog .leg,.nog .pic{display:none}.nog .alt{display:inline}</style></head><body>
<canvas id="g" width="860" height="860"></canvas><div id="fb">${gaugeSVG(x.v,{w:480})}</div>
<svg id="o" width="1080" height="1080"><path d="M${bx} ${by} Q${mx} ${my} ${ax} ${ay}" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="14 10" opacity=".9"/>
<circle cx="${ax}" cy="${ay}" r="14" fill="#facc15" stroke="#000" stroke-width="3"/><text x="${ax+22}" y="${ay+12}" fill="#fff" font-size="38" font-weight="900" style="${lab}">ລາວ</text>
<text x="${bx-150}" y="${by+80}" fill="#fff" font-size="30" font-weight="800" style="${lab}">ນ້ຳທະເລ${warm?'ຮ້ອນ':'ເຢັນ'}</text>
${eff?`<text x="${mx-250}" y="${my-6}" fill="#fde68a" font-size="30" font-weight="800" style="${lab}">→ ${esc(eff.short[0])}</text>`:''}</svg>
<div class="t sh"><div class="k">${h1?esc(h1)+(h2?`<small>${esc(h2)}</small>`:''):`<span class="pic">ພາບດາວທຽມ NASA · ${esc(dateLao(date))}</span><span class="alt">ເອລນີໂຍ · ລານີຍາ · NOAA</span>`}</div>
<h1>${x.s.side?`${esc(x.s.side)}<br>${esc(x.s.word)}`:'ປົກກະຕິ'}</h1><div class="v n">${sign(x.v)}°C</div></div>
<div class="leg sh"><span>ເຢັນກວ່າປົກກະຕິ</span><i></i><span>ຮ້ອນກວ່າ</span></div>
<div class="f"><span>ລາວປອດໄພ · /elnino</span><span><span class="pic">ພາບ: NASA GIBS (GHRSST MUR) ${esc(dateLao(date))} · </span>ຄ່າ: NOAA · ບໍ່ແມ່ນປະກາດທາງການ</span></div>
<script>${GLOBE_JS}${GLOBE3D_JS}${draw}</script></body></html>`;
}
// The card for a post: NASA globe when NASA's newest day is known, otherwise the needle gauge card.
export async function ensoCardFor(d,{fonts='',headline='',fetchImpl=fetch,now=Date.now()}={}){
 const date=await newestSstDate(fetchImpl,now);return date?ensoLaosCardHTML(d,{fonts,headline,date}):ensoCardHTML(d,fonts,headline);
}export function ensoCaption(d,headline=''){
 const x=ensoSummary(d),eff=EFFECTS[x.side];
 return [headline||`🌊 ເອລນີໂຍ · ລານີຍາ ປະຈຳເດືອນ: ${x.status||x.head}`,'',x.week?`• ຄ່າລ່າສຸດ (ອາທິດ ${x.week}): ${sign(x.v)} → ${x.head}`:`• ດັດຊະນີ ONI ${sign(x.v)} (${x.season}) → ${x.head}`,
  ...(x.week?[`• ຄ່າທາງການ NOAA (ONI ສະເລ່ຍ 3 ເດືອນ): ${sign(x.oni)} (${x.season})`]:[]),...(x.status&&headline?[`• ສະຖານະ NOAA: ${x.status}`]:[]),...(x.outlook?[`• ${x.outlook}`]:[]),
  ...(eff?['',eff.when,...eff.items.map(i=>'• '+i),'','ຄວນກຽມຕົວ:',...eff.advice.map(i=>'• '+i)]:[]),
  '',`ລາຍລະອຽດ: ${SITE}/elnino`,`ຂໍ້ມູນ: NOAA Climate Prediction Center${x.issued?` · ປະກາດ ${x.issued}`:''}`,'ຜົນກະທົບແມ່ນສິ່ງທີ່ມັກເກີດໃນອະດີດ ບໍ່ແມ່ນພະຍາກອນ · ບໍ່ແມ່ນປະກາດທາງການ','#ເອລນີໂຍ #ລາວປອດໄພ #ອາກາດລາວ'].join('\n');
}
// Urgent news (owner, 29 Oct 2026: "ถ้าประกาศด่วน ให้บอทร่าง แปล แล้วโพสต์อัตโนมัติ"). No machine translation:
// every case NOAA can announce has a fixed Lao sentence here, filled with NOAA's numbers.
export const STATUS_NEWS={'elnino-watch':'ປະກາດດ່ວນ: NOAA ເລີ່ມເຝົ້າລະວັງ ອາດເກີດເອລນີໂຍ','elnino-advisory':'ປະກາດດ່ວນ: NOAA ຢືນຢັນ ເກີດເອລນີໂຍແລ້ວ','elnino-final':'NOAA ປະກາດ: ເອລນີໂຍ ສິ້ນສຸດແລ້ວ',
 'lanina-watch':'ປະກາດດ່ວນ: NOAA ເລີ່ມເຝົ້າລະວັງ ອາດເກີດລານີຍາ','lanina-advisory':'ປະກາດດ່ວນ: NOAA ຢືນຢັນ ເກີດລານີຍາແລ້ວ','lanina-final':'NOAA ປະກາດ: ລານີຍາ ສິ້ນສຸດແລ້ວ',none:'NOAA ປະກາດ: ກັບສູ່ສະພາບປົກກະຕິ'};
const LEVEL_WORD=['','ອ່ອນ','ປານກາງ','ແຮງ','ແຮງຫຼາຍ','ຮຸນແຮງຫຼາຍ'];
const levelName=l=>l===0?'ປົກກະຕິ':(l>0?'ເອລນີໂຍ ':'ລານີຍາ ')+LEVEL_WORD[Math.abs(l)];
export function levelNews(from,to){const side=to>0?'ເອລນີໂຍ':to<0?'ລານີຍາ':null,same=Math.sign(from)===Math.sign(to)&&side;
 return same?`${Math.abs(to)>Math.abs(from)?'ປະກາດດ່ວນ: '+side+' ແຮງຂຶ້ນ':side+' ອ່ອນລົງ'} — ຈາກ "${levelName(from)}" ເປັນ "${levelName(to)}"`:`ປ່ຽນແປງ: ຈາກ "${levelName(from)}" ເປັນ "${levelName(to)}"`}
// Posts due for this data, given the state saved after the last check ({key, level} or null on the
// first run, which only remembers). One post per NOAA discussion (urgent headline when the status
// changed) and one when the weekly strength level changes.
export function ensoUpdates(d,prev){
 const posts=[],key=d?.disc?.key||null,v=nowValue(d),changed=!!(prev&&key&&prev.key&&key!==prev.key);
 if(d?.disc?.issued&&(/advisory|watch|final/.test(key)||changed)){const h=changed?STATUS_NEWS[key]:'';posts.push({key:'enso:'+d.disc.issued,kind:'enso',headline:h,caption:ensoCaption(d,h?(/ດ່ວນ/.test(h)?'⚠️ ':'📢 ')+h:''),link:SITE+'/elnino'})}
 const lv=prev&&d.now?.week?levelChange(v,prev.level):null;
 if(lv!=null){const h=levelNews(prev.level,lv);posts.push({key:'enso-level:'+d.now.week,kind:'enso',headline:h,caption:ensoCaption(d,(/ດ່ວນ/.test(h)?'⚠️ ':'📢 ')+h),link:SITE+'/elnino'})}
 return {posts,state:{key:key??prev?.key??null,level:lv??prev?.level??signedLevel(v)}};
}export async function ensoRoute(request,ctx,{fetchImpl=fetch,now=Date.now(),store=null}={}){
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const page=new URL(request.url).pathname.startsWith('/elnino');
 try{const d=await ensoData(ctx,{fetchImpl,now,store});
  return page?new Response(request.method==='HEAD'?null:ensoPageHTML(d),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public,max-age=1800','X-Content-Type-Options':'nosniff'}})
   :Response.json(d,{headers:{'Cache-Control':'public,max-age=1800','X-Content-Type-Options':'nosniff'}})}
 catch{return page?new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="background:#0b1424;color:#e9eef6;font-family:sans-serif;padding:20px">ຂໍ້ມູນເອລນີໂຍ ບໍ່ພ້ອມຊົ່ວຄາວ · ລອງໃໝ່ພາຍຫຼັງ · <a style="color:#93c5fd" href="/">ໜ້າຫຼັກ</a></body>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})
  :Response.json({error:'enso_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
