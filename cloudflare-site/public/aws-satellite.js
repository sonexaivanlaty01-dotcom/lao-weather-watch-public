export const AWS_TIMES='/api/satellite/aws/times';
// Pre-converted image CDN (cloudflare/ in this project). Empty = use the
// on-demand same-origin Worker route only. Example: 'https://himawari.example.org'
export const CLOUD_CDN_BASE='https://lao-himawari.sonexaivanlaty01.workers.dev';
export const CDN_PREFIX='himawari9/b13/';
export function cdnIndexURL(base=CLOUD_CDN_BASE){if(!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(base||''))throw new Error('no_cdn');return base+'/'+CDN_PREFIX+'index.json'}
export const AWS_COORDINATES=[[96,28],[112,28],[112,9],[96,9]];
export function awsFrameURL(frame,base=CLOUD_CDN_BASE){if(frame?.provider!=='aws'||!/^\d{12}$/.test(frame.stamp||''))throw new Error('invalid_aws_frame');const expected=new Date(frame.time).toISOString().replace(/[-:T]/g,'').slice(0,12);if(expected!==frame.stamp)throw new Error('invalid_aws_time');if(frame.source==='cdn')return cdnIndexURL(base).replace(/index\.json$/,frame.stamp+'.png');return '/api/satellite/aws/frame/'+frame.stamp+'.png'}
export function awsFrames(data,now=Date.now()){
 if(data?.provider!=='aws'||!Array.isArray(data.frames)||!data.frames.length||data.frames.length>31)throw new Error('invalid_aws_times');
 const source=data.source==='cdn'?'cdn':'worker',frames=data.frames.filter(f=>f.provider==='aws'&&Number.isFinite(Date.parse(f.time))&&Date.parse(f.time)<=now).map(f=>{const frame={...f,source,time:new Date(f.time).toISOString()};awsFrameURL({...frame,source:'worker'});return frame}).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
 if(!frames.length||now-Date.parse(frames.at(-1).time)>3600000)throw new Error('stale_aws_times');return frames.filter(f=>Date.parse(f.time)>=Date.parse(frames.at(-1).time)-5*3600000);
}
