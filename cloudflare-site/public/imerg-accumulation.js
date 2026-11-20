import {IMERG_PALETTE} from './imerg-palette.js?v=20261026-fast';
// 24-hour satellite rain total from NASA IMERG half-hourly rates (GIBS images).
// Each image's colour is converted back to its mm/h class (geometric middle of the
// log-spaced class), multiplied by 0.5 h and summed. Missing half-hours are counted,
// never filled: a total built from fewer images is reported as incomplete.
export const ACCUM_REGION={west:96,east:112,south:9,north:28,width:160,height:190};
export const IMERG_STEP_MS=1800000,ACCUM_HOURS=24,ACCUM_FRAMES=ACCUM_HOURS*2;
const rates=new Map(IMERG_PALETTE.map(([r,g,b,low,high])=>[(r<<16)|(g<<8)|b,high===null?low:Math.sqrt(low*high)]));
export function imergRate(r,g,b,a){if(!a)return 0;const v=rates.get((r<<16)|(g<<8)|b);return v===undefined?null:v}
// Half-hour start times of the latest complete 24 hours listed by GIBS.
export function imergDayTimes(domain,hours=ACCUM_HOURS){
 if(typeof domain!=='string'||!domain.trim())throw new Error('empty_domain');const all=new Set();
 for(const range of domain.split(',')){const [a,b,period]=range.trim().split('/'),start=Date.parse(a),end=Date.parse(b||a);if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||(b&&period!=='PT30M'))throw new Error('invalid_domain');for(let t=start;t<=end;t+=IMERG_STEP_MS)all.add(t)}
 const latest=Math.max(...all),first=latest-(hours*2-1)*IMERG_STEP_MS;
 return {latest,first,times:[...all].filter(t=>t>=first).sort((a,b)=>a-b)};
}
export function imergFrameURL(time){
 const g=ACCUM_REGION,q=new URLSearchParams({SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetMap',LAYERS:'IMERG_Precipitation_Rate_30min',STYLES:'',SRS:'EPSG:4326',BBOX:[g.west,g.south,g.east,g.north].join(','),WIDTH:g.width,HEIGHT:g.height,FORMAT:'image/png',TRANSPARENT:'TRUE',TIME:new Date(time).toISOString().replace('.000Z','Z')});
 return 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?'+q;
}
// frames: RGBA arrays (one per half-hour) or null where the image could not be loaded.
export function accumulate(frames,{width,height}=ACCUM_REGION){
 const mm=new Float32Array(width*height);let loaded=0,unknown=0;
 for(const rgba of frames){if(!rgba)continue;if(rgba.length!==width*height*4)throw new Error('invalid_frame');loaded++;
  for(let i=0;i<mm.length;i++){const p=i*4,rate=imergRate(rgba[p],rgba[p+1],rgba[p+2],rgba[p+3]);if(rate===null){unknown++;continue}mm[i]+=rate*.5}}
 return {mm,width,height,loaded,expected:frames.length,unknown,complete:loaded===frames.length};
}
export function accumulationAt(acc,lon,lat){
 const g=ACCUM_REGION;if(lon<g.west||lon>=g.east||lat<=g.south||lat>g.north)return null;
 const x=Math.min(acc.width-1,Math.floor((lon-g.west)/(g.east-g.west)*acc.width)),y=Math.min(acc.height-1,Math.floor((g.north-lat)/(g.north-g.south)*acc.height));
 return acc.mm[y*acc.width+x];
}
// Same 24-hour bands as the rain gauges, so both layers read alike.
const BANDS=[[90,[198,40,40]],[35,[239,108,0]],[10,[30,111,217]],[1,[111,177,238]]];
// MapLibre stretches image sources linearly in Web Mercator, so output rows are
// placed in Mercator and each takes the IMERG (equal-degree) row at its latitude.
const merc=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360)),unmerc=y=>(2*Math.atan(Math.exp(y))-Math.PI/2)*180/Math.PI;
export function accumulationRaster(acc){
 const g=ACCUM_REGION,out=new Uint8ClampedArray(acc.width*acc.height*4),top=merc(g.north),bottom=merc(g.south);
 for(let y=0;y<acc.height;y++){
  const lat=unmerc(top-(y+.5)/acc.height*(top-bottom)),sy=Math.min(acc.height-1,Math.max(0,Math.floor((g.north-lat)/(g.north-g.south)*acc.height)));
  for(let x=0;x<acc.width;x++){const v=acc.mm[sy*acc.width+x],band=BANDS.find(([min])=>v>=min);if(!band)continue;const p=(y*acc.width+x)*4;out[p]=band[1][0];out[p+1]=band[1][1];out[p+2]=band[1][2];out[p+3]=v>=10?190:150}
 }
 return out;
}
export function accumulationCoordinates(){const g=ACCUM_REGION;return [[g.west,g.north],[g.east,g.north],[g.east,g.south],[g.west,g.south]]}
