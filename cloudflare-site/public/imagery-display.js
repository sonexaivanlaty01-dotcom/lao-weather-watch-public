import {fetchResponse} from './data-service.js?v=20261025-ios';

// Display-only filtering. A padded WMS request includes neighboring pixels so
// filtering and cropping do not introduce transparent seams at tile borders.
export function paddedImageryRequest(protocolURL){
 const url=new URL(protocolURL.replace(/^smooth-gibs:\/\//,'https://'));
 if(url.hostname!=='gibs.earthdata.nasa.gov'||url.pathname!=='/wms/epsg3857/best/wms.cgi')throw new Error('Unsupported imagery source');
 const box=(url.searchParams.get('BBOX')||'').split(',').map(Number);
 if(box.length!==4||!box.every(Number.isFinite)||box[2]<=box[0]||box[3]<=box[1])throw new Error('Invalid imagery bounds');
 const size=256,padding=12,dx=(box[2]-box[0])/size,dy=(box[3]-box[1])/size;
 url.searchParams.set('BBOX',[box[0]-padding*dx,box[1]-padding*dy,box[2]+padding*dx,box[3]+padding*dy].join(','));
 url.searchParams.set('WIDTH',size+padding*2);url.searchParams.set('HEIGHT',size+padding*2);
 return {url:url.href,size,padding,radius:url.searchParams.get('LAYERS')==='IMERG_Precipitation_Rate_30min'?3:1.2};
}

export function installSmoothImagery(maplibregl){
 maplibregl.addProtocol('smooth-gibs',async (params,abortController)=>{
  const {url,size,padding,radius}=paddedImageryRequest(params.url),signal=abortController.signal;
  const response=await fetchResponse(url,{signal,attempts:2});
  const bitmap=await createImageBitmap(await response.blob());
  try{
   signal.throwIfAborted();
   const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
   const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   ctx.filter=`blur(${radius}px)`;
   ctx.drawImage(bitmap,-padding,-padding);
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Image encoding failed')),'image/png'));
   signal.throwIfAborted();return {data:await blob.arrayBuffer()};
  }finally{bitmap.close()}
 });
}
