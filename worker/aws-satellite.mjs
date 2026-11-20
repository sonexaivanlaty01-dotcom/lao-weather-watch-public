import {readOptionalCache,writeOptionalCache} from './optional-cache.mjs';
import {readHSD,cropLayout,copySegment,renderHSDIndexed,encodeIndexedPNG,AWS_REGION} from './himawari-hsd.mjs';
const AWS_ORIGIN='https://noaa-himawari9.s3.amazonaws.com';
let awsTimesState,awsTimesJob;const awsPNGCache=new Map(),awsPNGJobs=new Map();let awsPNGBytes=0;
export function awsFrameStamp(value){if(!/^\d{12}$/.test(value||''))return NaN;const iso=`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${value.slice(8,10)}:${value.slice(10,12)}:00Z`,t=Date.parse(iso);return Number.isFinite(t)&&new Date(t).toISOString().slice(0,16)===iso.slice(0,16)&&Number(value.slice(10))%10===0?t:NaN}
const awsStamp=time=>new Date(time).toISOString().replace(/[-:T]/g,'').slice(0,12);
export function parseAWSListing(xml){
 if(typeof xml!=='string'||!xml.includes('ListBucketResult')||/<IsTruncated>true<\/IsTruncated>/.test(xml))throw new Error('invalid_aws_listing');const frames=new Map();
 for(const row of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){
  const key=/<Key>([^<]+)<\/Key>/.exec(row[1])?.[1],m=/^AHI-L1b-FLDK\/(\d{4})\/(\d{2})\/(\d{2})\/(\d{4})\/HS_H09_(\d{8})_(\d{4})_B13_FLDK_R20_S(0[345])10\.DAT\.bz2$/.exec(key||'');if(!m||m[1]+m[2]+m[3]!==m[5]||m[4]!==m[6])continue;
  const stamp=m[5]+m[6],time=awsFrameStamp(stamp),modified=Date.parse(/<LastModified>([^<]+)<\/LastModified>/.exec(row[1])?.[1]),size=Number(/<Size>(\d+)<\/Size>/.exec(row[1])?.[1]);if(!Number.isFinite(time)||!Number.isFinite(modified)||size<100000||size>5000000)continue;
  const frame=frames.get(stamp)||{stamp,time,segments:new Set(),publishedAt:0};frame.segments.add(Number(m[7]));frame.publishedAt=Math.max(frame.publishedAt,modified);frames.set(stamp,frame);
 }
 return [...frames.values()].filter(f=>f.segments.size===3).map(({segments,...frame})=>({...frame,time:new Date(frame.time).toISOString(),provider:'aws'}));
}
async function awsListing(prefix){const url=AWS_ORIGIN+'/?list-type=2&max-keys=1000&prefix='+encodeURIComponent(prefix),r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('aws_list_http');return parseAWSListing(await r.text())}
export async function awsPublishedFrames(now=Date.now()){
 if(awsTimesState&&now-awsTimesState.checkedAt<10000)return awsTimesState;if(awsTimesJob)return awsTimesJob;
 const previous=awsTimesState;
 awsTimesJob=(async()=>{
  const start=previous&&now-previous.checkedAt<1800000?now-3600000:now-6.1*3600000,prefixes=[];
  for(let t=Math.floor(start/3600000)*3600000;t<=now;t+=3600000){const iso=new Date(t).toISOString();prefixes.push('AHI-L1b-FLDK/'+iso.slice(0,10).replaceAll('-','/')+'/'+iso.slice(11,13))}
  const byTime=new Map((previous?.frames||[]).map(f=>[f.time,f]));let cursor=0,success=0;
  await Promise.all(Array.from({length:Math.min(2,prefixes.length)},async()=>{while(cursor<prefixes.length){const prefix=prefixes[cursor++];try{for(const frame of await awsListing(prefix))byTime.set(frame.time,frame);success++}catch(error){console.warn('AWS publication list unavailable',prefix,error.message)}}}));
  if(!success)throw new Error('aws_publications_unavailable');const ordered=[...byTime.values()].filter(f=>Date.parse(f.time)<=now).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)),latest=Date.parse(ordered.at(-1)?.time);if(!Number.isFinite(latest)||now-latest>3600000)throw new Error('aws_publications_stale');
  const frames=ordered.filter(f=>Date.parse(f.time)>=latest-5*3600000).slice(-31);awsTimesState={provider:'aws',checkedAt:now,latest:new Date(latest).toISOString(),region:AWS_REGION,frames};return awsTimesState;
 })().finally(()=>awsTimesJob=null);return awsTimesJob;
}
// Pipeline: up to two frames may hold downloaded segments at once (one being
// converted, one downloading), so peak memory stays bounded while the next
// download overlaps the current conversion. Conversion itself stays serial.
// The newest observation is served before history prefetch.
const AWS_SLOTS=2,awsWaiters=[];let awsActive=0;
const awsByPriority=()=>awsWaiters.sort((a,b)=>b.priority-a.priority||a.order-b.order);let awsOrder=0;
function awsAcquire(stamp,priority){if(awsActive<AWS_SLOTS){awsActive++;return Promise.resolve()}return new Promise(resolve=>{awsWaiters.push({stamp,priority,order:awsOrder++,resolve});awsByPriority()})}
function awsRelease(){const next=awsWaiters.shift();if(next)next.resolve();else awsActive--}
let awsDecodeChain=Promise.resolve();
function awsSerial(task){const job=awsDecodeChain.then(task);awsDecodeChain=job.then(()=>{},()=>{});return job}
export async function awsSegment(url,signal){
 // One retry for a transient S3/network failure; never a different file.
 for(let attempt=0;;attempt++){
  try{const r=await fetch(url,{redirect:'manual',signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});if(!r.ok){const error=new Error('aws_segment_http');error.status=r.status;throw error}
   const length=Number(r.headers.get('Content-Length'));if(length>5000000)throw new Error('aws_segment_size');const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length>5000000)throw new Error('aws_segment_size');return bytes}
  catch(error){if(signal.aborted||attempt>=1||error.message==='aws_segment_size'||(error.status&&error.status<500&&error.status!==429))throw error;await new Promise(resolve=>setTimeout(resolve,700))}
 }
}
export function awsSegmentURL(stamp,segment){const day=stamp.slice(0,4)+'/'+stamp.slice(4,6)+'/'+stamp.slice(6,8),clock=stamp.slice(8);return `${AWS_ORIGIN}/AHI-L1b-FLDK/${day}/${clock}/HS_H09_${stamp.slice(0,8)}_${clock}_B13_FLDK_R20_S0${segment}10.DAT.bz2`}
export async function awsConvert(segments){
 let layout,grid;const t0=Date.now();
 for(let i=0;i<segments.length;i++){const hsd=readHSD(segments[i]);segments[i]=null;if(!layout){layout=cropLayout(hsd.projection);grid=new Float32Array(layout.width*layout.height);grid.fill(NaN)}copySegment(grid,layout,hsd)}
 if(!grid||grid.some(v=>!Number.isFinite(v)))throw new Error('incomplete_aws_frame');const t1=Date.now(),indices=renderHSDIndexed(grid,layout),t2=Date.now(),png=await encodeIndexedPNG(indices);
 return {png,decode:t1-t0,render:t2-t1,encode:Date.now()-t2};
}
async function awsRenderFrame(stamp,priority){
 const queued=Date.now();await awsAcquire(stamp,priority);
 try{
  // A failed segment cancels its siblings, so a released slot has no stray downloads.
  const started=Date.now(),abort=new AbortController(),segments=await Promise.all([3,4,5].map(segment=>awsSegment(awsSegmentURL(stamp,segment),abort.signal).catch(error=>{abort.abort();throw error}))),downloaded=Date.now();
  const result=await awsSerial(()=>awsConvert(segments)),converted=Date.now();
  return {png:result.png,timing:{queue:started-queued,download:downloaded-started,wait:converted-downloaded-result.decode-result.render-result.encode,decode:result.decode,render:result.render,encode:result.encode}};
 }finally{awsRelease()}
}
function awsRemember(stamp,png){awsPNGCache.set(stamp,png);awsPNGBytes+=png.length;for(const [key,bytes] of awsPNGCache){if(awsPNGBytes<=20*1024*1024&&awsPNGCache.size<=32)break;awsPNGBytes-=bytes.length;awsPNGCache.delete(key)}}
function awsReadyImage(stamp){
 if(awsPNGCache.has(stamp)){const png=awsPNGCache.get(stamp);awsPNGCache.delete(stamp);awsPNGCache.set(stamp,png);return Promise.resolve({png,timing:null})}
 const latest=awsTimesState?.frames?.at(-1)?.stamp,priority=stamp===latest?1:0,existing=awsPNGJobs.get(stamp);
 if(existing){if(priority){for(const waiter of awsWaiters)if(waiter.stamp===stamp)waiter.priority=1;awsByPriority()}return existing}
 const job=awsRenderFrame(stamp,priority).then(result=>{awsRemember(stamp,result.png);return result}).finally(()=>awsPNGJobs.delete(stamp));awsPNGJobs.set(stamp,job);return job;
}
function awsServerTiming(timing){return timing?Object.entries(timing).map(([name,ms])=>`${name};dur=${Math.max(0,Math.round(ms))}`).join(', '):'cache;desc="worker memory"'}
function awsImageResponse(png,time,timing){return new Response(png,{headers:{'Content-Type':'image/png','Cache-Control':'private, max-age=21600','X-Content-Type-Options':'nosniff','X-Observation-Time':new Date(time).toISOString(),'X-Imagery-Source':'JMA-Himawari-9-NOAA-AWS','Server-Timing':awsServerTiming(timing)}})}
// After a publication check, convert the newest observation in the background
// so the first viewer does not wait for it. At most one older frame is warmed
// per check, newest first, to keep Worker load bounded.
function awsWarm(data,origin,ctx){
 if(typeof ctx?.waitUntil!=='function')return;
 const frame=[...(data?.frames||[])].reverse().find(f=>!awsPNGCache.has(f.stamp)&&!awsPNGJobs.has(f.stamp));
 if(frame){const time=awsFrameStamp(frame.stamp);if(!Number.isFinite(time))return;const job=awsReadyImage(frame.stamp).then(({png,timing})=>writeOptionalCache(new Request(new URL(`/api/satellite/aws/frame/${frame.stamp}.png`,origin)),awsImageResponse(png,time,timing))).catch(error=>console.warn('AWS warm-up skipped',frame.stamp,error.message));ctx.waitUntil(job)}
}
export async function awsSatelliteRoute(request,ctx={}){
 if(!request.headers.get('oai-authenticated-user-id'))return Response.json({error:'sign_in_required'},{status:401});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const path=new URL(request.url).pathname;
 try{
  if(path==='/api/satellite/aws/times'){const data=await awsPublishedFrames();awsWarm(data,request.url,ctx);return Response.json(data,{headers:{'Cache-Control':'private, max-age=10'}})}
  const m=/^\/api\/satellite\/aws\/frame\/(\d{12})\.png$/.exec(path),time=m?awsFrameStamp(m[1]):NaN;
  if(!Number.isFinite(time)||time>Date.now()||time<Date.now()-7*3600000)return new Response('Not found',{status:404});
  const key=new Request(new URL(path,request.url));const cached=await readOptionalCache(key);if(cached)return request.method==='HEAD'?new Response(null,{headers:cached.headers}):cached;
  const {png,timing}=await awsReadyImage(m[1]),response=awsImageResponse(png,time,timing);writeOptionalCache(key,response.clone(),ctx);return request.method==='HEAD'?new Response(null,{headers:response.headers}):response;
 }catch(error){console.warn('AWS Himawari temporarily unavailable',error.message);return Response.json({error:'aws_temporarily_unavailable'},{status:502,headers:{'Cache-Control':'no-store'}})}
}
