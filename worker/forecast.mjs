import {FORECAST_GRID,forecastPoints} from '../dist/forecast-data.js';
import {readOptionalCache,writeOptionalCache} from './optional-cache.mjs';
// One download = 529 points = 529 Open-Meteo calls. GFS runs every 6 hours, so the grid
// is downloaded again only when Open-Meteo's model metadata shows a newerForecast run (≈4×/day
// instead of every 2 hours). The metadata file is static and not a forecast call.
// GFS precipitation in /v1/gfs comes from the 0.11° product (ncep_gfs013).
export const GFS_META_URL='https://api.open-meteo.com/data/ncep_gfs013/static/meta.json';
export const GFS_META_CHECK_MS=10*60000,FORECAST_FALLBACK_TTL=2*3600000,FORECAST_MAX_AGE=8*3600000,FORECAST_STORE_CHECK_MS=5*60000,FORECAST_HOURS=24;
// 24 hours from download: a grid kept up to 8 hours (until the next GFS run) still covers the
// 12 hours the map shows. Open-Meteo counts calls per location, not per hour, so this costs the same.
let forecastCached=null,forecastPending=null,forecastRetryAfter=0,knownRun=null,metaCheckedAt=0,storeCheckedAt=0;
export function parseForecastRows(rows,fetchedAt=Date.now(),run=null){
 const points=forecastPoints();if(!Array.isArray(rows)||rows.length!==points.length)throw new Error('invalid_grid');
 const times=rows[0]?.hourly?.time;if(!Array.isArray(times)||times.length<6||times.some((t,i)=>!Number.isFinite(t)||(i&&t-times[i-1]!==3600)))throw new Error('invalid_times');
 let missing=0;
 const cells=rows.map((row,i)=>{if(row.hourly_units?.precipitation!=='mm'||JSON.stringify(row.hourly?.time)!==JSON.stringify(times))throw new Error('invalid_units_or_times');const values=times.map((_,j)=>{const v=row.hourly.precipitation?.[j];if(!Number.isFinite(v)||v<0){missing++;return null}return v});return [...points[i],values]});
 if(missing===points.length*times.length)throw new Error('no_forecast');
 return {model:'NOAA GFS via Open-Meteo',kind:'model_forecast',source:'https://open-meteo.com/en/docs/gfs-api',fetchedAt,run,grid:FORECAST_GRID,times,cells,missingValues:missing,units:'mm per preceding hour',samplingKm:55};
}
// Latest GFS run known to Open-Meteo: {init, available} in ms, or null if the metadata
// cannot be read (then a 2-hour schedule is used instead).
export async function latestRun(now=Date.now(),force=false){
 if(!force&&now-metaCheckedAt<GFS_META_CHECK_MS)return knownRun;metaCheckedAt=now;
 try{const r=await fetch(GFS_META_URL,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error('meta');const m=await r.json(),init=m.last_run_initialisation_time*1000,available=m.last_run_availability_time*1000;if(!Number.isFinite(init)||!Number.isFinite(available))throw new Error('meta');knownRun={init,available}}catch{/* Keep the last known run. */}
 return knownRun;
}
export function forecastStale(data,run,now=Date.now()){
 if(!data||!Number.isFinite(data.fetchedAt)||now-data.fetchedAt>=FORECAST_MAX_AGE)return true;
 return run?(data.run?.init??0)<run.init:now-data.fetchedAt>=FORECAST_FALLBACK_TTL;
}
async function downloadForecast(run){
 const points=forecastPoints(),params=new URLSearchParams({latitude:points.map(p=>p[1]).join(','),longitude:points.map(p=>p[0]).join(','),hourly:'precipitation',forecast_hours:String(FORECAST_HOURS),timezone:'GMT',timeformat:'unixtime'});
 const r=await fetch('https://api.open-meteo.com/v1/gfs?'+params,{signal:AbortSignal.timeout(25000),headers:{'Cache-Control':'no-cache'}});if(!r.ok)throw new Error('upstream');return parseForecastRows(await r.json(),Date.now(),run);
}
const newerForecast=(a,b)=>!b||(a&&a.fetchedAt>b.fetchedAt)?a:b;
// Shared store (Cloudflare KV): every data centre reads the same grid. A scheduled job
// (refreshForecastStore) is the only regular writer; requests download only when the
// store has nothing usable.
export async function refreshForecastStore(store,now=Date.now()){
 const [data,run]=await Promise.all([store.get().catch(()=>null),latestRun(now,true)]);
 if(!forecastStale(data,run,now)){forecastCached=newerForecast(data,forecastCached);return 'current'}
 const fresh=await downloadForecast(run);await store.put(fresh);forecastCached=fresh;return 'updated';
}
export async function forecastRoute(request,ctx={},{store=null}={}){
 if(!['GET','HEAD'].includes(request.method))return Response.json({error:'method_not_allowed'},{status:405});
 if(!request.headers.get('oai-authenticated-user-id'))return Response.json({error:'sign_in_required'},{status:401});
 const key=new Request(new URL('/api/forecast/gfs-grid-v2',request.url)),now=Date.now();
 try{
  if(!forecastCached&&!store){const hit=await readOptionalCache(key);if(hit){try{forecastCached=await hit.json()}catch{/* Ignore invalid cached data and fetch the model. */}}}
  if(store&&now-storeCheckedAt>=FORECAST_STORE_CHECK_MS){storeCheckedAt=now;forecastCached=newerForecast(await store.get().catch(()=>null),forecastCached)}
  const run=store?null:await latestRun(now);
  // With a store, the scheduled job handles new runs; a request fetches only when nothing usable exists.
  const stale=store?!forecastCached||now-forecastCached.fetchedAt>=FORECAST_MAX_AGE:forecastStale(forecastCached,run,now);
  if(stale){
   if(now<forecastRetryAfter){if(!forecastCached||now-forecastCached.fetchedAt>=FORECAST_MAX_AGE)throw new Error('backoff')}
   else{
    if(!forecastPending)forecastPending=(store?latestRun(now):Promise.resolve(run)).then(downloadForecast).then(data=>{forecastCached=data;forecastRetryAfter=0;if(store)return Promise.resolve(store.put(data)).catch(()=>{}).then(()=>data);writeOptionalCache(key,Response.json(data,{headers:{'Cache-Control':'public,max-age=28800'}}),ctx);return data}).catch(error=>{forecastRetryAfter=Date.now()+60000;throw error}).finally(()=>forecastPending=null);
    // A newerForecast run failing to download keeps the previous grid (with its own run time) while it is under 8 hours old.
    try{await forecastPending}catch(error){if(!forecastCached||now-forecastCached.fetchedAt>=FORECAST_MAX_AGE)throw error}
   }
  }
  const headers={'Cache-Control':'private,max-age=60','X-Content-Type-Options':'nosniff'};
  return request.method==='HEAD'?new Response(null,{headers}):Response.json({...forecastCached,checkedAt:now},{headers});
 }catch{return Response.json({error:'forecast_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
