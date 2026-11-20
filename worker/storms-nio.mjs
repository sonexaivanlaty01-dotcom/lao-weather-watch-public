// Bay of Bengal / Arabian Sea storms (North Indian Ocean, 27 Oct 2026). JMA only covers the western
// Pacific and the South China Sea, so a cyclone moving into Myanmar never reached the page.
// The official WMO centre for this sea is IMD (RSMC New Delhi), but IMD publishes bulletins as PDF
// only. JTWC (US Navy) publishes the same storms as machine-readable warning text (.tcw), so positions
// and winds come from JTWC and every view says so. JTWC winds are 1-minute averages (JMA: 10-minute,
// IMD: 3-minute): the same storm reads stronger here than in IMD's bulletin.
// Output has the same shape as storms.mjs parseStorm(), so distance, level and display are shared.
import {laoBorderKm,stormLevel} from './storms.mjs';
export const JTWC='https://www.metoc.navy.mil/jtwc/';
const KT=1.852,ms=kt=>Math.round(kt*0.514444),nm=v=>Math.round(v*KT);
// Categories by JTWC 1-minute wind (knots), with IMD-style names (Lao names in the page).
export const nioCategory=kt=>kt>=64?'SCS':kt>=34?'CS':'TD';
const coord=(v,h)=>{const n=Number(v)/10;return /[SW]/.test(h)?-n:n};
// T000 159N 0872E 080 R064 015 NE QD ... R050 ... R034 ...
function radiiOf(line,kt){const m=new RegExp('R0?'+kt+'((?:\\s+\\d{3}\\s+[NESW]{2}\\s+QD){1,4})').exec(line);if(!m)return null;const v=[...m[1].matchAll(/(\d{3})\s+[NESW]{2}/g)].map(x=>+x[1]).filter(x=>x>0);return v.length?{max:nm(Math.max(...v)),min:nm(Math.min(...v))}:null}
export function parseTcw(text,id){
 const lines=String(text||'').replace(/\r/g,'').split('\n');
 const head=lines.find(l=>/^\d{10}\s+\d{2}[A-Z]\s+\S+/.test(l.trim()));if(!head)return null;
 const [base,number,name,,,course,speed]=head.trim().split(/\s+/);
 const t0=Date.UTC(+base.slice(0,4),+base.slice(4,6)-1,+base.slice(6,8),+base.slice(8,10));if(!Number.isFinite(t0))return null;
 // Gusts are only in the plain-text part, in the same order as the T lines.
 const gusts=[...String(text).matchAll(/MAX SUSTAINED WINDS - (\d{3}) KT, GUSTS (\d{3}) KT/g)].map(m=>+m[2]);
 const points=[];let first=null;
 for(const l of lines){const m=/^T(\d{3})\s+(\d{2,3})([NS])\s+(\d{3,4})([EW])\s+(\d{3})/.exec(l.trim());if(!m)continue;
  const h=+m[1],lat=coord(m[2],m[3]),lon=coord(m[4],m[5]),kt=+m[6],i=points.length;
  if(Math.abs(lat)>60||Math.abs(lon)>180)continue;
  points.push({h,t:new Date(t0+h*3600000).toISOString(),lat,lon,r:0,p:null,w:ms(kt),g:gusts[i]?ms(gusts[i]):null,cat:nioCategory(kt),laoKm:laoBorderKm([lon,lat])});
  if(h===0)first=l}
 if(!points.length)return null;points.sort((a,b)=>a.h-b.h);
 const c=Number(course),sp=Number(speed);if(Number.isFinite(c)&&c>=0&&c<=360)points[0].course=c;if(Number.isFinite(sp))points[0].kmh=Math.round(sp*KT);
 // Stamp is YYMMDDHHMMSS ("261028031126" = 2026-10-28 03:11:26Z).
 const issued=/WARNING\s+\S+\s+\S+\s+\S+\s+\S+\s+(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(text||'');
 const nice=name&&!/^(INVEST|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)$/.test(name)?name[0]+name.slice(1).toLowerCase():null;
 return {id,number,name:nice,category:points[0].cat,issued:issued?`20${issued[1]}-${issued[2]}-${issued[3]}T${issued[4]}:${issued[5]}:${issued[6]}Z`:new Date(t0).toISOString(),
  agency:'JTWC',basin:'NIO',windAvgMin:1,radiiKmh:{gale:63,storm:93},
  past:[],points,wind:{gale:first?radiiOf(first,34):null,storm:first?radiiOf(first,50):null},...stormLevel(points)};
}
// Active North Indian Ocean warnings listed in JTWC's feed (io0226.tcw = storm 02, 2026).
export function nioIds(rss){return [...new Set([...String(rss||'').matchAll(/products\/(io\d{4})\.tcw/gi)].map(m=>m[1].toUpperCase()))].slice(0,3)}
const get=async(url,fetchImpl)=>{const r=await fetchImpl(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Mozilla/5.0 (lao-weather-watch community site)'}});if(!r.ok)throw new Error('jtwc '+r.status);return r.text()};
// JTWC warns every 6 h. The feed can keep listing a storm after warnings stop (Arnab over land,
// 28 Oct 2026), so a warning position older than two missed warnings is dropped, not shown as current.
export const NIO_STALE_MS=12*3600000;
export async function downloadNioStorms(fetchImpl=fetch,now=Date.now()){
 const ids=nioIds(await get(JTWC+'rss/jtwc.rss',fetchImpl));
 return (await Promise.all(ids.map(async id=>{try{return parseTcw(await get(JTWC+'products/'+id.toLowerCase()+'.tcw',fetchImpl),id)}catch{return null}})))
  .filter(s=>s&&now-Date.parse(s.points[0].t)<=NIO_STALE_MS);
}
