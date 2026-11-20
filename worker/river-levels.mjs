// River water levels at MRC telemetry stations in Laos (15-minute data), with simple,
// transparent alert rules: at/above the station's alarm or flood level, or a fast rise.
// A fast rise downstream of dams can mean a release or heavy rain upstream; the route
// never claims which. Fixed upstream; callers cannot choose a destination.
import {readOptionalCache,writeOptionalCache} from './optional-cache.mjs';
import {readSnapshot,saveSnapshot} from './snapshot-store.mjs';
const LEVELS_API='https://api.mrcmekong.org/api/v1/time-series/telemetry/recent';
export const RISE_6H=.5,RISE_24H=1,RISE_NEAR_HIGH=.15,LEVELS_MAX_STATIONS=26;
const LEVELS_TTL=30*60000,LEVELS_WAIT_MS=25000,LEVELS_STUCK_MS=180000;let levelsCached=null,levelsPending=null,levelsPendingAt=0,levelsRetryAfter=0;
const finite=v=>Number.isFinite(v)?v:null;
// Median of the readings within ±window of a time: one-off sensor spikes (seen at some
// stations, e.g. 8 m → 11.9 m → 8 m within an hour) cannot trigger an alert. Needs at
// least 2 readings; no interpolation across gaps.
function levelAt(series,t,window=35*60000){const near=series.filter(p=>Math.abs(p.t-t)<=window).map(p=>p.w).sort((a,b)=>a-b);if(near.length<2)return null;const m=near.length>>1;return {t,w:near.length%2?near[m]:(near[m-1]+near[m])/2}}
export function riverStatus(station,measurements,now=Date.now()){
 // Readings at or below 0 m are sensor dropouts (seen: Se Bangfai sat at -0.01 m for 14 h,
 // which made the return to 11 m look like an 11 m rise). They are treated as missing.
 const series=(measurements||[]).map(m=>({t:Date.parse(m.d),w:finite(m.w)})).filter(p=>Number.isFinite(p.t)&&p.w!==null&&p.w>0&&p.t<=now+600000&&p.t>=now-30*3600000).sort((a,b)=>a.t-b.t);
 if(!series.length)return null;const latest=series.at(-1).t,last=levelAt(series,latest-15*60000,45*60000);if(!last)return null;last.t=latest;
 const ago6=levelAt(series,latest-6*3600000),ago24=levelAt(series,latest-24*3600000);
 const rise6=ago6?last.w-ago6.w:null,rise24=ago24?last.w-ago24.w:null,alarm=finite(station.alarmStage),flood=finite(station.floodStage);
 // "Rising" only while the river is at (or within 15 cm of) its highest level of the last
 // 24 h: a recovery after a dip (e.g. daily dam operation below Xayaburi) or a river that
 // has already peaked and is falling is not a rising-water alert.
 let high=-Infinity;for(let h=1;h<=24;h++){const p=levelAt(series,latest-h*3600000);if(p)high=Math.max(high,p.w)}
 const nearHigh=last.w>=high-RISE_NEAR_HIGH;
 const level=flood!==null&&last.w>=flood?'flood':alarm!==null&&last.w>=alarm?'alarm':nearHigh&&((rise6!==null&&rise6>=RISE_6H)||(rise24!==null&&rise24>=RISE_24H))?'rising':'normal';
 const hourly=[];for(let h=24;h>=0;h--){const p=levelAt(series,latest-h*3600000);hourly.push(p?Math.round(p.w*100)/100:null)}
 return {id:station.stationId,name:String(station.name||'').slice(0,60),river:String(station.river||'').slice(0,40),lat:station.latitude,lon:station.longitude,time:new Date(last.t).toISOString(),level:Math.round(last.w*1000)/1000,rise6:rise6===null?null:Math.round(rise6*100)/100,rise24:rise24===null?null:Math.round(rise24*100)/100,alarm,flood,status:level,stale:now-last.t>3*3600000,hourly};
}
// Season history from the MRC Flood Forecasting site (ffw.mrcmekong.org, wet season
// 1 Jun – 31 Oct): for each date the historical Max/Min/AVG and the 07:00 reading of
// this year, at the six Mekong stations in Laos. Its gauge readings match the telemetry
// (checked 10 Oct 2026: within 0.25 m); each day the two are compared again and the
// history is shown only if they agree within 0.3 m. Refreshed every 12 hours.
export const HISTORY_STATIONS={'011201':'LUA','011901':'VIE','012703':'PAK','013102':'THA','013401':'SAV','013901':'PKS'},HISTORY_MATCH_M=.3;
// The site answers 403 without a User-Agent (Workers send none), so the site names itself.
export const HISTORY_AGENT='LaoWeatherWatch/1.0 (non-profit community map; +https://lao-weather-watch.sonexaivanlaty01.workers.dev)';
const HISTORY_URL='https://ffw.mrcmekong.org/fetchwet_st.php?StCode=',HISTORY_TTL=12*3600000;let historyCached=null,historyRetryAfter=0;
// Max/Min/AVG are MRC's statistics for that calendar day; the page does not state their period.
// The page returns a JavaScript array (unquoted keys, trailing commas), not strict JSON.
export function parseSeasonHistory(text){const rows=JSON.parse(String(text).trim().replace(/([{,]\s*)([A-Za-z_]\w*|\d{4})\s*:/g,'$1"$2":').replace(/,\s*([\]}])/g,'$1'));if(!Array.isArray(rows))throw new Error('history');return rows}
const positive=v=>Number.isFinite(v)&&v>0?v:null;
export function historyFor(rows,date,year=date.slice(0,4)){
 const row=rows.find(r=>r.date_gmt===date);if(!row)return null;
 return {date,avg:positive(row.AVG),max:positive(row.Max),min:positive(row.Min),observed:positive(row[year])};
}
// Telemetry level at 07:00 Laos time (00:00 UTC) of that date, from the hourly series.
export function attachHistory(st,h){
 if(!h||h.avg===null)return st;const target=Date.parse(h.date+'T00:00:00Z'),k=Math.round((Date.parse(st.time)-target)/3600000),value=st.hourly?.[24-k];
 const offset=Number.isFinite(value)&&h.observed!==null?Math.round((value-h.observed)*100)/100:null;
 return {...st,history:{...h,offset,comparable:offset!==null&&Math.abs(offset)<=HISTORY_MATCH_M}};
}
async function seasonHistory(now){
 if(historyCached&&now-historyCached.at<HISTORY_TTL)return historyCached.byId;if(now<historyRetryAfter)return historyCached?.byId||{};
 const date=new Date(now+7*3600000).toISOString().slice(0,10),byId={};
 for(const [id,code] of Object.entries(HISTORY_STATIONS)){try{const r=await fetch(HISTORY_URL+code,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{'User-Agent':HISTORY_AGENT}});if(!r.ok)continue;const h=historyFor(parseSeasonHistory(await r.text()),date);if(h)byId[id]=h}catch{/* History is optional. */}}
 if(Object.keys(byId).length)historyCached={at:now,byId};else historyRetryAfter=now+30*60000;
 return byId;
}
async function levelsJSON(url){const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}});if(!r.ok)throw new Error('upstream');return r.json()}
async function downloadLevels(){
 const list=await levelsJSON(LEVELS_API+'/stations');if(!Array.isArray(list))throw new Error('invalid_list');
 const candidates=list.filter(s=>s&&s.country==='Lao PDR'&&s.wlSensor&&s.showOnWebsite!==false&&/^\d{6}$/.test(s.stationId||'')).slice(0,LEVELS_MAX_STATIONS),now=Date.now(),stations=[];let cursor=0;
 await Promise.all(Array.from({length:4},async()=>{while(cursor<candidates.length){const s=candidates[cursor++];try{const data=await levelsJSON(LEVELS_API+'/measurement/'+s.stationId),st=riverStatus({...s,...data.station},data.measurements,now);if(st)stations.push(st)}catch{/* One silent station must not hide the others. */}}}));
 if(!stations.length)throw new Error('no_levels');
 const history=await seasonHistory(now).catch(()=>({}));
 return {kind:'river_levels',source:'MRC near-real-time hydrometeorological monitoring',page:'https://monitoring.mrcmekong.org/',historySource:'MRC Flood Forecasting (ffw.mrcmekong.org), wet season 1 Jun – 31 Oct',rules:{rise6:RISE_6H,rise24:RISE_24H},fetchedAt:now,stations:stations.map(s=>attachHistory(s,history[s.id])).sort((a,b)=>a.id.localeCompare(b.id))};
}
// The 20,50 cron downloads the levels anyway (refresh: wait for a new copy); it and every visitor
// share one copy in KV, so visitors get it at once. Copies older than 2 h are not shown.
export const LEVELS_KV='rivers:levels:v1',LEVELS_SHOW_MS=2*3600000;
export async function riverLevelsRoute(request,ctx={},{store=null,refresh=false}={}){
 if(!['GET','HEAD'].includes(request.method))return Response.json({error:'method_not_allowed'},{status:405});
 if(!request.headers.get('oai-authenticated-user-id'))return Response.json({error:'sign_in_required'},{status:401});
 const key=new Request('https://rivers.internal/mrc-levels-v5'),now=Date.now(),old=d=>!d||now-d.fetchedAt>=LEVELS_TTL;
 try{
  if(!levelsCached){const hit=await readOptionalCache(key);if(hit){try{levelsCached=await hit.json()}catch{/* Ignore invalid cached data. */}}}
  if(old(levelsCached)){const kv=await readSnapshot(store,LEVELS_KV);if(kv&&(!levelsCached||kv.fetchedAt>levelsCached.fetchedAt))levelsCached=kv}
  if(levelsCached&&now-levelsCached.fetchedAt>=LEVELS_SHOW_MS)levelsCached=null;
  if(refresh||old(levelsCached)){
   if(now<levelsRetryAfter&&!refresh){if(!levelsCached)throw new Error('backoff')}
   else{
    // A stuck download that finishes late must not clear the newer one that replaced it.
    if(!levelsPending||now-levelsPendingAt>LEVELS_STUCK_MS){levelsPendingAt=now;const p=downloadLevels().then(data=>{levelsCached=data;levelsRetryAfter=0;writeOptionalCache(key,Response.json(data,{headers:{'Cache-Control':'public,max-age=1800'}}),ctx);saveSnapshot(store,LEVELS_KV,data,ctx);return data}).catch(error=>{levelsRetryAfter=Date.now()+180000;throw error}).finally(()=>{if(levelsPending===p)levelsPending=null});levelsPending=p;
     ctx.waitUntil?.(levelsPending.catch(()=>{}))}
    // Stale data is served at once while the refresh runs in the background. Without data (or for
    // the cron), wait at most 25 s: a download started by another (possibly cancelled) request may never settle here.
    if(!levelsCached||refresh){let timer;try{await Promise.race([levelsPending,new Promise((_,no)=>timer=setTimeout(()=>no(new Error('slow')),LEVELS_WAIT_MS))])}catch(error){if(!levelsCached)throw error}finally{clearTimeout(timer)}}
   }
  }
  const headers={'Cache-Control':'private,max-age=60','X-Content-Type-Options':'nosniff'};
  return request.method==='HEAD'?new Response(null,{headers}):Response.json({...levelsCached,checkedAt:now},{headers});
 }catch{return Response.json({error:'river_levels_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
