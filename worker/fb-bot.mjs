// Facebook Page bot (22 Oct 2026). The bot writes DRAFTS; the owner approves each one on admin.html
// before it is posted (owner's choice: "draft first, press approve"). Since 29 Oct 2026 the scheduled
// daily and weekly forecasts with a picture are approved by themselves (owner: "ลงอัตโนมัติเลย"); the
// owner can still press skip in the hour before posting. Warnings and manual test drafts still wait.
//  El Niño        09:00 + 15:00 Lao checks; monthly NOAA discussion + urgent status/level changes (checkEnso)
//  Daily summary   draft 05:00 → post 06:00 (today) and draft 17:00 → post 18:00 (tomorrow), Lao time
//  Weekly outlook  Sunday 17:00 → 18:00 (next 7 days by region)
//  Warnings        storm "watch"/"near" (JMA), MRC river station at alarm/flood level, and with the
//                  daily data: feels-like ≥ HEAT_ALERT °C or rain ≥ RAIN_ALERT mm in a province
// Text comes from fixed templates filled with forecast numbers (no AI writing). Every post names its
// source and says it is not an official warning. Pictures are rendered by Browser Run (free 10 min/day).
// Posting needs the secrets FB_PAGE_ID and FB_PAGE_TOKEN (a Page access token); without them drafts
// still work and the owner can copy the text and download the picture by hand.
import {PROVINCES} from './seo-provinces.mjs';
import {forecastPoint} from './province-towns.mjs';
import {CARD_FONTS} from './card-fonts.mjs';
import {logoSVG} from './brand.mjs';
import {PROVINCE_VIEW,PROVINCE_PATHS,PROVINCE_LABELS} from './lao-province-paths.mjs';
import {stormSummary,SITE} from './storm-share.mjs';
import {ensoUpdates,ensoCardFor,ensoCaption} from './enso.mjs';

export const REGIONS={north:['phongsaly','luang-namtha','oudomxay','bokeo','luang-prabang','houaphan','xaignabouli','xiangkhouang'],central:['vientiane-capital','vientiane','xaisomboun','bolikhamsai','khammouane','savannakhet'],south:['salavan','xekong','champasak','attapeu']};
const REGION_LO={north:'ພາກເໜືອ',central:'ພາກກາງ',south:'ພາກໃຕ້'};
export const RAIN_LIKELY=60,HOT_FEELS=38,HEAT_ALERT=41,RAIN_ALERT=50,DRAFT_HOURS=18;
const GRAPH='https://graph.facebook.com/v23.0';
const DAY_LO=['ອາທິດ','ຈັນ','ອັງຄານ','ພຸດ','ພະຫັດ','ສຸກ','ເສົາ'],MONTH_LO=['ມ.ກ.','ກ.ພ.','ມ.ນ.','ເມ.ສ.','ພ.ພ.','ມິ.ຖ.','ກ.ລ.','ສ.ຫ.','ກ.ຍ.','ຕ.ລ.','ພ.ຈ.','ທ.ວ.'];
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const LAO_MS=7*3600000,laoNow=now=>new Date(now+LAO_MS);
// "2026-10-23" → "ວັນສຸກ 23 ຕ.ລ. 2026"
export function laoDate(iso,{year=true}={}){const d=new Date(iso+'T00:00:00Z');return 'ວັນ'+DAY_LO[d.getUTCDay()]+' '+d.getUTCDate()+' '+MONTH_LO[d.getUTCMonth()]+(year?' '+d.getUTCFullYear():'')}
// Lao clock time of the day `iso` at hour h, as a UTC ISO string.
const laoAt=(iso,h)=>new Date(Date.parse(iso+'T00:00:00Z')+h*3600000-LAO_MS).toISOString();
const uvWord=v=>{const u=Math.round(v);return u>=11?'ອັນຕະລາຍ':u>=8?'ສູງຫຼາຍ':u>=6?'ສູງ':u>=3?'ປານກາງ':'ຕ່ຳ'};
const icon=p=>p>=RAIN_LIKELY?'🌧':p>=30?'🌦':'☀️';
const r0=v=>Math.round(v),r1=v=>Math.round(v*10)/10;

