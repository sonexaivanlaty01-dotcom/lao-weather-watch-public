// Measured rainfall from MRC near-real-time telemetry (rain gauges, 15-minute data).
// Fixed upstream; callers cannot choose a destination. Each station's own reported
// 1/6/24-hour totals are passed through; nothing is interpolated or estimated here.
import {readOptionalCache,writeOptionalCache} from './optional-cache.mjs';
export const MRC_TELEMETRY='https://api.mrcmekong.org/api/v1/time-series/telemetry/recent';
// Laos plus the neighbouring Mekong stations whose rain matters for Lao rivers.
export const MRC_REGION={west:99.8,east:108,south:13.5,north:22.6};
// One list request plus at most 45 station requests stays inside Workers Free limits.
export const MRC_MAX_STATIONS=45;
const MRC_TTL=10*60000,MRC_WAIT_MS=25000,MRC_STUCK_MS=180000;let mrcCached=null,mrcPending=null,mrcPendingAt=0,mrcRetryAfter=0;
export function _resetRainStations(){mrcCached=null;mrcPending=null;mrcPendingAt=0;mrcRetryAfter=0}
// MRC reports Indochina Time (UTC+7) without an offset.
export function mrcTime(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s))return null;const t=Date.parse(s+'+07:00');return Number.isFinite(t)?t:null}
const mrcMM=v=>Number.isFinite(v)&&v>=0&&v<1000?Math.round(v*10)/10:null;
export function mrcCandidates(list){
 if(!Array.isArray(list))throw new Error('invalid_list');const g=MRC_REGION;
 return list.filter(s=>s&&s.rainfallSensor&&s.showOnWebsite!==false&&/^\d{6}$/.test(s.stationId||'')&&s.longitude>=g.west&&s.longitude<=g.east&&s.latitude>=g.south&&s.latitude<=g.north).slice(0,MRC_MAX_STATIONS);
}
export function mrcStation(detail,now=Date.now()){
 const time=mrcTime(detail?.lastMeasurement);if(time===null||!/^\d{6}$/.test(detail.stationId||'')||!Number.isFinite(detail.latitude)||!Number.isFinite(detail.longitude))return null;
 return {id:detail.stationId,name:String(detail.name||'').slice(0,60),country:String(detail.country||'').slice(0,30),river:String(detail.river||'').slice(0,40),lat:detail.latitude,lon:detail.longitude,time:new Date(time).toISOString(),rain1h:mrcMM(detail.rainFall1H),rain6h:mrcMM(detail.rainFall6H),rain24h:mrcMM(detail.rainFall24H),stale:now-time>3*3600000};
}
async function mrcJSON(url){const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});if(!r.ok)throw new Error('upstream');return r.json()}
async function downloadRainStations(){
 const candidates=mrcCandidates(await mrcJSON(MRC_TELEMETRY+'/stations')),now=Date.now(),stations=[];let cursor=0;
 await Promise.all(Array.from({length:6},async()=>{while(cursor<candidates.length){const s=candidates[cursor++];try{const station=mrcStation(await mrcJSON(MRC_TELEMETRY+'/station/'+s.stationId),now);if(station)stations.push(station)}catch{/* One silent station must not hide the others. */}}}));
 if(!stations.length)throw new Error('no_stations');
 return {kind:'rain_gauge',source:'MRC near-real-time hydrometeorological monitoring',page:'https://monitoring.mrcmekong.org/',fetchedAt:now,stations:stations.sort((a,b)=>a.id.localeCompare(b.id))};
}
export async function rainStationsRoute(request,ctx={}){
 if(!['GET','HEAD'].includes(request.method))return Response.json({error:'method_not_allowed'},{status:405});
 if(!request.headers.get('oai-authenticated-user-id'))return Response.json({error:'sign_in_required'},{status:401});
 const key=new Request(new URL('/api/rain/mrc-stations-v1',request.url)),now=Date.now();
 try{
  if(!mrcCached){const hit=await readOptionalCache(key);if(hit){try{const data=await hit.json();if(now-data.fetchedAt<MRC_TTL)mrcCached=data}catch{/* Ignore invalid cached data. */}}}
  if(!mrcCached||now-mrcCached.fetchedAt>=MRC_TTL){
   if(now<mrcRetryAfter){if(!mrcCached)throw new Error('backoff')}
   else{
    // Same rules as river-levels.mjs (25 Oct 2026: this route hung > 45 s while a refresh was stuck).
    // A stuck download that finishes late must not clear the newer one that replaced it.
    if(!mrcPending||now-mrcPendingAt>MRC_STUCK_MS){mrcPendingAt=now;const p=downloadRainStations().then(data=>{mrcCached=data;mrcRetryAfter=0;writeOptionalCache(key,Response.json(data,{headers:{'Cache-Control':'public,max-age=600'}}),ctx);return data}).catch(error=>{mrcRetryAfter=Date.now()+120000;throw error}).finally(()=>{if(mrcPending===p)mrcPending=null});mrcPending=p;
     ctx.waitUntil?.(mrcPending.catch(()=>{}))}
    // The last good list (marked by its own fetch time) is served at once while the refresh runs in the
    // background. Without data, wait at most 25 s: a download started by another request may never settle here.
    if(!mrcCached){let timer;try{await Promise.race([mrcPending,new Promise((_,no)=>timer=setTimeout(()=>no(new Error('slow')),MRC_WAIT_MS))])}finally{clearTimeout(timer)}}
   }
  }
  const headers={'Cache-Control':'private,max-age=60','X-Content-Type-Options':'nosniff'};
  return request.method==='HEAD'?new Response(null,{headers}):Response.json({...mrcCached,checkedAt:now},{headers});
 }catch{return Response.json({error:'rain_stations_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
