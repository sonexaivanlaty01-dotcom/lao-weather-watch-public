// Cloud motion outlook: every 10 min for the first hour after now, then every 20 min up to
// 3 hours after now. Satellite images arrive 30–45 min late, so the extrapolation runs at most
// 4 hours from the newest image (CLOUD_MAX_LEAD_MS). Beyond the first hour the moved pattern is
// increasingly unreliable (clouds grow and decay); the page labels those frames as such.
export const CLOUD_STEP_MS=600000,CLOUD_MAX_LEAD_MS=240*60000,CLOUD_NEAR_MS=60*60000,CLOUD_AHEAD_MS=180*60000,CLOUD_FAR_STEP_MS=20*60000;
export const CLOUD_MAX_LEAD_STEPS=CLOUD_MAX_LEAD_MS/CLOUD_STEP_MS;
export const CLOUD_REGION={west:96,east:112,south:10,north:27};
export function cloudFutureSlots(base,now=Date.now()){
 if(!Number.isFinite(base)||base>now+120000)return [];
 const first=(Math.floor(now/CLOUD_STEP_MS)+1)*CLOUD_STEP_MS,times=[];
 for(let t=first;t<first+CLOUD_NEAR_MS;t+=CLOUD_STEP_MS)times.push(t);
 for(let t=first+CLOUD_NEAR_MS;t<first+CLOUD_AHEAD_MS;t+=CLOUD_FAR_STEP_MS)times.push(t);
 return times.map(time=>({time,lead:(time-base)/CLOUD_STEP_MS,far:time-now>CLOUD_NEAR_MS})).filter(s=>s.lead>0&&s.time<=base+CLOUD_MAX_LEAD_MS);
}
export function validCloudTimes(times){return times.length===3&&times.every((t,i)=>Number.isFinite(t)&&(!i||t-times[i-1]===CLOUD_STEP_MS))}
export function grayImage(rgba,width,size){
 const gray=new Float32Array(size*size);gray.fill(NaN);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const p=(Math.min(width-1,Math.floor(y*width/size))*width+Math.min(width-1,Math.floor(x*width/size)))*4;if(rgba[p+3]>32)gray[y*size+x]=(rgba[p]+rgba[p+1]+rgba[p+2])/3}return gray;
}
// Normalized patch correlation, not a trained meteorological/AMV model.
function correlate(a,b,n,x,y,dx,dy,r){
 if(x-r<0||y-r<0||x+r>=n||y+r>=n||x-r-dx<0||y-r-dy<0||x+r-dx>=n||y+r-dy>=n)return -1;
 let sumA=0,sumB=0,aa=0,bb=0,ab=0,k=0;
 for(let j=-r;j<=r;j+=2)for(let i=-r;i<=r;i+=2){const av=a[(y+j)*n+x+i],bv=b[(y+j-dy)*n+x+i-dx];if(!Number.isFinite(av)||!Number.isFinite(bv))continue;sumA+=av;sumB+=bv;aa+=av*av;bb+=bv*bv;ab+=av*bv;k++}
 if(k<(r+1)**2*.8)return -1;const va=aa-sumA*sumA/k,vb=bb-sumB*sumB/k;if(va/k<16||vb/k<16)return -1;return (ab-sumA*sumB/k)/Math.sqrt(va*vb);
}
function match(a,b,n,x,y,r,search){
 let score=-1,dx=0,dy=0;
 for(let v=-search;v<=search;v++)for(let u=-search;u<=search;u++){const s=correlate(a,b,n,x,y,u,v,r);if(s>score){score=s;dx=u;dy=v}}
 if(score<.8||Math.abs(dx)===search||Math.abs(dy)===search)return null;
 const refine=(low,high)=>{const d=low-2*score+high;return d<-.0001?Math.max(-.5,Math.min(.5,.5*(low-high)/d)):0};
 return {dx:dx+refine(correlate(a,b,n,x,y,dx-1,dy,r),correlate(a,b,n,x,y,dx+1,dy,r)),dy:dy+refine(correlate(a,b,n,x,y,dx,dy-1,r),correlate(a,b,n,x,y,dx,dy+1,r)),score};
}
export function estimateCloudFlow(images,n,{spacing=16,radius=8,search=6}={}){
 const start=radius+search+1,cols=Math.floor((n-1-2*start)/spacing)+1,nodes=[];
 for(let gy=0;gy<cols;gy++)for(let gx=0;gx<cols;gx++){
  const x=start+gx*spacing,y=start+gy*spacing,m=match(images[2],images[1],n,x,y,radius,search);
  const previous=m?match(images[1],images[0],n,Math.round(x-m.dx),Math.round(y-m.dy),radius,search):null;
  const valid=!!(m&&previous&&Math.hypot(m.dx-previous.dx,m.dy-previous.dy)<=2);
  nodes.push(valid?{dx:(m.dx+previous.dx)/2,dy:(m.dy+previous.dy)/2}:null);
 }
 return {size:n,start,spacing,cols,nodes,valid:nodes.filter(Boolean).length};
}
// Patch matching fails over uniform areas (clear sky, flat overcast), leaving holes.
// Drop isolated outliers, then give unmatched nodes the average motion of matched
// neighbours, spreading at most maxSteps nodes (~70 km each) from a real match.
// Only motion vectors are filled; the moved pixels are always the observed image.
const median=values=>{const s=[...values].sort((a,b)=>a-b),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
function neighbours(nodes,n,i){const x=i%n,y=(i-x)/n,out=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if((!dx&&!dy)||x+dx<0||y+dy<0||x+dx>=n||y+dy>=n)continue;const p=nodes[(y+dy)*n+x+dx];if(p)out.push({p,w:dx&&dy?.7:1})}return out}
export function completeCloudFlow(flow,{maxSteps=6,outlier=2.5}={}){
 const n=flow.cols;let nodes=flow.nodes.map((v,i)=>{if(!v)return null;const near=neighbours(flow.nodes,n,i);if(near.length<2)return v;return Math.hypot(v.dx-median(near.map(q=>q.p.dx)),v.dy-median(near.map(q=>q.p.dy)))>outlier?null:v});
 const matched=nodes.filter(Boolean).length;
 for(let step=0;step<maxSteps&&matched;step++){
  let changed=false;const next=nodes.slice();
  for(let i=0;i<nodes.length;i++){if(nodes[i])continue;const near=neighbours(nodes,n,i);if(!near.length)continue;const w=near.reduce((s,q)=>s+q.w,0);next[i]={dx:near.reduce((s,q)=>s+q.p.dx*q.w,0)/w,dy:near.reduce((s,q)=>s+q.p.dy*q.w,0)/w,filled:true};changed=true}
  nodes=next;if(!changed)break;
 }
 return {...flow,nodes,valid:matched,filled:nodes.filter(Boolean).length-matched};
}
export function cloudFlowAt(flow,x,y){
 // Clamp to the node grid so the outer margin uses its nearest nodes.
 const gx=Math.max(0,Math.min(flow.cols-1,(x-flow.start)/flow.spacing)),gy=Math.max(0,Math.min(flow.cols-1,(y-flow.start)/flow.spacing)),ix=Math.min(flow.cols-2,Math.floor(gx)),iy=Math.min(flow.cols-2,Math.floor(gy));
 const points=[flow.nodes[iy*flow.cols+ix],flow.nodes[iy*flow.cols+ix+1],flow.nodes[(iy+1)*flow.cols+ix],flow.nodes[(iy+1)*flow.cols+ix+1]];
 const a=gx-ix,b=gy-iy,weights=[(1-a)*(1-b),a*(1-b),(1-a)*b,a*b];let w=0,dx=0,dy=0;
 points.forEach((p,i)=>{if(p&&weights[i]>0){w+=weights[i];dx+=p.dx*weights[i];dy+=p.dy*weights[i]}});
 return w>=.25?{dx:dx/w,dy:dy/w}:null;
}
export function advectCloudImage(rgba,width,flow,lead){
 if(!Number.isFinite(lead)||lead<=0||lead>CLOUD_MAX_LEAD_STEPS)throw new Error('invalid_lead');
 const out=new Uint8ClampedArray(rgba.length),scale=flow.size/width;
 for(let y=0;y<width;y++)for(let x=0;x<width;x++){
  let sx=x*scale,sy=y*scale,ok=true;
  for(let i=0;i<Math.ceil(lead);i++){const v=cloudFlowAt(flow,sx,sy);if(!v){ok=false;break}const step=Math.min(1,lead-i);sx-=v.dx*step;sy-=v.dy*step}
  sx/=scale;sy/=scale;if(!ok||sx<0||sy<0||sx>=width-1||sy>=width-1)continue;
  const ix=Math.floor(sx),iy=Math.floor(sy),a=sx-ix,b=sy-iy,weights=[(1-a)*(1-b),a*(1-b),(1-a)*b,a*b],pixels=[(iy*width+ix)*4,(iy*width+ix+1)*4,((iy+1)*width+ix)*4,((iy+1)*width+ix+1)*4],p=(y*width+x)*4;
  for(let c=0;c<4;c++)out[p+c]=pixels.reduce((s,v,i)=>s+rgba[v+c]*weights[i],0);
 }
 return out;
}
// Display-only inward fade at unknown-mask boundaries. Never fills missing pixels.
export function fadeCloudEdges(rgba,width,radius=8){
 const dist=new Uint16Array(width*width);for(let i=0;i<dist.length;i++)dist[i]=rgba[i*4+3]?radius:0;
 for(let y=0;y<width;y++)for(let x=0;x<width;x++){const p=y*width+x;if(!dist[p])continue;dist[p]=Math.min(dist[p],x?dist[p-1]+1:1,y?dist[p-width]+1:1)}
 for(let y=width-1;y>=0;y--)for(let x=width-1;x>=0;x--){const p=y*width+x;if(!dist[p])continue;dist[p]=Math.min(dist[p],x<width-1?dist[p+1]+1:1,y<width-1?dist[p+width]+1:1);rgba[p*4+3]*=Math.min(1,dist[p]/radius)}return rgba;
}
