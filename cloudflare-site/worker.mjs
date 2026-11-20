// Lao Weather & Disaster Watch on Cloudflare Workers (separate from the Sites/Codex deployment).
// Every request passes through this Worker first. Access is private: Cloudflare Access
// must sit in front, and its verified e-mail header becomes the signed-in user that the
// existing routes expect. Without that header nothing is served (safe default).
import {radarRoute} from '../worker/radar.mjs';
import {satelliteRoute} from '../worker/satellite.mjs';
import {forecastRoute,refreshForecastStore} from '../worker/forecast.mjs';
import {rainStationsRoute} from '../worker/rain-stations.mjs';
import {riverLevelsRoute} from '../worker/river-levels.mjs';
import {weatherNewsRoute} from '../worker/weather-news.mjs';
import {aiRoute} from '../worker/ai.mjs';
import {feedbackRoute,feedbackListRoute,sameKey,pruneFeedback} from '../worker/feedback.mjs';
import {visitRoute,visitStatsRoute,pruneVisits} from '../worker/visits.mjs';
import {historyRoute,rainRows,levelRows,saveHistory,pruneHistory} from '../worker/history.mjs';
import {seoRoute} from '../worker/seo-pages.mjs';
import {stormsRoute} from '../worker/storms.mjs';
import {stormPageRoute,stormCardRoute} from '../worker/storm-share.mjs';
import {fbAdminRoute,botTick,checkEvents} from '../worker/fb-bot.mjs';
import {pushRoute,pushTick,kickPush} from '../worker/push.mjs';
import {ensoRoute,ensoData,sstRoute} from '../worker/enso.mjs';

// Cloudflare Workers reject redirect:'error'; 'manual' keeps the same rule (a redirect is not ok).
const platformFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=(input,init)=>platformFetch(input,init?.redirect==='error'?{...init,redirect:'manual'}:init);

const AI_ASSETS=['/data/admin/provinces.geojson','/data/admin/districts.geojson'];let aiAssetText;
async function aiAssets(env,origin){if(aiAssetText)return aiAssetText;const entries=await Promise.all(AI_ASSETS.map(async path=>{const r=await env.ASSETS.fetch(new Request(origin+path));if(!r.ok)throw new Error('missing_asset');return [path,await r.text()]}));aiAssetText=new Map(entries);return aiAssetText}

// Verify the Cloudflare Access JWT (RS256) against the team's published keys and the
// application audience. Headers alone are never trusted.
const b64url=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
let jwks;
async function accessKeys(team,fetchImpl){if(jwks&&jwks.team===team&&Date.now()-jwks.at<3600000)return jwks.keys;const r=await fetchImpl(`${team}/cdn-cgi/access/certs`,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error('access_certs');const keys=(await r.json()).keys||[];jwks={team,at:Date.now(),keys};return keys}
export async function accessUser(request,env,{fetchImpl=platformFetch,now=Date.now()}={}){
 // Public community site: everyone may read. The AI route stays off without a Gemini key.
 if(env.PUBLIC_SITE==='true')return 'public';
 if(env.ACCESS_REQUIRED==='false')return 'local-preview';
 const token=request.headers.get('cf-access-jwt-assertion'),team=(env.ACCESS_TEAM_DOMAIN||'').replace(/\/+$/,''),aud=env.ACCESS_AUD;
 if(!token||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)||!aud)return null;
 try{
  const [h,p,sig]=token.split('.'),header=JSON.parse(new TextDecoder().decode(b64url(h))),payload=JSON.parse(new TextDecoder().decode(b64url(p)));
  if(header.alg!=='RS256')return null;const jwk=(await accessKeys(team,fetchImpl)).find(k=>k.kid===header.kid);if(!jwk)return null;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64url(sig),new TextEncoder().encode(h+'.'+p)))return null;
  const audiences=[].concat(payload.aud||[]);if(payload.iss!==team||!audiences.includes(aud)||!(payload.exp*1000>now)||(payload.nbf&&payload.nbf*1000>now+60000))return null;
  return payload.email||payload.sub||null;
 }catch{return null}
}
function withUser(request,user){const headers=new Headers(request.headers);headers.set('oai-authenticated-user-id',user);return new Request(request,{headers})}

// Optional KV namespace FORECAST_KV (free: 100k reads, 1k writes per day; this uses ≈5 writes).
// Without it each data centre keeps its own copy, as on Sites.
export function forecastStore(env){const kv=env.FORECAST_KV;if(!kv)return null;return {get:()=>kv.get('gfs-grid-v2','json'),put:data=>kv.put('gfs-grid-v2',JSON.stringify(data))}}

