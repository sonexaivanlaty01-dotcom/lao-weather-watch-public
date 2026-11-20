// Share row (design 3, 20 Oct 2026): Facebook, Messenger, WhatsApp, LINE, copy link.
// Used by the map (weather panel) and, on the server, by the province pages. Only public share
// URLs of each service; nothing is sent until the person taps a button.
export const SHARE_TARGETS=['facebook','messenger','whatsapp','line','copy'];
const ICON={
 facebook:'<path fill="currentColor" stroke="none" d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3Z"/>',
 messenger:'<path fill="currentColor" stroke="none" d="M12 3C7 3 3 6.7 3 11.3c0 2.6 1.3 4.9 3.3 6.4V21l3-1.7c.9.3 1.8.4 2.7.4 5 0 9-3.7 9-8.4S17 3 12 3Zm.9 11.2-2.3-2.4-4.4 2.4 4.9-5.2 2.3 2.4 4.4-2.4-4.9 5.2Z"/>',
 whatsapp:'<path fill="currentColor" stroke="none" d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3Zm4.6 12.6c-.2.6-1.1 1.1-1.6 1.2-.4.1-.9.1-1.5-.1-.3-.1-.8-.3-1.3-.5-2.3-1-3.8-3.3-3.9-3.5-.1-.1-.9-1.2-.9-2.4s.6-1.7.8-1.9c.2-.2.5-.3.6-.3h.5c.1 0 .3 0 .5.4l.7 1.6c.1.1.1.3 0 .4l-.3.4-.3.3c-.1.1-.2.3-.1.5.1.2.6 1 1.3 1.6.9.8 1.6 1 1.8 1.1.2.1.4.1.5-.1l.7-.8c.1-.2.3-.2.5-.1l1.5.7c.2.1.4.2.4.3.1.1.1.6-.1 1.2Z"/>',
 line:'<path fill="currentColor" stroke="none" d="M12 3.5c-5 0-9 3.3-9 7.3 0 3.6 3.2 6.6 7.5 7.2.3.1.7.2.8.4.1.2.1.6 0 .8l-.1.8c0 .2-.2 1 .8.5 1-.4 5.6-3.3 7.6-5.6 1.4-1.5 2.1-3 2.1-4.1 0-4-4-7.3-9-7.3Zm-3.8 9.6H6.5c-.3 0-.5-.2-.5-.5V9.2c0-.3.2-.5.5-.5s.5.2.5.5v2.9h1.2c.3 0 .5.2.5.5s-.2.5-.5.5Zm1.8-.5c0 .3-.2.5-.5.5s-.5-.2-.5-.5V9.2c0-.3.2-.5.5-.5s.5.2.5.5v3.4Zm4.1 0c0 .2-.1.4-.3.5h-.2c-.2 0-.3-.1-.4-.2l-1.8-2.4v2.1c0 .3-.2.5-.5.5s-.5-.2-.5-.5V9.2c0-.2.1-.4.3-.5h.2c.2 0 .3.1.4.2l1.8 2.4V9.2c0-.3.2-.5.5-.5s.5.2.5.5v3.4Zm2.7-2.2c.3 0 .5.2.5.5s-.2.5-.5.5h-1.2v.7h1.2c.3 0 .5.2.5.5s-.2.5-.5.5h-1.7c-.3 0-.5-.2-.5-.5V9.2c0-.3.2-.5.5-.5h1.7c.3 0 .5.2.5.5s-.2.5-.5.5h-1.2v.7h1.2Z"/>',
 copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'};
export const SHARE_LABEL={facebook:'Facebook',messenger:'Messenger',whatsapp:'WhatsApp',line:'LINE',copy:'ຄັດລອກລິ້ງ'};
export const SHARE_COLOR={facebook:'#1877f2',messenger:'#0084ff',whatsapp:'#25d366',line:'#06c755',copy:'rgba(255,255,255,.12)'};
// Public share URLs for one page. Messenger has no web share URL without an app id: the
// fb-messenger: link opens the app on phones; on computers the button copies the link instead.
export function shareTargets(url,text){
 const u=encodeURIComponent(url),t=encodeURIComponent(text?text+' '+url:url);
 return {facebook:'https://www.facebook.com/sharer/sharer.php?u='+u,messenger:'fb-messenger://share/?link='+u,whatsapp:'https://wa.me/?text='+t,line:'https://social-plugins.line.me/lineit/share?url='+u,copy:url};
}
export const shareIcon=k=>`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const escAttr=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
// Static HTML (server pages): links work without script; the small script handles copy/Messenger.
export function shareRowHTML(url,text){
 const links=shareTargets(url,text);
 return '<div class="share-row" data-share-url="'+escAttr(url)+'" data-share-text="'+escAttr(text||'')+'">'+SHARE_TARGETS.map(k=>k==='copy'
  ?`<button type="button" class="share-btn" data-share="copy" style="background:${SHARE_COLOR[k]}" aria-label="${SHARE_LABEL[k]}" title="${SHARE_LABEL[k]}">${shareIcon(k)}</button>`
  :`<a class="share-btn" data-share="${k}" href="${escAttr(links[k])}" target="_blank" rel="noopener" style="background:${SHARE_COLOR[k]}" aria-label="ແບ່ງປັນທາງ ${SHARE_LABEL[k]}" title="${SHARE_LABEL[k]}">${shareIcon(k)}</a>`).join('')+'<span class="share-note" role="status"></span></div>';
}
const isPhone=()=>/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
async function copyText(text){try{await navigator.clipboard.writeText(text);return true}catch{const a=document.createElement('textarea');a.value=text;a.style.position='fixed';a.style.opacity='0';document.body.append(a);a.select();let ok=false;try{ok=document.execCommand('copy')}catch{}a.remove();return ok}}
// Phones: facebook.com/sharer in a new tab is grabbed by the Facebook app, which cannot open the
// sharer and closes at once (the tab flashes and vanishes). The phone share sheet did not reliably
// reach Facebook either (21 Oct 2026). So on phones the Facebook button opens Facebook's mobile
// sharer in this same tab: the post box with the link card (picture, title) appears directly.
export const mobileFacebookSharer=url=>'https://m.facebook.com/sharer.php?u='+encodeURIComponent(url);
function shareFacebookOnPhone(url){location.href=mobileFacebookSharer(url)}
// Click handling for any .share-row in the document (server pages and the map).
export function bindShareRows(root=document){
 root.addEventListener('click',async e=>{const b=e.target.closest?.('.share-btn');if(!b)return;const row=b.closest('.share-row'),url=row.dataset.shareUrl,note=row.querySelector('.share-note');
  if(b.dataset.share==='facebook'&&isPhone()){e.preventDefault();shareFacebookOnPhone(url);return}
  if(b.dataset.share==='copy'||(b.dataset.share==='messenger'&&!isPhone())){e.preventDefault();const ok=await copyText(url);note.textContent=ok?(b.dataset.share==='messenger'?'ຄັດລອກລິ້ງແລ້ວ · ວາງໃນ Messenger':'ຄັດລອກລິ້ງແລ້ວ'):'ຄັດລອກບໍ່ໄດ້ · ກົດຄ້າງທີ່ລິ້ງເພື່ອຄັດລອກ';setTimeout(()=>note.textContent='',3500)}});
}
// Map: update the row's links when the selected place changes.
export function updateShareRow(row,url,text){row.dataset.shareUrl=url;row.dataset.shareText=text||'';const links=shareTargets(url,text);row.querySelectorAll('a.share-btn').forEach(a=>a.href=links[a.dataset.share])}
export const SHARE_CSS='.share-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px}.share-btn{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;color:#fff;border:0;cursor:pointer;text-decoration:none;padding:0}.share-btn:active{transform:scale(.94)}.share-note{flex-basis:100%;font-size:12.5px;color:#7ee2a8;min-height:1em}';
