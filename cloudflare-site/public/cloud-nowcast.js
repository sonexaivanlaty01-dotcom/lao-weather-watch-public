import {fetchResponse,serviceTime} from './data-service.js?v=20261025-ios';
import {CLOUD_REGION,cloudFutureSlots,validCloudTimes} from './cloud-motion-math.js?v=20261019-longer';
export {CLOUD_REGION,cloudFutureSlots};
const mercator=lat=>6378137*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
export function cloudMotionURL(time){
 const g=CLOUD_REGION,bbox=[g.west*Math.PI*6378137/180,mercator(g.south),g.east*Math.PI*6378137/180,mercator(g.north)];
 const params=new URLSearchParams({SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetMap',LAYERS:'Himawari_AHI_Band13_Clean_Infrared',STYLES:'',SRS:'EPSG:3857',BBOX:bbox.join(','),WIDTH:'512',HEIGHT:'512',FORMAT:'image/png',TRANSPARENT:'TRUE',TIME:serviceTime(time)});
 return 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?'+params;
}
export async function buildCloudNowcast(times,{signal,now=Date.now(),loadImage=null}={}){
 if(!validCloudTimes(times))throw new Error('history');const base=times[2],slots=cloudFutureSlots(base,now);if(!slots.length)throw new Error('stale');
 const width=512,images=await Promise.all(times.map(async time=>{
  if(loadImage){const bitmap=await loadImage(time);try{if(bitmap.width!==width||bitmap.height!==width)throw new Error('image');const canvas=document.createElement('canvas');canvas.width=canvas.height=width;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);return ctx.getImageData(0,0,width,width).data}finally{bitmap.close()}}
  const response=await fetchResponse(cloudMotionURL(time),{signal,attempts:2,timeout:25000});if(!response.headers.get('Content-Type')?.includes('image/png'))throw new Error('image');
  const bitmap=await createImageBitmap(await response.blob());try{if(bitmap.width!==width||bitmap.height!==width)throw new Error('image');const canvas=document.createElement('canvas');canvas.width=canvas.height=width;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);return ctx.getImageData(0,0,width,width).data}finally{bitmap.close()}
 }));
 signal?.throwIfAborted();
 // GIBS can list a time before its imagery is filled in; the region is fully inside
 // the Himawari disk, so a real frame is almost entirely opaque.
 if(images.some(image=>{let seen=0;for(let p=3;p<image.length;p+=16)if(image[p]>32)seen++;return seen<image.length/16*.5}))throw new Error('blank');
 if(images[0].every((v,i)=>v===images[2][i]))throw new Error('unchanged');
 const result=await new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./cloud-motion-worker.js?v=20261019-longer',import.meta.url),{type:'module'});
  const done=(error,data)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(data)};
  const abort=()=>done(new Error('cancelled')),timer=setTimeout(()=>done(new Error('timeout')),60000);
  signal?.addEventListener('abort',abort,{once:true});worker.onerror=()=>done(new Error('tracking'));worker.onmessage=e=>e.data.error?done(new Error('tracking')):done(null,e.data);
  worker.postMessage({images,width,slots},images.map(image=>image.buffer));
 });
 const urls=[];
 try{for(const pixels of result.frames){signal?.throwIfAborted();const canvas=document.createElement('canvas');canvas.width=canvas.height=width;canvas.getContext('2d').putImageData(new ImageData(pixels,width,width),0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('image');urls.push(URL.createObjectURL(blob))}return {base,times,slots,urls,valid:result.valid,total:result.total}}catch(error){urls.forEach(URL.revokeObjectURL);throw error}
}
