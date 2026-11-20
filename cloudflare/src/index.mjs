// Himawari-9 Band 13 image CDN for Lao Weather & Disaster Watch.
// A cron job converts each NOAA/AWS observation ONCE, stores the PNG in R2 and
// publishes an index of ready frames. Viewers only download finished static
// files through Cloudflare's edge cache, so load does not grow with conversion.
// Observation times come from the AWS file names; nothing is relabelled,
// interpolated or fabricated. Partially published frames are not converted.
import {parseAWSListing,awsFrameStamp,awsSegment,awsSegmentURL,awsConvert} from '../../worker/aws-satellite.mjs';
import {AWS_REGION} from '../../worker/himawari-hsd.mjs';

export const PREFIX='himawari9/b13/',INDEX_KEY=PREFIX+'index.json',LOCK_KEY=PREFIX+'lock.json';
const AWS_ORIGIN='https://noaa-himawari9.s3.amazonaws.com',HOUR=3600000,WINDOW=5*HOUR,KEEP=6*HOUR,MAX_FRAMES=31;
const frameKey=stamp=>PREFIX+stamp+'.png';
const stampOf=time=>new Date(time).toISOString().replace(/[-:T]/g,'').slice(0,12);

async function listHour(time){
 const iso=new Date(time).toISOString(),prefix='AHI-L1b-FLDK/'+iso.slice(0,10).replaceAll('-','/')+'/'+iso.slice(11,13);
 const r=await fetch(AWS_ORIGIN+'/?list-type=2&max-keys=1000&prefix='+encodeURIComponent(prefix),{redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('aws_list_http_'+r.status);return parseAWSListing(await r.text());
}
async function readIndex(bucket){try{const o=await bucket.get(INDEX_KEY);return o?await o.json():null}catch{return null}}
function buildIndex(frames,now){
 const ordered=[...frames].sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)),latest=Date.parse(ordered.at(-1)?.time);
 const kept=Number.isFinite(latest)?ordered.filter(f=>Date.parse(f.time)>=latest-WINDOW).slice(-MAX_FRAMES):[];
 return {provider:'aws',source:'cdn',checkedAt:now,latest:kept.length?kept.at(-1).time:null,region:AWS_REGION,frames:kept};
}
async function putIndex(bucket,index){await bucket.put(INDEX_KEY,JSON.stringify(index),{httpMetadata:{contentType:'application/json',cacheControl:'public, max-age=15'}})}

// Best-effort lease so overlapping cron runs do not convert the same frame.
async function takeLease(bucket,now,ms){try{const o=await bucket.get(LOCK_KEY);if(o){const lease=await o.json();if(lease.until>now)return false}}catch{}await bucket.put(LOCK_KEY,JSON.stringify({until:now+ms}));return true}

