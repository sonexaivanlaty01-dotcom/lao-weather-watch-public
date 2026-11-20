// Weather, flood and dam headlines from KPL (Lao News Agency), which relays the
// Department of Meteorology and Hydrology's warnings. The DMH website could not be
// reached from outside Laos when this was built, and Facebook pages cannot be read
// without the page owner's permission. Only headline, short summary, date and link are
// shown; readers open KPL for the full article. Fixed upstream pages only.
import {readOptionalCache,writeOptionalCache} from './optional-cache.mjs';
import {readSnapshot,saveSnapshot} from './snapshot-store.mjs';
const KPL_ORIGIN='https://kpl.gov.la',KPL_PAGES=[{lang:'lo',url:'https://kpl.gov.la/default.aspx'},{lang:'en',url:'https://kpl.gov.la/En/default.aspx'},...['weather','flood','rain','storm','dam','meteorology'].map(q=>({lang:'en',url:'https://kpl.gov.la/En/search.aspx?search='+q}))];
const NEWS_TTL=30*60000,NEWS_KEEP_MS=30*86400000,NEWS_MAX=30,NEWS_DETAILS_PER_REFRESH=10;
let newsCached=null,newsPending=null,newsRetryAfter=0;const newsItems=new Map();
// Topic words; ນ້ຳ/ນໍ້າ are both common spellings.
const NEWS_LO=/ອຸຕຸນິຍົມ|ອຸທົກກະສາດ|ພະຍາກອນອາກາດ|ສະພາບອາກາດ|ຝົນຕົກ|ຝົນໜັກ|ນ[້ໍ]າຖ້ວມ|ນ[້ໍ]າປ່າ|ດິນເຈື່ອນ|ພາຍຸ|ລົມແຮງ|ລົມພາຍຸ|ລະດັບນ[້ໍ]າ|ເຂື່ອນ|ປ່ອຍນ[້ໍ]າ|ລະບາຍນ[້ໍ]າ|ໄພພິບັດ|ໄພແຫ້ງແລ້ງ|ອາກາດໜາວ|ຟ້າຜ່າ|ໝອກ/;
const NEWS_EN=/\b(weather|rains?|rainfall|heavy rain|floods?|flooding|flash floods?|storms?|landslides?|typhoons?|tropical (storm|depression|cyclone)|monsoon|dams?|water release|water levels?|drought|cold spell|thunderstorms?|meteorolog\w*|hydrolog\w*)\b/i;
// 'That Dam' is a stupa in Vientiane, not a dam.
const NEWS_NOT=/\bthat dam\b/i;
const WARNING=/ເຕືອນ|ແຈ້ງເຕືອນ|warn|alert|advisory/i;
export const newsTopic=(lang,title)=>(lang==='lo'?NEWS_LO:NEWS_EN).test(title||'')&&!NEWS_NOT.test(title||'');
const decode=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&rsquo;|&lsquo;/g,"'").replace(/&ldquo;|&rdquo;/g,'"').replace(/&ndash;|&mdash;/g,'–').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/\s+/g,' ').trim();
export function kplHeadlines(html,lang){
 // KPL lists: <a href = 'detail.aspx?id=N'>Title</a><p …>dd/mm/yyyy HH:MM</p>
 const seen=new Map();for(const m of String(html).matchAll(/href\s*=\s*['"][^'"]*?detail\.aspx\?id=(\d{1,7})['"][^>]*>([\s\S]{0,400}?)<\/a>(?:\s*<p[^>]*>\s*(\d\d)\/(\d\d)\/(20\d\d)[^<]*<\/p>)?/gi)){const title=decode(m[2]);if(title.length>=8&&!seen.has(m[1]))seen.set(m[1],{id:m[1],lang,title:title.slice(0,220),date:m[5]?`${m[5]}-${m[4]}-${m[3]}`:null})}
 return [...seen.values()];
}
export function kplDetail(html){
 const meta=name=>decode((new RegExp('<meta[^>]+(?:name|property)="'+name+'"[^>]+content="([^"]*)"','i').exec(html)||[])[1]||'');
 const image=meta('og:image'),date=/\/(20\d\d)\/(\d\d)\/(\d\d)\//.exec(image);
 return {title:meta('og:title'),summary:meta('Description').slice(0,400),date:date?`${date[1]}-${date[2]}-${date[3]}`:null};
}
async function kplText(url){const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'text/html'}});if(!r.ok)throw new Error('upstream');const text=await r.text();if(text.length>3000000)throw new Error('too_large');return text}
async function downloadNews(now=Date.now()){
 let ok=0;
 for(const page of KPL_PAGES){try{for(const h of kplHeadlines(await kplText(page.url),page.lang))if(newsTopic(h.lang,h.title)&&!newsItems.has(h.lang+h.id))newsItems.set(h.lang+h.id,{...h,url:KPL_ORIGIN+(h.lang==='en'?'/En':'')+'/detail.aspx?id='+h.id,firstSeen:now});ok++}catch{/* The other language page may still work. */}}
 if(!ok)throw new Error('kpl_unavailable');
 // Newest articles first (KPL ids increase over time).
 const pending=[...newsItems.values()].filter(i=>!i.detailed).sort((a,b)=>+b.id-+a.id).slice(0,NEWS_DETAILS_PER_REFRESH);
 await Promise.all(pending.map(async item=>{try{const d=kplDetail(await kplText(item.url));Object.assign(item,{title:d.title||item.title,summary:d.summary,date:item.date||d.date},{detailed:true})}catch{item.detailed=true}}));
 // Keep only items with a real publication date inside the window; search pages also
 // list old articles, which must never look new.
 for(const [key,item] of newsItems){const t=Date.parse(item.date||'');if(item.detailed&&!Number.isFinite(t)||Number.isFinite(t)&&now-t>NEWS_KEEP_MS)newsItems.delete(key)}
 // KPL sometimes republishes an article under a new id: keep one per title.
 const titles=new Set(),unique=[...newsItems.values()].filter(i=>i.date).sort((a,b)=>+b.id-+a.id).filter(i=>{const k=i.title.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');if(titles.has(k))return false;titles.add(k);return true});
 const items=unique.map(i=>({id:i.id,lang:i.lang,title:i.title,summary:i.summary||'',date:i.date||null,url:i.url,warning:WARNING.test(i.title+' '+(i.summary||'')),dmh:/ອຸຕຸນິຍົມ|Meteorology/i.test(i.title+' '+(i.summary||''))})).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||+b.id-+a.id).slice(0,NEWS_MAX);
 return {kind:'weather_news',source:'KPL Lao News Agency (relays DMH warnings)',page:KPL_ORIGIN,fetchedAt:now,items};
}
// The last list is kept in KV and served at once (up to a day old; every item shows its own date)
// while a newer one is fetched in the background: KPL takes about 5 s.
export const NEWS_KV='news:weather:v1',NEWS_SHOW_MS=24*3600000;
const useNews=data=>{newsCached=data;for(const i of data.items)if(!newsItems.has(i.lang+i.id))newsItems.set(i.lang+i.id,{...i,detailed:true,firstSeen:data.fetchedAt})};
export async function weatherNewsRoute(request,ctx={},{store=null}={}){
 if(!['GET','HEAD'].includes(request.method))return Response.json({error:'method_not_allowed'},{status:405});
 if(!request.headers.get('oai-authenticated-user-id'))return Response.json({error:'sign_in_required'},{status:401});
 const key=new Request('https://news.internal/kpl-weather-v2'),now=Date.now(),old=d=>!d||now-d.fetchedAt>=NEWS_TTL;
 try{
  if(!newsCached){const hit=await readOptionalCache(key);if(hit){try{useNews(await hit.json())}catch{/* Ignore invalid cached data. */}}}
  if(old(newsCached)){const kv=await readSnapshot(store,NEWS_KV);if(kv&&(!newsCached||kv.fetchedAt>newsCached.fetchedAt))useNews(kv)}
  if(newsCached&&now-newsCached.fetchedAt>=NEWS_SHOW_MS)newsCached=null;
  if(old(newsCached)){
   if(now<newsRetryAfter){if(!newsCached)throw new Error('backoff')}
   else{
    if(!newsPending){newsPending=downloadNews().then(data=>{newsCached=data;newsRetryAfter=0;writeOptionalCache(key,Response.json(data,{headers:{'Cache-Control':'public,max-age=1800'}}),ctx);saveSnapshot(store,NEWS_KV,data,ctx);return data}).catch(error=>{newsRetryAfter=Date.now()+300000;throw error}).finally(()=>newsPending=null);
     ctx.waitUntil?.(newsPending.catch(()=>{}))}
    if(!newsCached)await newsPending;
   }
  }
  const headers={'Cache-Control':'private,max-age=60','X-Content-Type-Options':'nosniff'};
  return request.method==='HEAD'?new Response(null,{headers}):Response.json({...newsCached,checkedAt:now},{headers});
 }catch{return Response.json({error:'weather_news_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
