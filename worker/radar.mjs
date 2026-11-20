// Read only public feeds used by the agencies' own radar viewers.
// Fixed origins and paths; callers cannot supply arbitrary proxy destinations.
import {readOptionalCache,writeOptionalCache} from './optional-cache.mjs';
export const providers={
 thailand:{name:'TMD · ໄທ',page:'https://weather.tmd.go.th/composite/index_composite.html',coordinates:[[95,22.5],[108,22.5],[108,4],[95,4]],units:'mm/h'},
 vietnam:{name:'Hymetnet · ຫວຽດນາມ',page:'http://hymetnet.gov.vn/radar/',coordinates:[[97,25.2],[115,25.2],[115,7.2],[97,7.2]],units:'dBZ'},
 china:{name:'NMC · ຈີນຕາເວັນຕົກສຽງໃຕ້',page:'https://www.nmc.cn/publish/radar/xinan.html',units:'dBZ',display:'chart'}
};
export function compactTime(s){
 const m=/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/.exec(s);
 if(!m)return NaN;
 return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]||'00'}Z`)/1000;
}
export function parseFrames(provider,text){
 let frames=[];
 if(provider==='thailand'){
  for(const m of text.matchAll(/^\S+\s+"(\d{4}-\d{2}-\d{2} \d{2}:\d{2})"\s+overlay=(?:zr\/)?(\d{2})\.png\s*$/gm))frames.push({time:Date.parse(m[1].replace(' ','T')+':00Z')/1000,key:m[2],url:`/api/radar/thailand/image/${m[2]}`});
 }else if(provider==='vietnam'){
  for(const m of text.matchAll(/tentimesett\[\d+\]\s*=\s*"(\d{12})"/g))frames.push({time:compactTime(m[1]),key:m[1],url:`/api/radar/vietnam/image/${m[1]}`});
 }else if(provider==='china'){
  for(const m of text.matchAll(/data-img="(https:\/\/image\.nmc\.cn\/product\/[^"?]+\.PNG)(?:\?[^"<>]*)?"/g)){
   const url=new URL(m[1]),timeMatch=/_(\d{14})\d*\.PNG$/.exec(url.pathname);
   if(!timeMatch||!/^\/product\/\d{4}\/\d{2}\/\d{2}\/RDCP\/(?:medium\/)?[A-Z0-9_]+\.PNG$/.test(url.pathname))continue;
   frames.push({time:compactTime(timeMatch[1]),key:url.pathname,url:'/api/radar/china/image?path='+encodeURIComponent(url.pathname)});
  }
 }
 const seen=new Set(),ordered=frames.filter(f=>Number.isFinite(f.time)&&!seen.has(f.key)&&seen.add(f.key)).sort((a,b)=>a.time-b.time),latest=ordered.at(-1)?.time;
 return ordered.filter(f=>f.time>=latest-5*3600).slice(-51);
}
async function upstream(url){
 const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(18000)});
 if(!r.ok)throw new Error(`Upstream HTTP ${r.status}`);
 return r;
}
export async function radarRoute(request,ctx={}){
 const u=new URL(request.url),parts=u.pathname.split('/'),provider=parts[3],config=providers[provider];
 if(!config)return new Response('Unknown radar source',{status:404});
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
 const cacheKey=new Request(u.origin+u.pathname+(provider==='china'&&parts[4]==='image'?'?path='+encodeURIComponent(u.searchParams.get('path')||''):''));
 const hit=await readOptionalCache(cacheKey);if(hit)return hit;
 try{
  let response;
  if(parts.length===4){
   const endpoint=provider==='thailand'?'https://weather.tmd.go.th/composite/images_composite.list':config.page;
   const text=await (await upstream(endpoint)).text(),frames=parseFrames(provider,text);
   if(!frames.length)throw new Error('Radar frame list unavailable');
   // TMD's current viewer uses radar.sharing.latest as its observation time.
   if(provider==='thailand'){
    try{const raw=(await (await upstream('https://weather.tmd.go.th/composite/radar.sharing.latest')).text()).trim();const latest=Date.parse(raw.replace(' ','T')+':00Z')/1000;
     if(Number.isFinite(latest)){for(let i=0;i<frames.length;i++)frames[i].time=latest-(frames.length-1-i)*900;}
    }catch{/* Use the published list timestamps if the companion file is down. */}
   }
   response=Response.json({...config,provider,frames,fetchedAt:new Date().toISOString()},{headers:{'Cache-Control':'private, max-age=120'}});
  }else if(parts[4]==='image'){
   let url;
   if(provider==='thailand'&&parts.length===6&&/^\d{2}$/.test(parts[5]))url=`https://weather.tmd.go.th/composite/images/zr/${parts[5]}.png`;
   if(provider==='vietnam'&&parts.length===6&&/^\d{12}$/.test(parts[5]))url=`http://hymetnet.gov.vn/dataout_web/COM/${parts[5].slice(0,8)}/COM_${parts[5]}_CMAX00.png`;
   if(provider==='china'&&parts.length===5){const p=u.searchParams.get('path')||'';if(/^\/product\/\d{4}\/\d{2}\/\d{2}\/RDCP\/(?:medium\/)?[A-Z0-9_]+\.PNG$/.test(p))url='https://image.nmc.cn'+p;}
   if(!url)return new Response('Invalid radar image',{status:400});
   const r=await upstream(url),body=new Uint8Array(await r.arrayBuffer());
   if(body.length>5000000||body[0]!==137||body[1]!==80||body[2]!==78||body[3]!==71)throw new Error('Invalid radar PNG');
   response=new Response(body,{headers:{'Content-Type':'image/png','Cache-Control':provider==='thailand'?'private, max-age=120':'private, max-age=600','X-Content-Type-Options':'nosniff'}});
  }else return new Response('Not found',{status:404});
  // Cache on the same protected site origin; never create a public proxy.
  const copy=response.clone();copy.headers.set('Cache-Control',provider==='thailand'?'public, max-age=120':'public, max-age=300');writeOptionalCache(cacheKey,copy,ctx);
  return response;
 }catch{return Response.json({error:'radar_source_unavailable',provider},{status:502,headers:{'Cache-Control':'no-store'}});}
}
