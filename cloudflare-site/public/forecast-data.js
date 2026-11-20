export const FORECAST_GRID={west:98,south:13,east:109,north:24,step:.5};
export const FORECAST_HOUR=3600000;
// The map shows up to 12 hourly periods (at least 3); the grid holds 24 hours from download.
export const FORECAST_SHOW_HOURS=12,FORECAST_MIN_HOURS=3;
export function forecastPoints(){const points=[];for(let lat=FORECAST_GRID.south;lat<=FORECAST_GRID.north;lat+=FORECAST_GRID.step)for(let lon=FORECAST_GRID.west;lon<=FORECAST_GRID.east;lon+=FORECAST_GRID.step)points.push([lon,lat]);return points}
// Open-Meteo precipitation is the sum of the hour ENDING at its timestamp.
// Select complete, consecutive future hours (stops at the first hour the grid lacks).
// Do not interpolate minutes.
export function forecastPeriods(data,now=Date.now(),count=FORECAST_SHOW_HOURS){
 const start=Math.ceil(now/FORECAST_HOUR)*FORECAST_HOUR,out=[];
 for(let i=0;i<count;i++){const end=start+(i+1)*FORECAST_HOUR,index=data.times.indexOf(end/1000);if(index<0)break;out.push({start:end-FORECAST_HOUR,end,index})}
 return out;
}
export function forecastCells(data,index){return {type:'FeatureCollection',features:data.cells.map(([lon,lat,values])=>{const h=data.grid.step/2,value=values[index];return {type:'Feature',properties:{mm:Number.isFinite(value)&&value>=0?value:null,lon,lat},geometry:{type:'Polygon',coordinates:[[[lon-h,lat-h],[lon+h,lat-h],[lon+h,lat+h],[lon-h,lat+h],[lon-h,lat-h]]]}}})}}
// Display raster: bilinear interpolation between the model's 0.5° grid points
// (instead of 55 km squares), coloured on a continuous scale matching the legend
// bands. Display only: values and popups still come from the grid cells.
// Rows are linear in Web Mercator, as MapLibre stretches image sources.
export const FORECAST_COLORS=[[.3,[154,130,229]],[2.5,[115,87,209]],[7,[88,64,177]],[14,[183,71,160]],[25,[221,101,128]]];
export const FORECAST_MIN_MM=.1;
function forecastColor(mm){
 const v=Math.log10(Math.max(mm,FORECAST_COLORS[0][0])),stops=FORECAST_COLORS.map(([m,c])=>[Math.log10(m),c]);
 if(v>=stops.at(-1)[0])return stops.at(-1)[1];let i=0;while(i<stops.length-2&&v>stops[i+1][0])i++;
 const [a,ca]=stops[i],[b,cb]=stops[i+1],t=Math.max(0,Math.min(1,(v-a)/(b-a)));return ca.map((c,k)=>Math.round(c+(cb[k]-c)*t));
}
const mercY=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360)),latFromMerc=y=>(2*Math.atan(Math.exp(y))-Math.PI/2)*180/Math.PI;
export function forecastRaster(data,index,width=440){
 const g=data.grid,h=g.step/2,west=g.west-h,east=g.east+h,south=g.south-h,north=g.north+h,cols=Math.round((g.east-g.west)/g.step)+1,rows=Math.round((g.north-g.south)/g.step)+1;
 const top=mercY(north),bottom=mercY(south),height=Math.max(1,Math.round(width*(top-bottom)/((east-west)*Math.PI/180))),pixels=new Uint8ClampedArray(width*height*4);
 const value=(x,y)=>{const v=data.cells[y*cols+x]?.[2][index];return Number.isFinite(v)&&v>=0?v:null};
 for(let py=0;py<height;py++){
  const lat=latFromMerc(top-(py+.5)/height*(top-bottom)),gy=Math.max(0,Math.min(rows-1,(lat-g.south)/g.step)),y0=Math.min(rows-2,Math.floor(gy)),fy=gy-y0;
  for(let px=0;px<width;px++){
   const lon=west+(px+.5)/width*(east-west),gx=Math.max(0,Math.min(cols-1,(lon-g.west)/g.step)),x0=Math.min(cols-2,Math.floor(gx)),fx=gx-x0;
   let sum=0,weight=0;for(const [x,y,w] of [[x0,y0,(1-fx)*(1-fy)],[x0+1,y0,fx*(1-fy)],[x0,y0+1,(1-fx)*fy],[x0+1,y0+1,fx*fy]]){const v=value(x,y);if(v!==null&&w>0){sum+=v*w;weight+=w}}
   const p=(py*width+px)*4;
   if(weight<.5){pixels[p]=119;pixels[p+1]=130;pixels[p+2]=142;pixels[p+3]=72;continue}
   const mm=sum/weight;if(mm<FORECAST_MIN_MM)continue;
   const c=forecastColor(mm),fade=Math.min(1,.35+(mm-FORECAST_MIN_MM)/(FORECAST_MIN_MM*1.5));pixels[p]=c[0];pixels[p+1]=c[1];pixels[p+2]=c[2];pixels[p+3]=Math.round(178*fade);
  }
 }
 return {pixels,width,height,coordinates:[[west,north],[east,north],[east,south],[west,south]]};
}
export function forecastCellAt(data,lon,lat,index){if(!data||index<0)return null;const h=data.grid.step/2,g=data.grid;if(lon<g.west-h||lon>g.east+h||lat<g.south-h||lat>g.north+h)return null;const width=Math.round((g.east-g.west)/g.step)+1,height=Math.round((g.north-g.south)/g.step)+1,x=Math.min(width-1,Math.round((lon-g.west)/g.step)),y=Math.min(height-1,Math.round((lat-g.south)/g.step));return data.cells[y*width+x]?.[2][index]??null}