export async function updateFrames(env,{now=Date.now(),maxFrames=Number(env.MAX_FRAMES_PER_RUN)||3,deadline=Date.now()+45000}={}){
 const bucket=env.FRAMES;if(!await takeLease(bucket,now,120000))return {skipped:'locked'};
 try{
  const previous=await readIndex(bucket),ready=new Map((previous?.frames||[]).map(f=>[f.stamp,f]));
  // Re-list the whole window until history is complete (or after a pause);
  // otherwise only the current and previous hour.
  const fresh=previous&&now-previous.checkedAt<30*60000&&previous.frames?.length>=MAX_FRAMES,hours=[];for(let t=Math.floor((now-(fresh?HOUR:6.1*HOUR))/HOUR)*HOUR;t<=now;t+=HOUR)hours.push(t);
  const published=new Map();let listed=0;
  for(const result of await Promise.allSettled(hours.map(listHour)))if(result.status==='fulfilled'){listed++;for(const f of result.value)if(Date.parse(f.time)<=now)published.set(f.stamp,f)}
  if(!listed)throw new Error('aws_publications_unavailable');
  const newest=Math.max(...[...published.values(),...ready.values()].map(f=>Date.parse(f.time)));
  const missing=[...published.values()].filter(f=>!ready.has(f.stamp)&&Date.parse(f.time)>=newest-WINDOW).sort((a,b)=>Date.parse(b.time)-Date.parse(a.time));
  const converted=[],failed=[];
  for(const frame of missing.slice(0,maxFrames)){
   if(Date.now()>deadline)break;
   try{
    const abort=new AbortController(),segments=await Promise.all([3,4,5].map(s=>awsSegment(awsSegmentURL(frame.stamp,s),abort.signal).catch(e=>{abort.abort();throw e}))),{png}=await awsConvert(segments);
    await bucket.put(frameKey(frame.stamp),png,{httpMetadata:{contentType:'image/png',cacheControl:'public, max-age=31536000, immutable'},customMetadata:{observationTime:frame.time,publishedAt:new Date(frame.publishedAt).toISOString()}});
    ready.set(frame.stamp,{stamp:frame.stamp,time:frame.time,publishedAt:frame.publishedAt,provider:'aws'});converted.push(frame.stamp);
    await putIndex(bucket,buildIndex(ready.values(),Date.now())); // newest becomes visible immediately
   }catch(error){failed.push(frame.stamp);console.warn('frame conversion failed',frame.stamp,error.message)}
  }
  const index=buildIndex(ready.values(),Date.now()),keepFrom=Date.parse(index.latest)-KEEP;await putIndex(bucket,index);
  const stale=[...ready.values()].filter(f=>Date.parse(f.time)<keepFrom).map(f=>frameKey(f.stamp));if(stale.length)await bucket.delete(stale);
  return {converted,failed,removed:stale.length,pending:Math.max(0,missing.length-converted.length-failed.length),latest:index.latest,frames:index.frames.length};
 }finally{try{await bucket.delete(LOCK_KEY)}catch{}}
}

function cors(env,headers=new Headers()){headers.set('Access-Control-Allow-Origin',env.ALLOWED_ORIGIN||'*');headers.set('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');headers.set('Access-Control-Expose-Headers','X-Observation-Time');headers.set('Vary','Origin');headers.set('X-Content-Type-Options','nosniff');return headers}
export default {
 async scheduled(event,env,ctx){ctx.waitUntil(updateFrames(env).then(r=>console.log('himawari update',JSON.stringify(r))))},
 async fetch(request,env,ctx){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(env)});
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:cors(env)});
  const url=new URL(request.url),path=url.pathname.replace(/^\/+/,'');
  if(path==='health'){const index=await readIndex(env.FRAMES),age=index?.latest?Math.round((Date.now()-Date.parse(index.latest))/60000):null;return Response.json({latest:index?.latest||null,ageMinutes:age,frames:index?.frames?.length||0,checkedAt:index?.checkedAt||null},{headers:cors(env,new Headers({'Cache-Control':'no-store'}))})}
  const m=new RegExp('^'+PREFIX+'(\\d{12})\\.png$').exec(path);
  if(path!==INDEX_KEY&&!(m&&Number.isFinite(awsFrameStamp(m[1]))))return new Response('Not found',{status:404,headers:cors(env)});
  const cacheKey=new Request(url.origin+'/'+path),edge=globalThis.caches?.default;
  if(edge){const hit=await edge.match(cacheKey).catch(()=>null);if(hit)return request.method==='HEAD'?new Response(null,{headers:hit.headers}):hit}
  const object=await env.FRAMES.get(path);if(!object)return new Response('Not found',{status:404,headers:cors(env,new Headers({'Cache-Control':'public, max-age=30'}))});
  const headers=cors(env);object.writeHttpMetadata(headers);headers.set('ETag',object.httpEtag);if(m)headers.set('X-Observation-Time',object.customMetadata?.observationTime||new Date(awsFrameStamp(m[1])).toISOString());
  const response=new Response(object.body,{headers});if(edge)ctx.waitUntil(edge.put(cacheKey,response.clone()).catch(()=>{}));
  return request.method==='HEAD'?new Response(null,{headers}):response;
 }
};
