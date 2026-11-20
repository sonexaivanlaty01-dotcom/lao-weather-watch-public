// Only immutable public JMA infrared tiles and its publication list are proxied.
export function jmaUpstream(path){
 if(path==='/api/satellite/jma/times')return {url:'https://www.jma.go.jp/bosai/himawari/data/satimg/targetTimes_fd.json',type:'application/json',ttl:30};
 const m=/^\/api\/satellite\/jma\/tile\/(\d{14})\/(\d{14})\/([2-5])\/(\d{1,2})\/(\d{1,2})$/.exec(path);
 if(!m||!Number.isFinite(jmaTimestamp(m[1]))||!Number.isFinite(jmaTimestamp(m[2]))||Number(m[4])>=2**Number(m[3])||Number(m[5])>=2**Number(m[3]))return null;
 return {url:`https://www.jma.go.jp/bosai/himawari/data/satimg/${m[1]}/fd/${m[2]}/B13/TBB/${m[3]}/${m[4]}/${m[5]}.jpg`,type:'image/jpeg',ttl:86400};
}
import {jmaTimestamp} from '../dist/jma-satellite.js';
import {readOptionalCache,writeOptionalCache} from './optional-cache.mjs';
let jmaMetadata;
export async function satelliteRoute(request,ctx={}){
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const path=new URL(request.url).pathname,target=jmaUpstream(path);if(!target)return new Response('Not found',{status:404});
 const key=new Request(new URL(path,request.url));
 const hit=await readOptionalCache(key);if(hit)return hit;
 try{
  let response;
  if(target.type==='application/json'){
   if(!jmaMetadata||Date.now()-jmaMetadata.at>=30000){const r=await fetch(target.url,{redirect:'error',headers:{'Cache-Control':'no-cache',Accept:'application/json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('JMA HTTP '+r.status);const list=await r.json();if(!Array.isArray(list)||!list.some(row=>Number.isFinite(jmaTimestamp(row.validtime))))throw new Error('invalid_jma_metadata');jmaMetadata={list,at:Date.now()}}
   response=new Response(JSON.stringify(jmaMetadata.list),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=30'}});
  }else{const r=await fetch(target.url,{redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok||!r.headers.get('Content-Type')?.startsWith('image/jpeg'))throw new Error('image');response=new Response(r.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}})}
  writeOptionalCache(key,response.clone(),ctx);
  return request.method==='HEAD'?new Response(null,{headers:response.headers}):response;
 }catch(error){console.error('JMA upstream failure',target.type,error.message);return new Response('JMA imagery temporarily unavailable',{status:502,headers:{'Cache-Control':'no-store'}})}
}
