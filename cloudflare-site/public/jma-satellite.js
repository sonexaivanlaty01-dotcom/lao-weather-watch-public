export const JMA_TIMES='/api/satellite/jma/times';
export function jmaDirectURL(path){
 const origin='https://www.jma.go.jp/bosai/himawari/data/satimg/';
 if(path===JMA_TIMES)return origin+'targetTimes_fd.json';
 const m=/^\/api\/satellite\/jma\/tile\/(\d{14})\/(\d{14})\/([2-5])\/(\d{1,2})\/(\d{1,2})$/.exec(path);
 if(!m||!Number.isFinite(jmaTimestamp(m[1]))||!Number.isFinite(jmaTimestamp(m[2]))||Number(m[4])>=2**Number(m[3])||Number(m[5])>=2**Number(m[3]))return null;
 return `${origin}${m[1]}/fd/${m[2]}/B13/TBB/${m[3]}/${m[4]}/${m[5]}.jpg`;
}
export async function discoverCloudFrames({loadPrimary,loadBackup,forceBackup=false,now=Date.now()}){
 let primary;
 if(!forceBackup){try{primary=jmaFrames(await loadPrimary(),now)}catch{/* Discover independently published backup times. */}}
 if(primary&&now-Date.parse(primary.at(-1).time)<1800000)return primary;
 try{const backup=(await loadBackup()).map(time=>({time,provider:'nasa'}));if(!backup.length)throw new Error('empty_backup');return !primary||Date.parse(backup.at(-1).time)>Date.parse(primary.at(-1).time)?backup:primary}
 catch(error){if(primary)return primary;throw error}
}
export function jmaTimestamp(value){
 if(!/^\d{14}$/.test(value||''))return NaN;
 const iso=`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${value.slice(8,10)}:${value.slice(10,12)}:${value.slice(12,14)}Z`,time=Date.parse(iso);
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,19)===iso.slice(0,19)?time:NaN;
}
export function jmaFrames(list,now=Date.now()){
 if(!Array.isArray(list))throw new Error('invalid_jma_times');
 const frames=new Map();
 for(const row of list){const time=jmaTimestamp(row.validtime),base=jmaTimestamp(row.basetime);if(Number.isFinite(time)&&Number.isFinite(base)&&base<=time&&time<=now)frames.set(time,{provider:'jma',basetime:row.basetime,validtime:row.validtime,time:new Date(time).toISOString()})}
 const ordered=[...frames.values()].sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)),latest=Date.parse(ordered.at(-1)?.time);
 if(!ordered.length)throw new Error('empty_jma_times');
 return ordered.filter(f=>Date.parse(f.time)>=latest-5*3600000);
}
export function jmaTilePlan(spec,frame){
 if(!Number.isFinite(jmaTimestamp(frame.basetime))||!Number.isFinite(jmaTimestamp(frame.validtime)))throw new Error('invalid_jma_frame');
 const zoom=Math.max(2,Math.min(5,spec.zoom)),count=2**zoom,world=count*256,x=lon=>(lon+180)/360*world,y=lat=>(1-Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))/Math.PI)/2*world;
 const left=x(spec.coordinates[0][0]),top=y(spec.coordinates[0][1]),right=x(spec.coordinates[2][0]),bottom=y(spec.coordinates[2][1]);
 const originX=Math.floor(left)-3,originY=Math.floor(top)-3,width=Math.ceil(right)-originX+3,height=Math.ceil(bottom)-originY+3,jobs=[];
 if(width<1||height<1||width*height>6000000)throw new Error('viewport_too_large');
 for(let ty=Math.max(0,Math.floor(originY/256));ty<=Math.min(count-1,Math.floor((originY+height-1)/256));ty++)for(let tx=Math.max(0,Math.floor(originX/256));tx<=Math.min(count-1,Math.floor((originX+width-1)/256));tx++)jobs.push({x:tx,y:ty,url:`/api/satellite/jma/tile/${frame.basetime}/${frame.validtime}/${zoom}/${tx}/${ty}`});
 if(!jobs.length||jobs.length>40)throw new Error('viewport_too_large');
 return {originX,originY,width,height,jobs,crop:[left-originX,top-originY,right-left,bottom-top]};
}
