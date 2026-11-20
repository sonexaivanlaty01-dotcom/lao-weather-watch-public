// Station history (D1 binding FEEDBACK_DB, tables in cloudflare-site/feedback-schema.sql).
// The cron saves what MRC telemetry reports — rain gauges (rain in the last hour and last 24 h
// at the station's reading time) and river levels (hourly series) — in three layers:
//   raw    every reading the cron sees (about every 30 min)  kept HISTORY_RAW_DAYS
//   hourly one value per Lao clock hour                       kept HISTORY_HOURLY_DAYS
//   daily  rain total / level max-min-last per Lao day         kept for good (long-term statistics)
// Nothing is estimated: rain "hourly" is the station's own 1-hour total at its last reading in
// that hour; a day's rain total is the station's 24-hour total at its last reading of the day,
// marked complete only when that reading is at 23:00 or later (Lao time).
export const HISTORY_RAW_DAYS=10,HISTORY_HOURLY_DAYS=90,HISTORY_KINDS=['rain','level'];
const LAO=7*3600000,DAY=86400000;
export const laoDayOf=t=>new Date(t+LAO).toISOString().slice(0,10);
export const laoHourOf=t=>new Date(t+LAO).toISOString().slice(0,13);
const ok=v=>Number.isFinite(v)?v:null;
// Rain gauges: one raw row, one hourly row, one daily row per fresh station reading.
export function rainRows(data){
 const out=[];for(const s of data?.stations||[]){
  const t=Date.parse(s.time);if(!Number.isFinite(t)||s.stale||!/^\d{6}$/.test(s.id))continue;
  const r1=ok(s.rain1h),r24=ok(s.rain24h);if(r1===null&&r24===null)continue;
  out.push({meta:{id:s.id,kind:'rain',name:s.name,river:s.river,lat:s.lat,lon:s.lon,alarm:null,flood:null},raw:{t:s.time,v:r1},hourly:r1===null?[]:[{hour:laoHourOf(t),v:r1,t:s.time}],daily:[{day:laoDayOf(t),total:r24,vmax:r1,vmin:r1,last:r24,last_t:s.time}]});
 }
 return out;
}
// River levels: the route already gives the last 25 hourly medians; the newest `hours` are saved
// (3 covers a missed cron run; the first run after a gap fills all 25).
export function levelRows(data,hours=3){
 const out=[];for(const s of data?.stations||[]){
  const t=Date.parse(s.time);if(!Number.isFinite(t)||s.stale||!/^\d{6}$/.test(s.id)||!Array.isArray(s.hourly))continue;
  const hourly=[];s.hourly.forEach((v,i)=>{if(i>=s.hourly.length-hours&&Number.isFinite(v)){const at=t-(s.hourly.length-1-i)*3600000;hourly.push({hour:laoHourOf(at),v,t:new Date(at).toISOString()})}});
  const byDay=new Map();for(const h of hourly){const d=h.hour.slice(0,10),x=byDay.get(d)||{day:d,total:null,vmax:-Infinity,vmin:Infinity,last:null,last_t:''};x.vmax=Math.max(x.vmax,h.v);x.vmin=Math.min(x.vmin,h.v);if(h.t>x.last_t){x.last=h.v;x.last_t=h.t}byDay.set(d,x)}
  out.push({meta:{id:s.id,kind:'level',name:s.name,river:s.river,lat:s.lat,lon:s.lon,alarm:ok(s.alarm),flood:ok(s.flood)},raw:Number.isFinite(s.level)?{t:s.time,v:s.level}:null,hourly,daily:[...byDay.values()]});
 }
 return out;
}
// All writes for one cron run as D1 statements (sent in one batch).
export function historyStatements(db,rows){
 const st=[];
 for(const r of rows){const m=r.meta;
  st.push(db.prepare('INSERT INTO stations (id,kind,name,river,lat,lon,alarm,flood) VALUES (?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(id,kind) DO NOTHING').bind(m.id,m.kind,m.name||'',m.river||'',m.lat,m.lon,m.alarm,m.flood));
  if(r.raw&&r.raw.v!==null)st.push(db.prepare('INSERT INTO obs_raw (id,kind,t,v) VALUES (?1,?2,?3,?4) ON CONFLICT(id,kind,t) DO NOTHING').bind(m.id,m.kind,r.raw.t,r.raw.v));
  for(const h of r.hourly)st.push(db.prepare('INSERT INTO obs_hourly (id,kind,hour,v,t) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(id,kind,hour) DO UPDATE SET v=excluded.v,t=excluded.t WHERE excluded.t>=obs_hourly.t').bind(m.id,m.kind,h.hour,h.v,h.t));
  for(const d of r.daily)st.push(db.prepare('INSERT INTO obs_daily (id,kind,day,total,vmax,vmin,last,last_t) VALUES (?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(id,kind,day) DO UPDATE SET vmax=max(coalesce(obs_daily.vmax,excluded.vmax),coalesce(excluded.vmax,obs_daily.vmax)),vmin=min(coalesce(obs_daily.vmin,excluded.vmin),coalesce(excluded.vmin,obs_daily.vmin)),total=CASE WHEN excluded.last_t>=obs_daily.last_t THEN excluded.total ELSE obs_daily.total END,last=CASE WHEN excluded.last_t>=obs_daily.last_t THEN excluded.last ELSE obs_daily.last END,last_t=max(obs_daily.last_t,excluded.last_t)')
   .bind(m.id,m.kind,d.day,d.total,Number.isFinite(d.vmax)?d.vmax:null,Number.isFinite(d.vmin)?d.vmin:null,d.last,d.last_t));
 }
 return st;
}
export async function saveHistory(db,rows){const st=historyStatements(db,rows);for(let i=0;i<st.length;i+=200)await db.batch(st.slice(i,i+200));return st.length}
export function pruneHistory(db,now=Date.now()){return db.batch([
 db.prepare('DELETE FROM obs_raw WHERE t<?1').bind(new Date(now-HISTORY_RAW_DAYS*DAY).toISOString()),
 db.prepare('DELETE FROM obs_hourly WHERE hour<?1').bind(laoHourOf(now-HISTORY_HOURLY_DAYS*DAY))])}
