import assert from 'node:assert/strict';
import fs from 'node:fs';
import {softenRGBA,resampleRGBA} from './dist/imagery-smoothing.js';
import {FrameRenderer,pixelJob,viewportSpec} from './dist/frame-renderer.js';
// Pixel jobs give exactly the same pixels as the direct functions (here: fallback without Worker).
const w=24,h=12,px=()=>{const a=new Uint8ClampedArray(w*h*4);for(let i=0;i<a.length;i+=4){a[i]=(i*7)&255;a[i+1]=(i*3)&255;a[i+3]=i%40?255:0}return a};
assert.deepEqual(await pixelJob({op:'soften',pixels:px(),width:w,height:h,radius:2,preserveGaps:true}),softenRGBA(px(),w,h,2,{preserveGaps:true}));
const crop=[2,1,20,10];
assert.deepEqual(await pixelJob({op:'resample',pixels:px(),width:w,height:h,outWidth:60,outHeight:30,crop,preserveGaps:false,soften:true}),resampleRGBA(softenRGBA(px(),w,h,1),w,h,60,30,{crop}));
assert.deepEqual(await pixelJob({op:'resample',pixels:px(),width:w,height:h,outWidth:30,outHeight:15,crop,preserveGaps:false,soften:false}),resampleRGBA(px(),w,h,30,15,{crop}));
// The Worker script answers with the same result and transfers its buffer.
let posted;globalThis.self={postMessage:(m,t)=>{posted={m,t}}};
await import('./dist/imagery-worker.js');
self.onmessage({data:{job:7,op:'soften',pixels:px(),width:w,height:h,radius:1}});
assert.equal(posted.m.job,7);assert.deepEqual(posted.m.result,softenRGBA(px(),w,h,1));assert.equal(posted.t[0],posted.m.result.buffer);
self.onmessage({data:{job:8,op:'resample',pixels:new Uint8ClampedArray(3),width:2,height:2,outWidth:4,outHeight:4}});assert.equal(posted.m.job,8);assert(posted.m.error);
// covers(): a zoom-in inside the shown image needs no download until the image is too coarse;
// a zoom-out or a pan beyond its edge does.
const fake={states:new Map()},covers=FrameRenderer.prototype.covers.bind(fake);
const shown=viewportSpec([90,5,115,30],1000,600,4),image={width:shown.width,height:shown.height};
fake.states.set('cloud',{current:{image,coordinates:shown.coordinates}});fake.states.set('radar',{current:{image,coordinates:shown.coordinates}});
assert.equal(covers('cloud',viewportSpec([91,6,114,29],1000,600,4)),true);                // small zoom-in
assert.equal(covers('cloud',viewportSpec([88,3,117,32],1000,600,4)),false);               // zoom-out: edges uncovered
assert.equal(covers('cloud',viewportSpec([104,18,107,21],1000,600,7)),false);              // strong zoom-in: too coarse
assert.equal(covers('imerg',viewportSpec([91,6,114,29],1000,600,4)),false);               // no IMERG image yet
const sharp=viewportSpec([103,17,104,18],1000,600,9);fake.states.set('imerg',{current:{image:{width:sharp.width,height:sharp.height},coordinates:sharp.coordinates}});
assert.equal(covers('imerg',viewportSpec([103.4,17.4,103.6,17.6],1000,600,11)),true);      // finer than IMERG's ~10 km: no gain
assert.equal(covers('cloud',null),false);
// The page waits for the map to settle and skips covered views; images swap only between gestures.
const app=fs.readFileSync('dist/app.js','utf8'),fr=fs.readFileSync('dist/frame-renderer.js','utf8');
assert(app.includes("map.on('moveend',()=>{clearTimeout(viewportTimer);viewportTimer=setTimeout(refreshViewportImagery,VIEWPORT_SETTLE_MS)})"));
assert(app.includes('frameRenderer.covers(activeTime,frameRenderer.spec())'));assert(!app.includes("map.on('moveend',()=>{if(ready&&!playing)updateTimeline()})"));
assert(fr.includes("this.map.once('moveend',resolve)"));assert(fr.includes("new URL('./imagery-worker.js"));
assert(!/softenRGBA\(pixels\.data|out\.putImageData\(new ImageData\(resampleRGBA/.test(fr),'no pixel filtering on the main thread');
// The time bar keeps its height while images load (no status line popping in and out),
// and its height only re-centres the map after it settles, never during a gesture.
assert(!app.includes("playbackStatus('ລໍຖ້າພາບຄົບກ່ອນປ່ຽນ…')")&&app.includes("if(!playing){imageLoading=true;updateImageFreshness()}"));
assert(app.includes("imageLoading?'⟳ ກຳລັງໂຫຼດພາບ'"));
// The time bar's height only sets a CSS variable; it never moves the camera (setPadding fired moveend and reloaded images).
assert(!app.includes('setPadding')&&app.includes("$('workspace').style.setProperty('--timeline-height',h+'px')"));
const css=fs.readFileSync('dist/professional.css','utf8').trim().split('\n').at(-1);
assert(css.startsWith('.timeline-freshness{white-space:nowrap;overflow:hidden;text-overflow:ellipsis'));
// SOS demo removed on the owner's request (10 October 2026).
const page=fs.readFileSync('dist/index.html','utf8');assert(!/sos|SOS/.test(page.replace(/ISOString/g,''))&&!/sos-demo|sosBtn|sosDialog|simulateSos/.test(app));
// First load only: a blank newest NASA frame falls back to the newest earlier observation (own time);
// once a cloud image is on the map it is kept instead.
assert(app.includes("if(id==='cloud'&&!playing&&(!shownTimes.cloud||!frameRenderer?.covers('cloud',frameRenderer.spec()))&&fallback<3)")&&app.includes('s.frame>=0&&s.frame!==slot.frame'));
console.log('smooth zoom ok');
