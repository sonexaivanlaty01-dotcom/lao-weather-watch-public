import assert from 'node:assert/strict';
import {Playback,RenderGate,cursorAtTime,playbackIndices} from './dist/playback.js';
import {viewportSpec,nasaFrameURL,hasVisiblePixels,imageryBlurRadius} from './dist/frame-renderer.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const tick=()=>new Promise(r=>setTimeout(r,0));
const shown=[],states=[],slow=deferred();
const player=new Playback({holdMs:1,onState:s=>states.push(s),render:async i=>{if(i===1)await slow.promise;shown.push(i);return true}});
const run=player.run([0,1,2]);await new Promise(r=>setTimeout(r,10));assert.deepEqual(shown,[0]);slow.resolve();assert.equal(await run,'ended');assert.deepEqual(shown,[0,1,2]);await tick();assert.deepEqual(shown,[0,1,2]);assert.equal(states.at(-1),'ended');
const blocked=deferred(),seen=[];const cancelled=new Playback({holdMs:1,render:async i=>{seen.push(i);await blocked.promise;return true}});const task=cancelled.run([0,1]);cancelled.cancel();blocked.resolve();assert.equal(await task,'cancelled');assert.deepEqual(seen,[0]);
const failed=new Playback({holdMs:1,render:async i=>i!==1});assert.equal(await failed.run([0,1,2]),'error');
const loops=[],roundStates=[];const loopPlayer=new Playback({holdMs:1,render:async i=>{loops.push(i);return i!==1},onState:(s,d)=>roundStates.push([s,d])});
assert.equal(await loopPlayer.run([0,1,2],{}, {rounds:3,skipUnavailable:true}),'ended');assert.deepEqual(loops,[0,1,2,0,1,2,0,1,2]);assert.equal(roundStates.at(-1)[1].rounds,3);assert.equal(roundStates.at(-1)[1].skipped,3);
const unavailable=new Playback({holdMs:1,render:async()=>false});assert.equal(await unavailable.run([0,1],{}, {rounds:3,skipUnavailable:true}),'error');
const blockedLoop=deferred(),cancelledLoops=[];const stopLoop=new Playback({holdMs:1,render:async i=>{cancelledLoops.push(i);await blockedLoop.promise;return true}});const stopRun=stopLoop.run([0,1],{}, {rounds:3});stopLoop.cancel();blockedLoop.resolve();assert.equal(await stopRun,'cancelled');assert.deepEqual(cancelledLoops,[0]);
const gate=new RenderGate(),old=deferred(),commits=[];const oldTask=gate.prepare(()=>old.promise,x=>commits.push(x));await gate.prepare(async()=>2,x=>commits.push(x));old.resolve(1);assert.equal(await oldTask,false);assert.deepEqual(commits,[2]);
const pending=deferred();const stop=gate.prepare(()=>pending.promise,x=>commits.push(x));gate.cancel();pending.resolve(3);assert.equal(await stop,false);assert.deepEqual(commits,[2]);
const spec=viewportSpec([96,10,112,27],390,844,4.5);assert(spec.width<=1024&&spec.height<=1024);assert(spec.coordinates[0][0]<96&&spec.coordinates[2][0]>112);assert(spec.coordinates[0][1]>27&&spec.coordinates[2][1]<10);
const url=new URL(nasaFrameURL('cloud',Date.parse('2026-10-07T05:20:00Z'),spec));assert.equal(url.searchParams.get('TIME'),'2026-10-07T05:20:00Z');assert.equal(url.searchParams.get('BBOX'),spec.bbox.join(','));assert.equal(url.searchParams.get('WIDTH'),String(spec.width));assert.equal(url.searchParams.get('FORMAT'),'image/png');assert.equal(viewportSpec([96,10,112,27],3000,3000,15).zoom,7);
assert.throws(()=>viewportSpec([112,10,96,27]));
const retina=viewportSpec([96,10,112,27],1000,650,4,2);assert(retina.width>spec.width);assert(retina.width<=2048&&retina.height<=2048);
const countryView=viewportSpec([96,10,112,27],1000,650,4),cityView=viewportSpec([102.55,17.93,102.68,18.06],1000,650,11),streetView=viewportSpec([102.61,17.97,102.611,17.971],1000,650,16);
for(const layer of ['cloud','imerg','radar']){assert(imageryBlurRadius(layer,cityView)>imageryBlurRadius(layer,countryView));assert(imageryBlurRadius(layer,streetView)<=192)}
assert.equal(hasVisiblePixels(new Uint8ClampedArray([255,255,255,0,0,0,0,0])),false);assert.equal(hasVisiblePixels(new Uint8ClampedArray([0,0,0,0,1,1,1,1])),true);
assert.equal(cursorAtTime([{time:10},{time:20},{time:30}],20),1);assert.equal(cursorAtTime([{time:10},{time:20}],30),1);assert.equal(cursorAtTime([{time:20},{time:30}],10),0);
assert.deepEqual(playbackIndices([{frame:0},{frame:-1},{frame:1},{frame:-1},{frame:2}],0),[0,2,4]);assert.deepEqual(playbackIndices([{frame:0},{frame:-1},{frame:1}],1),[2]);
console.log('Playback serial readiness, three bounded rounds, unavailable-frame skipping, cancellation and zoom-aware display smoothing passed');
const nativeTimeout=globalThis.setTimeout,delays=[],speedStates=[];
globalThis.setTimeout=(callback,ms)=>{delays.push(ms);queueMicrotask(callback);return 0};
try{
 const fast=new Playback({holdMs:1200,speed:3,render:async()=>true,onState:(s,d)=>{if(s==='playing')speedStates.push(d.speed)}});
 assert.equal(await fast.run([0,1,2]),'ended');assert.deepEqual(delays,[400,400]);assert.deepEqual(speedStates,[3,3,3]);
 delays.length=0;fast.setSpeed(2);assert.equal(await fast.run([0,1]),'ended');assert.deepEqual(delays,[600]);
 fast.setSpeed(99);assert.equal(fast.speed,1);
}finally{globalThis.setTimeout=nativeTimeout}
const speedWait=deferred(),fastSeen=[],changing=new Playback({holdMs:1200,speed:2,render:async i=>{fastSeen.push(i);if(i===0)await speedWait.promise;return true}});
const speedRun=changing.run([0,1]);changing.setSpeed(3);await tick();assert.deepEqual(fastSeen,[0]);speedWait.resolve();assert.equal(await speedRun,'ended');assert.deepEqual(fastSeen,[0,1]);
console.log('1x/2x/3x timing and live speed changes preserve serial frame readiness.');
