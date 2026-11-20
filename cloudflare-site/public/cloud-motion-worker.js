import {grayImage,estimateCloudFlow,completeCloudFlow,advectCloudImage,fadeCloudEdges} from './cloud-motion-math.js?v=20261019-longer';
self.onmessage=event=>{
 try{
  const {images,width,slots}=event.data,flow=completeCloudFlow(estimateCloudFlow(images.map(image=>grayImage(image,width,384)),384));
  if(flow.valid<12)throw new Error('tracking');
  const frames=slots.map(slot=>fadeCloudEdges(advectCloudImage(images[2],width,flow,slot.lead),width));
  if(frames.some(frame=>{let pixels=0;for(let p=3;p<frame.length;p+=4)if(frame[p]>32)pixels++;return pixels<width*width*.01}))throw new Error('tracking');
  self.postMessage({frames,valid:flow.valid,total:flow.nodes.length},frames.map(frame=>frame.buffer));
 }catch{self.postMessage({error:'tracking'})}
};
