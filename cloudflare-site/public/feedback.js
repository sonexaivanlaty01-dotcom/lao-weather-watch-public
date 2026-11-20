// Feedback dialog (Lao): star rating, topic, free text. Anonymous; sent to /api/feedback.
// "website" is a hidden honeypot field; the time spent on the form is sent so the
// server can ignore instant robot submissions.
const MESSAGES={sent:'ຂອບໃຈຫຼາຍໆ ສຳລັບຄຳຕິຊົມ! ພວກເຮົາຈະນຳໄປປັບປຸງເວັບ.',empty:'ກະລຸນາໃຫ້ດາວ ຫຼື ຂຽນຄຳຄິດເຫັນກ່ອນ',tooMany:'ທ່ານສົ່ງຫຼາຍເທື່ອແລ້ວ · ລອງໃໝ່ພາຍຫຼັງ',failed:'ສົ່ງບໍ່ສຳເລັດ · ກວດອິນເຕີເນັດ ແລ້ວລອງໃໝ່',sending:'ກຳລັງສົ່ງ…'};
export function feedbackPayload(form,openedAt,now=Date.now()){
 return {rating:+form.rating||null,topic:form.topic||null,message:String(form.message||'').trim(),website:form.website||'',elapsedMs:now-openedAt,view:form.view||null,viewport:form.viewport||null};
}
export function setupFeedback({openButtons,dialog,currentView=()=>null}){
 const $=sel=>dialog.querySelector(sel),stars=[...dialog.querySelectorAll('[data-star]')],topics=[...dialog.querySelectorAll('[data-topic]')];
 let rating=0,topic=null,openedAt=0,sending=false;
 const status=(text,kind='')=>{const s=$('.fb-status');s.textContent=text;s.dataset.kind=kind};
 const paintStars=()=>stars.forEach(b=>{const on=+b.dataset.star<=rating;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(+b.dataset.star===rating))});
 stars.forEach(b=>b.addEventListener('click',()=>{rating=+b.dataset.star===rating?0:+b.dataset.star;paintStars();status('')}));
 topics.forEach(b=>b.addEventListener('click',()=>{topic=topic===b.dataset.topic?null:b.dataset.topic;topics.forEach(t=>t.setAttribute('aria-pressed',String(t.dataset.topic===topic)))}));
 const count=()=>{$('.fb-count').textContent=$('#fbMessage').value.length+' / 1000'};$('#fbMessage').addEventListener('input',()=>{count();status('')});
 function reset(){rating=0;topic=null;paintStars();topics.forEach(t=>t.setAttribute('aria-pressed','false'));$('#fbMessage').value='';$('#fbWebsite').value='';count();status('');$('.fb-form').hidden=false;$('.fb-done').hidden=true}
 openButtons.forEach(b=>b.addEventListener('click',()=>{if($('.fb-done').hidden===false)reset();openedAt=Date.now();dialog.showModal();setTimeout(()=>stars[0]?.focus(),50)}));
 $('.fb-form').addEventListener('submit',async e=>{
  e.preventDefault();if(sending)return;
  const body=feedbackPayload({rating,topic,message:$('#fbMessage').value,website:$('#fbWebsite').value,view:currentView(),viewport:innerWidth+'x'+innerHeight},openedAt);
  if(!body.rating&&body.message.length<3){status(MESSAGES.empty,'error');return}
  sending=true;$('.fb-send').disabled=true;status(MESSAGES.sending);
  try{
   const r=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout?.(15000)});
   if(r.status===429){status(MESSAGES.tooMany,'error');return}
   if(!r.ok)throw new Error('HTTP '+r.status);
   $('.fb-form').hidden=true;$('.fb-done').hidden=false;$('.fb-done p').textContent=MESSAGES.sent;
  }catch{status(MESSAGES.failed,'error')}
  finally{sending=false;$('.fb-send').disabled=false}
 });
 reset();
}
