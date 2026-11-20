// Phone layout "C" (app style, 19 Oct 2026): floating place search + feedback + alert badge at the
// top, round layer buttons on the right, a small weather card above the timeline, and the icon
// bar at the bottom (the existing .mobile-nav). Desktop keeps the dock; nothing here changes data.
import {shareRowHTML,bindShareRows,updateShareRow} from './share.js?v=20261021fb';
const $=id=>document.getElementById(id);
const MOBILE='(max-width:760px)';
// Lao district names start with "ມ. " (ເມືອງ); matching ignores it, spaces and case.
export const searchKey=s=>String(s||'').toLowerCase().replace(/^ມ\.\s*/,'').replace(/[\s.\-·]/g,'');
// Places: provinces first, then districts with their province. Each has the select values to apply.
// Province page slug, same rule as build-seo.mjs (e.g. "Vientiane Capital" → vientiane-capital).
export const provinceSlug=nameEn=>String(nameEn||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function placeIndex(provinces,districts){
 const out=provinces.map(f=>({label:f.properties.name_lo,sub:'ແຂວງ',province:f.properties.id,district:null,slug:provinceSlug(f.properties.name_en),provinceName:f.properties.name_lo,keys:[f.properties.name_lo,f.properties.name_en]}));
 for(const f of districts){const p=f.properties;out.push({label:p.name_lo,sub:'ແຂວງ'+p.parent_lo,province:p.parent_id,district:p.id,slug:provinceSlug(p.parent_en),provinceName:p.parent_lo,keys:[p.name_lo,p.name_en]})}
 return out.map(x=>({...x,keys:x.keys.filter(Boolean).map(searchKey)}));
}
// Best matches first: name starts with the query, then contains it. Provinces win ties.
export function searchPlaces(index,query,limit=8){
 const q=searchKey(query);if(!q)return [];
 const scored=[];for(const [i,p] of index.entries()){const s=p.keys.some(k=>k.startsWith(q))?0:p.keys.some(k=>k.includes(q))?1:-1;if(s>=0)scored.push([s,p.district?1:0,i,p])}
 return scored.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]).slice(0,limit).map(x=>x[3]);
}
// Applies a place through the existing pickers so the page reacts exactly as if chosen there.
export function choosePlace(place,{province=$('provinceSelect'),district=$('districtSelect')}={}){
 province.value=place.province;province.dispatchEvent(new Event('change',{bubbles:true}));
 if(place.district){district.value=place.district;district.dispatchEvent(new Event('change',{bubbles:true}))}
}
const TABS=[['map','ແຜນທີ່'],['weather','ອາກາດ'],['layers','ຊັ້ນຂໍ້ມູນ'],['news','ຂ່າວ']];
// Extra layers in the desktop palette: each row mirrors (and clicks) the switch in the layers panel.
export const PALETTE_SWITCHES=[['stationsToggle','ສະຖານີວັດຝົນ','MRC','gauge'],['riversToggle','ແມ່ນ້ຳ','','river'],['damsToggle','ເຂື່ອນ','','dam'],['terrainToggle','ພູມປະເທດ 3D','','terrain']];
const ICONS={logo:'<path d="M7.1 13.5a3.4 3.4 0 0 1-.56-6.7A4.9 4.9 0 0 1 16 5.85 3.75 3.75 0 0 1 17.06 13.5z" fill="#75c8ff" stroke="none"/><path d="M9 16.1l-.9 2.3M12 16.1l-.9 2.3M15 16.1l-.9 2.3" stroke="#fff" stroke-width="1.5"/>',info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.5"/>',gauge:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',river:'<path d="M3 8c3 0 3 2 6 2s3-2 6-2 3 2 6 2M3 15c3 0 3 2 6 2s3-2 6-2 3 2 6 2"/>',dam:'<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6"/>',terrain:'<path d="m3 19 6-11 4 6 3-4 5 9H3Z"/>',map:'<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',weather:'<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 9.5 4.25 4.25 0 0 0 7 18Z"/>',layers:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',news:'<path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6Z"/><path d="M10 19a2 2 0 0 0 4 0"/>',ai:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',chat:'<path d="M4 5h16v11H9l-5 4V5Z"/>',gps:'<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>'};
export const icon=name=>`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
export function setupAppShell({workspace=$('workspace'),controlDock=document.querySelector('.control-dock'),loadJSON=url=>fetch(url).then(r=>r.json())}={}){
 // Top bar: search, feedback, (the alert badge keeps its own element and is placed by CSS).
 const top=document.createElement('div');top.className='app-top';
 top.innerHTML=`<div class="app-brand"><span class="app-logo">${icon('logo')}</span><b>ລາວປອດໄພ</b><span class="app-live"><i></i>LIVE</span></div><form class="app-search" role="search"><span class="app-search-icon">${icon('search')}</span><label class="sr-only" for="placeSearch">ຄົ້ນຫາແຂວງ ຫຼື ເມືອງ</label><input id="placeSearch" type="search" autocomplete="off" enterkeyhint="search" placeholder="ຄົ້ນຫາແຂວງ ຫຼື ເມືອງ…" aria-controls="placeResults" aria-expanded="false"><ul id="placeResults" class="app-results" role="listbox" hidden></ul></form><nav class="app-tabs" aria-label="ເມນູ">${TABS.map(([v,l])=>`<button type="button" data-view="${v}"${v==='map'?' class="active"':''}>${l}</button>`).join('')}</nav><button type="button" class="app-round app-feedback" data-feedback-open aria-haspopup="dialog" aria-label="ສົ່ງຄຳຕິຊົມ">${icon('chat')}</button><button type="button" class="app-round app-sources" aria-label="ແຫຼ່ງຂໍ້ມູນ ແລະ ສິດການໃຊ້">${icon('info')}</button><button type="button" class="app-ai" data-ai-open>${icon('ai')}<span>ຖາມ AI</span></button>`;
 workspace.append(top);
 // Desktop tabs drive the existing dock tabs (which own the view switching and keyboard support).
 top.querySelectorAll('.app-tabs [data-view]').forEach(b=>b.addEventListener('click',()=>document.querySelector(`.dock-tabs [data-view=${b.dataset.view}]`)?.click()));
 top.querySelector('.app-sources').addEventListener('click',()=>$('sourcesDialog')?.showModal());
 const input=top.querySelector('input'),list=top.querySelector('ul');let index=null,results=[],active=-1;
 const ensureIndex=()=>index??=Promise.all([loadJSON('./data/admin/provinces.geojson'),loadJSON('./data/admin/districts.geojson')]).then(([p,d])=>placeIndex(p.features,d.features)).catch(()=>{index=null;return []});
 const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');active=-1};
 const paint=()=>{list.replaceChildren(...results.map((p,i)=>{const li=document.createElement('li');li.role='option';li.id='place-'+i;li.setAttribute('aria-selected',String(i===active));const b=document.createElement('strong');b.textContent=p.label;const s=document.createElement('span');s.textContent=p.sub;li.append(b,s);li.addEventListener('pointerdown',e=>{e.preventDefault();pick(p)});return li}));
  if(!results.length&&input.value.trim()){const li=document.createElement('li');li.className='empty';li.textContent='ບໍ່ພົບ · ລອງພິມຊື່ອື່ນ';list.append(li)}
  list.hidden=!input.value.trim();input.setAttribute('aria-expanded',String(!list.hidden));if(active>=0)input.setAttribute('aria-activedescendant','place-'+active);else input.removeAttribute('aria-activedescendant')};
 const pick=p=>{choosePlace(p);input.value=p.label;close();input.blur()};
 input.addEventListener('focus',ensureIndex);
 // Links from the province pages open the map on a place: /?place=LA-LP or /?place=<district id>.
 const wanted=new URLSearchParams(location.search).get('place');
 if(wanted&&/^[A-Za-z0-9-]{2,40}$/.test(wanted))(async()=>{
  for(let i=0;i<60&&($('provinceSelect')?.options.length||0)<2;i++)await new Promise(r=>setTimeout(r,250));
  const p=(await ensureIndex()).find(x=>x.district===wanted||(!x.district&&x.province===wanted));if(!p)return;
  choosePlace(p);input.value=p.label;history.replaceState(null,'',location.pathname);
 })();
 input.addEventListener('input',async()=>{const idx=await ensureIndex();results=searchPlaces(idx,input.value);active=-1;paint()});
 input.addEventListener('keydown',e=>{if(list.hidden)return;if(e.key==='ArrowDown'){active=Math.min(results.length-1,active+1);paint();e.preventDefault()}else if(e.key==='ArrowUp'){active=Math.max(0,active-1);paint();e.preventDefault()}else if(e.key==='Escape')close()});
 input.addEventListener('blur',()=>setTimeout(close,150));
 top.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const p=results[Math.max(0,active)];if(p)pick(p)});
 // Share row (Facebook, Messenger, WhatsApp, LINE, copy) at the top of the weather panel. It shares
 // the province page of the selected place (its link preview shows that province's card).
 const sharePanel=document.createElement('section');sharePanel.className='panel share-panel';
 sharePanel.innerHTML='<div class="section-heading"><h2>ແບ່ງປັນໃຫ້ໝູ່</h2></div><p class="small share-what"></p>'+shareRowHTML(location.origin+'/','ສະພາບອາກາດລາວ ມື້ນີ້');
 $('weatherPanel')?.prepend(sharePanel);bindShareRows(sharePanel);
 const shareSync=async()=>{const id=$('provinceSelect')?.value,row=sharePanel.querySelector('.share-row'),what=sharePanel.querySelector('.share-what');
  const p=id?(await ensureIndex()).find(x=>!x.district&&x.province===id):null;
  if(p){updateShareRow(row,location.origin+'/weather/'+p.slug,'ສະພາບອາກາດ ແຂວງ'+p.label+' ມື້ນີ້');what.textContent='ສົ່ງໜ້າພະຍາກອນ ແຂວງ'+p.label+' (ມື້ນີ້ ແລະ 7 ມື້)'}
  else{updateShareRow(row,location.origin+'/','ສະພາບອາກາດລາວ ມື້ນີ້');what.textContent='ສົ່ງລິ້ງແຜນທີ່ສະພາບອາກາດລາວ'}};
 $('provinceSelect')?.addEventListener('change',shareSync);shareSync();
 // Weather card: mirrors the values the weather panel already shows; tap opens that panel.
 const card=document.createElement('button');card.type='button';card.className='app-weather';card.setAttribute('aria-label','ເປີດສະພາບອາກາດໃນພື້ນທີ່');
 card.innerHTML='<span class="app-weather-place"><strong></strong><small class="app-weather-when"></small><small class="app-weather-note">ຕົ້ນແບບ · ບໍ່ແມ່ນປະກາດທາງການ</small></span><span class="app-weather-temp"></span><span class="app-weather-hilo"></span><span class="app-weather-rain"><b></b><small>ໂອກາດຝົນ</small></span><span class="app-weather-stats"></span><span class="app-weather-bars" aria-hidden="true"></span><small class="app-weather-axis" aria-hidden="true"><span>ດຽວນີ້</span><span>+3ຊມ</span><span>+6ຊມ</span><span>+9ຊມ</span><span>+12ຊມ</span></small><small class="app-weather-foot">ຕົ້ນແບບເພື່ອຊຸມຊົນ · ບໍ່ແມ່ນປະກາດເຕືອນໄພທາງການ · Open-Meteo GFS</small>';
 workspace.append(card);
 // Desktop extras (high/low, rain today, wind, next 12 hours of rain) from the weather the page loaded.
 document.addEventListener('weather:update',e=>{const {data,idx}=e.detail||{},d=data?.daily;if(!d)return;
  card.querySelector('.app-weather-hilo').textContent=`ສູງ ${Math.round(d.temperature_2m_max[idx])}° · ຕ່ຳ ${Math.round(d.temperature_2m_min[idx])}°`;
  card.querySelector('.app-weather-when').textContent='ແບບຈຳລອງ '+String(data.current?.time||'').slice(11,16)+(data.timezone&&data.timezone!=='Asia/Vientiane'?' (ເວລາທ້ອງຖິ່ນ)':' (ລາວ)');
  const stats=[['ຝົນມື້ນີ້',Number(d.precipitation_sum[idx]).toFixed(1),'mm'],['ລົມສູງສຸດ',Math.round(d.wind_speed_10m_max[idx]),'km/h']];
  card.querySelector('.app-weather-stats').replaceChildren(...stats.map(([a,b,u])=>{const s=document.createElement('span');const x=document.createElement('small');x.textContent=a;const y=document.createElement('b');y.textContent=b;const z=document.createElement('i');z.textContent=' '+u;y.append(z);s.append(x,y);return s}));
  const h=data.hourly,start=Math.max(0,h.time.indexOf(String(data.current?.time||'').slice(0,13)+':00')),next=h.precipitation.slice(start,start+12),max=Math.max(1,...next);
  card.querySelector('.app-weather-bars').replaceChildren(...next.map(v=>{const i=document.createElement('i');i.style.height=Math.max(6,Math.round(v/max*100))+'%';i.title=v+' mm';if(!(v>0))i.className='dry';return i}))});
 const num=id=>{const t=$(id)?.textContent||'';return /\d/.test(t)?t.replace(/\s+/g,' ').trim():'—'};
 const sync=()=>{card.querySelector('strong').textContent=$('selectedPlace')?.querySelector('strong')?.textContent||'ສປປ ລາວ';card.querySelector('.app-weather-temp').textContent=num('tempValue').replace(/\s*°C/,'°');card.querySelector('.app-weather-rain b').textContent=num('chanceValue').replace(/\s*%/,'%')};
 const watch=new MutationObserver(sync);for(const id of ['selectedPlace','tempValue','chanceValue'])if($(id))watch.observe($(id),{subtree:true,childList:true,characterData:true});sync();
 card.addEventListener('click',()=>document.querySelector('.mobile-nav [data-view=weather]')?.click());
 // Phones: the disclaimer sits as a small caption under the weather chip.
 const note=document.createElement('small');note.className='app-note-m';note.textContent='ຕົ້ນແບບ · ບໍ່ແມ່ນປະກາດທາງການ';workspace.append(note);
 // El Niño / La Niña chip (owner's option 1, 29 Oct 2026): next to the weather chip when it fits,
 // otherwise under it (desktop: under the weather card). Shown only while one is active or watched.
 const enso=document.createElement('a');enso.className='app-enso';enso.href='/elnino';enso.hidden=true;workspace.append(enso);
 const placeEnso=()=>{if(enso.hidden)return;const w=workspace.getBoundingClientRect(),c=card.getBoundingClientRect(),q=document.querySelector('.workspace>.quick-layers')?.getBoundingClientRect();
  if(!c.width){enso.style.visibility='hidden';return}enso.style.visibility='';
  const room=(q&&q.width?q.left:w.right)-6-(c.right+6),side=c.height<56&&enso.offsetWidth<=room,n=note.getBoundingClientRect();
  enso.style.left=(side?c.right+6:c.left)-w.left+'px';enso.style.top=(side?c.top+(c.height-enso.offsetHeight)/2:Math.max(c.bottom,n.height?n.bottom:0)+6)-w.top+'px'};
 fetch('/api/enso').then(r=>r.ok?r.json():null).then(d=>{const v=d?.now?.value??d?.latest?.anom,k=d?.disc?.key||'';if(!Number.isFinite(v))return;
  const side=k.startsWith('lanina')||(!k.startsWith('elnino')&&v<=-0.5)?'lanina':k.startsWith('elnino')||v>=0.5?'elnino':null;
  if(!side||!/advisory|watch/.test(k)&&Math.abs(v)<0.5)return;
  enso.classList.toggle('cold',side==='lanina');enso.textContent=(side==='lanina'?'ລານີຍາ ':'ເອລນີໂຍ ')+(v>0?'+':'')+v.toFixed(1);
  enso.setAttribute('aria-label',enso.textContent+' · ເບິ່ງຜົນກະທົບຕໍ່ລາວ');enso.hidden=false;placeEnso()}).catch(()=>{});
 new ResizeObserver(placeEnso).observe(card);addEventListener('resize',placeEnso);new MutationObserver(placeEnso).observe(workspace,{attributes:true,attributeFilter:['data-view']});
 // Phones: the three timeline mode buttons collapse into one dropdown in the timeline header.
 const modes=[...document.querySelectorAll('.timeline-mode button')],headRow=document.querySelector('.timeline-head');
 if(modes.length&&headRow){const sel=document.createElement('select');sel.className='app-mode-select';sel.setAttribute('aria-label','ເລືອກຍ້ອນຫຼັງ ຫຼື ພະຍາກອນ');
  const fill=()=>{sel.replaceChildren(...modes.map(b=>{const o=document.createElement('option');o.value=b.id;o.textContent=b.textContent.trim();o.disabled=b.disabled;return o}));sel.value=(modes.find(b=>b.getAttribute('aria-pressed')==='true')||modes[0]).id};
  sel.addEventListener('change',()=>{$(sel.value)?.click();fill()});
  const mo=new MutationObserver(fill);for(const b of modes)mo.observe(b,{attributes:true,childList:true,characterData:true,subtree:true});fill();headRow.append(sel)}
 // Bottom bar: line icons, alert count on "news".
 const nav=document.querySelector('.mobile-nav');
 if(nav){for(const b of nav.querySelectorAll('button')){const key=b.dataset.view||'ai',span=b.querySelector('span');if(span)span.outerHTML=icon(key)}
  const news=nav.querySelector('[data-view=news]'),banner=$('alertBanner');
  const badge=()=>{const n=banner?.dataset.count||'';news.dataset.count=n;news.setAttribute('aria-label','ຂ່າວ'+(n?' · '+n+' ແຈ້ງເຕືອນ':''))};
  if(banner)new MutationObserver(badge).observe(banner,{attributes:true,attributeFilter:['data-count']});badge()}
 // Desktop layer palette (right): the three image layers plus mirrored switches.
 const palette=document.createElement('div');palette.className='app-palette';palette.setAttribute('role','group');palette.setAttribute('aria-label','ຊັ້ນຂໍ້ມູນ');
 const head=document.createElement('div');head.className='app-palette-head';head.textContent='ຊັ້ນຂໍ້ມູນ';palette.append(head);
 const extra=document.createElement('div');extra.className='app-palette-extra';
 for(const [id,label,note,ic] of PALETTE_SWITCHES){const input=$(id);if(!input)continue;const b=document.createElement('button');b.type='button';b.innerHTML=icon(ic)+'<span></span>'+(note?'<small></small>':'');b.querySelector('span').textContent=label;if(note)b.querySelector('small').textContent=note;
  const sync=()=>b.setAttribute('aria-pressed',String(input.checked));b.addEventListener('click',()=>{input.click();sync()});input.addEventListener('change',sync);sync();extra.append(b)}
 const more=document.createElement('button');more.type='button';more.className='app-palette-more';more.textContent='ທຸກຊັ້ນຂໍ້ມູນ ›';more.addEventListener('click',()=>document.querySelector('.dock-tabs [data-view=layers]')?.click());extra.append(more);
 palette.append(extra);workspace.append(palette);
 // Layer buttons: phones → floating column; desktop → top of the palette.
 const quick=document.querySelector('.quick-layers'),mq=window.matchMedia(MOBILE);
 // The alert badge sits in the desktop top row (before feedback); on phones it floats on its own.
 const banner=$('alertBanner'),fb=top.querySelector('.app-feedback');
 // Phones: "all layers" button at the bottom of the layer column (desktop has it in the palette).
 const moreLayers=document.createElement('button');moreLayers.type='button';moreLayers.className='app-layers-more';moreLayers.innerHTML=icon('layers')+'<span class="sr-only">ທຸກຊັ້ນຂໍ້ມູນ</span>';
 moreLayers.addEventListener('click',()=>document.querySelector('.dock-tabs [data-view=layers]')?.click());quick?.append(moreLayers);
 // GPS (owner's option A, 29 Oct 2026): phones → its own button under the layer column; desktop → at the
 // end of the search box (the palette already reaches the zoom buttons at 768 px). Both press the
 // existing #locateBtn (app.js), which works outside Laos too.
 const locate=$('locateBtn'),gps=document.createElement('button');gps.type='button';gps.className='app-gps';
 const gpsSearch=document.createElement('button');gpsSearch.type='button';gpsSearch.className='app-gps-search';
 if(locate){for(const b of [gps,gpsSearch]){b.innerHTML=icon('gps')+'<span class="sr-only">ຕຳແໜ່ງຂອງຂ້ອຍ (GPS)</span>';b.title='ຕຳແໜ່ງຂອງຂ້ອຍ (GPS)';b.addEventListener('click',()=>{input.value='';close();locate.click()})}
  workspace.append(gps);top.querySelector('.app-search').append(gpsSearch);
  const busy=()=>{for(const b of [gps,gpsSearch]){b.disabled=locate.disabled;b.setAttribute('aria-busy',String(locate.disabled))}};new MutationObserver(busy).observe(locate,{attributes:true,attributeFilter:['disabled']});busy()}
 const placeGps=()=>{const q=quick?.getBoundingClientRect(),w=workspace.getBoundingClientRect();if(q?.height&&quick.parentNode===workspace)gps.style.top=q.bottom-w.top+8+'px'};
 if(quick)new ResizeObserver(placeGps).observe(quick);addEventListener('resize',placeGps);
 // Alert badge: in the top row on every screen (phones: after feedback; desktop: before it).
 const place=()=>{if(mq.matches){if(quick&&quick.parentNode!==workspace)workspace.append(quick);if(banner&&fb.nextSibling!==banner)fb.after(banner)}else{if(quick&&quick.parentNode!==palette)head.after(quick);if(banner&&banner.nextSibling!==fb)fb.before(banner)}};
 mq.addEventListener('change',()=>{place();placeGps()});place();placeGps();
 // Desktop zoom buttons sit above the timeline on the right. On short screens (1024×700, 1366×768) they
 // reached the layer palette (owner, 29 Oct 2026), so they move to the palette's left when the two would touch.
 const placeZoom=()=>{const z=workspace.querySelector('.maplibregl-ctrl-top-right');if(!z)return;z.style.right='';if(mq.matches)return;
  const a=z.getBoundingClientRect(),p=palette.getBoundingClientRect();if(a.height&&p.height&&a.top<p.bottom+8&&a.right>p.left-8)z.style.right=workspace.getBoundingClientRect().right-p.left+10+'px'};
 const zoomRO=new ResizeObserver(()=>requestAnimationFrame(placeZoom));zoomRO.observe(palette);const tl=document.querySelector('.timeline');if(tl)zoomRO.observe(tl);
 addEventListener('resize',placeZoom);mq.addEventListener('change',placeZoom);
 (function waitZoom(n){const z=workspace.querySelector('.maplibregl-ctrl-top-right');if(z&&z.children.length){zoomRO.observe(z);placeZoom()}else if(n<80)setTimeout(()=>waitZoom(n+1),250)})(0);
 document.body.classList.add('app-c');document.body.classList.remove('app-boot');
 return {top,card};
}
