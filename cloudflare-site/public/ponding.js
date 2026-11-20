// Rain-on-terrain ponding screening ("fill and spill") on a ~10 × 10 km DEM window.
// Screening only: no drains, culverts, pumps, river overflow, soil moisture or time
// evolution; the DEM is a surface model (trees and buildings included).
//
// 1. Priority-flood (Barnes et al. 2014) from the window edge gives the filled surface,
//    every depression's spill level, and a drainage tree that also routes across flats.
// 2. Each cell yields rain × runoff coefficient. Water is passed down the tree; when
//    it reaches the outlet cell of a depression, the depression keeps up to its volume
//    and the excess continues downstream (fill, then spill).
// 3. Stored water is levelled inside each depression to give a depth per cell.
export const TERRARIUM='https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const EARTH=40075016.686;
const worldX=(lon,z)=>(lon+180)/360*256*2**z,worldY=(lat,z)=>(1-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))/Math.PI)/2*256*2**z;
const lonAt=(x,z)=>x/(256*2**z)*360-180,latAt=(y,z)=>(2*Math.atan(Math.exp(Math.PI*(1-2*y/(256*2**z))))-Math.PI/2)*180/Math.PI;
export function demPlan(lon,lat,{sizeKm=10,zoom=12}={}){
 if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lat)>80)throw new Error('invalid_place');
 const cell=EARTH*Math.cos(lat*Math.PI/180)/(256*2**zoom),half=Math.round(sizeKm*500/cell),cx=Math.round(worldX(lon,zoom)),cy=Math.round(worldY(lat,zoom));
 const left=cx-half,top=cy-half,width=half*2,height=half*2,tiles=[];
 for(let ty=Math.floor(top/256);ty<=Math.floor((top+height-1)/256);ty++)for(let tx=Math.floor(left/256);tx<=Math.floor((left+width-1)/256);tx++)tiles.push({x:tx,y:ty,url:`${TERRARIUM}/${zoom}/${tx}/${ty}.png`});
 const west=lonAt(left,zoom),east=lonAt(left+width,zoom),north=latAt(top,zoom),south=latAt(top+height,zoom);
 return {zoom,left,top,width,height,cell,tiles,bounds:[west,south,east,north],coordinates:[[west,north],[east,north],[east,south],[west,south]]};
}
export function planLngLat(plan,x,y){return [lonAt(plan.left+x+.5,plan.zoom),latAt(plan.top+y+.5,plan.zoom)]}
// Mapzen terrarium: elevation = R×256 + G + B/256 − 32768 metres.
export function assembleDEM(plan,tiles){
 const {width,height,left,top}=plan,elev=new Float32Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const gx=left+x,gy=top+y,key=Math.floor(gx/256)+'/'+Math.floor(gy/256),rgba=tiles.get(key);if(!rgba)throw new Error('missing_tile');
  const p=(((gy%256)+256)%256*256+(((gx%256)+256)%256))*4;elev[y*width+x]=rgba[p]*256+rgba[p+1]+rgba[p+2]/256-32768;
 }
 return elev;
}
class MinHeap{
 constructor(n){this.key=new Float64Array(n);this.id=new Int32Array(n);this.size=0}
 push(k,i){let n=this.size++;while(n>0){const p=(n-1)>>1;if(this.key[p]<=k)break;this.key[n]=this.key[p];this.id[n]=this.id[p];n=p}this.key[n]=k;this.id[n]=i}
 pop(){const top=this.id[0],k=this.key[--this.size],i=this.id[this.size];let n=0;for(;;){let c=2*n+1;if(c>=this.size)break;if(c+1<this.size&&this.key[c+1]<this.key[c])c++;if(this.key[c]>=k)break;this.key[n]=this.key[c];this.id[n]=this.id[c];n=c}this.key[n]=k;this.id[n]=i;return top}
}
const NEIGHBOURS=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
// Light 3 × 3 smoothing removes single-cell DEM noise (radar speckle, tree crowns)
// that would otherwise appear as countless deep pits.
export function smoothDEM(elev,width,height){
 const out=new Float32Array(elev.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){let s=0,k=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=width||yy>=height)continue;s+=elev[yy*width+xx];k++}out[y*width+x]=s/k}
 return out;
}
export function simulatePonding(source,width,height,cell,{rainMm,runoff=.5,minDepth=.02,minCells=4,smooth=true}={}){
 if(source.length!==width*height||!(cell>0))throw new Error('invalid_dem');if(!(rainMm>=0)||!(runoff>0&&runoff<=1))throw new Error('invalid_rain');
 const elev=smooth?smoothDEM(source,width,height):source;
 const n=width*height,area=cell*cell,filled=new Float32Array(n),parent=new Int32Array(n).fill(-1),closed=new Uint8Array(n),order=new Int32Array(n),heap=new MinHeap(n),pit=new Int32Array(n);let count=0,pitHead=0,pitTail=0;
 for(let x=0;x<width;x++)for(const y of [0,height-1]){const i=y*width+x;if(!closed[i]){closed[i]=1;filled[i]=elev[i];heap.push(elev[i],i)}}
 for(let y=1;y<height-1;y++)for(const x of [0,width-1]){const i=y*width+x;if(!closed[i]){closed[i]=1;filled[i]=elev[i];heap.push(elev[i],i)}}
 while(pitHead<pitTail||heap.size){
  const c=pitHead<pitTail?pit[pitHead++]:heap.pop();order[count++]=c;const cx=c%width,cy=(c-cx)/width;
  for(const [dx,dy] of NEIGHBOURS){const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=width||y>=height)continue;const i=y*width+x;if(closed[i])continue;closed[i]=1;parent[i]=c;
   if(elev[i]<=filled[c]){filled[i]=filled[c];pit[pitTail++]=i}else{filled[i]=elev[i];heap.push(elev[i],i)}}
 }
 // Depressions: connected cells that the fill raised by more than minDepth.
 const comp=new Int32Array(n).fill(-1),comps=[],stack=new Int32Array(n);
 for(let s=0;s<n;s++){
  if(comp[s]>=0||filled[s]-elev[s]<=minDepth)continue;const k=comps.length,cells=[];let top=0;stack[top++]=s;comp[s]=k;
  while(top){const c=stack[--top];cells.push(c);const cx=c%width,cy=(c-cx)/width;for(const [dx,dy] of NEIGHBOURS){const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=width||y>=height)continue;const i=y*width+x;if(comp[i]<0&&filled[i]-elev[i]>minDepth&&filled[i]===filled[s]){comp[i]=k;stack[top++]=i}}}
  // Depressions smaller than minCells are treated as DEM noise: water passes through.
  let capacity=0;if(cells.length>=minCells)for(const c of cells)capacity+=(filled[c]-elev[c])*area;comps.push({cells,capacity,stored:0,inflow:0,level:filled[s]});
 }
 // Route water children-first (reverse flood order); depressions keep what fits.
 const water=new Float64Array(n).fill(rainMm/1000*runoff*area),upCells=new Float64Array(n).fill(1);
 for(let j=count-1;j>=0;j--){
  const c=order[j],p=parent[c],k=comp[c];
  if(k>=0&&(p<0||comp[p]!==k)){const d=comps[k];d.inflow+=water[c];const keep=Math.min(water[c],d.capacity-d.stored);d.stored+=keep;water[c]-=keep}
  if(p>=0){water[p]+=water[c];upCells[p]+=upCells[c]}
 }
 // Level the stored volume inside each depression (water surface below its spill level).
 const depth=new Float32Array(n),results=[];
 for(const d of comps){
  if(d.stored<=0)continue;let low=Infinity;for(const c of d.cells)low=Math.min(low,elev[c]);let lo=low,hi=d.level;
  for(let it=0;it<40;it++){const mid=(lo+hi)/2;let v=0;for(const c of d.cells)if(mid>elev[c])v+=(mid-elev[c])*area;if(v>d.stored)hi=mid;else lo=mid}
  let wet=0,max=0,sx=0,sy=0,deepest=d.cells[0];for(const c of d.cells){const h=Math.max(0,lo-elev[c]);depth[c]=h;if(h>=.1){wet++;const x=c%width;sx+=x;sy+=(c-x)/width}if(h>max){max=h;deepest=c}}
  if(wet)results.push({cells:wet,area:wet*area,volume:d.stored,maxDepth:max,full:d.stored>=d.capacity*.999,x:wet?sx/wet:deepest%width,y:wet?sy/wet:Math.floor(deepest/width),deepest});
 }
 results.sort((a,b)=>b.volume-a.volume);
 const wetArea=results.reduce((s,r)=>s+r.area,0),maxDepth=results.reduce((m,r)=>Math.max(m,r.maxDepth),0);
 return {depth,water,upCells,width,height,cell,ponds:results,stats:{ponds:results.length,wetArea,maxDepth,rainMm,runoff,generated:rainMm/1000*runoff*area*n,stored:comps.reduce((s,d)=>s+d.stored,0)}};
}
// Display: depth classes and the routes that carry the excess water.
export const POND_CLASSES=[[1,[19,82,168],'> 1 m'],[.3,[58,155,224],'0.3–1 m'],[.1,[130,206,250],'0.1–0.3 m']];
export function pondingRaster(result,{flowCells=150,flowVolume=50}={}){
 const {depth,water,upCells,width,height}=result,out=new Uint8ClampedArray(width*height*4);
 for(let i=0;i<width*height;i++){const p=i*4,band=POND_CLASSES.find(([min])=>depth[i]>=min);
  if(band){out[p]=band[1][0];out[p+1]=band[1][1];out[p+2]=band[1][2];out[p+3]=210}
  else if(upCells[i]>=flowCells&&water[i]>=flowVolume){out[p]=0;out[p+1]=188;out[p+2]=212;out[p+3]=Math.min(230,120+Math.log10(upCells[i])*30)}}
 return out;
}
