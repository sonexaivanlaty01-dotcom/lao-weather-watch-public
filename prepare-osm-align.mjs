// Aligns HydroRIVERS reaches (modelled, ~500 m, no names) with OpenStreetMap river centre
// lines (traced from imagery, named): each reach gets the OSM river name it follows and,
// when it clearly follows one OSM river, a line drawn on that river's real channel.
// The HydroRIVERS network (which reach flows into which, distances) is not changed.
const DEG_KM=111.2,CELL=.05,STEP_KM=.2;
// Lao name first: name:lo, else the Lao-script part of name, else name:en, else name.
export function riverName(tags={}){
 const lao=s=>(String(s||'').match(/[຀-໿][຀-໿\s]*/g)||[]).map(x=>x.trim()).sort((a,b)=>b.length-a.length)[0]||null;
 return lao(tags['name:lo'])||lao(tags.name)||(tags['name:en']||'').trim()||(tags.name&&!/[^\x00-\x7F]/.test(tags.name)?tags.name.trim():null)||null;
}
// One river often has several spellings in OSM (ນ້ຳງຶ່ມ / ນ້ຳງືມ / "Nam Ngum River"). Lao
// spellings are compared without tone marks; Latin ones without "river"; a way that has
// both a Lao and a Latin name links the two. Each group is shown with its most used Lao name.
const laoCanon=s=>s.normalize('NFC').replace(/[່-ໍ]/g,'').replace(/ຶ/g,'ື').replace(/\s+/g,'');
const latinCanon=s=>s.toLowerCase().replace(/\briver\b/g,'').replace(/\bxe\b/g,'se').replace(/[^a-z]/g,'');
export function riverGroups(ways){
 const parent=new Map(),find=k=>{while(parent.get(k)!==k){parent.set(k,parent.get(parent.get(k)));k=parent.get(k)}return k},add=k=>{if(!parent.has(k))parent.set(k,k);return k},union=(a,b)=>parent.set(find(a),find(b));
 const wayKeys=new Map();
 for(const w of ways){const t=w.tags||{},keys=[];
  for(const v of [t['name:lo'],t.name]){for(const lao of String(v||'').match(/[຀-໿][຀-໿\s]*/g)||[])keys.push(add('lo:'+laoCanon(lao)))}
  for(const v of [t['name:en'],/[^\x00-\x7F]/.test(t.name||'')?null:t.name]){if(v&&latinCanon(v))keys.push(add('en:'+latinCanon(v)))}
  for(let i=1;i<keys.length;i++)union(keys[0],keys[i]);if(keys.length)wayKeys.set(w.id,keys[0]);
 }
 const votes=new Map();for(const w of ways){const k=wayKeys.get(w.id);if(!k)continue;const g=find(k),name=riverName(w.tags);if(!name)continue;if(!votes.has(g))votes.set(g,new Map());const m=votes.get(g),lao=/[຀-໿]/.test(name);m.set(name,(m.get(name)||0)+(lao?1000:1))}
 const display=new Map();for(const [g,m] of votes)display.set(g,[...m].sort((a,b)=>b[1]-a[1])[0][0]);
 return w=>{const k=wayKeys.get(w.id);return k?display.get(find(k))||null:null};
}
function segmentIndex(ways){
 const grid=new Map(),segs=[],groupName=riverGroups(ways);
 for(const w of ways){const g=w.geometry||[];if(g.length<2)continue;const name=groupName(w),key=name||'way:'+w.id;
  for(let i=0;i+1<g.length;i++){const a=g[i],b=g[i+1];const s={ax:a.lon,ay:a.lat,bx:b.lon,by:b.lat,key,name};const id=segs.push(s)-1;
   const x0=Math.floor(Math.min(a.lon,b.lon)/CELL),x1=Math.floor(Math.max(a.lon,b.lon)/CELL),y0=Math.floor(Math.min(a.lat,b.lat)/CELL),y1=Math.floor(Math.max(a.lat,b.lat)/CELL);
   for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const c=x+','+y;if(!grid.has(c))grid.set(c,[]);grid.get(c).push(id)}}}
 return {grid,segs};
}
// Nearest point on any indexed segment within maxKm (optionally only one river key).
function nearest(index,lon,lat,maxKm,key=null){
 const k=Math.cos(lat*Math.PI/180),cx=Math.floor(lon/CELL),cy=Math.floor(lat/CELL);let best=null;
 for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++)for(const id of index.grid.get(x+','+y)||[]){
  const s=index.segs[id];if(key&&s.key!==key)continue;
  const ax=(s.ax-lon)*k,ay=s.ay-lat,dx=(s.bx-s.ax)*k,dy=s.by-s.ay,len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/len)):0;
  const px=ax+t*dx,py=ay+t*dy,km=Math.hypot(px,py)*DEG_KM;
  if(km<=maxKm&&(!best||km<best.km))best={km,key:s.key,name:s.name,lon:s.ax+t*(s.bx-s.ax),lat:s.ay+t*(s.by-s.ay)};
 }
 return best;
}
function densify(line){
 const pts=[];for(let i=0;i+3<line.length;i+=2){const [x0,y0,x1,y1]=[line[i],line[i+1],line[i+2],line[i+3]],km=Math.hypot((x1-x0)*Math.cos(y0*Math.PI/180),y1-y0)*DEG_KM,n=Math.max(1,Math.ceil(km/STEP_KM));for(let j=0;j<n;j++)pts.push([x0+(x1-x0)*j/n,y0+(y1-y0)*j/n])}
 pts.push([line.at(-2),line.at(-1)]);return pts;
}
function simplify(pts,tol){
 if(pts.length<=2)return pts;const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;const stack=[[0,pts.length-1]];
 while(stack.length){const [a,b]=stack.pop();let max=0,idx=-1;const [ax,ay]=pts[a],[bx,by]=pts[b],dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1e-12;
  for(let i=a+1;i<b;i++){const d=Math.abs(dy*(pts[i][0]-ax)-dx*(pts[i][1]-ay))/len;if(d>max){max=d;idx=i}}if(max>tol){keep[idx]=1;stack.push([a,idx],[idx,b])}}
 return pts.filter((_,i)=>keep[i]);
}
// reaches: [id,next,distDn,upland,cls,flatLine]. Returns new reaches with [..., nameIndex]
// (-1 = no name) and a names table. A line is replaced only when ≥80 % of its samples
// lie within reach of the same OSM river; otherwise the HydroRIVERS line stays.
// Names follow the network: going downstream, a reach keeps the name of its main upstream
// reach (largest upstream area, at least half of its own) unless ≥80 % of its samples follow
// another named OSM river (a real change of name). This stops a main river taking the name
// of a tributary drawn close to it, or a small stream's name after a confluence.
export function alignReaches(reaches,ways,{tol=.001}={}){
 const index=segmentIndex(ways),names=[],nameIdx=new Map(),stats={named:0,snapped:0,total:reaches.length};
 const vote=new Map();
 for(const r of reaches){
  const maxKm=r[3]>=50000?2.5:r[3]>=5000?1.8:1.2,samples=densify(r[5]),votes=new Map();
  for(const [x,y] of samples){const n=nearest(index,x,y,maxKm);if(n)votes.set(n.key,(votes.get(n.key)||0)+1)}
  let key=null,count=0;for(const [k,c] of votes)if(c>count){key=k;count=c}
  vote.set(r[0],{key,share:count/samples.length,samples,maxKm,named:key&&!key.startsWith('way:')?key:null});
 }
 const mainUp=new Map();for(const r of reaches){if(!r[1])continue;const m=mainUp.get(r[1]);if(!m||r[3]>m[3])mainUp.set(r[1],r)}
 const finalName=new Map();
 for(const r of [...reaches].sort((a,b)=>a[3]-b[3])){
  const v=vote.get(r[0]),up=mainUp.get(r[0]),inherited=up&&up[3]>=.5*r[3]?finalName.get(up[0]):null;
  // Very large rivers (≥50,000 km², e.g. the Mekong) never change name: a stream on the
  // bank can lie closer to the modelled line than the wide river's own centre line.
  finalName.set(r[0],inherited?(v.named&&v.named!==inherited&&v.share>=.8&&r[3]<50000?v.named:inherited):(v.named&&v.share>=.5?v.named:null));
 }
 const out=reaches.map(r=>{
  const v=vote.get(r[0]),name=finalName.get(r[0]);let line=r[5],ni=-1;
  if(name){if(!nameIdx.has(name)){nameIdx.set(name,names.length);names.push(name)}ni=nameIdx.get(name);stats.named++}
  // Redraw on the OSM channel only when the reach clearly follows that river.
  if(v.key&&v.share>=.8&&(!name||v.key===name)){
   const snapped=v.samples.map(([x,y])=>{const n=nearest(index,x,y,v.maxKm,v.key);return n?[n.lon,n.lat]:[x,y]});
   line=simplify(snapped,tol).flatMap(([x,y])=>[Math.round(x*1000)/1000,Math.round(y*1000)/1000]);stats.snapped++;
  }
  return [r[0],r[1],r[2],r[3],r[4],line,ni];
 });
 // Reaches redrawn separately can stop up to ~2 km apart at a junction: end each line at
 // the start of the reach it flows into, so routes are drawn without gaps.
 const start=new Map(out.map(r=>[r[0],[r[5][0],r[5][1]]]));
 for(const r of out){const s=start.get(r[1]);if(!s)continue;const L=r[5];if(Math.hypot(L.at(-2)-s[0],L.at(-1)-s[1])>.0005){r[5]=[...L,s[0],s[1]];stats.joined=(stats.joined||0)+1}}
 return {reaches:out,names,stats};
}
