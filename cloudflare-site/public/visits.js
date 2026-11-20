// Anonymous visitor ping for the owner's "online now / today" counts (/api/visits).
// Sends a random browser id (no name, e-mail or location), the open view and phone/desktop.
// Pings on load, every 2 minutes while the tab is visible, and when the tab comes back.
const KEY='llw-visitor',PING_MS=120000;
export function visitorId(storage=globalThis.localStorage,random=()=>crypto.getRandomValues(new Uint8Array(12))){
 try{const old=storage?.getItem(KEY);if(/^[0-9a-f]{24}$/.test(old||''))return old}catch{}
 const id=[...random()].map(b=>b.toString(16).padStart(2,'0')).join('');
 try{storage?.setItem(KEY,id)}catch{}
 return id;
}
export function visitPayload(id,view,width){return {id,view:view||null,device:width<768?'mobile':'desktop'}}
export function startVisits({currentView=()=>null}={}){
 const id=visitorId();let last=0;
 const ping=()=>{if(document.hidden)return;last=Date.now();fetch('/api/visits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(visitPayload(id,currentView(),innerWidth)),keepalive:true}).catch(()=>{})};
 ping();setInterval(ping,PING_MS);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-last>PING_MS/2)ping()});
}