const LOCKED=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lao Weather & Disaster Watch</title><body style="font:16px system-ui;background:#0b1730;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px"><main style="max-width:420px"><h1 style="font-size:20px">ເວັບນີ້ເປັນສ່ວນຕົວ</h1><p>ຕ້ອງເຂົ້າສູ່ລະບົບຜ່ານ Cloudflare Access ກ່ອນ.</p></main>`;

// Security (26 Oct 2026). Per-IP limits use the Cloudflare Rate Limiting binding; the address is only a
// counter key and is never stored. Without the binding (local tests) nothing is limited.
//  WRITE_LIMIT  POST /api/visits, /api/feedback, phone-alert sign-up and receipts (each writes to D1; free quota 100k writes/day)
//  ADMIN_LIMIT  owner routes incl. phone-alert tests (slows down guessing ADMIN_KEY); post pictures are not counted
const ADMIN_PATHS=['/api/feedback/list','/api/visits/stats'];
export async function rateLimited(request,env){
 const path=new URL(request.url).pathname,ip=request.headers.get('CF-Connecting-IP')||'unknown';
 const lim=ADMIN_PATHS.includes(path)||path.startsWith('/api/push/admin/')||(path.startsWith('/api/fb/')&&!path.startsWith('/api/fb/image/'))?env.ADMIN_LIMIT:request.method==='POST'&&(path==='/api/visits'||path==='/api/feedback'||path==='/api/push/ack'||path==='/api/push/subscribe'||path==='/api/push/unsubscribe')?env.WRITE_LIMIT:null;
 if(!lim?.limit)return null;
 try{if((await lim.limit({key:path.split('/').slice(0,3).join('/')+':'+ip})).success)return null}catch{return null}
 return Response.json({error:'too_many'},{status:429,headers:{'Cache-Control':'no-store','Retry-After':'60'}});
}
// Same headers as dist/_headers, for everything the Worker answers itself (pages, API, pictures).
export const SECURITY_HEADERS={'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'geolocation=(self), camera=(), microphone=(), payment=(), usb=()','Strict-Transport-Security':'max-age=31536000'};
export function secure(response){
 const h=new Headers(response.headers);let changed=false;for(const [k,v] of Object.entries(SECURITY_HEADERS))if(!h.has(k)){h.set(k,v);changed=true}
 return changed?new Response(response.body,{status:response.status,statusText:response.statusText,headers:h}):response;
}

export default {
 async fetch(request,env,ctx){
  const limited=await rateLimited(request,env);if(limited)return secure(limited);
  return secure(await handle(request,env,ctx));
 },
 // Three schedules (wrangler.toml), each kept under the Workers Free limit of 50 outgoing requests:
 //  */30     GFS grid (only when a new run exists) + drop old visitor rows
 //  10,40    save MRC rain-gauge readings to the station history
 //  20,50    save MRC river levels to the station history (+ trim raw/hourly history once a day)
 async scheduled(event,env,ctx){return scheduled(event,env,ctx)}
};
async function handle(request,env,ctx){
  const user=await accessUser(request,env),url=new URL(request.url);
  if(!user)return new Response(LOCKED,{status:401,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  const path=url.pathname;
  // Feedback reads the request body, so it must run before withUser() copies the request
  // (copying a Request transfers its body and leaves the original unreadable).
  if(path==='/api/feedback')return feedbackRoute(request,env);
  if(path==='/api/feedback/list')return feedbackListRoute(request,env);
  if(path==='/api/visits')return visitRoute(request,env);
  if(path==='/api/visits/stats')return visitStatsRoute(request,env);
  if(path==='/api/history'||path==='/api/history/stations')return historyRoute(request,env,ctx);
  if(path==='/api/storms')return stormsRoute(request,ctx);
  // Phone alerts (Web Push, worker/push.mjs). Reads the body, so it also runs before withUser().
  const isAdmin=r=>!!env.ADMIN_KEY&&sameKey(r.headers.get('X-Admin-Key'),env.ADMIN_KEY);
  if(path.startsWith('/api/push/'))return pushRoute(request,env,{sameKey,isAdmin});
  // Facebook Page bot: drafts the owner approves on admin.html (worker/fb-bot.mjs).
  if(path.startsWith('/api/fb/'))return fbAdminRoute(request,env,{isAdmin,ctx,enso:()=>ensoData(ctx,{store:env.FORECAST_KV})});
  // Storm share link and its preview picture (worker/storm-share.mjs).
  if(path.startsWith('/storm/')||path.startsWith('/api/storm-card/')){const storms=stormList(url.origin,ctx);return path.startsWith('/storm/')?stormPageRoute(request,env,{storms}):stormCardRoute(request,ctx,{storms,env})}
  // Province weather pages (server-rendered for search engines and link previews).
  if(path==='/weather'||path==='/weather/'||path.startsWith('/weather/'))return seoRoute(request,ctx,{riverLevels:async()=>{const r=await riverLevelsRoute(new Request(url.origin+'/api/rivers/levels',{headers:{'oai-authenticated-user-id':'seo'}}),ctx,{store:env.FORECAST_KV});return r.ok?r.json():null}});
  // El Niño / La Niña page and data (worker/enso.mjs, NOAA CPC).
  if(path==='/elnino'||path==='/elnino/'||path==='/api/enso')return ensoRoute(request,ctx,{store:env.FORECAST_KV});
  if(path.startsWith('/api/enso/sst/'))return sstRoute(request,ctx,{store:env.FORECAST_KV});
  const signed=withUser(request,user);
  // On-demand HSD conversion does not fit Workers Free CPU; the page uses the frame CDN instead.
  if(path.startsWith('/api/satellite/aws/'))return Response.json({error:'use_frame_cdn'},{status:404,headers:{'Cache-Control':'no-store'}});
  if(path.startsWith('/api/satellite/jma/'))return satelliteRoute(signed,ctx);
  if(path==='/api/forecast/grid')return forecastRoute(signed,ctx,{store:forecastStore(env)});
  if(path==='/api/rain/stations')return rainStationsRoute(signed,ctx);
  if(path==='/api/rivers/levels')return riverLevelsRoute(signed,ctx,{store:env.FORECAST_KV});
  if(path==='/api/news/weather')return weatherNewsRoute(signed,ctx,{store:env.FORECAST_KV});
  if(path.startsWith('/api/radar/'))return radarRoute(signed,ctx);
  if(path.startsWith('/api/ai/')){const assets=await aiAssets(env,url.origin);return aiRoute(signed,env,p=>{const text=assets.get(p);if(text===undefined)throw new Error('missing_asset');return text})}
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  const response=await env.ASSETS.fetch(request),headers=new Headers(response.headers);
  // Private site: browsers may cache, shared caches may not. (On the public site static
  // files are served by Cloudflare directly; only /api/* reaches this Worker.)
  headers.set('Cache-Control',path.endsWith('.html')||path==='/'?'private, no-cache':'private, max-age=300');headers.set('X-Content-Type-Options','nosniff');
  return new Response(response.body,{status:response.status,headers});
}
async function scheduled(event,env,ctx){
  const cron=event?.cron||'*/30 * * * *',db=env.FEEDBACK_DB;
  if(cron==='*/30 * * * *'){const store=forecastStore(env);if(store)ctx.waitUntil(refreshForecastStore(store).catch(()=>{}));if(db){ctx.waitUntil(pruneVisits(env).catch(()=>{}));ctx.waitUntil(pruneFeedback(env).catch(()=>{}));ctx.waitUntil(facebookBot(env,ctx).catch(()=>{}));ctx.waitUntil(pushTick(env,{storms:stormList('https://push.internal',ctx)}).catch(()=>{}).then(()=>kickPush(env)).catch(()=>{}))}return}
  if(!db)return;
  ctx.waitUntil(saveStationHistory(cron,db,ctx,env).catch(()=>{}));
}
const stormList=(origin,ctx)=>async()=>{const r=await stormsRoute(new Request(origin+'/api/storms'),ctx);return r.ok?(await r.json()).storms:[]};
// Facebook drafts at 05:00 / 17:00 Lao time, warnings, and posting of approved drafts (worker/fb-bot.mjs).
// River warnings are checked in the 20,50 run, which already downloads the levels (50-request limit).
function facebookBot(env,ctx){
 const origin='https://bot.internal',storms=stormList(origin,ctx);
 return botTick(env,{storms,enso:()=>ensoData(ctx,{store:env.FORECAST_KV}),
  stormCard:async id=>{const r=await stormCardRoute(new Request(origin+'/api/storm-card/'+id+'.jpg'),ctx,{storms,env});return r.ok&&r.headers.get('Content-Type')==='image/jpeg'?r.arrayBuffer():null}});
}
// Reads the same data the page gets (same routes, same caches) and stores it.
// Every run also sends phone alerts still waiting in the queue (kickPush), so retries happen every 10 min.
async function saveStationHistory(cron,db,ctx,env){
 const internal=path=>new Request('https://history.internal'+path,{headers:{'oai-authenticated-user-id':'cron'}});
 if(cron.startsWith('10,40')){const r=await rainStationsRoute(internal('/api/rain/stations'),ctx);if(r.ok)await saveHistory(db,rainRows(await r.json()));await kickPush(env).catch(()=>{});return}
 const r=await riverLevelsRoute(internal('/api/rivers/levels'),ctx,{store:env.FORECAST_KV,refresh:true});if(!r.ok)return;const levels=await r.json();await saveHistory(db,levelRows(levels));
 await checkEvents({FEEDBACK_DB:db},{riverLevels:async()=>levels}).catch(()=>{});
 await pushTick(env,{riverLevels:levels}).catch(()=>{});await kickPush(env).catch(()=>{});
 // Once a day (the 03:20 Lao-time run): trim raw readings to 10 days and hourly values to 90 days.
 const lao=new Date(Date.now()+7*3600000);if(lao.getUTCHours()===3&&lao.getUTCMinutes()<30)await pruneHistory(db);
}
