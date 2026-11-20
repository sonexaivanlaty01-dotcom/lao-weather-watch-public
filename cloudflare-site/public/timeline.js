export const HISTORY_WINDOW=5*60*60*1000;
export const TIMELINE_STEP=10*60*1000;
export const TIMELINE_POSITIONS=HISTORY_WINDOW/TIMELINE_STEP+1;
export const LIVE_REFRESH_MS=10*60*1000;
export const IMAGERY_REFRESH_MS=60000;
export function nextImageryRefreshDelay(now=Date.now()){return IMAGERY_REFRESH_MS-now%IMAGERY_REFRESH_MS}
// Extra 15-second checks from 11:15 to 13:30 after each ten-minute observation,
// when NOAA/AWS usually publishes Himawari files. Outside it, wait for it.
export const AWS_CHECK_WINDOW=[11.25*60000,13.5*60000],AWS_CHECK_MS=15000;
// The window is longer than one cadence after its observation, so compare
// within the ten-minute cycle (11:15 after 00:00 is 01:15 into the 00:10 cycle).
export function awsPublicationCheckDelay(now=Date.now()){const phase=now%LIVE_REFRESH_MS,start=AWS_CHECK_WINDOW[0]%LIVE_REFRESH_MS,end=start+AWS_CHECK_WINDOW[1]-AWS_CHECK_WINDOW[0];if(phase<start)return start-phase;if(phase<end-AWS_CHECK_MS)return AWS_CHECK_MS-(phase-start)%AWS_CHECK_MS;return LIVE_REFRESH_MS-phase+start}
// Check shortly after a provider observation boundary, rather than ten minutes
// after the user happened to open the page. Do not invent new observation times.
export function nextRefreshDelay(now=Date.now()){const offset=60000,slot=Math.floor((now-offset)/LIVE_REFRESH_MS)+1;return slot*LIVE_REFRESH_MS+offset-now}
// Each ten-minute cursor uses the preceding actual observation, never a
// future image. Missing history and gaps longer than the source cadence stay
// empty. The original observation timestamp remains available to the UI.
// The bar spans what the source actually offers (rounded up to 10 min, 1–5 hours): RainViewer's
// free API keeps 2 hours, TMD and the satellites 5, so no source shows hours of empty slots.
// The step follows the source's own cadence (IMERG 30 min, TMD 15 min, others 10 min), so the
// slider never lands between two images of a slower source.
export const MIN_TIMELINE_WINDOW=60*60*1000;
export function timelineWindow(times,stepMs=TIMELINE_STEP){if(!times.length)return HISTORY_WINDOW;const span=times.at(-1)-times[0];return Math.min(HISTORY_WINDOW,Math.max(MIN_TIMELINE_WINDOW,Math.ceil(span/stepMs)*stepMs))}
export function buildTimeline(times,maxHoldMinutes,windowMs=HISTORY_WINDOW,stepMs=TIMELINE_STEP){
 if(!times.length)return [];
 const end=times.at(-1),start=end-windowMs;let frame=-1;
 return Array.from({length:Math.floor(windowMs/stepMs)+1},(_,i)=>{
  const time=start+i*stepMs;while(frame+1<times.length&&times[frame+1]<=time)frame++;
  const available=frame>=0&&time-times[frame]<maxHoldMinutes*60000;
  return {time,frame:available?frame:-1};
 });
}
