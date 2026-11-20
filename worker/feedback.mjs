// Visitor feedback (Cloudflare D1 binding FEEDBACK_DB). Anonymous: no name, no e-mail, no
// IP address is stored. Spam control: hidden honeypot field, minimum time on the form,
// and at most FEEDBACK_PER_HOUR submissions per visitor, counted with a one-way hash of
// (IP + day + secret) that cannot be turned back into the address and changes daily.
// The owner reads entries with /api/feedback/list and the ADMIN_KEY secret (admin.html).
export const FEEDBACK_TOPICS=['problem','request','data','other'],FEEDBACK_MAX_CHARS=1000,FEEDBACK_PER_HOUR=5,FEEDBACK_MIN_MS=3000;
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const clean=(s,max)=>String(s??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').trim().slice(0,max);
// Returns {ok:true,entry} | {ok:false,reason} | {bot:true} (silently accepted, not stored).
export function validateFeedback(body){
 if(!body||typeof body!=='object')return {ok:false,reason:'invalid'};
 if(clean(body.website,200))return {bot:true};
 if(!Number.isFinite(body.elapsedMs)||body.elapsedMs<FEEDBACK_MIN_MS)return {bot:true};
 const rating=Number.isInteger(body.rating)&&body.rating>=1&&body.rating<=5?body.rating:null;
 const topic=FEEDBACK_TOPICS.includes(body.topic)?body.topic:null;
 const message=clean(body.message,FEEDBACK_MAX_CHARS);
 if(rating===null&&message.length<3)return {ok:false,reason:'empty'};
 return {ok:true,entry:{rating,topic,message,view:clean(body.view,20).replace(/[^a-z]/g,'')||null,viewport:clean(body.viewport,20).replace(/[^0-9x]/g,'')||null}};
}
async function visitorHash(request,secret,now){
 const ip=request.headers.get('CF-Connecting-IP')||'unknown',day=new Date(now).toISOString().slice(0,10);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip+'|'+day+'|'+(secret||'lao-weather-watch')));
 return [...new Uint8Array(digest)].slice(0,12).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function feedbackRoute(request,env,{now=Date.now()}={}){
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 const db=env.FEEDBACK_DB;if(!db)return json({error:'feedback_unavailable'},503);
 // Only the site's own page may post (blocks cross-site form spam).
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'forbidden'},403);
 const text=await request.text();if(text.length>4000)return json({error:'too_large'},413);
 let body;try{body=JSON.parse(text)}catch{return json({error:'invalid'},400)}
 const v=validateFeedback(body);if(v.bot)return json({ok:true});if(!v.ok)return json({error:v.reason},400);
 const hash=await visitorHash(request,env.ADMIN_KEY,now),since=new Date(now-3600000).toISOString();
 const recent=await db.prepare('SELECT COUNT(*) AS n FROM feedback WHERE visitor=?1 AND created_at>=?2').bind(hash,since).first();
 if((recent?.n||0)>=FEEDBACK_PER_HOUR)return json({error:'too_many'},429);
 const e=v.entry;
 await db.prepare('INSERT INTO feedback (created_at,rating,topic,message,view,viewport,country,visitor) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)')
  .bind(new Date(now).toISOString(),e.rating,e.topic,e.message,e.view,e.viewport,clean(request.cf?.country,2)||null,hash).run();
 return json({ok:true});
}
// Entries are kept one year (owner's choice 30 Oct 2026, stated on /privacy); the */30 cron drops older ones.
export const FEEDBACK_KEEP_DAYS=365;
export function pruneFeedback(env,now=Date.now()){return env.FEEDBACK_DB.prepare('DELETE FROM feedback WHERE created_at<?1').bind(new Date(now-FEEDBACK_KEEP_DAYS*86400000).toISOString()).run()}
// Constant-time comparison of the admin key.
export function sameKey(a,b){const x=new TextEncoder().encode(String(a||'')),y=new TextEncoder().encode(String(b||''));let d=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)d|=(x[i]||0)^(y[i]||0);return d===0&&y.length>=12}
export async function feedbackListRoute(request,env){
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 if(!env.ADMIN_KEY||!sameKey(request.headers.get('X-Admin-Key'),env.ADMIN_KEY))return json({error:'unauthorized'},401);
 const db=env.FEEDBACK_DB;if(!db)return json({error:'feedback_unavailable'},503);
 const {results=[]}=await db.prepare('SELECT id,created_at,rating,topic,message,view,viewport,country FROM feedback ORDER BY id DESC LIMIT 1000').all();
 const rated=results.filter(r=>r.rating),byTopic={};for(const r of results)byTopic[r.topic||'none']=(byTopic[r.topic||'none']||0)+1;
 return json({count:results.length,averageRating:rated.length?Math.round(rated.reduce((a,r)=>a+r.rating,0)/rated.length*10)/10:null,byTopic,entries:results});
}
