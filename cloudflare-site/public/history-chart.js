// Station history dialog (/api/history): rain bars or river-level line for 10 days (hourly),
// 90 days, 1 year or everything (daily). Values are what the site saved from MRC; nothing is filled in.
export const RANGES=[['10d','10 ມື້','hourly',10],['90d','90 ມື້','daily',90],['1y','1 ປີ','daily',365],['all','ທັງໝົດ','daily',3660]];
const SVGNS='http://www.w3.org/2000/svg',W=640,H=220,PAD={l:44,r:12,t:14,b:26};
const el=(tag,attrs={},parent)=>{const n=document.createElementNS(SVGNS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);parent?.append(n);return n};
// Turns route points into {x: time label, v, lo, hi, partial} for either resolution.
export function seriesFrom(json,kind){
 const pts=json?.points||[];
 if(json?.res==='hourly'||json?.res==='raw')return pts.map(p=>({key:p.hour||p.t,v:p.v,lo:null,hi:null,partial:false})).filter(p=>Number.isFinite(p.v));
 return pts.map(p=>kind==='rain'?{key:p.day,v:p.total,lo:null,hi:null,partial:!p.complete}:{key:p.day,v:p.last,lo:p.vmin,hi:p.vmax,partial:false}).filter(p=>Number.isFinite(p.v));
}
export function summary(series,kind){
 if(!series.length)return null;const vals=series.map(p=>p.v);
 if(kind==='rain'){const total=vals.reduce((a,b)=>a+b,0),max=series.reduce((a,b)=>b.v>a.v?b:a);return {total:Math.round(total*10)/10,max:max.v,maxKey:max.key,wet:vals.filter(v=>v>=1).length}}
 const hi=series.reduce((a,b)=>(b.hi??b.v)>(a.hi??a.v)?b:a),lo=series.reduce((a,b)=>(b.lo??b.v)<(a.lo??a.v)?b:a);return {max:hi.hi??hi.v,maxKey:hi.key,min:lo.lo??lo.v,minKey:lo.key,last:vals.at(-1)};
}
function draw(svg,series,kind,station){
 svg.replaceChildren();if(!series.length)return;
 const ys=series.flatMap(p=>[p.v,p.lo,p.hi]).filter(Number.isFinite);
 if(kind==='level'){for(const v of [station?.alarm,station?.flood])if(Number.isFinite(v))ys.push(v)}
 let min=kind==='rain'?0:Math.min(...ys),max=Math.max(...ys,kind==='rain'?1:min+.5);const span=max-min;if(kind==='level'){min-=span*.08;max+=span*.08}
 const x=i=>PAD.l+(series.length===1?.5:i/(series.length-1))*(W-PAD.l-PAD.r),y=v=>H-PAD.b-(v-min)/(max-min)*(H-PAD.t-PAD.b);
 for(let k=0;k<=4;k++){const v=min+(max-min)*k/4;el('line',{x1:PAD.l,x2:W-PAD.r,y1:y(v),y2:y(v),stroke:'#e6ebf2'},svg);el('text',{x:PAD.l-6,y:y(v)+4,'text-anchor':'end','font-size':10,fill:'#7a8ba1'},svg).textContent=v.toFixed(kind==='rain'||max-min>5?0:1)}
 if(kind==='rain'){const bw=Math.max(1.5,(W-PAD.l-PAD.r)/series.length*.72);series.forEach((p,i)=>{el('rect',{x:x(i)-bw/2,y:y(p.v),width:bw,height:Math.max(0,y(0)-y(p.v)),rx:Math.min(2,bw/3),fill:p.partial?'#9cc3f5':'#1e6fd9'},svg)})}
 else{
  if(series.some(p=>Number.isFinite(p.hi)))el('path',{d:series.map((p,i)=>(i?'L':'M')+x(i)+' '+y(p.hi??p.v)).join('')+series.map((p,i)=>'L'+x(series.length-1-i)+' '+y(series[series.length-1-i].lo??series[series.length-1-i].v)).join('')+'Z',fill:'#cfe2fb'},svg);
  el('path',{d:series.map((p,i)=>(i?'L':'M')+x(i)+' '+y(p.v)).join(''),fill:'none',stroke:'#1e5bd8','stroke-width':2},svg);
  for(const [v,c,label] of [[station?.alarm,'#f08a24','ເຕືອນ'],[station?.flood,'#d7261e','ຖ້ວມ']])if(Number.isFinite(v)){el('line',{x1:PAD.l,x2:W-PAD.r,y1:y(v),y2:y(v),stroke:c,'stroke-dasharray':'5 4'},svg);el('text',{x:W-PAD.r-2,y:y(v)-4,'text-anchor':'end','font-size':10,fill:c},svg).textContent=label+' '+v+' m'}
 }
 const fmt=k=>k.length>10?k.slice(8,10)+'/'+k.slice(5,7)+' '+k.slice(11,13)+'ໂມງ':k.slice(8,10)+'/'+k.slice(5,7)+(series.length>200?'/'+k.slice(2,4):'');
 for(const i of [0,Math.floor((series.length-1)/2),series.length-1])el('text',{x:x(i),y:H-8,'text-anchor':i===0?'start':i===series.length-1?'end':'middle','font-size':10,fill:'#7a8ba1'},svg).textContent=fmt(series[i].key);
}
export function setupHistoryDialog({dialog,getJSON=url=>fetch(url).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})}){
 const $=s=>dialog.querySelector(s),svg=$('svg');let state=null;
 async function render(){
  const [,,res,days]=RANGES.find(r=>r[0]===state.range);$('.hist-status').textContent='ກຳລັງໂຫຼດ…';svg.replaceChildren();$('.hist-summary').replaceChildren();
  dialog.querySelectorAll('[data-hist-kind]').forEach(b=>{b.hidden=!state.kinds.includes(b.dataset.histKind);b.setAttribute('aria-pressed',String(b.dataset.histKind===state.kind))});
  dialog.querySelectorAll('[data-hist-range]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.histRange===state.range)));
  try{
   const json=await getJSON(`/api/history?id=${state.id}&kind=${state.kind}&res=${res}&days=${days}`);const series=seriesFrom(json,state.kind),s=summary(series,state.kind);
   draw(svg,series,state.kind,json.station);
   if(!s){$('.hist-status').textContent='ຍັງບໍ່ມີຂໍ້ມູນໃນຊ່ວງນີ້ · ເວັບເລີ່ມເກັບ 19 ຕ.ລ. 2026 ແລະ ເພີ່ມທຸກ 30 ນາທີ';return}
   const items=state.kind==='rain'?[['ຝົນລວມ',s.total+' mm'],['ມື້/ຊົ່ວໂມງ ຝົນຫຼາຍສຸດ',s.max+' mm'],[res==='daily'?'ມື້ທີ່ມີຝົນ ≥1 mm':'ຊົ່ວໂມງທີ່ມີຝົນ ≥1 mm',String(s.wet)]]:[['ລ່າສຸດ',s.last.toFixed(2)+' m'],['ສູງສຸດ',s.max.toFixed(2)+' m'],['ຕ່ຳສຸດ',s.min.toFixed(2)+' m']];
   $('.hist-summary').replaceChildren(...items.map(([a,b])=>{const d=document.createElement('div');const x=document.createElement('b');x.textContent=b;const y=document.createElement('span');y.textContent=a;d.append(x,y);return d}));
   $('.hist-status').textContent=`${series.length} ${res==='daily'?'ມື້':'ຊົ່ວໂມງ'} · ຈາກ ${series[0].key.slice(0,10)}`+(state.kind==='rain'&&res==='daily'?' · ແທ່ງສີອ່ອນ = ມື້ທີ່ຂໍ້ມູນບໍ່ຄົບ':'');
  }catch{$('.hist-status').textContent='ໂຫຼດສະຖິຕິບໍ່ສຳເລັດ · ລອງໃໝ່ພາຍຫຼັງ'}
 }
 dialog.querySelectorAll('[data-hist-kind]').forEach(b=>b.addEventListener('click',()=>{state.kind=b.dataset.histKind;render()}));
 dialog.querySelectorAll('[data-hist-range]').forEach(b=>b.addEventListener('click',()=>{state.range=b.dataset.histRange;render()}));
 return {open({id,name,kinds}){state={id,kinds,kind:kinds[0],range:'10d'};$('.hist-title').textContent=name;dialog.showModal();render()}};
}
