// River routing on the HydroRIVERS network clipped to Laos (data/rivers.json).
// Each reach: [id, nextDownId (0 = leaves the clip/outlet), distance to ocean km,
// upstream area km², display class (0 = routing only), flat [lon,lat,...] line,
// index into data.names (OpenStreetMap river name, -1 = none)].
// Dams are snapped once in prepare-rivers.mjs; stations are snapped here at runtime.
// Distances along the river come from HydroRIVERS DIST_DN_KM (reach resolution, ~4 km).
export const ROUTE_KM=300,STATION_SNAP_KM=3;
const RAD=Math.PI/180;
export function indexRivers(data){
 if(data?.kind!=='river_network'||!Array.isArray(data.reaches))return null;
 const byId=new Map(),names=Array.isArray(data.names)?data.names:[];for(const r of data.reaches)byId.set(r[0],{id:r[0],next:r[1],dist:r[2],upland:r[3],cls:r[4],line:r[5],name:names[r[6]]??null});
 return {...data,byId};
}
// Distance in km from a point to a reach line (equirectangular, fine at this scale), and
// the position along the line (segment index + fraction; lines run downstream).
export function pointReach(reach,lon,lat){
 const k=Math.cos(lat*RAD),L=reach.line;let best=Infinity,pos=0;
 for(let i=0;i+3<L.length;i+=2){
  const ax=(L[i]-lon)*k,ay=L[i+1]-lat,bx=(L[i+2]-lon)*k,by=L[i+3]-lat,dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
  const t=len?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/len)):0,x=ax+t*dx,y=ay+t*dy,d=x*x+y*y;if(d<best){best=d;pos=i/2+t}
 }
 if(L.length===2){const x=(L[0]-lon)*k,y=L[1]-lat;best=x*x+y*y}
 return {km:Math.sqrt(best)*111.2,pos};
}
export const pointReachKm=(reach,lon,lat)=>pointReach(reach,lon,lat).km;
// Nearest reach within maxKm. On the Mekong only main-stem reaches (≥80 % of the largest
// upstream area nearby) count, so a gauge is never put on a tributary mouth beside it.
export function snapPoint(net,lon,lat,{maxKm=STATION_SNAP_KM,minUpland=100,mainStem=false}={}){
 const near=[];
 for(const r of net.byId.values()){
  if(r.upland<minUpland)continue;const L=r.line;let close=false;
  for(let i=0;i<L.length;i+=2)if(Math.abs(L[i]-lon)<.2&&Math.abs(L[i+1]-lat)<.2){close=true;break}
  if(!close)continue;const {km,pos}=pointReach(r,lon,lat);if(km<=maxKm)near.push({reach:r,km,pos});
 }
 const floor=mainStem?.8*Math.max(0,...near.map(c=>c.reach.upland)):0;
 return near.filter(c=>c.reach.upland>=floor).sort((a,b)=>a.km-b.km)[0]||null;
}
// Reaches from a start reach downstream, with river km from the start, up to maxKm.
export function downstream(net,startId,maxKm=ROUTE_KM){
 const out=[],start=net.byId.get(startId);if(!start)return out;const seen=new Set();
 for(let r=start;r&&!seen.has(r.id);r=net.byId.get(r.next)){seen.add(r.id);const km=start.dist-r.dist;if(km>maxKm)break;out.push({reach:r,km})}
 return out;
}
export function routeLines(path){return path.map(p=>{const c=[];for(let i=0;i<p.reach.line.length;i+=2)c.push([p.reach.line[i],p.reach.line[i+1]]);return c})}
// The Mekong line from a 500 m DEM can sit a few km from a bank-side gauge.
export function stationReach(net,s){const main=/mekong|ຂອງ/i.test(s.river||'');return snapPoint(net,s.lon,s.lat,{mainStem:main,maxKm:main?5:STATION_SNAP_KM})}
// River km from a dam down to a snapped station, or null when the station is not on
// the dam's route within maxKm (or sits upstream of the dam on the same reach).
function kmBelow(net,dam,route,snap,maxKm){
 const hit=downstream(net,route.reach,maxKm).find(p=>p.reach.id===snap.reach.id);if(!hit)return null;
 if(hit.km===0&&snap.pos<pointReach(hit.reach,dam.lon,dam.lat).pos)return null;
 return hit.km;
}
// Dams whose downstream route passes the station within maxKm, nearest first.
export function damsUpstreamOf(net,dams,station,maxKm=ROUTE_KM){
 const snap=net&&stationReach(net,station);if(!snap)return [];
 const found=[];
 for(const d of dams?.dams||[]){const route=net.dams?.[d.name];if(!route)continue;const km=kmBelow(net,d,route,snap,maxKm);if(km!==null)found.push({dam:d,km})}
 return found.sort((a,b)=>a.km-b.km);
}
// MRC level stations on a dam's downstream route within maxKm.
export function stationsBelowDam(net,dam,stations,maxKm=ROUTE_KM){
 const route=net?.dams?.[dam.name];if(!route)return [];const found=[];
 for(const s of stations||[]){const snap=stationReach(net,s),km=snap&&kmBelow(net,dam,route,snap,maxKm);if(km!==null&&km!==undefined&&snap)found.push({station:s,km})}
 return found.sort((a,b)=>a.km-b.km);
}
// MapLibre popup anchor on the side of the dam away from its route: a route running
// south gives 'bottom' (popup above the dam), east gives 'right' (popup to the left).
export function popupSide(dam,points){
 let dx=0,dy=0;const k=Math.cos(dam.lat*Math.PI/180);for(const [lon,lat] of points){dx+=(lon-dam.lon)*k;dy+=lat-dam.lat}
 return Math.abs(dy)>=Math.abs(dx)?(dy<0?'bottom':'top'):(dx>0?'right':'left');
}
// River names along a route in order, each once, with the river km where it starts
// (e.g. Nam Ngum from 0 km, then the Mekong from ~150 km). Short unnamed or briefly
// matched pieces (<5 km) between two stretches of the same river are ignored.
export function routeRivers(path){
 const out=[];for(const p of path){const name=p.reach.name;if(!name)continue;const last=out.at(-1);if(last?.name===name)continue;if(out.length>=2&&out.at(-2).name===name&&p.km-last.km<5){out.pop();continue}out.push({name,km:p.km})}
 return out.filter((r,i,a)=>a.findIndex(x=>x.name===r.name)===i);
}
// Dam bar symbol (21 Oct 2026): rotation in degrees (MapLibre icon-rotate, clockwise from east)
// that lays a horizontal bar across the river, from the flow direction just below the dam.
// 0 when the dam has no route.
export function damBarAngle(net,dam){
 const route=net?.dams?.[dam.name];if(!route)return 0;
 const pts=routeLines(downstream(net,route.reach,8)).flat();if(pts.length<2)return 0;
 const k=Math.cos(dam.lat*Math.PI/180),dist=([lon,lat])=>Math.hypot((lon-dam.lon)*k,lat-dam.lat)*111.32;
 let i0=0;for(let i=1;i<pts.length;i++)if(dist(pts[i])<dist(pts[i0]))i0=i;
 // Flow direction: from the line point nearest the dam to the first point ≥1 km further along
 // (lines repeat points where reaches join, so the next point can be the same one).
 const a=pts[i0],gap=([lon,lat])=>Math.hypot((lon-a[0])*k,lat-a[1])*111.32;
 let j=i0+1;while(j<pts.length-1&&gap(pts[j])<1)j++;
 if(pts[j]&&gap(pts[j])>=.05)return barFrom(a,pts[j],k);
 // Nearest point is the end of the line: use the stretch just before it.
 const p=pts.slice(0,i0).reverse().find(q=>gap(q)>=.05);return p?barFrom(p,a,k):0;
}
function barFrom(a,b,k){
 const flow=Math.atan2(-(b[1]-a[1]),(b[0]-a[0])*k)*180/Math.PI;
 let bar=flow+90;while(bar>90)bar-=180;while(bar<=-90)bar+=180;return Math.round(bar);
}
export const roundKm=km=>km<10?'<10':String(Math.round(km/5)*5);
