// Display-only pixel filtering off the main thread, so zooming and panning stay smooth
// while a new viewport image is prepared. Same functions as the main-thread fallback.
import {softenRGBA,resampleRGBA} from './imagery-smoothing.js?v=20261008-adaptive';
self.onmessage=event=>{
 const {job,op,pixels,width,height,outWidth,outHeight,crop,radius,preserveGaps,soften}=event.data;
 try{
  const result=op==='soften'?softenRGBA(pixels,width,height,radius,{preserveGaps}):resampleRGBA(soften?softenRGBA(pixels,width,height,1,{preserveGaps}):pixels,width,height,outWidth,outHeight,{crop,preserveGaps});
  self.postMessage({job,result},[result.buffer]);
 }catch(error){self.postMessage({job,error:String(error?.message||error)})}
};
