// HSD header fields follow JMA's Himawari Standard Data specification.
// Keep the measured native grid. Smooth display interpolation adds no observations.
import {bunzipBytes} from './vendor/bzip2.mjs';
import {AWS_PALETTE} from '../dist/aws-palette.js';
export const AWS_REGION={west:96,south:9,east:112,north:28,width:1024,height:1260};
const deg=Math.PI/180;
export function readHSD(compressed){
 const bytes=bunzipBytes(compressed),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),blocks=new Map();let pos=0;
 for(let n=1;n<=11;n++){if(pos+5>bytes.length)throw new Error('truncated_hsd');const id=v.getUint8(pos),length=id===10?v.getUint32(pos+1,true):v.getUint16(pos+1,true);if(id!==n||length<3||pos+length>bytes.length)throw new Error('invalid_hsd_header');blocks.set(id,pos);pos+=length}
 const b=blocks.get(1),d=blocks.get(2),p=blocks.get(3),c=blocks.get(5),s=blocks.get(7),header=v.getUint32(b+70,true),cols=v.getUint16(d+5,true),rows=v.getUint16(d+7,true),first=v.getUint16(s+5,true)-1;
 if(header!==pos||cols!==5500||rows!==550||v.getUint16(c+3,true)!==13||v.getUint8(d+9)!==0||header+rows*cols*2!==bytes.length)throw new Error('invalid_hsd_layout');
 const f=(base,offset)=>v.getFloat64(base+offset,true),ir=c+35;
 const projection={lon:f(p,3),cfac:v.getUint32(p+11,true),lfac:v.getUint32(p+15,true),coff:v.getFloat32(p+19,true),loff:v.getFloat32(p+23,true),H:f(p,27),a:f(p,35),b:f(p,43)};
 if(Math.abs(projection.lon-140.7)>.05||projection.a<6300||projection.H<42000)throw new Error('invalid_hsd_projection');
 const calibration={gain:f(c,19),offset:f(c,27),wave:f(c,5)*1e-6,error:v.getUint16(c+15,true),outside:v.getUint16(c+17,true),c0:f(ir,0),c1:f(ir,8),c2:f(ir,16),light:f(ir,48),planck:f(ir,56),boltzmann:f(ir,64)};
 return {view:v,header,cols,rows,first,projection,calibration};
}
export function hsdPixel(lon,lat,p){
 const ratio=(p.b/p.a)**2,phi=Math.atan(ratio*Math.tan(lat*deg)),delta=(lon-p.lon)*deg,cos=Math.cos(phi),radius=p.b/Math.sqrt(1-(1-ratio)*cos*cos),r1=p.H-radius*cos*Math.cos(delta),r2=-radius*cos*Math.sin(delta),r3=radius*Math.sin(phi);
 return [Math.atan(-r2/r1)/deg*p.cfac/65536+p.coff-1,Math.asin(-r3/Math.sqrt(r1*r1+r2*r2+r3*r3))/deg*p.lfac/65536+p.loff-1];
}
export function countTemperature(count,c){
 if(count===c.error||count===c.outside)return NaN;const rad=count*c.gain+c.offset;if(rad<=0)return NaN;
 const te=c.planck*c.light/(c.boltzmann*c.wave)/Math.log1p(2*c.planck*c.light*c.light/(rad*1e6*c.wave**5));return c.c0+c.c1*te+c.c2*te*te;
}
export function cropLayout(p){
 const g=AWS_REGION,points=[];for(const lat of [g.south,g.north])for(let lon=g.west;lon<=g.east;lon+=.25)points.push(hsdPixel(lon,lat,p));
 for(const lon of [g.west,g.east])for(let lat=g.south;lat<=g.north;lat+=.25)points.push(hsdPixel(lon,lat,p));
 const left=Math.max(0,Math.floor(Math.min(...points.map(x=>x[0])))-2),top=Math.max(0,Math.floor(Math.min(...points.map(x=>x[1])))-2),right=Math.min(5499,Math.ceil(Math.max(...points.map(x=>x[0])))+2),bottom=Math.min(5499,Math.ceil(Math.max(...points.map(x=>x[1])))+2);
 if(top<1100||bottom>=2750||(right-left)*(bottom-top)>1300000)throw new Error('unsupported_aws_region');
 return {left,top,width:right-left+1,height:bottom-top+1,projection:p};
}
export function copySegment(grid,layout,hsd){
 const start=Math.max(layout.top,hsd.first),end=Math.min(layout.top+layout.height,hsd.first+hsd.rows);
 for(let y=start;y<end;y++)for(let x=0;x<layout.width;x++){const count=hsd.view.getUint16(hsd.header+((y-hsd.first)*hsd.cols+layout.left+x)*2,true);grid[(y-layout.top)*layout.width+x]=countTemperature(count,hsd.calibration)}
}
let awsProjectionMap;
function mapping(layout){
 const g=AWS_REGION;if(awsProjectionMap?.key===JSON.stringify(layout))return awsProjectionMap;
 const x=new Float32Array(g.width*g.height),y=new Float32Array(x.length),latitudes=new Float64Array(g.height),m=v=>Math.log(Math.tan(Math.PI/4+v*deg/2)),north=m(g.north),south=m(g.south);
 for(let row=0;row<g.height;row++)latitudes[row]=(2*Math.atan(Math.exp(north-(row+.5)*(north-south)/g.height))-Math.PI/2)/deg;
 for(let row=0;row<g.height;row++)for(let col=0;col<g.width;col++){const point=hsdPixel(g.west+(col+.5)*(g.east-g.west)/g.width,latitudes[row],layout.projection),i=row*g.width+col;x[i]=point[0]-layout.left;y[i]=point[1]-layout.top}
 awsProjectionMap={key:JSON.stringify(layout),x,y};return awsProjectionMap;
}
// Continuous colour for a brightness temperature (degrees Celsius).
// NASA's table has one-degree bins; continuous interpolation matches the accepted sample.
function paletteColor(tempC,out,offset){
 const palette=AWS_PALETTE,t=Math.max(0,Math.min(palette.length-1,tempC-palette[0][0])),index=Math.floor(t),fraction=t-index,a=palette[index],b=palette[Math.min(index+1,palette.length-1)];
 for(let channel=0;channel<3;channel++)out[offset+channel]=Math.round(a[channel+1]*(1-fraction)+b[channel+1]*fraction);
}
function sampleTemperature(grid,layout,x,y){
 const ix=Math.floor(x),iy=Math.floor(y),dx=x-ix,dy=y-iy;if(ix<0||iy<0||ix+1>=layout.width||iy+1>=layout.height)return NaN;
 const k=iy*layout.width+ix;return grid[k]*(1-dx)*(1-dy)+grid[k+1]*dx*(1-dy)+grid[k+layout.width]*(1-dx)*dy+grid[k+layout.width+1]*dx*dy;
}
export function renderHSD(grid,layout){
 const g=AWS_REGION,map=mapping(layout),rgba=new Uint8Array(g.width*g.height*4);
 for(let i=0;i<map.x.length;i++){const temp=sampleTemperature(grid,layout,map.x[i],map.y[i]);if(!Number.isFinite(temp))continue;paletteColor(temp-273.15,rgba,i*4);rgba[i*4+3]=255}
 return rgba;
}
// Compact display image: 255 brightness-temperature levels (about 0.58 degC
// apart, finer than NASA's one-degree table) plus index 0 for no data. About
// a quarter of the RGBA size, so history downloads and decodes faster.
export const AWS_LEVELS={min:-91.6,max:57.4,count:255};
export const AWS_INDEXED_PALETTE=(()=>{const rgb=new Uint8Array(256*3);for(let i=1;i<256;i++)paletteColor(AWS_LEVELS.min+(i-1)*(AWS_LEVELS.max-AWS_LEVELS.min)/(AWS_LEVELS.count-1),rgb,i*3);return rgb})();
export function levelIndex(tempC){return 1+Math.round(Math.max(0,Math.min(1,(tempC-AWS_LEVELS.min)/(AWS_LEVELS.max-AWS_LEVELS.min)))*(AWS_LEVELS.count-1))}
export function renderHSDIndexed(grid,layout){
 const g=AWS_REGION,map=mapping(layout),indices=new Uint8Array(g.width*g.height);
 for(let i=0;i<map.x.length;i++){const temp=sampleTemperature(grid,layout,map.x[i],map.y[i]);if(Number.isFinite(temp))indices[i]=levelIndex(temp-273.15)}
 return indices;
}
const pngCRCTable=new Uint32Array(256).map((_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function pngChunk(type,data){const bytes=new Uint8Array(data.length+12),view=new DataView(bytes.buffer);view.setUint32(0,data.length);bytes.set(new TextEncoder().encode(type),4);bytes.set(data,8);let crc=0xffffffff;for(let i=4;i<bytes.length-4;i++)crc=pngCRCTable[(crc^bytes[i])&255]^(crc>>>8);view.setUint32(bytes.length-4,(crc^0xffffffff)>>>0);return bytes}
export async function encodeAWSImage(rgba,width=AWS_REGION.width,height=AWS_REGION.height){
 if(rgba.length!==width*height*4)throw new Error('invalid_aws_image');const stride=width*4,filtered=new Uint8Array((stride+1)*height);
 for(let y=0;y<height;y++){const start=y*(stride+1);filtered[start]=1;for(let x=0;x<stride;x++)filtered[start+1+x]=(rgba[y*stride+x]-(x<4?0:rgba[y*stride+x-4]))&255}
 const compressed=new Uint8Array(await new Response(new Blob([filtered]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()),ihdr=new Uint8Array(13),header=new DataView(ihdr.buffer);header.setUint32(0,width);header.setUint32(4,height);ihdr[8]=8;ihdr[9]=6;
 const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ihdr),pngChunk('IDAT',compressed),pngChunk('IEND',new Uint8Array())],length=chunks.reduce((n,c)=>n+c.length,0),png=new Uint8Array(length);let pos=0;for(const chunk of chunks){png.set(chunk,pos);pos+=chunk.length}return png;
}

// Palette PNG (colour type 3) with index 0 transparent. Each row uses the
// cheapest of the None/Sub/Up filters by absolute-sum heuristic.
export async function encodeIndexedPNG(indices,width=AWS_REGION.width,height=AWS_REGION.height,palette=AWS_INDEXED_PALETTE){
 if(indices.length!==width*height||palette.length!==768)throw new Error('invalid_indexed_image');
 const filtered=new Uint8Array((width+1)*height),candidate=[new Uint8Array(width),new Uint8Array(width),new Uint8Array(width)];
 for(let y=0;y<height;y++){
  const row=y*width,previous=row-width;let best=0,bestScore=Infinity;
  for(let f=0;f<3;f++){let score=0;const out=candidate[f];for(let x=0;x<width;x++){const v=indices[row+x],p=f===1?(x?indices[row+x-1]:0):f===2?(y?indices[previous+x]:0):0,d=(v-p)&255;out[x]=d;score+=d<128?d:256-d}if(score<bestScore){bestScore=score;best=f}}
  const start=y*(width+1);filtered[start]=best;filtered.set(candidate[best],start+1);
 }
 const compressed=new Uint8Array(await new Response(new Blob([filtered]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()),ihdr=new Uint8Array(13),header=new DataView(ihdr.buffer);header.setUint32(0,width);header.setUint32(4,height);ihdr[8]=8;ihdr[9]=3;
 const trns=new Uint8Array(256).fill(255);trns[0]=0;
 const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ihdr),pngChunk('PLTE',palette),pngChunk('tRNS',trns),pngChunk('IDAT',compressed),pngChunk('IEND',new Uint8Array())],length=chunks.reduce((n,c)=>n+c.length,0),png=new Uint8Array(length);let pos=0;for(const chunk of chunks){png.set(chunk,pos);pos+=chunk.length}return png;
}