// Public read route: GET /api/history?id=011901&kind=level&res=daily&days=365
// and GET /api/history/stations (what is stored, from when). Cached 10 minutes.
const json=(data,status=200,maxAge=0)=>Response.json(data,{status,headers:{'Cache-Control':maxAge?`public,max-age=${maxAge}`:'no-store','X-Content-Type-Options':'nosniff'}});
export const HISTORY_LIMITS={raw:HISTORY_RAW_DAYS,hourly:HISTORY_HOURLY_DAYS,daily:3660};
export function historyQuery(params,now=Date.now()){
 const id=params.get('id')||'',kind=params.get('kind')||'',res=params.get('res')||'daily',days=Math.round(Number(params.get('days')||30));
 if(!/^\d{6}$/.test(id)||!HISTORY_KINDS.includes(kind)||!(res in HISTORY_LIMITS)||!(days>=1&&days<=HISTORY_LIMITS[res]))return null;
 const since=now-days*DAY;
 if(res==='raw')return {res,sql:'SELECT t,v FROM obs_raw WHERE id=?1 AND kind=?2 AND t>=?3 ORDER BY t',args:[id,kind,new Date(since).toISOString()]};
 if(res==='hourly')return {res,sql:'SELECT hour,v FROM obs_hourly WHERE id=?1 AND kind=?2 AND hour>=?3 ORDER BY hour',args:[id,kind,laoHourOf(since)]};
 return {res,sql:'SELECT day,total,vmax,vmin,last,last_t FROM obs_daily WHERE id=?1 AND kind=?2 AND day>=?3 ORDER BY day',args:[id,kind,laoDayOf(since)]};
}
// A day's rain total is complete when the last reading was at 23:00 Lao time or later.
export const dayComplete=(day,lastT)=>!!lastT&&laoDayOf(Date.parse(lastT))===day&&new Date(Date.parse(lastT)+LAO).getUTCHours()>=23;
export async function historyRoute(request,env,ctx={},{now=Date.now()}={}){
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 const db=env.FEEDBACK_DB;if(!db)return json({error:'history_unavailable'},503);
 const url=new URL(request.url);
 try{
  if(url.pathname==='/api/history/stations'){
   const {results=[]}=await db.prepare('SELECT s.id,s.kind,s.name,s.river,s.lat,s.lon,s.alarm,s.flood,min(d.day) AS first_day,max(d.day) AS last_day,count(d.day) AS days FROM stations s LEFT JOIN obs_daily d ON d.id=s.id AND d.kind=s.kind GROUP BY s.id,s.kind ORDER BY s.kind,s.name').all();
   return json({keep:{rawDays:HISTORY_RAW_DAYS,hourlyDays:HISTORY_HOURLY_DAYS,daily:'all'},stations:results},200,600);
  }
  const q=historyQuery(url.searchParams,now);if(!q)return json({error:'invalid'},400);
  const [{results=[]},meta]=await Promise.all([db.prepare(q.sql).bind(...q.args).all(),db.prepare('SELECT id,kind,name,river,alarm,flood FROM stations WHERE id=?1 AND kind=?2').bind(q.args[0],q.args[1]).first()]);
  const points=q.res==='daily'?results.map(r=>({...r,complete:q.args[1]==='rain'?dayComplete(r.day,r.last_t):true})):results;
  return json({station:meta||null,res:q.res,unit:q.args[1]==='rain'?'mm':'m',source:'MRC near-real-time telemetry, saved by this site every 30 minutes',points},200,600);
 }catch{return json({error:'history_unavailable'},503)}
}
