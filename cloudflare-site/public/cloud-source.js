// Cloud imagery source policy. NASA GIBS is primary: NASA renders Himawari-9
// Band 13 itself, so no converter of ours has to stay up, and history is long.
// NOAA/AWS frames (CDN, then the on-demand Worker) are a backup only, used when
// GIBS cannot be reached and the frames already shown are too old to keep.
export const CLOUD_PRIMARY='nasa';
// GIBS normally publishes 30–45 minutes after observation; AWS about 12.
// Beyond these ages the source itself is flagged as late, never the frame time.
export const SOURCE_LATE_MS={nasa:3600000,aws:1800000,jma:1800000};
// Keep showing the primary's frames through short outages instead of switching.
export const KEEP_PRIMARY_MS=5400000;
export function sourceLate(provider,latest,now=Date.now()){const t=Date.parse(latest);return Number.isFinite(t)&&now-t>=(SOURCE_LATE_MS[provider]??SOURCE_LATE_MS.nasa)}
export async function chooseCloudSource(current,{nasa,backup},now=Date.now()){
 try{return {source:'nasa',frames:await nasa()}}
 catch(error){const latest=Date.parse(current?.latest);if(current?.provider==='nasa'&&Number.isFinite(latest)&&now-latest<KEEP_PRIMARY_MS)throw error}
 return {source:'aws',frames:await backup()};
}
export function cloudSourceLabel(source){return source==='nasa'?'NASA GIBS · Himawari-9':source==='aws'?'NOAA / AWS · Himawari-9 · ສຳຮອງ':'JMA · Himawari-9'}
export function cloudTimelineTitle(source){return source==='nasa'?'Himawari · NASA':source==='aws'?'Himawari · AWS ສຳຮອງ':'JMA · ເມກ'}
