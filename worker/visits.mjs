// Visitor counts (Cloudflare D1 binding FEEDBACK_DB, table visits). Anonymous: the page sends a
// random id kept in the browser; the server stores only a one-way hash of (id + Lao day +
// secret), so the same browser cannot be followed from one day to the next. No IP is stored.
// "Online now" = a ping within VISIT_ONLINE_MS; the page pings every VISIT_PING_MS while visible.
// The owner reads totals with /api/visits/stats and the ADMIN_KEY secret (admin.html).
export const VISIT_PING_MS=120000,VISIT_ONLINE_MS=300000,VISIT_KEEP_DAYS=90;
const LAO_OFFSET_MS=7*3600000;
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export const laoDay=(now,daysBack=0)=>new Date(now+LAO_OFFSET_MS-daysBack*86400000).toISOString().slice(0,10);
const VIEWS=['map','weather','layers','news'];
// Returns the fields to store, or null for a malformed ping.
export function validateVisit(body){
 if(!body||typeof body!=='object')return null;
 const id=String(body.id||'').toLowerCase();if(!/^[0-9a-f]{16,32}$/.test(id))return null;
 return {id,view:VIEWS.includes(body.view)?body.view:null,device:body.device==='mobile'?'mobile':body.device==='desktop'?'desktop':null};
}
async function visitorHash(id,day,secret){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id+'|'+day+'|'+(secret||'lao-weather-watch')));
 return [...new Uint8Array(digest)].slice(0,12).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function visitRoute(request,env,{now=Date.now()}={}){
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 const db=env.FEEDBACK_DB;if(!db)return json({error:'visits_unavailable'},503);
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'forbidden'},403);
 const text=await request.text();if(text.length>500)return json({error:'too_large'},413);
 let body;try{body=JSON.parse(text)}catch{return json({error:'invalid'},400)}
 const v=validateVisit(body);if(!v)return json({error:'invalid'},400);
 const day=laoDay(now),at=new Date(now).toISOString(),country=String(request.cf?.country||'').replace(/[^A-Z]/g,'').slice(0,2)||null;
 await db.prepare('INSERT INTO visits (day,visitor,first_seen,last_seen,view,device,country,pings) VALUES (?1,?2,?3,?3,?4,?5,?6,1) ON CONFLICT(day,visitor) DO UPDATE SET last_seen=excluded.last_seen,view=excluded.view,pings=pings+1')
  .bind(day,await visitorHash(v.id,day,env.ADMIN_KEY),at,v.view,v.device,country).run();
 return json({ok:true});
}
// Constant-time comparison of the admin key (same rule as the feedback list: at least 12 characters).
function sameKey(a,b){const x=new TextEncoder().encode(String(a||'')),y=new TextEncoder().encode(String(b||''));let d=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)d|=(x[i]||0)^(y[i]||0);return d===0&&y.length>=12}
export async function visitStatsRoute(request,env,{now=Date.now()}={}){
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 if(!env.ADMIN_KEY||!sameKey(request.headers.get('X-Admin-Key'),env.ADMIN_KEY))return json({error:'unauthorized'},401);
 const db=env.FEEDBACK_DB;if(!db)return json({error:'visits_unavailable'},503);
 const today=laoDay(now),yesterday=laoDay(now,1),since=new Date(now-VISIT_ONLINE_MS).toISOString();
 // Online rows can only be in today's or yesterday's partition (a visit just after midnight).
 const [online,days,todayRows]=await Promise.all([
  db.prepare('SELECT view,COUNT(*) AS n FROM visits WHERE day IN (?1,?2) AND last_seen>=?3 GROUP BY view').bind(today,yesterday,since).all(),
  db.prepare('SELECT day,COUNT(*) AS n FROM visits WHERE day>=?1 GROUP BY day ORDER BY day').bind(laoDay(now,29)).all(),
  db.prepare('SELECT device,country,COUNT(*) AS n FROM visits WHERE day=?1 GROUP BY device,country').bind(today).all()]);
 const onlineByView={};let onlineNow=0;for(const r of online.results||[]){onlineByView[r.view||'other']=(onlineByView[r.view||'other']||0)+r.n;onlineNow+=r.n}
 const perDay=Object.fromEntries((days.results||[]).map(r=>[r.day,r.n])),last30=Array.from({length:30},(_,i)=>{const d=laoDay(now,29-i);return {day:d,visitors:perDay[d]||0}});
 const devices={},countries={};for(const r of todayRows.results||[]){devices[r.device||'other']=(devices[r.device||'other']||0)+r.n;countries[r.country||'??']=(countries[r.country||'??']||0)+r.n}
 return json({generatedAt:new Date(now).toISOString(),onlineWindowMinutes:VISIT_ONLINE_MS/60000,onlineNow,onlineByView,today:perDay[today]||0,yesterday:perDay[yesterday]||0,last30,todayDevices:devices,todayCountries:countries});
}
// Called from the Worker's cron: drop rows older than VISIT_KEEP_DAYS.
export function pruneVisits(env,now=Date.now()){return env.FEEDBACK_DB.prepare('DELETE FROM visits WHERE day<?1').bind(laoDay(now,VISIT_KEEP_DAYS)).run()}
