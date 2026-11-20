// Service worker (28 Oct 2026): shows phone alerts (Web Push, worker/push.mjs) and opens the page when
// one is tapped. It does not cache pages or data: the map must always show live data with its own times.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
// After the alert is on screen, a receipt tells the server this phone still gets alerts (1 Nov 2026: phones
// that never answer are removed after a long silence, worker/push.mjs pruneDead). Failures are ignored.
const receipt=async key=>{try{const s=await self.registration.pushManager.getSubscription();if(s)await fetch('/api/push/ack',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:s.endpoint,key:String(key||'').slice(0,120)})})}catch{}};
self.addEventListener('push',e=>{
 let d={};try{d=e.data?e.data.json():{}}catch{d={body:e.data?e.data.text():''}}
 e.waitUntil(self.registration.showNotification(d.title||'ລາວປອດໄພ',{body:d.body||'',tag:d.tag||undefined,lang:'lo',icon:'/icons/icon-192.png',badge:'/icons/badge-96.png',timestamp:d.at?Date.parse(d.at):Date.now(),data:{url:d.url||'/'}}).then(()=>receipt(d.tag)));
});
self.addEventListener('notificationclick',e=>{
 e.notification.close();
 const url=new URL(e.notification.data?.url||'/',self.location.origin).href;
 e.waitUntil((async()=>{for(const c of await self.clients.matchAll({type:'window',includeUncontrolled:true}))if(c.url===url&&'focus' in c)return c.focus();return self.clients.openWindow(url)})());
});
