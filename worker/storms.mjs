// Tropical cyclones near Laos: JMA (RSMC Tokyo, the WMO centre for this region) bosai JSON.
// GET /api/storms → every active storm with its past track, official forecast points (centre,
// 70 % probability circle, pressure, wind), the gale/storm wind radii now, and the distance from
// each point to the nearest point of the Lao border. Nothing is estimated here: values are JMA's.
// Cached 10 minutes (JMA updates every 3–6 h; the page also shows each bulletin's issue time).
import {readOptionalCache,writeOptionalCache} from './optional-cache.mjs';
import {LAO_BORDER} from './lao-border.mjs';
export const STORMS_TTL=10*60000,STORM_NEAR_KM=500,STORM_WATCH_KM=1000;
const JMA='https://www.jma.go.jp/bosai/typhoon/data/';
const hav=([a,b],[c,d])=>{const r=Math.PI/180,x=Math.sin((d-b)*r/2)**2+Math.cos(b*r)*Math.cos(d*r)*Math.sin((c-a)*r/2)**2;return 2*6371*Math.asin(Math.sqrt(x))};
export const laoBorderKm=([lon,lat])=>Math.round(Math.min(...LAO_BORDER.map(p=>hav([lon,lat],p))));
// JMA gives the heading as a Japanese 16-point compass word; stored as degrees (0 = north).
export const COURSE={'北':0,'北北東':22.5,'北東':45,'東北東':67.5,'東':90,'東南東':112.5,'南東':135,'南南東':157.5,'南':180,'南南西':202.5,'南西':225,'西南西':247.5,'西':270,'西北西':292.5,'北西':315,'北北西':337.5};
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const radii=list=>{const km=(Array.isArray(list)?list:[]).map(x=>num(x?.range?.km)).filter(v=>v!==null);return km.length?{max:Math.max(...km),min:Math.min(...km)}:null};
// One storm from JMA's two files.
export function parseStorm(id,spec,fc){
 if(!Array.isArray(spec)||!Array.isArray(fc))return null;
 const title=spec.find(x=>x.part==='title')||{},bySpec=new Map(spec.filter(x=>Number.isFinite(x.advancedHours)).map(x=>[x.advancedHours,x]));
 const points=[];
 for(const f of fc){if(!Array.isArray(f.center)||!Number.isFinite(f.advancedHours))continue;const s=bySpec.get(f.advancedHours)||{},lat=num(f.center[0]),lon=num(f.center[1]);if(lat===null||lon===null)continue;
  points.push({h:f.advancedHours,t:f.validtime?.UTC||s.validtime?.UTC||null,lat,lon,r:Math.round(num(f.probabilityCircle?.radius)||0),p:num(s.pressure),w:num(s.maximumWind?.sustained?.['m/s']),g:num(s.maximumWind?.gust?.['m/s']),
   course:COURSE[s.course]??(s.course?null:undefined),kmh:num(s.speed?.['km/h']),slow:/ゆっくり|停滞/.test(s.speed?.['km/h']||s.course||'')||undefined,cat:s.category?.en||null,laoKm:laoBorderKm([lon,lat])})}
 if(!points.length)return null;points.sort((a,b)=>a.h-b.h);
 const tr=fc.find(f=>f.track)?.track||{},past=[...(tr.preTyphoon||[]),...(tr.typhoon||[]),...(tr.tropicalStorm||[])].filter(p=>Array.isArray(p)&&p.length>=2).map(([la,lo])=>[lo,la]);
 const now=bySpec.get(0)||{};
 return {id,number:title.typhoonNumber||null,name:title.name?.en||null,category:title.category?.en||now.category?.en||null,issued:title.issue?.UTC||null,
  agency:'JMA',basin:'WNP',windAvgMin:10,radiiKmh:{gale:54,storm:90},
  past,points,wind:{gale:radii(now.galeWarning),storm:radii(now.stormWarning)},...stormLevel(points)};
}
// Same rule for every agency: near = a point within 72 h is ≤ 500 km from the border; watch = any point ≤ 1,000 km.
export function stormLevel(points){
 const soon=points.filter(p=>p.h<=72),near=soon.length?Math.min(...soon.map(p=>p.laoKm)):Infinity,closest=points.reduce((a,b)=>b.laoKm<a.laoKm?b:a);
 return {closest:{h:closest.h,km:closest.laoKm},level:near<=STORM_NEAR_KM?'near':Math.min(...points.map(p=>p.laoKm))<=STORM_WATCH_KM?'watch':'far'};
}
async function getJSON(url,fetchImpl){const r=await fetchImpl(url,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});if(!r.ok)throw new Error('jma '+r.status);return r.json()}
async function downloadJmaStorms(fetchImpl){
 const list=await getJSON(JMA+'targetTc.json',fetchImpl),ids=(Array.isArray(list)?list:[list]).map(x=>x?.tropicalCyclone).filter(id=>/^TC\d{4}$/.test(id||''));
 return (await Promise.all(ids.slice(0,6).map(async id=>{try{const [spec,fc]=await Promise.all([getJSON(JMA+id+'/specifications.json',fetchImpl),getJSON(JMA+id+'/forecast.json',fetchImpl)]);return parseStorm(id,spec,fc)}catch{return null}}))).filter(Boolean);
}
// Both sides of Laos: JMA (Pacific / South China Sea) and JTWC (Bay of Bengal / Arabian Sea, worker/storms-nio.mjs).
// One source failing never hides the other; only both failing is an error.
export async function downloadStorms(fetchImpl=fetch,now=Date.now()){
 const {downloadNioStorms}=await import('./storms-nio.mjs');
 const [jma,nio]=await Promise.allSettled([downloadJmaStorms(fetchImpl),downloadNioStorms(fetchImpl,now)]);
 if(jma.status==='rejected'&&nio.status==='rejected')throw jma.reason;
 return {kind:'storms',source:'JMA RSMC Tokyo – Typhoon Center (www.jma.go.jp/bosai/map.html#contents=typhoon) · JTWC (www.metoc.navy.mil/jtwc) for the North Indian Ocean',
  fetchedAt:new Date(now).toISOString(),sources:{JMA:jma.status==='fulfilled',JTWC:nio.status==='fulfilled'},storms:[...(jma.value||[]),...(nio.value||[])]};
}
let cached=null,pending=null;
export function _resetStorms(){cached=null;pending=null}
export async function stormsRoute(request,ctx={},{fetchImpl=fetch,now=Date.now()}={}){
 if(!['GET','HEAD'].includes(request.method))return Response.json({error:'method_not_allowed'},{status:405});
 const headers={'Cache-Control':'public,max-age=300','X-Content-Type-Options':'nosniff'},key=new Request(new URL('/api/storms-v1',request.url));
 try{
  if(!cached){const hit=await readOptionalCache(key);if(hit){try{const d=await hit.json();if(now-Date.parse(d.fetchedAt)<STORMS_TTL)cached=d}catch{/* ignore */}}}
  if(!cached||now-Date.parse(cached.fetchedAt)>=STORMS_TTL){
   pending??=downloadStorms(fetchImpl,now).then(d=>{cached=d;writeOptionalCache(key,Response.json(d,{headers:{'Cache-Control':'public,max-age=600'}}),ctx);return d}).finally(()=>pending=null);
   try{await pending}catch(e){if(!cached)throw e}
  }
  return request.method==='HEAD'?new Response(null,{headers}):Response.json(cached,{headers});
 }catch{return Response.json({error:'storms_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
