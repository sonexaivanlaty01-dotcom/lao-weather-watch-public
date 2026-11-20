import {shareRowHTML,bindShareRows} from './share.js?v=20261021fb';
// Storm tracking mode on the main map (22 Oct 2026). The home map is unchanged; the storm banner
// (app-shell.js) or the link /?storm=<id> switches the map into storm mode: zoomed out over Laos and
// the storm, live Himawari clouds on, JMA forecast track drawn on the map. "‹ ອອກ" leaves the mode.
// Data: /api/storms (worker/storms.mjs), values exactly as JMA published them.
export const STORM_LAYERS=['storm-cone','storm-cone-line','storm-far','storm-gale','storm-past','storm-track','storm-track-far','storm-points','storm-labels'];
const col=p=>!Number.isFinite(p)?'#94a3b8':p<=930?'#dc2626':p<=960?'#f97316':p<=985?'#facc15':'#60a5fa';
const CAT={TY:'ໄຕ້ຝຸ່ນ',STS:'ພາຍຸໂຊນຮ້ອນແຮງ',TS:'ພາຍຸໂຊນຮ້ອນ',TD:'ພາຍຸດີເປຣຊັນ',SCS:'ພາຍຸໄຊໂຄລນກຳລັງແຮງ',CS:'ພາຍຸໄຊໂຄລນ'};
// Who published the track. Bay of Bengal storms: JTWC text (the WMO centre there, IMD India, publishes PDF only).
export const agencyLao=s=>s.agency==='JTWC'?'JTWC ສະຫະລັດ (ເຂດອ່າວເບັງກອນ · ສູນທາງການແມ່ນ IMD ອິນເດຍ)':'JMA ຍີ່ປຸ່ນ (RSMC Tokyo)';
const R=6371;
function circle([lon,lat],km,n=64){const out=[],d=km/R,la=lat*Math.PI/180,lo=lon*Math.PI/180;for(let i=0;i<=n;i++){const b=i/n*2*Math.PI,l2=Math.asin(Math.sin(la)*Math.cos(d)+Math.cos(la)*Math.sin(d)*Math.cos(b)),o2=lo+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(la),Math.cos(d)-Math.sin(la)*Math.sin(l2));out.push([o2*180/Math.PI,l2*180/Math.PI])}return out}
const poly=ring=>({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[ring]}}),line=c=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:c}});
const fc=features=>({type:'FeatureCollection',features});
// Probability circles (the "cone"), split at 72 h: firm before, faint after.
export function stormGeometry(s){
 const pts=s.points,cut=pts.findIndex(p=>p.h>72),near=cut<0?pts:pts.slice(0,cut),far=cut<0?[]:pts.slice(cut-1);
 const rings=list=>list.filter(p=>p.r>0).map(p=>poly(circle([p.lon,p.lat],p.r/1000)));
 const end=pts.at(-1),gone=end.cat==='LOW'||end.w===0;
 return {cone:fc(rings(near)),far:fc(rings(far.slice(1))),track:line(near.map(p=>[p.lon,p.lat])),trackFar:far.length>1?line(far.map(p=>[p.lon,p.lat])):null,past:s.past.length>1?line(s.past):null,
  gale:s.wind?.gale?.max?poly(circle([pts[0].lon,pts[0].lat],s.wind.gale.max,96)):null,
  points:fc(pts.map(p=>({type:'Feature',properties:{h:p.h,color:col(p.p),label:p.h?'+'+p.h+' ຊມ'+(p===end&&gone?' · ສະຫຼາຍ':''):'',far:p.h>72},geometry:{type:'Point',coordinates:[p.lon,p.lat]}})))};
}
// Laos plus the 0–72 h track (the opening view of storm mode).
export function stormView(s){const near=s.points.filter(p=>p.h<=72),lons=[100.1,107.7,...near.map(p=>p.lon)],lats=[13.9,22.5,...near.map(p=>p.lat)];return [[Math.min(...lons),Math.min(...lats)],[Math.max(...lons),Math.max(...lats)]]}
// Storm mode lets the map pan over the whole West Pacific (the home map stops at 136° E).
export const STORM_BOUNDS=[[60,-15],[180,60]];
// Heading in Lao (JMA's 16-point compass, degrees from north).
const DIR=['ທິດເໜືອ','ທິດເໜືອ ຄ່ອນໄປທາງຕາເວັນອອກ','ທິດຕາເວັນອອກສ່ຽງເໜືອ','ທິດຕາເວັນອອກ ຄ່ອນໄປທາງເໜືອ','ທິດຕາເວັນອອກ','ທິດຕາເວັນອອກ ຄ່ອນໄປທາງໃຕ້','ທິດຕາເວັນອອກສ່ຽງໃຕ້','ທິດໃຕ້ ຄ່ອນໄປທາງຕາເວັນອອກ','ທິດໃຕ້','ທິດໃຕ້ ຄ່ອນໄປທາງຕາເວັນຕົກ','ທິດຕາເວັນຕົກສ່ຽງໃຕ້','ທິດຕາເວັນຕົກ ຄ່ອນໄປທາງໃຕ້','ທິດຕາເວັນຕົກ','ທິດຕາເວັນຕົກ ຄ່ອນໄປທາງເໜືອ','ທິດຕາເວັນຕົກສ່ຽງເໜືອ','ທິດເໜືອ ຄ່ອນໄປທາງຕາເວັນຕົກ'];
export const headingLao=deg=>Number.isFinite(deg)?DIR[Math.round(((deg%360)+360)%360/22.5)%16]:null;
const bearing=([a,b],[c,d])=>{const r=Math.PI/180,y=Math.sin((c-a)*r)*Math.cos(d*r),x=Math.cos(b*r)*Math.sin(d*r)-Math.sin(b*r)*Math.cos(d*r)*Math.cos((c-a)*r);return (Math.atan2(y,x)/r+360)%360};
// Is the storm moving towards Laos? Compares its heading with the bearing from the storm to Vientiane.
export function towardsLaos(p){if(!Number.isFinite(p.course))return null;const b=bearing([p.lon,p.lat],[102.6,18]),diff=Math.abs(((p.course-b)%360+540)%360-180);return diff<=45?'towards':diff>=110?'away':'side'}
const TOWARDS={towards:'ມຸ່ງໜ້າເຂົ້າຫາລາວ',away:'ເຄື່ອນທີ່ອອກຫ່າງຈາກລາວ',side:'ເຄື່ອນຜ່ານທາງຂ້າງ ບໍ່ກົງມາລາວ'};
const kmh=ms=>Number.isFinite(ms)?Math.round(ms*3.6):null;
const laoTime=iso=>{const d=new Date(Date.parse(iso)+7*3600e3);return d.getUTCDate()+'/'+(d.getUTCMonth()+1)+' '+String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Details card for storm mode: strength, wind, heading and speed, size, distance, forecast table.
export function stormDetailsHTML(s){
 const p=s.points[0],arrow=d=>Number.isFinite(d)?`<i class="sm-arrow" style="transform:rotate(${d}deg)">↑</i>`:'',tw=towardsLaos(p),wind=s.wind||{};
 const radius=r=>r?'ລັດສະໝີ '+(r.min===r.max?r.max:r.min+'–'+r.max)+' km':'';
 const row=(k,v)=>v?`<div class="sm-row"><span>${k}</span><b>${v}</b></div>`:'';
 const table=s.points.slice(1).filter(x=>x.h<=72||x===s.points.at(-1)).map(x=>`<tr><td>+${x.h} ຊມ<small>${laoTime(x.t)}</small></td><td style="color:${col(x.p)}">${x.p??'—'}</td><td>${kmh(x.w)??'—'}</td><td>${arrow(x.course)}</td></tr>`).join('');
 return `<div class="sm-grid">
  ${row('ຄວາມກົດອາກາດ',p.p?p.p+' hPa':'')}
  ${row('ລົມສູງສຸດໃກ້ສູນກາງ',Number.isFinite(p.w)?kmh(p.w)+' km/h ('+p.w+' m/s)':'')}
  ${row('ລົມກະໂຊກ',Number.isFinite(p.g)?kmh(p.g)+' km/h ('+p.g+' m/s)':'')}
  ${row('ທິດທາງເຄື່ອນທີ່',Number.isFinite(p.course)?arrow(p.course)+' '+headingLao(p.course):(p.slow?'ເຄື່ອນຊ້າ / ເກືອບຢູ່ກັບທີ່':''))}
  ${row('ຄວາມໄວເຄື່ອນທີ່',Number.isFinite(p.kmh)?p.kmh+' km/h':'')}
  ${tw?row('ທຽບກັບລາວ',`<span class="sm-tw ${tw}">${TOWARDS[tw]}</span>`):''}
  ${row('ເຂດລົມແຮງ (≥'+(s.radiiKmh?.gale??54)+' km/h)',radius(wind.gale))}
  ${row('ເຂດລົມພາຍຸ (≥'+(s.radiiKmh?.storm??90)+' km/h)',radius(wind.storm))}
  ${row('ຫ່າງຊາຍແດນລາວ',p.laoKm.toLocaleString()+' km')}
  ${row('ໃກ້ລາວທີ່ສຸດ',s.closest.km.toLocaleString()+' km · '+(s.closest.h>0?'ປະມານ +'+s.closest.h+' ຊມ':'ຕອນນີ້ (ຈາກນີ້ໄປຈະຫ່າງອອກ)'))}
 </div>
 <table class="sm-table"><thead><tr><th>ພະຍາກອນ</th><th>hPa</th><th>km/h</th><th>ທິດ</th></tr></thead><tbody>${table}</tbody></table>
 <p class="sm-src">ຂໍ້ມູນ: ${agencyLao(s)} ອອກ ${laoTime(s.issued)} ເວລາລາວ · ລົມສະເລ່ຍ ${s.windAvgMin||10} ນາທີ · ພາຍຸມີຜົນນອກເສັ້ນທາງໄດ້ · ບໍ່ແມ່ນປະກາດທາງການຂອງລາວ · ຕິດຕາມກົມອຸຕຸນິຍົມ ແລະ ອຸທົກກະສາດ</p>`;
}
// Short text sent with the link (the preview card carries the rest).
export function shareText(s){const p=s.points[0],cat={TY:'ໄຕ້ຝຸ່ນ',STS:'ພາຍຸໂຊນຮ້ອນແຮງ',TS:'ພາຍຸໂຊນຮ້ອນ',TD:'ພາຍຸດີເປຣຊັນ'}[s.category]||'ພາຍຸ';
 return ['🌀 '+cat+' '+(s.name||''),Number.isFinite(p.w)?'ລົມ '+kmh(p.w)+' km/h':'',headingLao(p.course)?'ໄປ'+headingLao(p.course):'','ຫ່າງຊາຍແດນລາວ '+p.laoKm.toLocaleString('en-US')+' km','ຕິດຕາມ:'].filter(Boolean).join(' · ')}
export function setupStormLayer(map,{homeBounds,markerClass,laoView,cloudOn,padding=()=>({top:110,bottom:150,left:20,right:40}),fetchImpl=fetch}={}){
 const bar=document.createElement('div');bar.className='app-storm-mode';bar.hidden=true;
 bar.innerHTML='<div class="sm-head"><button type="button" class="sm-exit" aria-label="ອອກຈາກໂໝດຕິດຕາມພາຍຸ">‹ ອອກ</button><div class="sm-text"><b></b><small></small></div><button type="button" class="sm-more" aria-expanded="false">ລາຍລະອຽດ ▾</button></div><div class="sm-details" hidden></div>';
 const more=bar.querySelector('.sm-more'),details=bar.querySelector('.sm-details');bindShareRows(details);
 more.onclick=()=>{const open=details.hidden;details.hidden=!open;more.setAttribute('aria-expanded',String(open));more.textContent=open?'ປິດ ▴':'ລາຍລະອຽດ ▾'};
 // The bar sits on top of the time bar (attached to it, same width); the report opens upwards.
 const dock=()=>document.querySelector('.workspace .timeline')||document.querySelector('.workspace')||document.body;
 dock().append(bar);
 let storms=[],active=null;
 const sources=g=>{const src=(id,data)=>{if(map.getSource(id))map.getSource(id).setData(data||fc([]));else map.addSource(id,{type:'geojson',data:data||fc([]),attribution:'Storm track: JMA RSMC Tokyo · JTWC'})};
  src('storm-cone',g.cone);src('storm-far',g.far);src('storm-gale',g.gale);src('storm-past',g.past);src('storm-track',g.track);src('storm-track-far',g.trackFar);src('storm-points',g.points);
  if(map.getLayer('storm-cone'))return;
  map.addLayer({id:'storm-cone',type:'fill',source:'storm-cone',paint:{'fill-color':'#facc15','fill-opacity':.1}});
  map.addLayer({id:'storm-cone-line',type:'line',source:'storm-cone',paint:{'line-color':'#facc15','line-width':1,'line-opacity':.6}});
  map.addLayer({id:'storm-far',type:'line',source:'storm-far',paint:{'line-color':'#facc15','line-width':1,'line-opacity':.35,'line-dasharray':[2,2]}});
  map.addLayer({id:'storm-gale',type:'line',source:'storm-gale',paint:{'line-color':'#facc15','line-width':1.5,'line-dasharray':[3,2]}});
  map.addLayer({id:'storm-past',type:'line',source:'storm-past',paint:{'line-color':'#cbd5e1','line-width':2}});
  map.addLayer({id:'storm-track',type:'line',source:'storm-track',layout:{'line-cap':'round'},paint:{'line-color':'#facc15','line-width':2.5,'line-dasharray':[2,1.5]}});
  map.addLayer({id:'storm-track-far',type:'line',source:'storm-track-far',layout:{'line-cap':'round'},paint:{'line-color':'#facc15','line-width':2,'line-opacity':.55,'line-dasharray':[1,2]}});
  map.addLayer({id:'storm-points',type:'circle',source:'storm-points',paint:{'circle-radius':['case',['==',['get','h'],0],7,5],'circle-color':['get','color'],'circle-stroke-color':'#fff','circle-stroke-width':2,'circle-opacity':['case',['get','far'],.6,1],'circle-stroke-opacity':['case',['get','far'],.6,1]}});
  if(map.getStyle().glyphs)map.addLayer({id:'storm-labels',type:'symbol',source:'storm-points',layout:{'text-field':['get','label'],'text-size':11,'text-offset':[.8,0],'text-anchor':'left'},paint:{'text-color':'#fff','text-halo-color':'#000','text-halo-width':1.5}})};
 // Time labels (+12 ຊມ …) as small HTML markers: the base map style has no font glyphs.
 let labels=[];const Marker=markerClass;
 const drawLabels=g=>{for(const m of labels)m.remove();labels=[];if(!Marker)return;for(const f of g.points.features){if(!f.properties.label)continue;const el=document.createElement('div');el.className='storm-lbl';el.textContent=f.properties.label;labels.push(new Marker({element:el,anchor:'left',offset:[8,0]}).setLngLat(f.geometry.coordinates).addTo(map))}requestAnimationFrame(declutter)};
 // Slow storms put forecast points close together: hide a time label that would cover an earlier one.
 const declutter=()=>{const shown=[];for(const m of labels){const el=m.getElement();el.style.visibility='';const r=el.getBoundingClientRect();if(shown.some(s=>r.left<s.right+2&&r.right>s.left-2&&r.top<s.bottom&&r.bottom>s.top))el.style.visibility='hidden';else shown.push(r)}};
 map.on('moveend',()=>{if(labels.length)declutter()});
 const visible=on=>{for(const id of STORM_LAYERS)if(map.getLayer(id)){map.setLayoutProperty(id,'visibility',on?'visible':'none');if(on)map.moveLayer(id)}if(!on){for(const m of labels)m.remove();labels=[]}};
 // One line under the name: wind, heading, speed, distance. The card holds the rest.
 function summary(s){const p=s.points[0],h=headingLao(p.course);
  bar.querySelector('small').textContent=[Number.isFinite(p.w)?'ລົມ '+kmh(p.w)+' km/h':'',h?'➜ '+h.replace('ທິດ','')+(Number.isFinite(p.kmh)?' '+p.kmh+' km/h':''):'','ຫ່າງຊາຍແດນລາວ '+p.laoKm.toLocaleString()+' km'].filter(Boolean).join(' · ');
  // Share row (Facebook, Messenger, WhatsApp, LINE, copy): the link /storm/<id> opens storm mode and
  // shows this storm's name, wind and distance from Laos in the link preview.
  details.innerHTML=stormDetailsHTML(s)+'<div class="sm-share"><b>ແບ່ງປັນພາຍຸລູກນີ້ໃຫ້ໝູ່</b>'+shareRowHTML(location.origin+'/storm/'+s.id,shareText(s))+'</div>'}
 function enter(id){
  const s=storms.find(x=>x.id===id)||storms[0];if(!s)return false;active=s;const g=stormGeometry(s);sources(g);visible(true);drawLabels(g);cloudOn?.();
  bar.querySelector('b').textContent=(CAT[s.category]||'ພາຍຸ')+' '+(s.name||'')+' · ຕິດຕາມພາຍຸ';
  summary(s);
  if(bar.parentNode!==dock())dock().append(bar);bar.hidden=false;document.body.classList.add('storm-mode');map.setMaxBounds(STORM_BOUNDS);map.setMinZoom(2);setTimeout(()=>map.resize(),50);
  map.fitBounds(stormView(s),{padding:padding(),maxZoom:5,duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:900});
  history.replaceState(null,'','/storm/'+s.id);return true}
 function exit(){active=null;visible(false);bar.hidden=true;document.body.classList.remove('storm-mode');if(homeBounds)map.setMaxBounds(homeBounds);map.setMinZoom(2.5);setTimeout(()=>map.resize(),50);history.replaceState(null,'','/');laoView?.()}
 bar.querySelector('.sm-exit').onclick=exit;
 const load=()=>fetchImpl('/api/storms').then(r=>r.ok?r.json():null).then(d=>{storms=(d?.storms||[]).filter(s=>s.category&&s.category!=='LOW').sort((a,b)=>a.closest.km-b.closest.km);
  if(active){const s=storms.find(x=>x.id===active.id);if(s){active=s;const g=stormGeometry(s);sources(g);drawLabels(g);summary(s)}else exit()}
  document.dispatchEvent(new CustomEvent('storms:update',{detail:storms}));return storms}).catch(()=>storms);
 // Open straight into storm mode from a shared /?storm=<id> link (once the page has settled).
 load().then(()=>{const want=location.pathname.match(/^\/storm\/((?:TC|IO)\d{4})/)?.[1]||new URLSearchParams(location.search).get('storm');if(want&&storms.length)setTimeout(()=>map.once('idle',()=>enter(want)),800)});
 setInterval(load,10*60000);
 return {enter:id=>storms.length?enter(id):load().then(()=>enter(id)),exit,get active(){return active}};
}