// One Open-Meteo request for the 18 province centres (free, no key), 7 days, Lao time.
export async function fetchProvinceForecast(fetchImpl=fetch){
 // Capital towns, as the caption says (the geometric centres sat on mountains, 28 Oct 2026).
 const pts=PROVINCES.map(p=>forecastPoint(p.slug,p.center));
 const qs=new URLSearchParams({latitude:pts.map(p=>p[0]).join(','),longitude:pts.map(p=>p[1]).join(','),daily:'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,precipitation_probability_max,uv_index_max',timezone:'Asia/Vientiane',forecast_days:'8'});
 const r=await fetchImpl('https://api.open-meteo.com/v1/forecast?'+qs,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('open_meteo_'+r.status);
 const rows=await r.json();if(!Array.isArray(rows)||rows.length!==PROVINCES.length)throw new Error('open_meteo_shape');
 return {at:new Date().toISOString(),provinces:PROVINCES.map((p,i)=>({slug:p.slug,name:p.name_lo,region:Object.keys(REGIONS).find(k=>REGIONS[k].includes(p.slug)),daily:rows[i].daily}))};
}
// Values of one day (0 = today in Lao time).
export function dayRows(fc,i){return fc.provinces.map(p=>{const d=p.daily;return {slug:p.slug,name:p.name,region:p.region,date:d.time[i],tmax:d.temperature_2m_max[i],tmin:d.temperature_2m_min[i],feels:d.apparent_temperature_max[i],rain:d.precipitation_sum[i]??0,pop:d.precipitation_probability_max[i]??0,uv:d.uv_index_max[i]??0}}).filter(r=>Number.isFinite(r.tmax))}
export function regionSummary(rows,k){
 const l=rows.filter(r=>r.region===k);if(!l.length)return null;
 const wet=l.filter(r=>r.pop>=RAIN_LIKELY),maxPop=Math.max(...l.map(r=>r.pop)),maxRain=Math.max(...l.map(r=>r.rain));
 // Words follow both the chance and the amount: 100 % chance of 2 mm is still "light rain".
 const amount=maxRain>=35?'ຝົນຕົກໜັກ':maxRain>=10?'ຝົນປານກາງ':'ຝົນເລັກນ້ອຍ',where=wet.length>=l.length/2?'ຫຼາຍບ່ອນ':'ບາງບ່ອນ';
 const text=wet.length?`ມີ${amount}${where}`:maxPop>=30?'ອາດມີຝົນເລັກນ້ອຍ':'ສ່ວນຫຼາຍແດດ ຝົນໜ້ອຍ';
 return {k,name:REGION_LO[k],text,wet,maxPop,maxRain,tmin:r0(Math.min(...l.map(r=>r.tmin))),tmax:r0(Math.max(...l.map(r=>r.tmax))),feels:r0(Math.max(...l.map(r=>r.feels)))};
}
// Long caption (owner's choice 22 Oct 2026: longer, with advice and hashtags).
export function dailyCaption(rows,{label,issuedAt}){
 const date=rows[0].date,regs=Object.keys(REGIONS).map(k=>regionSummary(rows,k)).filter(Boolean);
 const wet=rows.filter(r=>r.pop>=RAIN_LIKELY).sort((a,b)=>b.pop-a.pop||b.rain-a.rain),hot=rows.filter(r=>r.feels>=HOT_FEELS).sort((a,b)=>b.feels-a.feels);
 const uv=Math.max(...rows.map(r=>r.uv)),maxRain=rows.reduce((a,b)=>b.rain>a.rain?b:a);
 const L=[`🌤 ພະຍາກອນອາກາດ ${label} ${laoDate(date)}`,''];
 for(const g of regs)L.push(`${icon(g.maxPop)} ${g.name}: ${g.text}${g.maxRain>=1?` (ສູງສຸດ ~${r0(g.maxRain)} mm)`:''} · ${g.tmin}–${g.tmax}°C`);
 L.push('');
 if(wet.length)L.push(`📍 ແຂວງທີ່ມີໂອກາດຝົນສູງ: ${wet.slice(0,6).map(r=>`${r.name} ${r.pop}%`).join(', ')}`);
 if(maxRain.rain>=10)L.push(`💧 ຝົນຫຼາຍທີ່ສຸດ: ${maxRain.name} ປະມານ ${r0(maxRain.rain)} mm`);
 if(hot.length)L.push(`🔥 ຮ້ອນອົບເອົ້າ: ຮູ້ສຶກເຖິງ ${r0(hot[0].feels)}°C (${hot.slice(0,4).map(r=>r.name).join(', ')})`);
 if(uv>=3)L.push(`😎 ດັດຊະນີ UV ສູງສຸດ ${r0(uv)} (${uvWord(uv)}) ຊ່ວງ 11:00–15:00`);
 const tips=[];
 if(wet.length)tips.push('ພົກຄັນຮົ່ມ ຫຼື ເສື້ອກັນຝົນ, ຂັບຂີ່ລົດຊ້າລົງ ເວລາຖະໜົນປຽກ');
 if(maxRain.rain>=35)tips.push('ຜູ້ຢູ່ໃກ້ນ້ຳ ຫຼື ຕີນພູ ລະວັງນ້ຳຖ້ວມສັ້ນ ແລະ ດິນເຈື່ອນ');
 if(hot.length)tips.push('ດື່ມນ້ຳຫຼາຍໆ, ຫຼີກລ່ຽງການອອກແຮງ ຫຼື ກິດຈະກຳກາງແຈ້ງ 11:00–15:00');
 if(hot.length)tips.push('ເດັກນ້ອຍ, ຜູ້ສູງອາຍຸ ແລະ ຜູ້ມີພະຍາດ ລະວັງເປັນລົມແດດ');
 if(uv>=6)tips.push('ທາຄີມກັນແດດ, ໃສ່ໝວກ ແລະ ແວ່ນຕາກັນແດດ');
 if(tips.length)L.push('','✅ ຄຳແນະນຳ:',...tips.map(t=>'• '+t));
 L.push('',`🗺 ເບິ່ງເຣດາ, ພາບດາວທຽມ ແລະ ລະດັບນ້ຳ ແບບສົດໆ: ${SITE}`,`ຂໍ້ມູນ: ພະຍາກອນ Open-Meteo ທີ່ຕົວເມືອງເອກຂອງແຕ່ລະແຂວງ · ດຶງເມື່ອ ${clock(issuedAt)}`,'⚠️ ຂໍ້ມູນເພື່ອຊຸມຊົນ ບໍ່ແມ່ນປະກາດທາງການ — ກະລຸນາຕິດຕາມປະກາດຂອງ ກົມອຸຕຸນິຍົມ ແລະ ອຸທົກກະສາດ','',`#ລາວປອດໄພ #ພະຍາກອນອາກາດ #ອາກາດ${label} #ຝົນ #ລາວ`);
 return L.join('\n');
}
const clock=iso=>{const d=laoNow(Date.parse(iso));return d.getUTCDate()+'/'+(d.getUTCMonth()+1)+' '+String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')};
export function weeklyCaption(fc,{issuedAt}){
 const days=[1,2,3,4,5,6,7].map(i=>dayRows(fc,i)).filter(d=>d.length);const first=days[0][0].date,last=days.at(-1)[0].date;
 const L=[`📅 ແນວໂນ້ມອາກາດ 7 ວັນ (${laoDate(first,{year:false})} – ${laoDate(last)})`,''];
 for(const k of Object.keys(REGIONS)){const per=days.map(d=>regionSummary(d,k));const wetDays=per.filter(g=>g.wet.length).length,maxRain=Math.max(...per.map(g=>g.maxRain)),tmax=Math.max(...per.map(g=>g.tmax)),tmin=Math.min(...per.map(g=>g.tmin));
  L.push(`${wetDays>=4?'🌧':wetDays?'🌦':'☀️'} ${REGION_LO[k]}: ${wetDays?`ມີຝົນ ${wetDays} ໃນ 7 ວັນ${maxRain>=1?` (ສູງສຸດ ~${r0(maxRain)} mm/ມື້)`:''}`:'ແຫ້ງເກືອບທັງອາທິດ'} · ${tmin}–${tmax}°C`)}
 const hot=days.flat().filter(r=>r.feels>=HOT_FEELS),uv=Math.max(...days.flat().map(r=>r.uv));
 L.push('');if(hot.length)L.push(`🔥 ມີ ${new Set(hot.map(r=>r.date)).size} ມື້ ທີ່ຮູ້ສຶກຮ້ອນເຖິງ ${r0(Math.max(...hot.map(r=>r.feels)))}°C ບາງແຂວງ`);if(uv>=6)L.push(`😎 UV ${uvWord(uv)} ເກືອບທຸກມື້ ຊ່ວງທ່ຽງ`);
 L.push('',`🗺 ເບິ່ງພະຍາກອນລາຍແຂວງ: ${SITE}/weather`,`ຂໍ້ມູນ: Open-Meteo · ດຶງເມື່ອ ${clock(issuedAt)} · ພະຍາກອນໄລຍະຍາວ ອາດປ່ຽນແປງໄດ້`,'⚠️ ຂໍ້ມູນເພື່ອຊຸມຊົນ ບໍ່ແມ່ນປະກາດທາງການ','','#ລາວປອດໄພ #ພະຍາກອນອາກາດ #ອາກາດລາວ');
 return L.join('\n');
}
// Warnings found in one day of province data.
export function weatherAlerts(rows,label){
 const out=[],date=rows[0]?.date;
 const heat=rows.filter(r=>r.feels>=HEAT_ALERT).sort((a,b)=>b.feels-a.feels);
 if(heat.length)out.push({key:'heat:'+date,kind:'heat',caption:[`🔥 ເຕືອນອາກາດຮ້ອນຈັດ ${label} ${laoDate(date)}`,'',`ຮູ້ສຶກຮ້ອນເຖິງ ${r0(heat[0].feels)}°C ທີ່: ${heat.map(r=>`${r.name} ${r0(r.feels)}°C`).join(', ')}`,'','✅ ຄຳແນະນຳ:','• ງົດກິດຈະກຳກາງແຈ້ງ ແລະ ການອອກແຮງໜັກ ຊ່ວງ 11:00–15:00','• ດື່ມນ້ຳເລື້ອຍໆ ເຖິງວ່າບໍ່ຫິວ','• ຢ່າປະເດັກນ້ອຍ ຫຼື ສັດລ້ຽງໄວ້ໃນລົດ','• ອາການເປັນລົມແດດ: ວິນຫົວ, ຄື່ນໄສ້, ຕົວຮ້ອນ ແຕ່ບໍ່ມີເຫື່ອ → ພາເຂົ້າບ່ອນຮົ່ມ ເຊັດຕົວ ແລະ ໄປໂຮງໝໍ','',`ຂໍ້ມູນ: Open-Meteo (ອຸນຫະພູມທີ່ຮູ້ສຶກ) · ${SITE}`,'⚠️ ຂໍ້ມູນເພື່ອຊຸມຊົນ ບໍ່ແມ່ນປະກາດທາງການ','','#ລາວປອດໄພ #ອາກາດຮ້ອນ #ລົມແດດ'].join('\n')});
 const wet=rows.filter(r=>r.rain>=RAIN_ALERT).sort((a,b)=>b.rain-a.rain);
 if(wet.length)out.push({key:'rain:'+date,kind:'rain',caption:[`🌧 ເຕືອນຝົນຕົກໜັກ ${label} ${laoDate(date)}`,'',`ພະຍາກອນຝົນ: ${wet.map(r=>`${r.name} ~${r0(r.rain)} mm`).join(', ')}`,'','✅ ຄຳແນະນຳ:','• ລະວັງນ້ຳຖ້ວມສັ້ນ ແລະ ນ້ຳຂັງ ໃນເຂດຕ່ຳ','• ຜູ້ຢູ່ຕີນພູ ລະວັງດິນເຈື່ອນ','• ບໍ່ຂັບຂີ່ ຫຼື ຍ່າງຂ້າມທາງທີ່ນ້ຳໄຫຼແຮງ','',`ເບິ່ງເຣດາຝົນສົດ: ${SITE}`,'ຂໍ້ມູນ: Open-Meteo (ພະຍາກອນ ອາດຄາດເຄື່ອນ)','⚠️ ຂໍ້ມູນເພື່ອຊຸມຊົນ ບໍ່ແມ່ນປະກາດທາງການ — ຕິດຕາມປະກາດຂອງ ກົມອຸຕຸນິຍົມ ແລະ ອຸທົກກະສາດ','','#ລາວປອດໄພ #ຝົນຕົກໜັກ #ນ້ຳຖ້ວມ'].join('\n')});
 return out;
}
const HEAD=['ທິດເໜືອ','ທິດຕາເວັນອອກສ່ຽງເໜືອ','ທິດຕາເວັນອອກ','ທິດຕາເວັນອອກສ່ຽງໃຕ້','ທິດໃຕ້','ທິດຕາເວັນຕົກສ່ຽງໃຕ້','ທິດຕາເວັນຕົກ','ທິດຕາເວັນຕົກສ່ຽງເໜືອ'];
export function stormAlert(s,now){
 if(!['watch','near'].includes(s.level))return null;
 const p=s.points[0],{name}=stormSummary(s),hd=Number.isFinite(p.course)?HEAD[Math.round(((p.course%360)+360)%360/45)%8]:null;
 const days=s.closest.h/24,when=s.closest.h<=0?'ຕອນນີ້':days<1?`ໃນອີກ ~${Math.max(1,Math.round(s.closest.h))} ຊົ່ວໂມງ`:`ໃນອີກ ~${r1(days)} ວັນ`;
 return {key:`storm:${s.id}:${s.level}`,kind:'storm',storm:s.id,caption:[`🌀 ${s.level==='near'?'ເຕືອນ':'ເຝົ້າລະວັງ'}: ${name}`,'',
  `📍 ຫ່າງຊາຍແດນລາວ ${p.laoKm.toLocaleString('en-US')} km${Number.isFinite(p.w)?` · ລົມສູງສຸດ ${r0(p.w*3.6)} km/h`:''}${hd?` · ກຳລັງໄປ${hd}${Number.isFinite(p.kmh)?` ${p.kmh} km/h`:''}`:''}`,
  `⏱ ຕາມເສັ້ນທາງພະຍາກອນ ຈະໃກ້ລາວທີ່ສຸດ ~${s.closest.km.toLocaleString('en-US')} km ${when}`,'',
  '✅ ກຽມພ້ອມ:','• ຕິດຕາມປະກາດຂອງ ກົມອຸຕຸນິຍົມ ແລະ ອຸທົກກະສາດ','• ພາຍຸ ອາດເຮັດໃຫ້ມີຝົນຕົກໜັກ, ລົມແຮງ, ນ້ຳຖ້ວມສັ້ນ ແລະ ດິນເຈື່ອນ','• ກຽມໄຟສາຍ, ນ້ຳດື່ມ, ຢາ ແລະ ສາກແບັດໂທລະສັບໄວ້',
  '',`🗺 ຕິດຕາມເສັ້ນທາງ ແລະ ພາບດາວທຽມ: ${SITE}/storm/${s.id}`,`ຂໍ້ມູນ: ${s.agency==='JTWC'?'JTWC ສະຫະລັດ (ສູນທາງການຂອງອ່າວເບັງກອນແມ່ນ IMD ອິນເດຍ)':'ອົງການອຸຕຸນິຍົມຍີ່ປຸ່ນ (JMA)'} ອອກ ${s.issued?clock(s.issued):'–'} · ພາບ Himawari-9 / NASA GIBS`,'⚠️ ຂໍ້ມູນເພື່ອຊຸມຊົນ ບໍ່ແມ່ນປະກາດທາງການ','','#ລາວປອດໄພ #ພາຍຸ #ຕິດຕາມພາຍຸ'].join('\n'),link:`${SITE}/storm/${s.id}`};
}
export function riverAlert(stations,now){
 const bad=(stations||[]).filter(s=>!s.stale&&(s.status==='alarm'||s.status==='flood'));if(!bad.length)return null;
 const day=laoNow(now).toISOString().slice(0,10),flood=bad.some(s=>s.status==='flood');
 return {key:`river:${day}:${bad.map(s=>s.id+s.status).sort().join(',')}`,kind:'river',caption:[`🌊 ${flood?'ເຕືອນ: ນ້ຳຂຶ້ນເຖິງລະດັບນ້ຳຖ້ວມ':'ເຝົ້າລະວັງ: ນ້ຳຂຶ້ນເຖິງລະດັບເຕືອນ'}`,'',
  ...bad.map(s=>`• ${s.name}${s.river?` (${s.river})`:''}: ${s.level} m${s.status==='flood'?` ≥ ລະດັບນ້ຳຖ້ວມ ${s.flood} m`:` ≥ ລະດັບເຕືອນ ${s.alarm} m`}${Number.isFinite(s.rise24)&&s.rise24>0?` · ຂຶ້ນ ${s.rise24} m ໃນ 24 ຊມ`:''}`),
  '','✅ ຜູ້ຢູ່ແຄມນ້ຳ: ຍ້າຍເຄື່ອງຂຶ້ນບ່ອນສູງ, ລະວັງເດັກນ້ອຍໃກ້ນ້ຳ, ຕິດຕາມປະກາດຂອງເມືອງ',`🗺 ເບິ່ງລະດັບນ້ຳ ແລະ ກຣາຟ: ${SITE}`,'ຂໍ້ມູນ: ສະຖານີວັດແທກ ຄະນະກຳມາທິການແມ່ນ້ຳຂອງ (MRC)','⚠️ ຂໍ້ມູນເພື່ອຊຸມຊົນ ບໍ່ແມ່ນປະກາດທາງການ','','#ລາວປອດໄພ #ລະດັບນ້ຳ #ນ້ຳຖ້ວມ'].join('\n'),link:SITE};
}

// Card (option D, 22 Oct 2026): map coloured by chance of rain + list of provinces to watch. 1080×1080.
const popCol=p=>p>=80?'#1d4ed8':p>=60?'#2563eb':p>=40?'#60a5fa':p>=20?'#bfdbfe':'#334155';
const CARD_CSS=`*{margin:0;box-sizing:border-box}body{width:1080px;height:1080px;overflow:hidden;background:#0d1523;color:#fff;font-family:'Noto Sans Lao',Inter,sans-serif;position:relative}
.lg{position:absolute;left:40px;top:36px;display:flex;align-items:center;gap:14px;font-weight:900;font-size:34px}.lg i{width:60px;height:60px;border-radius:16px;background:#2563eb;display:grid;place-items:center;font-style:normal;font-size:36px}
.hd{position:absolute;left:40px;top:118px;font-size:50px;font-weight:900;line-height:1.15}.hd small{display:block;font-size:30px;color:#94a3b8;font-weight:700}
.mp{position:absolute;left:30px;top:236px}.leg{position:absolute;left:40px;top:1022px;font-size:20px;color:#cbd5e1;display:flex;align-items:center;gap:6px}.leg span{width:24px;height:16px;border-radius:4px;display:inline-block;margin-left:8px}
.ls{position:absolute;right:40px;top:236px;width:470px;font-size:27px}.ls b{display:flex;align-items:center;gap:10px;font-size:30px;margin:0 0 8px}.ls div{display:flex;justify-content:space-between;padding:6px 16px;background:rgba(255,255,255,.07);border-radius:12px;margin-bottom:6px}.ls span{font-weight:900;font-family:Inter,'Noto Sans Lao'}.ls .none{color:#94a3b8;background:none;padding:0 4px}
.rg{position:absolute;left:40px;right:40px;top:900px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.rg div{background:rgba(255,255,255,.07);border-radius:14px;padding:10px 16px;display:flex;align-items:center;justify-content:space-between}.rg b{font-size:27px}.rg span{font-size:32px;font-weight:900;font-family:Inter,'Noto Sans Lao'}
.src{position:absolute;right:40px;top:1024px;font-size:19px;color:#94a3b8;text-align:right}`;
// Drawn icons (the render browser may have no colour-emoji font).
const SVG={rain:'<svg viewBox="0 0 48 48" width="1em" height="1em"><path d="M14 30a9 9 0 0 1 1-18 12 12 0 0 1 22 4 7 7 0 0 1 0 14z" fill="#cbd5e1"/><path d="M17 35l-3 7M26 35l-3 7M35 35l-3 7" stroke="#60a5fa" stroke-width="3.5" stroke-linecap="round"/></svg>',
 cloud:'<svg viewBox="0 0 48 48" width="1em" height="1em"><circle cx="17" cy="16" r="8" fill="#fbbf24"/><path d="M16 38a8 8 0 0 1 1-16 11 11 0 0 1 20 4 6 6 0 0 1 0 12z" fill="#cbd5e1"/></svg>',
 sun:'<svg viewBox="0 0 48 48" width="1em" height="1em"><circle cx="24" cy="24" r="10" fill="#fbbf24"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M10 10l4 4M34 34l4 4M38 10l-4 4M14 34l-4 4" stroke="#fbbf24" stroke-width="3.5" stroke-linecap="round"/></svg>',
 heat:'<svg viewBox="0 0 48 48" width="1em" height="1em"><path d="M24 4c3 9 13 13 13 25a13 13 0 0 1-26 0c0-7 4-10 6-15 2 4 4 5 5 5 0-5 0-10 2-15z" fill="#f97316"/><path d="M24 26c2 4 6 5 6 10a6 6 0 0 1-12 0c0-3 2-5 3-7 1 1 2 1 3-3z" fill="#fde047"/></svg>'};
const svgIcon=p=>p>=RAIN_LIKELY?SVG.rain:p>=30?SVG.cloud:SVG.sun;

// Daily card, "TV weather" option 2 (owner's choice 28 Oct 2026, replaces option D): map with a weather
// icon + highest temperature on every province, and a table of all 18 provinces by region with low–high,
// rain in mm and chance of rain. 1080×1080, same navy/blue colours.
const TV_POP=p=>p>=80?'#1d4ed8':p>=60?'#2563eb':p>=40?'#3b82f6':p>=20?'#1e3a5f':'#1e293b';
const TV_ICON={sun:SVG.sun,part:SVG.cloud,rain:SVG.rain,
 storm:'<svg viewBox="0 0 48 48" width="1em" height="1em"><path d="M14 28a9 9 0 0 1 1-18 12 12 0 0 1 22 4 7 7 0 0 1 0 14z" fill="#94a3b8"/><path d="M25 27l-6 10h6l-3 9 9-12h-6l3-7z" fill="#facc15"/><path d="M14 34l-2 5M36 34l-2 5" stroke="#60a5fa" stroke-width="3.5" stroke-linecap="round"/></svg>'};
const tvKind=r=>r.rain>=35?'storm':r.pop>=RAIN_LIKELY&&r.rain>=1?'rain':r.pop>=30?'part':'sun';
const tvMM=r=>r.rain>=0.5?`${r.rain>=10?r0(r.rain):Math.round(r.rain*10)/10} mm`:'—';
// Tag positions moved apart where provinces are small and close (map viewBox units).
const TV_NUDGE={'vientiane':[150,316],'vientiane-capital':[214,392],'xiangkhouang':[288,236],'xaisomboun':[244,320],'luang-namtha':[92,118],'bokeo':[44,204],'oudomxay':[136,186],'savannakhet':[428,482],'salavan':[468,548],'xekong':[552,572],'attapeu':[550,652],'champasak':[466,656]};
const TV_CSS=`*{margin:0;box-sizing:border-box}body{width:1080px;height:1080px;overflow:hidden;background:radial-gradient(circle at 30% 20%,#13233d,#0b1220 70%);color:#fff;font-family:'Noto Sans Lao',Inter,sans-serif;position:relative}.num{font-family:Inter,'Noto Sans Lao';font-weight:800}
.top{position:absolute;left:0;right:0;top:0;height:120px;display:flex;align-items:center;gap:18px;padding:0 40px;background:linear-gradient(90deg,#1d4ed8,#2563eb 55%,rgba(37,99,235,0))}.top i{width:64px;height:64px;border-radius:16px;background:#fff;color:#1d4ed8;display:grid;place-items:center;font-style:normal;font-size:40px;font-weight:900}
.top h1{font-size:44px;font-weight:900;line-height:1.05}.top h1 small{display:block;font-size:26px;font-weight:700;color:#dbeafe}
.foot{position:absolute;left:0;right:0;bottom:0;height:58px;background:#0a101c;border-top:3px solid #2563eb;display:flex;align-items:center;justify-content:space-between;padding:0 40px;font-size:21px;color:#cbd5e1}.foot b{color:#fff}
.tag{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;line-height:1;font-size:32px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.7))}.tag b{font-size:24px}
.leg{position:absolute;left:30px;top:900px;font-size:18px;color:#cbd5e1;display:flex;gap:6px;align-items:center}.leg span{display:inline-block;width:22px;height:14px;border-radius:3px;margin-left:6px}
.tbl{position:absolute;right:30px;top:138px;width:520px}.r{display:grid;grid-template-columns:1fr 32px 92px 74px 54px;align-items:center;gap:8px;height:38px;padding:0 10px;font-size:20px;font-weight:700;border-radius:8px}.r:nth-child(odd){background:rgba(255,255,255,.05)}.r i{font-size:30px;line-height:0}
.r .t{text-align:right}.r .m{text-align:right;color:#93c5fd;font-size:18px}.r .p{text-align:right;color:#cbd5e1;font-size:17px}.r.h{background:none;color:#94a3b8;font-size:15px;height:24px}.r.h span{text-align:right}.r.h span:first-child{text-align:left}.g{font-size:18px;font-weight:900;color:#60a5fa;margin:8px 0 2px 6px}`;
export function dailyCardHTML(rows,label){
 const by=Object.fromEntries(rows.map(r=>[r.slug,r])),[vw,vh]=PROVINCE_VIEW,h=610,s=h/vh,w=r0(vw*s),mx=14,my=170;
 const map=`<svg style="position:absolute;left:${mx}px;top:${my}px" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}">${Object.entries(PROVINCE_PATHS).map(([slug,d])=>`<path d="${d}" fill="${TV_POP(by[slug]?.pop??0)}" stroke="#0b1220" stroke-width="2.2" stroke-linejoin="round"/>`).join('')}</svg>`;
 const tags=Object.entries(PROVINCE_LABELS).map(([slug,pos])=>{const r=by[slug];if(!r)return '';const [lx,ly]=TV_NUDGE[slug]||pos;
  return `<div class="tag" style="left:${mx+r0(lx*s)}px;top:${my+r0(ly*s)}px">${TV_ICON[tvKind(r)]}<b class="num">${r0(r.tmax)}°</b></div>`}).join('');
 const row=r=>`<div class="r"><span>${esc(r.name)}</span><i>${TV_ICON[tvKind(r)]}</i><span class="num t">${r0(r.tmin)}–${r0(r.tmax)}°</span><span class="num m">${tvMM(r)}</span><span class="num p">${r0(r.pop)}%</span></div>`;
 const table=Object.entries(REGIONS).map(([k,list])=>`<div class="g">${REGION_LO[k]}</div>${list.map(slug=>by[slug]).filter(Boolean).map(row).join('')}`).join('');
 return `<!doctype html><html lang="lo"><head><meta charset="utf-8"><style>${CARD_FONTS}${TV_CSS}</style></head><body>
<div class="top"><i style="background:none">${logoSVG()}</i><h1>ພະຍາກອນອາກາດ ${esc(label)}<small>${esc(laoDate(rows[0].date))} · ລາວປອດໄພ</small></h1></div>${map}${tags}
<div class="leg" style="top:868px">ຕົວເລກເທິງແຜນທີ່ = ອຸນຫະພູມສູງສຸດຂອງມື້ (°C)</div><div class="leg">ໂອກາດຝົນ ${[['#1e293b','&lt;20'],['#1e3a5f','20'],['#3b82f6','40'],['#2563eb','60'],['#1d4ed8','80%+']].map(([c,t])=>`<span style="background:${c}"></span>${t}`).join('')}</div>
<div class="tbl"><div class="r h"><span>ແຂວງ</span><span></span><span>ອຸນຫະພູມ</span><span>ຝົນ</span><span>ໂອກາດ</span></div>${table}</div>
<div class="foot"><span><b>ລາວປອດໄພ</b> · ແຜນທີ່ສົດ: lao-weather-watch</span><span>ຂໍ້ມູນ Open-Meteo · ບໍ່ແມ່ນປະກາດທາງການ</span></div></body></html>`;
}
export function weeklyCardHTML(fc){
 const days=[1,2,3,4,5,6,7].map(i=>dayRows(fc,i)).filter(d=>d.length);
 const cell=(d,k)=>{const g=regionSummary(d,k);return `<td><i>${svgIcon(g.maxPop)}</i><b>${g.tmax}°</b><small>${g.maxPop}%</small></td>`};
 return `<!doctype html><html lang="lo"><head><meta charset="utf-8"><style>${CARD_FONTS}${CARD_CSS}
table{position:absolute;left:40px;right:40px;top:300px;width:1000px;border-spacing:8px}th{font-size:24px;color:#cbd5e1;font-weight:800}th.r{text-align:left;font-size:30px;color:#fff;width:150px}td{background:rgba(255,255,255,.07);border-radius:14px;text-align:center;padding:12px 0}td i{display:block;font-style:normal;font-size:40px}td b{display:block;font-size:32px;font-family:Inter}td small{font-size:20px;color:#93c5fd;font-weight:800}</style></head><body>
<div class="lg"><i style="background:none">${logoSVG()}</i>ລາວປອດໄພ</div><div class="hd">ແນວໂນ້ມ 7 ວັນ<small>${esc(laoDate(days[0][0].date,{year:false}))} – ${esc(laoDate(days.at(-1)[0].date))}</small></div>
<table><tr><th></th>${days.map(d=>`<th>${DAY_LO[new Date(d[0].date+'T00:00:00Z').getUTCDay()]}<br>${+d[0].date.slice(8)}</th>`).join('')}</tr>${Object.keys(REGIONS).map(k=>`<tr><th class="r">${REGION_LO[k]}</th>${days.map(d=>cell(d,k)).join('')}</tr>`).join('')}</table>
<div class="leg" style="top:960px">ຕົວເລກ: ອຸນຫະພູມສູງສຸດ · ໂອກາດຝົນສູງສຸດໃນພາກ</div><div class="src">Open-Meteo · ບໍ່ແມ່ນປະກາດທາງການ</div></body></html>`;
}
// Browser Run is 10 minutes a day on the free plan (owner's option A, 30 Oct 2026). A card is shot as soon
// as it is drawn (page loaded and fonts ready) instead of after 500 ms of network silence. The El Niño
// globe still waits for the network, its picture is drawn by script after NASA's map arrives.
export const CARD_READY_JS='<script>(document.fonts?document.fonts.ready:Promise.resolve()).then(function(){document.documentElement.setAttribute("data-card-ready","1")})</script>';
export async function shootCard(env,html,{width=1080,height=1080,quality=88}={}){
 if(!env.BROWSER?.quickAction)return null;
 const network=html.includes('dataset.ready');
 const opts=network?{html,gotoOptions:{waitUntil:'networkidle0',timeout:20000}}
  :{html:html.replace('</body>',CARD_READY_JS+'</body>'),gotoOptions:{waitUntil:'load',timeout:20000},waitForSelector:{selector:'html[data-card-ready]',timeout:10000}};
 try{const r=await env.BROWSER.quickAction('screenshot',{...opts,viewport:{width,height},screenshotOptions:{type:'jpeg',quality}});
  if(!r.ok){await r.body?.cancel();return null}const img=await r.arrayBuffer();return img.byteLength>20000?img:null}catch{return null}
}
export const renderCard=(env,html)=>shootCard(env,html);

// Storage: D1 table fb_posts (created on first use) + the picture in KV for 4 days.
const SCHEMA='CREATE TABLE IF NOT EXISTS fb_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, post_at TEXT NOT NULL, caption TEXT NOT NULL, link TEXT, has_image INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT \'draft\', fb_id TEXT, error TEXT, posted_at TEXT)';
let schemaReady=null;const ensure=db=>schemaReady??=db.prepare(SCHEMA).run().catch(e=>{schemaReady=null;throw e});
export function _resetBot(){schemaReady=null}
const imgKey=key=>'fbpost:'+key,cardKey=key=>'fbcard:'+key;
async function exists(db,key){return !!await db.prepare('SELECT id FROM fb_posts WHERE key=?1').bind(key).first()}
// auto: approved at once, but only with a picture (a failed render waits for the owner).
// card: the card's HTML; when the shot failed it is kept (KV, 20 h) for retryImages.
export async function saveDraft(env,{key,kind,caption,link=null,postAt,image=null,card=null,auto=false},now){
 const db=env.FEEDBACK_DB;await ensure(db);if(await exists(db,key))return false;
 const pic=!!(image&&env.FORECAST_KV);if(pic)await env.FORECAST_KV.put(imgKey(key),image,{expirationTtl:4*86400});
 else if(card&&env.FORECAST_KV)await env.FORECAST_KV.put(cardKey(key),JSON.stringify({html:card,auto}),{expirationTtl:20*3600});
 const r=await db.prepare('INSERT OR IGNORE INTO fb_posts (key,kind,created_at,post_at,caption,link,has_image,status) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)').bind(key,kind,new Date(now).toISOString(),postAt,caption,link,pic?1:0,auto&&pic?'approved':'draft').run();
 return (r.meta?.changes??1)>0;
}
// Builds the scheduled drafts. slot: 'morning' (today) | 'evening' (tomorrow) | 'weekly'.
export async function makeDrafts(env,slot,{now=Date.now(),fetchImpl=fetch,suffix=''}={}){
 const fc=await fetchProvinceForecast(fetchImpl),made=[],auto=!suffix;
 if(slot==='weekly'){const first=dayRows(fc,1)[0].date,key='weekly:'+first+suffix,card=weeklyCardHTML(fc);
  if(await saveDraft(env,{key,kind:'weekly',caption:weeklyCaption(fc,{issuedAt:fc.at}),postAt:laoAt(dayRows(fc,0)[0].date,18),image:await renderCard(env,card),card,auto},now))made.push(key);return made}
 const i=slot==='morning'?0:1,rows=dayRows(fc,i),label=i?'ມື້ອື່ນ':'ມື້ນີ້',postAt=laoAt(dayRows(fc,0)[0].date,i?18:6);
 const card=dailyCardHTML(rows,label),image=await renderCard(env,card),key=`daily:${rows[0].date}:${slot}${suffix}`;
 if(await saveDraft(env,{key,kind:'daily',caption:dailyCaption(rows,{label,issuedAt:fc.at}),postAt,image,card,auto},now))made.push(key);
 for(const a of weatherAlerts(rows,label))if(await saveDraft(env,{...a,key:a.key+suffix,postAt:new Date(now).toISOString(),image,card},now))made.push(a.key+suffix);
 return made;
}
export async function checkEvents(env,{now=Date.now(),storms=async()=>[],riverLevels=async()=>null,stormCard=async()=>null}={}){
 const made=[],db=env.FEEDBACK_DB;await ensure(db);
 for(const s of await storms().catch(()=>[])){const a=stormAlert(s,now);if(!a||await exists(db,a.key))continue;
  if(await saveDraft(env,{...a,postAt:new Date(now).toISOString(),image:await stormCard(s.id).catch(()=>null)},now))made.push(a.key)}
 const levels=await riverLevels().catch(()=>null),a=riverAlert(levels?.stations,now);
 if(a&&await saveDraft(env,{...a,postAt:new Date(now).toISOString()},now))made.push(a.key);
 return made;
}

// El Niño / La Niña posts (worker/enso.mjs): one per monthly NOAA discussion, plus urgent news when NOAA's
// status or the weekly strength level changes. Posted by themselves like the daily forecast when the
// picture rendered (owner's choice 29 Oct 2026). Last status/level kept in KV enso:state.
export async function checkEnso(env,{now=Date.now(),enso=async()=>null,fetchImpl=fetch}={}){
 const d=await enso().catch(()=>null);if(!d)return [];
 const kv=env.FORECAST_KV,prev=kv?await kv.get('enso:state').then(s=>JSON.parse(s||'null')).catch(()=>null):null,{posts,state}=ensoUpdates(d,prev),made=[];
 for(const p of posts){if(await exists(env.FEEDBACK_DB,p.key))continue;
  const card=await ensoCardFor(d,{fonts:CARD_FONTS,headline:p.headline,fetchImpl,now}),image=await renderCard(env,card);
  if(await saveDraft(env,{...p,postAt:new Date(now).toISOString(),image,card,auto:true},now))made.push(p.key)}
 if(kv)await kv.put('enso:state',JSON.stringify(state));
 return made;
}

// Graph API: photo post (picture + text) or link post. Needs FB_PAGE_ID + FB_PAGE_TOKEN secrets.
export const fbConfigured=env=>!!(env.FB_PAGE_ID&&env.FB_PAGE_TOKEN);
export async function postToPage(env,post,image,fetchImpl=fetch){
 if(!fbConfigured(env))return {ok:false,error:'not_configured'};
 let r;
 try{if(image){const fd=new FormData();fd.append('source',new Blob([image],{type:'image/jpeg'}),'post.jpg');fd.append('message',post.caption);fd.append('access_token',env.FB_PAGE_TOKEN);r=await fetchImpl(`${GRAPH}/${encodeURIComponent(env.FB_PAGE_ID)}/photos`,{method:'POST',body:fd,signal:AbortSignal.timeout(30000)})}
  else{const body=new URLSearchParams({message:post.caption,access_token:env.FB_PAGE_TOKEN});if(post.link)body.set('link',post.link);r=await fetchImpl(`${GRAPH}/${encodeURIComponent(env.FB_PAGE_ID)}/feed`,{method:'POST',body,signal:AbortSignal.timeout(30000)})}
  const j=await r.json().catch(()=>({}));if(!r.ok||j.error)return {ok:false,error:String(j.error?.message||'HTTP '+r.status).slice(0,300)};
  return {ok:true,id:String(j.post_id||j.id||'')}}catch(e){return {ok:false,error:String(e?.message||e).slice(0,300)}}
}
async function publish(env,row,fetchImpl,now){
 const image=row.has_image&&env.FORECAST_KV?await env.FORECAST_KV.get(imgKey(row.key),'arrayBuffer'):null;
 const res=await postToPage(env,row,image,fetchImpl),db=env.FEEDBACK_DB;
 if(res.ok)await db.prepare('UPDATE fb_posts SET status=\'posted\',fb_id=?2,posted_at=?3,error=NULL WHERE id=?1').bind(row.id,res.id,new Date(now).toISOString()).run();
 else await db.prepare('UPDATE fb_posts SET status=?2,error=?3 WHERE id=?1').bind(row.id,res.error==='not_configured'?'approved':'failed',res.error).run();
 return res;
}
// Approved posts whose time has come. Drafts nobody approved, and approved posts that could not go out
// (Page not connected), expire DRAFT_HOURS after their time: an old forecast is never posted late.
export async function publishDue(env,{now=Date.now(),fetchImpl=fetch}={}){
 const db=env.FEEDBACK_DB;await ensure(db);const iso=new Date(now).toISOString();
 await db.prepare('UPDATE fb_posts SET status=\'expired\' WHERE status IN (\'draft\',\'approved\') AND post_at<?1').bind(new Date(now-DRAFT_HOURS*3600000).toISOString()).run();
 if(!fbConfigured(env))return [];
 const {results=[]}=await db.prepare('SELECT * FROM fb_posts WHERE status=\'approved\' AND post_at<=?1 ORDER BY post_at LIMIT 3').bind(iso).all();
 const out=[];for(const row of results)out.push(await publish(env,row,fetchImpl,now));return out;
}
// Drafts whose card could not be shot (Browser Run over its 10 minutes, which reset at 07:00 Lao, or down)
// are tried again on later runs, at most two a run, stopping at the first failure. A draft that was meant
// to post by itself is approved once it has its picture.
export async function retryImages(env,{now=Date.now()}={}){
 const kv=env.FORECAST_KV,db=env.FEEDBACK_DB,done=[];if(!kv||!env.BROWSER?.quickAction)return done;
 const {results=[]}=await db.prepare('SELECT id,key FROM fb_posts WHERE has_image=0 AND status IN (\'draft\',\'approved\') AND created_at>?1 ORDER BY id LIMIT 6').bind(new Date(now-20*3600000).toISOString()).all();
 let tried=0;
 for(const row of results){if(tried>=2)break;
  const job=await kv.get(cardKey(row.key),'json').catch(()=>null);if(!job?.html)continue;tried++;
  const image=await renderCard(env,job.html);if(!image)break;
  await kv.put(imgKey(row.key),image,{expirationTtl:4*86400});
  await db.prepare('UPDATE fb_posts SET has_image=1,status=CASE WHEN ?2=1 AND status=\'draft\' THEN \'approved\' ELSE status END WHERE id=?1').bind(row.id,job.auto?1:0).run();
  await kv.delete(cardKey(row.key));done.push(row.key)}
 return done;
}
// Called by the */30 cron. Lao time decides which scheduled drafts are due.
export async function botTick(env,opts={}){
 const now=opts.now??Date.now(),lao=laoNow(now),h=lao.getUTCHours(),first=lao.getUTCMinutes()<30,jobs=[];
 if(!env.FEEDBACK_DB)return jobs;
 if(h===5&&first)jobs.push(makeDrafts(env,'morning',{...opts,now}));
 if(h===17&&first){jobs.push(makeDrafts(env,'evening',{...opts,now}));if(lao.getUTCDay()===0)jobs.push(makeDrafts(env,'weekly',{...opts,now}))}
 if((h===9||h===15)&&first&&opts.enso)jobs.push(ensure(env.FEEDBACK_DB).then(()=>checkEnso(env,{...opts,now})));
 jobs.push(checkEvents(env,{...opts,now}));
 const made=(await Promise.allSettled(jobs)).flatMap(r=>r.status==='fulfilled'?r.value:[]);
 await retryImages(env,{now}).catch(()=>[]);
 const posted=await publishDue(env,{...opts,now});
 return {made,posted};
}

// Owner routes (X-Admin-Key, same key as admin.html):
//  GET  /api/fb/posts            latest 40 posts + whether the Page is connected
//  GET  /api/fb/image/<id>       the post's picture
//  POST /api/fb/posts/<id>       {action:'approve'|'unapprove'|'skip', caption?}
//  POST /api/fb/make             {slot:'morning'|'evening'|'weekly'|'enso'} make a draft now (preview/test)
export async function fbAdminRoute(request,env,{isAdmin,now=Date.now(),fetchImpl=fetch,ctx,enso=async()=>null}={}){
 if(!isAdmin(request))return json({error:'unauthorized'},401);
 const db=env.FEEDBACK_DB;if(!db)return json({error:'unavailable'},503);await ensure(db);
 const path=new URL(request.url).pathname;
 if(path==='/api/fb/posts'&&request.method==='GET'){
  const {results=[]}=await db.prepare('SELECT id,key,kind,created_at,post_at,caption,link,has_image,status,fb_id,error,posted_at FROM fb_posts ORDER BY id DESC LIMIT 40').all();
  return json({configured:fbConfigured(env),pageId:env.FB_PAGE_ID||null,posts:results})}
 const img=path.match(/^\/api\/fb\/image\/(\d+)$/);
 if(img&&request.method==='GET'){const row=await db.prepare('SELECT key FROM fb_posts WHERE id=?1').bind(+img[1]).first();const buf=row&&env.FORECAST_KV?await env.FORECAST_KV.get(imgKey(row.key),'arrayBuffer'):null;
  return buf?new Response(buf,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=600'}}):json({error:'not_found'},404)}
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'forbidden'},403);
 const text=await request.text();if(text.length>12000)return json({error:'too_large'},413);let body;try{body=JSON.parse(text||'{}')}catch{return json({error:'invalid'},400)}
 if(path==='/api/fb/make'&&body.slot==='enso'){const d=await enso().catch(()=>null);if(!d)return json({error:'enso_unavailable'},502);
  const key='enso:manual'+now,card=await ensoCardFor(d,{fonts:CARD_FONTS,fetchImpl,now});
  return json({made:await saveDraft(env,{key,kind:'enso',caption:ensoCaption(d),link:SITE+'/elnino',postAt:new Date(now).toISOString(),image:await renderCard(env,card),card},now)?[key]:[]})}
 if(path==='/api/fb/make'){if(!['morning','evening','weekly'].includes(body.slot))return json({error:'invalid'},400);
  try{return json({made:await makeDrafts(env,body.slot,{now,fetchImpl,suffix:':manual'+now})})}catch(e){return json({error:String(e.message||e)},502)}}
 const one=path.match(/^\/api\/fb\/posts\/(\d+)$/);if(!one)return json({error:'not_found'},404);
 const row=await db.prepare('SELECT * FROM fb_posts WHERE id=?1').bind(+one[1]).first();if(!row)return json({error:'not_found'},404);
 if(row.status==='posted')return json({error:'already_posted'},409);
 const caption=typeof body.caption==='string'?body.caption.replace(/\r\n/g,'\n').trim().slice(0,5000):row.caption;if(caption.length<10)return json({error:'caption_too_short'},400);
 if(body.action==='skip'||body.action==='unapprove'){await db.prepare('UPDATE fb_posts SET status=?2,caption=?3 WHERE id=?1').bind(row.id,body.action==='skip'?'skipped':'draft',caption).run();return json({ok:true})}
 if(body.action!=='approve')return json({error:'invalid'},400);
 await db.prepare('UPDATE fb_posts SET status=\'approved\',caption=?2,error=NULL WHERE id=?1').bind(row.id,caption).run();
 // Approved after its time: post now instead of waiting for the next cron run.
 if(Date.parse(row.post_at)<=now&&fbConfigured(env)){const res=await publish(env,{...row,caption},fetchImpl,now);return json({ok:res.ok,posted:res.ok,id:res.id,error:res.error})}
 return json({ok:true,posted:false,configured:fbConfigured(env),postAt:row.post_at});
}
