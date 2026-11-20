import {CARD_FONTS} from './card-fonts.mjs';
import {logoSVG} from './brand.mjs';
import {shootCard} from './fb-bot.mjs';
// Sharing a storm (22 Oct 2026).
//  GET /storm/<TC id>            → the map page (index.html) with link-preview tags for that storm, so
//                                   Facebook/LINE/WhatsApp show its name, wind and distance from Laos;
//                                   the page itself opens straight into storm tracking mode.
//  GET /api/storm-card/<TC id>.jpg → the preview picture: the newest complete real Himawari-9 infrared
//                                   image of the storm (NASA GIBS), 1200×630, cached 30 minutes.
// Storm values come from /api/storms (JMA). Nothing is drawn or estimated on the picture.
export const SITE='https://lao-weather-watch.sonexaivanlaty01.workers.dev';
const CAT={TY:'ໄຕ້ຝຸ່ນ',STS:'ພາຍຸໂຊນຮ້ອນແຮງ',TS:'ພາຍຸໂຊນຮ້ອນ',TD:'ພາຍຸດີເປຣຊັນ',SCS:'ພາຍຸໄຊໂຄລນກຳລັງແຮງ',CS:'ພາຍຸໄຊໂຄລນ'};
const LEVEL={far:'ບໍ່ມຸ່ງໜ້າມາລາວ',watch:'ເຝົ້າລະວັງ',near:'ໃກ້ລາວ'};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export const stormIdOk=id=>/^(TC|IO)\d{4}$/.test(id||'');
// Short summary used for the share text and the preview tags.
export function stormSummary(s){
 const p=s.points[0],name=(CAT[s.category]||'ພາຍຸ')+' '+(s.name||s.number||'');
 const parts=[Number.isFinite(p.w)?'ລົມ '+Math.round(p.w*3.6)+' km/h':'',p.p?p.p+' hPa':'','ຫ່າງຊາຍແດນລາວ '+p.laoKm.toLocaleString('en-US')+' km',LEVEL[s.level]||''].filter(Boolean);
 return {title:'🌀 '+name+' · '+parts.slice(-2).join(' · '),description:parts.join(' · ')+' · ເສັ້ນທາງພະຍາກອນ '+(s.agency||'JMA')+' ແລະ ພາບດາວທຽມຈິງ · ລາວປອດໄພ',name};
}
// Replace the home page's preview tags with the storm's; <base> keeps ./app.js etc. working under /storm/.
export function stormPageHTML(html,s){
 const {title,description}=stormSummary(s),url=SITE+'/storm/'+s.id,img=SITE+'/api/storm-card/'+s.id+'.jpg?t='+encodeURIComponent(s.issued||'');
 const set=(h,attr,key,val)=>h.replace(new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`),`$1${esc(val)}$2`);
 let h=html.replace('<head>','<head><base href="/">').replace(/<title>[^<]*<\/title>/,'<title>'+esc(title)+' | ລາວປອດໄພ</title>');
 h=set(h,'name','description',description);h=set(h,'property','og:title',title);h=set(h,'property','og:description',description);h=set(h,'property','og:url',url);h=set(h,'property','og:image',img);
 h=h.replace(/(<meta property="og:image:type" content=")[^"]*(")/,'$1image/jpeg$2');
 return h;
}
const merc=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))*6378137;
// 1200×630 Web-Mercator box around the storm centre (wide enough for the whole cloud shield).
export function cardBBox(lon,lat,halfWidthKm=1100){const R=6378137,x=lon*Math.PI/180*R,y=merc(lat),hw=halfWidthKm*1000/Math.cos(lat*Math.PI/180),hh=hw*630/1200;return [x-hw,y-hh,x+hw,y+hh]}
// Heading words (JMA 16-point compass, degrees from north) for the card.
const DIR=['ທິດເໜືອ','ທິດເໜືອ ຄ່ອນໄປທາງຕາເວັນອອກ','ທິດຕາເວັນອອກສ່ຽງເໜືອ','ທິດຕາເວັນອອກ ຄ່ອນໄປທາງເໜືອ','ທິດຕາເວັນອອກ','ທິດຕາເວັນອອກ ຄ່ອນໄປທາງໃຕ້','ທິດຕາເວັນອອກສ່ຽງໃຕ້','ທິດໃຕ້ ຄ່ອນໄປທາງຕາເວັນອອກ','ທິດໃຕ້','ທິດໃຕ້ ຄ່ອນໄປທາງຕາເວັນຕົກ','ທິດຕາເວັນຕົກສ່ຽງໃຕ້','ທິດຕາເວັນຕົກ ຄ່ອນໄປທາງໃຕ້','ທິດຕາເວັນຕົກ','ທິດຕາເວັນຕົກ ຄ່ອນໄປທາງເໜືອ','ທິດຕາເວັນຕົກສ່ຽງເໜືອ','ທິດເໜືອ ຄ່ອນໄປທາງຕາເວັນຕົກ'];
const heading=d=>Number.isFinite(d)?DIR[Math.round(((d%360)+360)%360/22.5)%16]:null;
// Link-preview card (owner's request 22 Oct 2026: "like the province cards", picture with the storm's
// name and heading). Real photo full-bleed; the text sits in the centre so it survives Facebook's
// square crop (same rule as the province cards, option C). Rendered by Browser Run (free: 10 min/day).
export function cardHTML(s,photoURL,photoTime){
 const p=s.points[0],{name}=stormSummary(s),hd=heading(p.course),lao=new Date(Date.parse(photoTime)+7*3600e3);
 const when=lao.getUTCDate()+'/'+(lao.getUTCMonth()+1)+' '+String(lao.getUTCHours()).padStart(2,'0')+':'+String(lao.getUTCMinutes()).padStart(2,'0');
 const lv={far:['#15803d','ບໍ່ມຸ່ງໜ້າມາລາວ'],watch:['#d97706','ເຝົ້າລະວັງ'],near:['#b91c1c','ໃກ້ລາວ · ຕິດຕາມປະກາດ']}[s.level]||['#15803d',''];
 const arrow=Number.isFinite(p.course)?`<svg width="54" height="54" viewBox="-32 -32 64 64" style="transform:rotate(${p.course}deg)"><circle r="30" fill="rgba(250,204,21,.18)" stroke="#facc15" stroke-width="3"/><path d="M0 -22 L13 8 L0 1 L-13 8 Z" fill="#facc15"/></svg>`:'';
 return `<!doctype html><html lang="lo"><head><meta charset="utf-8"><style>${CARD_FONTS}*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;overflow:hidden;background:#0b1220;font-family:'Noto Sans Lao',Inter,sans-serif;color:#fff;position:relative}
.ph{position:absolute;inset:0;background:#0b1220 url('${String(photoURL).replace(/['()\\\s]/g,encodeURIComponent)}') center/cover}
.sh{position:absolute;inset:0;background:radial-gradient(ellipse 62% 70% at 50% 46%,transparent 40%,rgba(8,16,30,.35)),linear-gradient(transparent 38%,rgba(8,16,30,.92) 78%)}
.top{position:absolute;left:300px;width:600px;top:24px;display:flex;justify-content:center;gap:10px}
.logo{display:flex;align-items:center;gap:10px;font-weight:900;font-size:24px;background:rgba(8,16,30,.78);padding:7px 16px 7px 7px;border-radius:16px}.logo i{width:42px;height:42px;border-radius:12px;background:#2563eb;display:grid;place-items:center;font-style:normal;font-size:24px}
.tag{align-self:center;background:#dc2626;font-weight:900;font-size:19px;padding:7px 13px;border-radius:10px}
.box{position:absolute;left:300px;width:600px;bottom:26px;text-align:center}
.nm{font-size:58px;font-weight:900;line-height:1.1;text-shadow:0 3px 12px #000}
.hd{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:10px;font-size:26px;font-weight:800;color:#fde047;text-shadow:0 2px 8px #000}
.row{display:flex;justify-content:center;gap:10px;margin-top:14px}.row span{background:rgba(255,255,255,.14);border-radius:12px;padding:7px 14px;font-size:22px;font-weight:800}
.lv{background:${lv[0]}!important}
.src{position:absolute;right:16px;bottom:10px;font-size:14px;color:#cbd5e1;font-family:Inter,'Noto Sans Lao'}</style></head><body>
<div class="ph"></div><div class="sh"></div>
<div class="top"><div class="logo"><i style="background:none">${logoSVG()}</i>ລາວປອດໄພ</div><div class="tag">ຕິດຕາມພາຍຸ</div></div>
<div class="box"><div class="nm">${esc(name)}</div>${hd?`<div class="hd">${arrow}<span>ກຳລັງໄປ${esc(hd)}${Number.isFinite(p.kmh)?' · '+p.kmh+' km/h':''}</span></div>`:''}
<div class="row">${Number.isFinite(p.w)?`<span>ລົມ ${Math.round(p.w*3.6)} km/h</span>`:''}<span>ຫ່າງລາວ ${p.laoKm.toLocaleString('en-US')} km</span>${lv[1]?`<span class="lv">${lv[1]}</span>`:''}</div></div>
<div class="src">Himawari-9 / NASA GIBS ${esc(when)} · ${esc(s.agency||'JMA')} · ລາວປອດໄພ</div></body></html>`;
}
// Newest complete photo: NASA fills the newest frames in strips, so try 40–120 min ago and keep the
// first JPEG large enough to be a full picture (a blank one is a few KB).
export async function newestPhoto(lon,lat,fetchImpl,now){const b=cardBBox(lon,lat);
 for(const back of [40,50,60,70,80,100,120]){const t=new Date(Math.floor((now-back*60000)/600000)*600000).toISOString().slice(0,19)+'Z';
  const url=`https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=Himawari_AHI_Band13_Clean_Infrared&CRS=EPSG:3857&BBOX=${b.join(',')}&WIDTH=1200&HEIGHT=630&FORMAT=image/jpeg&TIME=${t}`;
  try{const r=await fetchImpl(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)continue;const buf=await r.arrayBuffer();if(buf.byteLength<60000)continue;return {url,t,buf}}catch{/* next time */}}
 return null}
// The photo goes into the card as a data: URL (the render browser then never waits for NASA).
export function dataURL(buf){const b=new Uint8Array(buf);let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return 'data:image/jpeg;base64,'+btoa(s)}
// Cards are kept per storm bulletin (KV, 6 h): a new image is rendered only when JMA issues a new one.
export async function stormCardRoute(request,ctx,{storms,env={},fetchImpl=fetch,now=Date.now()}){
 const id=new URL(request.url).pathname.match(/\/api\/storm-card\/((?:TC|IO)\d{4})\.jpg$/)?.[1];if(!id)return new Response('not found',{status:404});
 const s=(await storms())?.find(x=>x.id===id);if(!s)return new Response('not found',{status:404});
 const kvKey='storm-card2:'+id+':'+(s.issued||''),kv=env.FORECAST_KV,headers=t=>({'Content-Type':'image/jpeg','Cache-Control':'public,max-age=1800','X-Image-Time':t||'','X-Source':'Himawari-9 / NASA GIBS · '+(s.agency||'JMA')});
 if(kv){try{const {value,metadata}=await kv.getWithMetadata(kvKey,'arrayBuffer');if(value)return new Response(value,{headers:headers(metadata?.t)})}catch{/* render again */}}
 const p=s.points[0],photo=await newestPhoto(p.lon,p.lat,fetchImpl,now);if(!photo)return Response.redirect(SITE+'/og/home.jpg?v=2',302);
 const img=await shootCard(env,cardHTML(s,dataURL(photo.buf),photo.t),{width:1200,height:630,quality:86});
 if(img){if(kv)ctx.waitUntil?.(kv.put(kvKey,img,{expirationTtl:6*3600,metadata:{t:photo.t}}));return new Response(img,{headers:headers(photo.t)})}
 // Without Browser Run (or over its daily limit): the real photo without text.
 return new Response(photo.buf,{headers:{...headers(photo.t),'Cache-Control':'public,max-age=600'}});
}
export async function stormPageRoute(request,env,{storms}){
 const id=new URL(request.url).pathname.match(/^\/storm\/((?:TC|IO)\d{4})\/?$/)?.[1];
 const page=await env.ASSETS.fetch(new Request(new URL('/index.html',request.url)));let html=await page.text();
 const s=id?(await storms())?.find(x=>x.id===id):null;if(s)html=stormPageHTML(html,s);else html=html.replace('<head>','<head><base href="/">');
 return new Response(html,{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public,max-age=300','X-Content-Type-Options':'nosniff'}});
}
