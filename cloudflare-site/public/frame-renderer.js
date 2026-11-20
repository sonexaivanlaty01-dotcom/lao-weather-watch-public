import {fetchResponse,serviceTime} from './data-service.js?v=20261025-ios';
import {RenderGate} from './playback.js?v=20261008-speed';
import {ImageBlobCache} from './image-cache.js?v=20261026-fast';
import {awsFrameURL,AWS_COORDINATES} from './aws-satellite.js?v=20261009-cdn-live';
import {jmaTilePlan,jmaDirectURL} from './jma-satellite.js?v=20261008-direct';
import {smoothingSize,softenRGBA,resampleRGBA} from './imagery-smoothing.js?v=20261008-adaptive';
const R=6378137,merc=lat=>R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360)),inverse=y=>(2*Math.atan(Math.exp(y/R))-Math.PI/2)*180/Math.PI;
export function viewportSpec(bounds,viewWidth=1000,viewHeight=600,zoom=4,pixelRatio=1){
 const [west,south,east,north]=bounds;if(!bounds.every(Number.isFinite)||east<=west||north<=south)throw new Error('invalid_bounds');
 const x0=west*Math.PI*R/180,x1=east*Math.PI*R/180,y0=merc(Math.max(-84,south)),y1=merc(Math.min(84,north)),dx=(x1-x0)*.04,dy=(y1-y0)*.04;
 const bbox=[x0-dx,y0-dy,x1+dx,y1+dy],density=Math.max(1,Math.min(2,pixelRatio)),limit=Math.round(1024*density);let width=Math.min(limit,Math.max(512,Math.round(viewWidth*density))),height=Math.round(width*(bbox[3]-bbox[1])/(bbox[2]-bbox[0]));if(height>limit){width=Math.round(width*limit/height);height=limit}height=Math.max(32,height);width=Math.max(32,width);
 return {bbox,width,height,zoom:Math.min(7,Math.max(2,Math.floor(zoom+1))),coordinates:[[bbox[0]/R*180/Math.PI,inverse(bbox[3])],[bbox[2]/R*180/Math.PI,inverse(bbox[3])],[bbox[2]/R*180/Math.PI,inverse(bbox[1])],[bbox[0]/R*180/Math.PI,inverse(bbox[1])]],key:bbox.map(v=>Math.round(v)).join(',')+':'+width+':'+height};
}
const layers={cloud:'Himawari_AHI_Band13_Clean_Infrared',imerg:'IMERG_Precipitation_Rate_30min'};
// Approximate native pixel size of each source (Web Mercator metres near Laos): a
// sharper download than this adds no detail.
const NATIVE_METRES={cloud:2000,imerg:10000,radar:1200};
export function nasaFrameURL(id,time,spec){
 if(!layers[id])throw new Error('invalid_layer');const q=new URLSearchParams({SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetMap',LAYERS:layers[id],STYLES:'',SRS:'EPSG:3857',BBOX:spec.bbox.join(','),WIDTH:spec.width,HEIGHT:spec.height,FORMAT:'image/png',TRANSPARENT:'TRUE',TIME:serviceTime(time)});return 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?'+q;
}
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
// Pixel filtering runs in a Worker (0.1–1 s per viewport image on the main thread froze
// zooming). Falls back to the same functions here if a Worker cannot start.
let pixelWorker=null,pixelJobs=new Map(),pixelJobId=0;
function directPixels(m){return m.op==='soften'?softenRGBA(m.pixels,m.width,m.height,m.radius,{preserveGaps:m.preserveGaps}):resampleRGBA(m.soften?softenRGBA(m.pixels,m.width,m.height,1,{preserveGaps:m.preserveGaps}):m.pixels,m.width,m.height,m.outWidth,m.outHeight,{crop:m.crop,preserveGaps:m.preserveGaps})}
function workerFailed(){pixelWorker?.terminate?.();pixelWorker=false;for(const [,job] of pixelJobs)try{job.resolve(directPixels(job.message))}catch(error){job.reject(error)}pixelJobs.clear()}
export function pixelJob(message){
 if(pixelWorker===null){try{pixelWorker=new Worker(new URL('./imagery-worker.js?v=20261010-offthread',import.meta.url),{type:'module'});pixelWorker.onmessage=e=>{const job=pixelJobs.get(e.data.job);if(!job)return;pixelJobs.delete(e.data.job);e.data.error?job.reject(new Error(e.data.error)):job.resolve(e.data.result)};pixelWorker.onerror=workerFailed}catch{pixelWorker=false}}
 if(!pixelWorker)return Promise.resolve().then(()=>directPixels(message));
 return new Promise((resolve,reject)=>{const job=++pixelJobId;pixelJobs.set(job,{resolve,reject,message:{...message,pixels:message.pixels.slice()}});pixelWorker.postMessage({...message,job},[message.pixels.buffer])});
}
// Filter only the displayed image. Grow the radius as source pixels are enlarged.
export function imageryBlurRadius(id,spec){
 const metresPerPixel=(spec.bbox[2]-spec.bbox[0])/spec.width;
 const nativeMetres=id==='imerg'?12000:id==='cloud'?3000:40075016/(2**spec.zoom*256);
 // Clouds: no minimum. Zoomed out, a Himawari pixel is already smaller than a
 // display pixel, so any filtering only blurs real detail.
 return Math.min(192,Math.max(id==='imerg'?3:id==='cloud'?0:1.8,nativeMetres/metresPerPixel*.8));
}
// IMERG look: layer opacity plus a colour boost applied after softening, so the soft edges stay
// but the rain colours read clearly over the satellite base map. Display only.
export const IMERG_LOOK={opacity:.65,saturate:1,contrast:1};
async function softenedBitmap(image,d){
 const radius=d.kind==='image'?1.5:imageryBlurRadius(d.id,d.spec),size=smoothingSize(image.width,image.height,radius),small=canvas(size.width,size.height),ctx=small.getContext('2d',{willReadFrequently:true});
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,small.width,small.height);
 const pixels=ctx.getImageData(0,0,small.width,small.height),soft=await pixelJob({op:'soften',pixels:pixels.data,width:small.width,height:small.height,radius:size.radius,preserveGaps:d.id==='cloud-motion'});
 ctx.putImageData(new ImageData(soft,small.width,small.height),0,0);
 const result=canvas(image.width,image.height),out=result.getContext('2d');out.imageSmoothingEnabled=true;out.imageSmoothingQuality='high';
 if(d.id==='imerg'&&(IMERG_LOOK.saturate!==1||IMERG_LOOK.contrast!==1))out.filter=`saturate(${IMERG_LOOK.saturate}) contrast(${IMERG_LOOK.contrast})`;
 out.drawImage(small,0,0,result.width,result.height);out.filter='none';
 // Unknown areas in calculated cloud motion keep their original transparency.
 if(d.id==='cloud-motion'){out.globalCompositeOperation='destination-in';out.drawImage(image,0,0);out.globalCompositeOperation='source-over'}
 return createImageBitmap(result);
}
export function hasVisiblePixels(rgba){for(let i=3;i<rgba.length;i+=4)if(rgba[i])return true;return false}
const sourceImages=new ImageBlobCache();
function sourceBlob(url,fresh=false){
 return sourceImages.get(url,async()=>{const direct=jmaDirectURL(url),options={attempts:2,timeout:url.startsWith('/api/satellite/aws/')?45000:8000,cache:fresh?'no-store':'default'};let r;if(direct){try{r=await fetchResponse(direct,options)}catch{r=await fetchResponse(url,options)}}else r=await fetchResponse(url,options);if(!r.headers.get('Content-Type')?.startsWith('image/'))throw new Error('invalid_image');return r.blob()});
}
async function decoded(url,fresh=false){
 try{return await createImageBitmap(await sourceBlob(url,fresh))}catch(error){sourceImages.remove(url);throw error}
}
// Download (and let the Worker convert) one AWS observation before playback,
// without decoding it. The same exact-time URL is reused when it is shown.
export async function prepareAWSFrame(frame){try{await sourceBlob(awsFrameURL(frame));return true}catch(error){sourceImages.remove(awsFrameURL(frame));throw error}}
async function radarMosaic(descriptor){
 const {spec,host,path}=descriptor;if(new URL(host).hostname!=='tilecache.rainviewer.com'||!/^\/v2\/radar\/[a-zA-Z0-9]+$/.test(path))throw new Error('invalid_radar');
 const count=2**spec.zoom,world=count*256,toX=lon=>(lon+180)/360*world,toY=lat=>(1-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))/Math.PI)/2*world;
 const left=toX(spec.coordinates[0][0]),top=toY(spec.coordinates[0][1]),right=toX(spec.coordinates[2][0]),bottom=toY(spec.coordinates[2][1]);
 // Keep native 512px tiles intact, join them first, then resample the viewport.
 // A neighbour border avoids independent tile filtering and visible seams.
 const originX=Math.floor(left*2)-3,originY=Math.floor(top*2)-3,nativeWidth=Math.ceil(right*2)-originX+3,nativeHeight=Math.ceil(bottom*2)-originY+3;
 if(nativeWidth*nativeHeight>6000000)throw new Error('viewport_too_large');
 const c=canvas(nativeWidth,nativeHeight),ctx=c.getContext('2d'),jobs=[];
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 for(let y=Math.max(0,Math.floor(originY/512));y<=Math.min(count-1,Math.floor((originY+nativeHeight-1)/512));y++)for(let x=Math.max(0,Math.floor(originX/512));x<=Math.min(count-1,Math.floor((originX+nativeWidth-1)/512));x++)jobs.push([x,y]);
 if(jobs.length>40)throw new Error('viewport_too_large');let cursor=0,failed=false;
 await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{try{while(cursor<jobs.length&&!failed){const [x,y]=jobs[cursor++],image=await decoded(`${host}${path}/512/${spec.zoom}/${x}/${y}/2/${descriptor.smooth?'1':'0'}_0.png`);try{ctx.drawImage(image,x*512-originX,y*512-originY,512,512)}finally{image.close()}}}catch(error){failed=true;throw error}}));
 return resizedBitmap(c,spec.width,spec.height,{smooth:descriptor.smooth,crop:[left*2-originX,top*2-originY,(right-left)*2,(bottom-top)*2]});
}
export async function jmaMosaic(descriptor,{signal}={}){
 const {spec}=descriptor,plan=jmaTilePlan(spec,descriptor.frame),c=canvas(plan.width,plan.height),ctx=c.getContext('2d');let cursor=0,failed=false;
 await Promise.all(Array.from({length:Math.min(4,plan.jobs.length)},async()=>{try{while(cursor<plan.jobs.length&&!failed){signal?.throwIfAborted();const job=plan.jobs[cursor++],image=await decoded(job.url);try{if(image.width!==256||image.height!==256)throw new Error('invalid_jma_tile');ctx.drawImage(image,job.x*256-plan.originX,job.y*256-plan.originY)}finally{image.close()}}}catch(error){failed=true;throw error}}));
 signal?.throwIfAborted();return resizedBitmap(c,spec.width,spec.height,{smooth:descriptor.smooth,crop:plan.crop});
}
async function resizedBitmap(image,width,height,{smooth=true,crop=[0,0,image.width,image.height],preserveGaps=false}={}){
 const result=canvas(width,height),out=result.getContext('2d');
 if(smooth&&(width>crop[2]*1.1||height>crop[3]*1.1)){
  const source=canvas(image.width,image.height),ctx=source.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,source.width,source.height).data;
  // Round source-grid corners only during strong enlargement. The support is
  // fixed at three native pixels; never shrink the viewport or grow a screen blur.
  const soften=width>crop[2]*2||height>crop[3]*2;
  out.putImageData(new ImageData(await pixelJob({op:'resample',pixels,width:source.width,height:source.height,outWidth:width,outHeight:height,crop,preserveGaps,soften}),width,height),0,0);
 }else{
  // Halve large reductions in stages so isolated rain cells remain legible.
  let source=image,box=crop;
  while(smooth&&box[2]>width*2&&box[3]>height*2){const next=canvas(Math.ceil(box[2]/2),Math.ceil(box[3]/2)),ctx=next.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,...box,0,0,next.width,next.height);source=next;box=[0,0,next.width,next.height]}
  out.imageSmoothingEnabled=smooth;out.imageSmoothingQuality='high';out.drawImage(source,...box,0,0,width,height);
 }
 return createImageBitmap(result);
}
async function radarImageFrame(image,d){
 const coords=d.coordinates,x0=coords[0][0]*Math.PI*R/180,x1=coords[2][0]*Math.PI*R/180,y0=merc(coords[2][1]),y1=merc(coords[0][1]);
 const [west,south,east,north]=d.spec.bbox,box=[Math.max(west,x0),Math.max(south,y0),Math.min(east,x1),Math.min(north,y1)];
 if(box[2]<=box[0]||box[3]<=box[1])return {image,coordinates:coords};
 const crop=[(box[0]-x0)/(x1-x0)*image.width,(y1-box[3])/(y1-y0)*image.height,(box[2]-box[0])/(x1-x0)*image.width,(box[3]-box[1])/(y1-y0)*image.height];
 const left=Math.max(0,Math.floor(crop[0])-3),top=Math.max(0,Math.floor(crop[1])-3),right=Math.min(image.width,Math.ceil(crop[0]+crop[2])+3),bottom=Math.min(image.height,Math.ceil(crop[1]+crop[3])+3),source=canvas(right-left,bottom-top);
 source.getContext('2d').drawImage(image,left,top,source.width,source.height,0,0,source.width,source.height);
 const width=Math.max(1,Math.round(d.spec.width*(box[2]-box[0])/(east-west))),height=Math.max(1,Math.round(d.spec.height*(box[3]-box[1])/(north-south)));
 const result=await resizedBitmap(source,width,height,{smooth:d.smooth,crop:[crop[0]-left,crop[1]-top,crop[2],crop[3]]});image.close();
 return {image:result,coordinates:[[box[0]/R*180/Math.PI,inverse(box[3])],[box[2]/R*180/Math.PI,inverse(box[3])],[box[2]/R*180/Math.PI,inverse(box[1])],[box[0]/R*180/Math.PI,inverse(box[1])]]};
}
export async function awsMosaic(descriptor,{signal}={}){
 signal?.throwIfAborted();const image=await decoded(awsFrameURL(descriptor.frame));
 if(signal?.aborted){image.close();signal.throwIfAborted()}
 return radarImageFrame(image,{...descriptor,coordinates:AWS_COORDINATES});
}
export class FrameRenderer {
 constructor(map,{onState=()=>{},onCommit=()=>{},reducedMotion=()=>false,cacheBytes=64*1024*1024}={}){this.map=map;this.onState=onState;this.onCommit=onCommit;this.reducedMotion=reducedMotion;this.cacheBytes=cacheBytes;this.cache=new Map();this.failures=new Map();this.states=new Map()}
 spec(){const b=this.map.getBounds(),c=this.map.getContainer();return viewportSpec([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()],c.clientWidth,c.clientHeight,this.map.getZoom(),window.devicePixelRatio||1)}
 key(d){return [d.id,d.kind,d.time||d.url,d.url,d.host,d.spec?.key||JSON.stringify(d.coordinates),d.smooth,d.path,d.frame?.basetime,d.frame?.validtime].join('|')}
 async load(d){
  if(d.kind==='aws'){
   const key=this.key(d),failed=this.failures.get(key);if(failed&&Date.now()<failed.until)throw failed.error;if(this.cache.has(key))return this.cache.get(key).promise;
   const entry={};entry.promise=awsMosaic(d).then(frame=>{entry.image=frame.image;this.failures.delete(key);this.trim();return {...frame,key}}).catch(error=>{this.cache.delete(key);this.failures.set(key,{error,until:Date.now()+30000});throw error});this.cache.set(key,entry);return entry.promise;
  }
  const failed=this.failures.get(this.key(d));if(failed&&Date.now()<failed.until)throw failed.error;
  const key=this.key(d);if(this.cache.has(key)){const entry=this.cache.get(key);this.cache.delete(key);this.cache.set(key,entry);return entry.promise}
  const entry={};entry.promise=(async()=>{let image=d.kind==='tiles'?await radarMosaic(d):d.kind==='jma'?await jmaMosaic(d):await decoded(d.kind==='nasa'?nasaFrameURL(d.id,d.time,d.spec):d.url,d.kind==='nasa'&&d.id==='cloud'),coordinates=d.coordinates||d.spec.coordinates;if(d.kind==='nasa'&&d.id==='cloud'){const c=canvas(image.width,image.height),ctx=c.getContext('2d');ctx.drawImage(image,0,0);if(!hasVisiblePixels(ctx.getImageData(0,0,c.width,c.height).data)){image.close();sourceImages.remove(nasaFrameURL(d.id,d.time,d.spec));throw new Error('empty_cloud_image')}}if(d.id==='radar'&&d.kind==='image'&&d.spec){const frame=await radarImageFrame(image,d);image=frame.image;coordinates=frame.coordinates}else if(d.smooth&&!['tiles','jma'].includes(d.kind)&&!(d.kind==='nasa'&&d.id==='cloud'&&imageryBlurRadius(d.id,d.spec)<1)){const filtered=await softenedBitmap(image,d);image.close();image=filtered}entry.image=image;this.failures.delete(key);this.trim();return {image,key,coordinates}})().catch(error=>{this.cache.delete(key);this.failures.set(key,{error,until:Date.now()+30000});if(this.failures.size>128)this.failures.delete(this.failures.keys().next().value);throw error});this.cache.set(key,entry);return entry.promise;
 }
 trim(){let bytes=[...this.cache.values()].reduce((n,e)=>n+(e.image?e.image.width*e.image.height*4:0),0);const recent=new Set([...this.cache.keys()].slice(-3)),pinned=new Set([...this.states.values()].flatMap(s=>[s.current?.image,s.next?.image]));for(const [key,entry] of this.cache){if(bytes<=this.cacheBytes&&this.cache.size<=64)break;if(entry.image&&!recent.has(key)&&!pinned.has(entry.image)){bytes-=entry.image.width*entry.image.height*4;entry.image.close();this.cache.delete(key)}}}
 cancel(id){const s=this.states.get(id);if(!s)return;s.gate.cancel();if(s.current&&s.canvas&&this.map.getSource(id)){const ctx=s.canvas.getContext('2d');ctx.clearRect(0,0,s.canvas.width,s.canvas.height);ctx.drawImage(s.current.image,0,0,s.canvas.width,s.canvas.height);this.map.getSource(id).updateImage({image:s.canvas,coordinates:s.current.coordinates})}s.next=null}
 cancelAll(){for(const id of this.states.keys())this.cancel(id)}
 // True when the image on screen already covers this viewport at a useful sharpness:
 // no new download is needed after a zoom-in or a small pan.
 covers(id,spec){
  const frame=this.states.get(id)?.current;if(!frame?.image||!frame.coordinates||!spec)return false;
  const c=frame.coordinates,x0=c[0][0]*Math.PI*R/180,x1=c[2][0]*Math.PI*R/180,y0=merc(c[2][1]),y1=merc(c[0][1]),[w,s,e,n]=spec.bbox;
  if(w<x0||e>x1||s<y0||n>y1)return false;
  const shown=(x1-x0)/frame.image.width,wanted=(e-w)/spec.width,native=NATIVE_METRES[id]||0;
  return shown<=wanted*1.35||shown<=native*.9;
 }
 visible(id,on){if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility',on?'visible':'none')}
 prefetch(descriptors){for(const d of descriptors)this.load(d).catch(()=>{})}
 async show(id,descriptor){
  let state=this.states.get(id);if(!state){state={gate:new RenderGate(),current:null,canvas:null};this.states.set(id,state)}
  const key=this.key(descriptor);if(state.current?.key===key&&this.map.getSource(id)){this.cancel(id);this.visible(id,true);this.onState(id,'ready');return true}
  this.onState(id,'loading');const revision=state.gate.revision+1;
  try{return await state.gate.prepare(()=>this.load(descriptor),async(frame,current)=>{
   // Swap images only between gestures: a replacement mid-zoom looks like a jump.
   if(this.map.isMoving?.())await new Promise(resolve=>this.map.once('moveend',resolve));if(!current())return;
   state.next=frame;const same=state.current&&JSON.stringify(state.current.coordinates)===JSON.stringify(frame.coordinates),w=frame.image.width,h=frame.image.height;
   if(!state.canvas||state.canvas.width!==w||state.canvas.height!==h)state.canvas=canvas(w,h);const ctx=state.canvas.getContext('2d');
   if(!this.map.getSource(id)){this.map.addSource(id,{type:'image',coordinates:frame.coordinates});this.map.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':descriptor.opacity??.8,'raster-fade-duration':0,'raster-resampling':'linear'}})}
   const source=this.map.getSource(id),duration=same&&!this.reducedMotion()?180:0,start=performance.now();this.visible(id,true);
   await new Promise(resolve=>{const draw=()=>{if(!current()){resolve();return}const p=duration?Math.min(1,(performance.now()-start)/duration):1;ctx.clearRect(0,0,w,h);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1-p;if(same&&p<1)ctx.drawImage(state.current.image,0,0,w,h);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=p;ctx.drawImage(frame.image,0,0,w,h);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';source.updateImage({image:state.canvas,coordinates:frame.coordinates});if(p<1)requestAnimationFrame(draw);else requestAnimationFrame(()=>resolve())};draw()});
   if(!current())return;state.current=frame;state.next=null;this.onState(id,'ready');this.onCommit(id);this.trim();
  })}catch(error){if(state.gate.revision!==revision)return false;this.onState(id,'error');throw error}
 }
}
