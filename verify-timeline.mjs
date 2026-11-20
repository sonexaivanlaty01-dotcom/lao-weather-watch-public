import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildTimeline,HISTORY_WINDOW,TIMELINE_STEP,nextRefreshDelay,LIVE_REFRESH_MS,nextImageryRefreshDelay,IMAGERY_REFRESH_MS} from './dist/timeline.js';
const end=Date.parse('2026-10-07T03:00:00Z');
const times=Array.from({length:13},(_,i)=>end-(12-i)*10*60000),slots=buildTimeline(times,10);
assert.equal(slots.length,31);assert.equal(HISTORY_WINDOW,5*3600000);assert.equal(slots[0].time,end-HISTORY_WINDOW);assert.equal(slots.at(-1).time,end);
assert.equal(slots[1].time-slots[0].time,TIMELINE_STEP);assert.equal(slots[17].frame,-1);assert.equal(slots[18].frame,0);assert.equal(slots[19].frame,1);assert.equal(slots[20].frame,2);
assert(slots.every(s=>s.frame<0||times[s.frame]<=s.time));
const gaps=buildTimeline([end-180*60000,end],10);assert.equal(gaps[2].frame,-1);assert.equal(gaps.at(-1).frame,1);
assert.deepEqual(buildTimeline([],10),[]);
const complete=Array.from({length:31},(_,i)=>end-(30-i)*TIMELINE_STEP);assert(buildTimeline(complete,10).every((s,i)=>s.frame===i));
console.log('5-hour / 10-minute timeline, preceding observations and missing gaps passed');
// Window per source: RainViewer free API (13 frames = 2 h) -> 2 h bar; TMD 5 h -> 5 h; short lists at least 1 h.
{const {timelineWindow,MIN_TIMELINE_WINDOW}=await import('./dist/timeline.js');
 assert.equal(timelineWindow(times),2*3600000);const rv=buildTimeline(times,10,timelineWindow(times));assert.equal(rv.length,13);assert(rv.every((s,i)=>s.frame===i),'no empty slots for a 2-hour source');
 const vn=Array.from({length:12},(_,i)=>end-(11-i)*10*60000);assert.equal(timelineWindow(vn),110*60000,'Hymetnet list spans 110 min → 110-minute bar');
 const tmd=Array.from({length:21},(_,i)=>end-(20-i)*15*60000);assert.equal(timelineWindow(tmd),HISTORY_WINDOW);
 assert.equal(timelineWindow([end]),MIN_TIMELINE_WINDOW);assert.equal(timelineWindow([end-9*3600000,end]),HISTORY_WINDOW,'never more than 5 h');assert.equal(timelineWindow([]),HISTORY_WINDOW);
 const app=fs.readFileSync('dist/app.js','utf8');assert(app.includes('timeSlots=buildTimeline(times,hold,windowMs,stepMs)')&&!app.includes("$('timeSlider').max=TIMELINE_POSITIONS-1"));
 // IMERG every 30 min: a 30-minute step gives 11 positions for 5 h, each its own image (none repeated or empty).
 const im=Array.from({length:11},(_,i)=>end-(10-i)*30*60000),imSlots=buildTimeline(im,30,timelineWindow(im,30*60000),30*60000);
 assert.equal(imSlots.length,11);assert(imSlots.every((s,i)=>s.frame===i));
 const tmdSlots=buildTimeline(tmd,15,timelineWindow(tmd,15*60000),15*60000);assert.equal(tmdSlots.length,21);assert(tmdSlots.every((s,i)=>s.frame===i));
 assert(app.includes("activeTime==='imerg'?30:")&&app.includes('timeSlots=buildTimeline(times,hold,windowMs,stepMs)'));
 console.log('Timeline window and step follow each source (RainViewer 2 h/10 min, TMD 5 h/15 min, IMERG 5 h/30 min).');}
// IMERG display: the soft look is kept (owner's choice); the page says the image is hours old.
{const fr=fs.readFileSync('dist/frame-renderer.js','utf8'),app=fs.readFileSync('dist/app.js','utf8');
 assert(fr.includes("preserveGaps:d.id==='cloud-motion'})")&&fr.includes("id==='imerg'?3:"));
 assert(app.includes("NASA ເຜີຍແຜ່ຊ້າ 4–6 ຊມ"));}
const clock=Date.UTC(2026,9,8,0,30);assert.equal(nextRefreshDelay(clock),60000);assert.equal(nextRefreshDelay(clock+59000),1000);assert.equal(nextRefreshDelay(clock+60000),LIVE_REFRESH_MS);
assert(nextRefreshDelay(clock+123456)>0&&nextRefreshDelay(clock+123456)<=LIVE_REFRESH_MS);
console.log('Refresh aligns to ten-minute observation boundaries with a one-minute publication margin.');
assert.equal(IMAGERY_REFRESH_MS,60000);assert.equal(nextImageryRefreshDelay(clock),60000);assert.equal(nextImageryRefreshDelay(clock+59999),1);assert.equal(nextImageryRefreshDelay(clock+60000),60000);
assert(nextImageryRefreshDelay(clock+123456)>0&&nextImageryRefreshDelay(clock+123456)<=60000);
console.log('Independent image metadata checks occur every minute without changing observation cadence.');
{
 const {awsPublicationCheckDelay,AWS_CHECK_MS}=await import('./dist/timeline.js');
 const slot=Date.parse('2026-10-09T00:00:00Z');
 assert.equal(awsPublicationCheckDelay(slot),1.25*60000,'waits for the window 11:15 after the previous observation');
 assert.equal(awsPublicationCheckDelay(slot+11.25*60000),AWS_CHECK_MS);
 assert.equal(awsPublicationCheckDelay(slot+11.25*60000+5000),10000);
 assert.equal(awsPublicationCheckDelay(slot+13.5*60000),10*60000-2.25*60000,'next window after the current one');
 const checks=[];for(let t=slot+4*60000;t<slot+14*60000;){t+=awsPublicationCheckDelay(t);checks.push((t-slot)/1000)}
 assert.deepEqual(checks,[675,690,705,720,735,750,765,780,795,1275],'quiet until 11:15, then every 15 s to 13:30');
 for(let t=slot;t<slot+20*60000;t+=7000){const d=awsPublicationCheckDelay(t);assert.ok(d>0&&d<=10*60000)}
 console.log('AWS publication-window checks: 15 s from 11:15 to 13:30 after each observation, otherwise idle.');
}
