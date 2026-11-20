// Phone alerts (28 Oct 2026, owner's choice): option 2 = invitation bar on the map for people who have
// not turned alerts on; option 5 = settings and the alerts already sent, in the News tab.
// iPhone: Apple only allows alerts for a site added to the Home Screen (iOS 16.4+), so iPhones in Safari
// get the "add to Home Screen" steps instead of the switch. The page sends only the subscription (an
// address at the browser's own push service), the province and the chosen kinds (worker/push.mjs).
import {provinceSlug} from './app-shell.js?v=20261029-zoom';
import {timeoutSignal} from './data-service.js?v=20261025-ios';
const $=id=>document.getElementById(id);
// The 4th field marks an opt-in kind: off by default and not part of the one-tap bar (the daily summary,
// owner's choice 28 Oct 2026, so people who only want warnings are not woken every morning).
export const KINDS=[['storm','ພາຍຸ','ທຸກແຂວງ'],['river','ນ້ຳຂຶ້ນຮອດລະດັບເຕືອນ','ສະຖານີ MRC ໃນແຂວງ'],['rain','ຝົນຕົກໜັກມື້ອື່ນ','ແຈ້ງຕອນ 17:00'],['heat','ອາກາດຮ້ອນຈັດມື້ອື່ນ','ແຈ້ງຕອນ 17:00'],['daily','ສະຫຼຸບອາກາດທຸກເຊົ້າ','ແຈ້ງຕອນ 06:00 · ອຸນຫະພູມ ແລະ ໂອກາດຝົນມື້ນີ້',true]];
const WARNINGS=KINDS.filter(k=>!k[3]).map(k=>k[0]);
// HIDE: "×" hides the bar for HIDE_DAYS. DONE: never show it again on this browser (owner's request,
// 28 Oct 2026): set by "already installed" on iPhone Safari (a tab cannot tell that the Home Screen app
// exists, they keep separate storage) and when someone turns alerts off on purpose.
const PREF='laoPushPrefs',HIDE='laoPushBannerHidden',DONE='laoPushBannerDone',HIDE_DAYS=14;
const store={get:k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}},set:(k,v)=>{try{v===null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v))}catch{}}};
const keyBytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
export const isIOS=(ua=navigator.userAgent,platform=navigator.platform,touch=navigator.maxTouchPoints)=>/iPad|iPhone|iPod/.test(ua)||(platform==='MacIntel'&&touch>1);
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const canPush=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const api=async(path,body)=>{const r=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:timeoutSignal(10000)});if(!r.ok)throw new Error('HTTP '+r.status);return r.json()};
const ICON='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6Z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>';
const SHARE='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5v9h14v-9h-1"/></svg>';
const IOS_STEPS=`<ol class="push-ios"><li>ກົດປຸ່ມ ແບ່ງປັນ ${SHARE} ຢູ່ລຸ່ມຈໍ Safari</li><li>ເລືອກ <b>ເພີ່ມໃສ່ໜ້າຈໍໂຮມ</b> (Add to Home Screen)</li><li>ເປີດ <b>ລາວປອດໄພ</b> ຈາກໄອຄອນ ແລ້ວເປີດແຈ້ງເຕືອນອີກຄັ້ງ</li></ol><p class="push-small">iPhone ຕ້ອງເປັນ iOS 16.4 ຂຶ້ນໄປ (ກົດລະບຽບຂອງ Apple)</p>`;
const when=iso=>{const d=new Date(Date.parse(iso)+7*3600000);return d.getUTCDate()+'/'+(d.getUTCMonth()+1)+' '+String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')};

export async function setupPush({workspace=$('workspace'),newsPanel=$('newsPanel'),provinceSelect=$('provinceSelect'),toast=()=>{},loadJSON=url=>fetch(url).then(r=>r.json())}={}){
 if(!workspace||!newsPanel)return null;
 const secure=location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname);
 if(secure&&'serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
 let key;try{key=(await api('/api/push/key')).key}catch{return null}   // alerts not set up: show nothing
 const provinces=await loadJSON('./data/admin/provinces.geojson').then(g=>g.features.map(f=>({id:f.properties.id,slug:provinceSlug(f.properties.name_en),name:f.properties.name_lo})).sort((a,b)=>a.name.localeCompare(b.name,'lo'))).catch(()=>[]);
 if(!provinces.length)return null;
 const nameOf=slug=>provinces.find(p=>p.slug===slug)?.name||'';
 const current=()=>provinces.find(p=>p.id===provinceSelect?.value)?.slug||'';
 const registration=async()=>{if(!secure||!canPush())return null;let t;const r=await Promise.race([navigator.serviceWorker.ready,new Promise(res=>{t=setTimeout(()=>res(null),8000)})]);clearTimeout(t);return r};
 const subscription=async()=>{try{return (await registration())?.pushManager.getSubscription()??null}catch{return null}};
 // on | ready | denied | ios-install | unsupported
 // iPhone in a Safari tab: never offer the switch there (Apple only delivers to Home Screen apps).
 const mode=async()=>{if(isIOS()&&!standalone())return 'ios-install';if(!secure||!canPush())return 'unsupported';if(Notification.permission==='denied')return 'denied';return (await subscription())&&store.get(PREF)?'on':'ready'};

 async function turnOn(province,kinds){
  const perm=await Notification.requestPermission();
  if(perm!=='granted'){toast(perm==='denied'?'ທ່ານບໍ່ອະນຸຍາດແຈ້ງເຕືອນ · ເປີດໄດ້ໃນການຕັ້ງຄ່າຂອງບຣາວເຊີ':'ຍັງບໍ່ໄດ້ເປີດແຈ້ງເຕືອນ');await refresh();return false}
  try{
   const reg=await registration();if(!reg)throw new Error('no_worker');
   const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(key)});
   await api('/api/push/subscribe',{subscription:sub.toJSON(),province,kinds});
   store.set(PREF,{province,kinds,syncedAt:Date.now()});toast('ເປີດແຈ້ງເຕືອນແລ້ວ · ແຂວງ'+nameOf(province));await refresh();return true;
  }catch{toast('ເປີດແຈ້ງເຕືອນບໍ່ສຳເລັດ · ລອງໃໝ່ອີກຄັ້ງ');return false}
 }
 async function turnOff(){
  const sub=await subscription();
  try{if(sub)await api('/api/push/unsubscribe',{endpoint:sub.endpoint});await sub?.unsubscribe()}catch{}
  store.set(PREF,null);store.set(DONE,true);toast('ປິດແຈ້ງເຕືອນແລ້ວ');await refresh();
 }

 // Option 2: invitation bar on the map.
 const bar=document.createElement('div');bar.className='push-banner';bar.hidden=true;bar.setAttribute('role','region');bar.setAttribute('aria-label','ຮັບແຈ້ງເຕືອນໄພ');
 bar.innerHTML=`<div class="push-banner-row"><span class="push-banner-icon">${ICON}</span><span class="push-banner-text"><b>ຢາກຮູ້ທັນທີ ເມື່ອມີໄພ?</b><small>ພາຍຸ · ນ້ຳຂຶ້ນ · ຝົນໜັກ · ຮ້ອນຈັດ</small></span><button type="button" class="push-banner-go" aria-expanded="false">ເປີດ</button><button type="button" class="push-banner-x" aria-label="ປິດແຖບນີ້">×</button></div>
<div class="push-banner-pick" hidden><p class="push-label">ເລືອກແຂວງຂອງທ່ານ</p><div class="push-chips" role="radiogroup" aria-label="ແຂວງ"></div><p class="push-error" role="alert" hidden>ກະລຸນາເລືອກແຂວງກ່ອນ</p><button type="button" class="push-banner-ok">ຮັບແຈ້ງເຕືອນທັງ 4 ເລື່ອງ</button><p class="push-small">ບໍ່ແມ່ນລະບົບເຕືອນໄພທາງການ · ປ່ຽນ ຫຼື ປິດໄດ້ໃນແຖບ ຂ່າວ</p></div>
<div class="push-banner-iosbox" hidden><p class="push-label">iPhone: ຕິດຕັ້ງກ່ອນ ຈຶ່ງຮັບແຈ້ງເຕືອນໄດ້</p>${IOS_STEPS}<button type="button" class="push-banner-done">ຕິດຕັ້ງແລ້ວ · ບໍ່ຕ້ອງສະແດງອີກ</button></div>`;
 workspace.append(bar);
 const chips=bar.querySelector('.push-chips'),pick=bar.querySelector('.push-banner-pick'),iosBox=bar.querySelector('.push-banner-iosbox'),go=bar.querySelector('.push-banner-go'),err=bar.querySelector('.push-error');
 let chosen='';
 const paintChips=()=>chips.replaceChildren(...provinces.map(p=>{const b=document.createElement('button');b.type='button';b.className='push-chip';b.setAttribute('role','radio');b.setAttribute('aria-checked',String(p.slug===chosen));b.textContent=p.name;b.addEventListener('click',()=>{chosen=p.slug;err.hidden=true;paintChips()});return b}));
 go.addEventListener('click',async()=>{const ios=(await mode())==='ios-install',box=ios?iosBox:pick,open=box.hidden;
  pick.hidden=true;iosBox.hidden=true;box.hidden=!open;go.setAttribute('aria-expanded',String(open));go.textContent=open?'ຍຸບ':'ເປີດ';
  if(open&&!ios){chosen=chosen||current();paintChips();chips.querySelector('[aria-checked=true]')?.scrollIntoView({block:'nearest'})}});
 bar.querySelector('.push-banner-ok').addEventListener('click',async()=>{if(!chosen){err.hidden=false;return}await turnOn(chosen,WARNINGS)});
 bar.querySelector('.push-banner-done').addEventListener('click',()=>{store.set(DONE,true);bar.hidden=true;document.body.classList.remove('has-push-banner')});
 bar.querySelector('.push-banner-x').addEventListener('click',()=>{store.set(HIDE,Date.now());bar.hidden=true;document.body.classList.remove('has-push-banner')});

 // Option 5: settings + recent alerts at the top of the News tab.
 const box=document.createElement('section');box.className='panel push-settings';
 box.innerHTML=`<div class="section-heading"><h2>ແຈ້ງເຕືອນໃນມືຖື</h2><span class="badge push-badge"></span></div><p class="small push-status" role="status"></p>
<div class="push-form"><label class="push-field"><span>ແຂວງ</span><select class="push-province"><option value="">— ເລືອກແຂວງ —</option>${provinces.map(p=>`<option value="${p.slug}">${p.name}</option>`).join('')}</select></label>
${KINDS.map(([k,l,n,opt])=>`<label class="layer-row push-kind"><span><span class="layer-title">${l}</span><span class="description">${n}</span></span><input type="checkbox" class="switch" value="${k}"${opt?'':' checked'}></label>`).join('')}
<p class="push-error" role="alert" hidden></p><div class="push-actions"><button type="button" class="push-save">ເປີດແຈ້ງເຕືອນ</button><button type="button" class="link-button push-off" hidden>ປິດແຈ້ງເຕືອນ</button></div></div>
<div class="push-iosbox" hidden>${IOS_STEPS}</div>
<p class="small push-note">ພາຍຸ: JMA / JTWC · ນ້ຳ: MRC · ຝົນ, ຮ້ອນ ແລະ ສະຫຼຸບອາກາດ: ພະຍາກອນ Open-Meteo · ບໍ່ແມ່ນລະບົບເຕືອນໄພທາງການ · <a href="/privacy">ຄວາມເປັນສ່ວນຕົວ</a></p>
<h3 class="push-recent-h">ແຈ້ງເຕືອນ 7 ມື້ຫຼ້າສຸດ</h3><ul class="push-recent"></ul><p class="small push-recent-empty" hidden>ບໍ່ມີແຈ້ງເຕືອນໃນ 7 ມື້ຜ່ານມາ</p>`;
 const head=newsPanel.querySelector('.close-mobile');if(head)head.after(box);else newsPanel.prepend(box);
 const sel=box.querySelector('.push-province'),form=box.querySelector('.push-form'),status=box.querySelector('.push-status'),badge=box.querySelector('.push-badge'),save=box.querySelector('.push-save'),off=box.querySelector('.push-off'),ferr=box.querySelector('.push-error');
 const kindsOn=()=>[...box.querySelectorAll('.push-kind input')].filter(i=>i.checked).map(i=>i.value);
 save.addEventListener('click',async()=>{const p=sel.value,k=kindsOn();if(!p||!k.length){ferr.textContent=!p?'ກະລຸນາເລືອກແຂວງກ່ອນ':'ເລືອກຢ່າງໜ້ອຍ 1 ເລື່ອງ';ferr.hidden=false;return}ferr.hidden=true;await turnOn(p,k)});
 sel.addEventListener('change',()=>{ferr.hidden=true;recent()});box.querySelectorAll('.push-kind input').forEach(i=>i.addEventListener('change',()=>{ferr.hidden=true}));
 off.addEventListener('click',turnOff);

 async function recent(){
  const list=box.querySelector('.push-recent'),empty=box.querySelector('.push-recent-empty');
  let alerts=[];try{alerts=(await api('/api/push/recent?province='+encodeURIComponent(sel.value||'')))?.alerts||[]}catch{}
  list.replaceChildren(...alerts.map(a=>{const li=document.createElement('li');li.className='push-item push-'+a.kind;const t=document.createElement('a');t.href=a.url;t.textContent=a.title;const b=document.createElement('span');b.textContent=a.body;const w=document.createElement('small');w.textContent=when(a.created_at)+' (ເວລາລາວ)';li.append(t,b,w);return li}));
  empty.hidden=alerts.length>0;
 }
 async function refresh(){
  const m=await mode(),pref=store.get(PREF),hiddenAt=store.get(HIDE);
  const showBar=(m==='ready'||m==='ios-install')&&!store.get(DONE)&&!(hiddenAt&&Date.now()-hiddenAt<HIDE_DAYS*86400000);
  bar.hidden=!showBar;document.body.classList.toggle('has-push-banner',showBar);
  if(!sel.value)sel.value=pref?.province||current();
  if(pref)box.querySelectorAll('.push-kind input').forEach(i=>{i.checked=pref.kinds.includes(i.value)});
  form.hidden=!['on','ready'].includes(m);box.querySelector('.push-iosbox').hidden=m!=='ios-install';
  off.hidden=m!=='on';save.textContent=m==='on'?'ບັນທຶກການປ່ຽນແປງ':'ເປີດແຈ້ງເຕືອນ';
  badge.textContent={on:'ເປີດຢູ່',ready:'ປິດຢູ່',denied:'ຖືກບລັອກ','ios-install':'ຕ້ອງຕິດຕັ້ງ',unsupported:'ບໍ່ຮອງຮັບ'}[m];badge.dataset.mode=m;
  status.textContent={on:'ຮັບແຈ້ງເຕືອນຂອງ ແຂວງ'+nameOf(pref?.province)+' ຢູ່ ໃນມືຖືເຄື່ອງນີ້',ready:'ເລືອກແຂວງ ແລະ ເລື່ອງທີ່ຢາກຮູ້ ແລ້ວກົດ ເປີດແຈ້ງເຕືອນ',denied:'ບຣາວເຊີບລັອກແຈ້ງເຕືອນຂອງເວັບນີ້ໄວ້ · ເປີດຄືນໄດ້ທີ່ ການຕັ້ງຄ່າເວັບໄຊ → ການແຈ້ງເຕືອນ → ອະນຸຍາດ','ios-install':'iPhone ຮັບແຈ້ງເຕືອນໄດ້ ເມື່ອເພີ່ມເວັບນີ້ໃສ່ໜ້າຈໍໂຮມກ່ອນ:',unsupported:'ບຣາວເຊີນີ້ຮັບແຈ້ງເຕືອນບໍ່ໄດ້ · ລອງເປີດດ້ວຍ Chrome ຫຼື Safari'}[m];
  // Keep the server copy fresh once a day (the browser may renew the subscription on its own).
  if(m==='on'&&pref&&Date.now()-(pref.syncedAt||0)>86400000){const sub=await subscription();if(sub)api('/api/push/subscribe',{subscription:sub.toJSON(),province:pref.province,kinds:pref.kinds}).then(()=>store.set(PREF,{...pref,syncedAt:Date.now()})).catch(()=>{})}
 }
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
 await refresh();recent();
 return {bar,box,refresh};
}
