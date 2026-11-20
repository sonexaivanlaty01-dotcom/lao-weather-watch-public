// Builds dist/data/rivers.json from HydroRIVERS v1.0 Asia (source-data/hydrorivers/, not
// published). Keeps reaches inside a box around Laos, snaps each dam in dams.json to
// its river, and keeps every reach on the dams' downstream routes.
// Run: node prepare-rivers.mjs   (once; re-run only when dams.json changes)
import fs from 'node:fs';
import {indexRivers,snapPoint,stationReach,stationsBelowDam,ROUTE_KM} from './dist/river-network.js';
import {alignReaches} from './prepare-osm-align.mjs';
const SRC='source-data/hydrorivers/HydroRIVERS_v10_as_shp/HydroRIVERS_v10_as';
const BOX={w:99.8,e:108.0,s:13.4,n:22.7};
const NETWORK_UPLAND=1000,DISPLAY_UPLAND=5000,DAM_SNAP_KM=4,DAM_MIN_UPLAND=10,TOL=.0025;
const shp=fs.readFileSync(SRC+'.shp'),dbf=fs.readFileSync(SRC+'.dbf');
const rows=dbf.readUInt32LE(4),headerLen=dbf.readUInt16LE(8),recLen=dbf.readUInt16LE(10),fields=[];
for(let o=32,at=1;dbf[o]!==0x0d;o+=32){const len=dbf[o+16];fields.push({name:dbf.toString('latin1',o,o+11).replace(/\0.*/,''),at,len});at+=len}
const field=Object.fromEntries(fields.map(f=>[f.name,f]));
const num=(row,name)=>{const f=field[name],o=headerLen+row*recLen+f.at;return Number(dbf.toString('latin1',o,o+f.len).trim())};
// Douglas-Peucker on flat [lon,lat] pairs.
function simplify(pts){
 if(pts.length<=2)return pts;const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;const stack=[[0,pts.length-1]];
 while(stack.length){const [a,b]=stack.pop();let max=0,idx=-1;const [ax,ay]=pts[a],[bx,by]=pts[b],dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1e-12;
  for(let i=a+1;i<b;i++){const d=Math.abs(dy*(pts[i][0]-ax)-dx*(pts[i][1]-ay))/len;if(d>max){max=d;idx=i}}
  if(max>TOL){keep[idx]=1;stack.push([a,idx],[idx,b])}}
 return pts.filter((_,i)=>keep[i]);
}
const all=new Map();let offset=100,row=0;
while(offset<shp.length){
 const contentLen=shp.readInt32BE(offset+4)*2,o=offset+8;offset+=8+contentLen;const r=row++;
 if(shp.readInt32LE(o)!==3)continue;
 const xmin=shp.readDoubleLE(o+4),ymin=shp.readDoubleLE(o+12),xmax=shp.readDoubleLE(o+20),ymax=shp.readDoubleLE(o+28);
 if(xmax<BOX.w||xmin>BOX.e||ymax<BOX.s||ymin>BOX.n)continue;
 const upland=num(r,'UPLAND_SKM');if(upland<DAM_MIN_UPLAND)continue;
 const parts=shp.readInt32LE(o+36),points=shp.readInt32LE(o+40),p0=o+44+parts*4,pts=[];
 for(let i=0;i<points;i++)pts.push([shp.readDoubleLE(p0+i*16),shp.readDoubleLE(p0+i*16+8)]);
 const line=simplify(pts).flatMap(([x,y])=>[Math.round(x*1000)/1000,Math.round(y*1000)/1000]);
 all.set(num(r,'HYRIV_ID'),[num(r,'HYRIV_ID'),num(r,'NEXT_DOWN'),num(r,'DIST_DN_KM'),Math.round(upland),upland>=DISPLAY_UPLAND?1:0,line]);
}
if(row!==rows)throw new Error(`shp/dbf mismatch ${row} ${rows}`);
console.log(`HydroRIVERS rows ${rows}, in box with upland ≥${DAM_MIN_UPLAND} km²: ${all.size}`);
// Snap dams on the full in-box set, then keep the network plus every dam's route.
const dams=JSON.parse(fs.readFileSync('dist/data/dams.json','utf8'));
const full=indexRivers({kind:'river_network',reaches:[...all.values()]}),keep=new Set(),damRoutes={},report=[];
for(const r of all.values())if(r[3]>=NETWORK_UPLAND)keep.add(r[0]);
for(const d of dams.dams){
 const snap=snapPoint(full,d.lon,d.lat,{maxKm:DAM_SNAP_KM,minUpland:DAM_MIN_UPLAND,mainStem:/^mekong$/i.test(d.river||'')});
 if(!snap){report.push(`  no river within ${DAM_SNAP_KM} km: ${d.name}`);continue}
 damRoutes[d.name]={reach:snap.reach.id,snapKm:Math.round(snap.km*10)/10,upland:snap.reach.upland};
 const seen=new Set();for(let r=snap.reach;r&&!seen.has(r.id);r=full.byId.get(r.next)){seen.add(r.id);keep.add(r.id)}
}
const network=[...keep].map(id=>all.get(id)).map(r=>r[1]&&!keep.has(r[1])?[r[0],0,...r.slice(2)]:r);
// Names and real-channel lines from OpenStreetMap (source-data/osm/laos-rivers.json, from
// source-data/osm/fetch-rivers.mjs). Without that file the HydroRIVERS lines are kept.
const OSM_FILE='source-data/osm/laos-rivers.json',osmWays=fs.existsSync(OSM_FILE)?JSON.parse(fs.readFileSync(OSM_FILE,'utf8')).elements.filter(e=>e.type==='way'):[];
const aligned=osmWays.length?alignReaches(network,osmWays):{reaches:network.map(r=>[...r,-1]),names:[],stats:null},reaches=aligned.reaches;
if(aligned.stats)console.log(`OSM rivers: ${osmWays.length} ways · reaches named ${aligned.stats.named}/${aligned.stats.total}, lines on OSM channel ${aligned.stats.snapped}/${aligned.stats.total}, joins ${aligned.stats.joined||0}, ${aligned.names.length} river names`);
const out={kind:'river_network',source:'HydroRIVERS v1.0 (WWF / HydroSHEDS), Asia',licence:'Free for scientific, educational and commercial use with attribution (HydroSHEDS licence)',citation:'Lehner, B., Grill G. (2013): Global river hydrography and network routing: baseline data and new approaches to study the world’s large river systems. Hydrological Processes, 27(15): 2171–2186.',page:'https://www.hydrosheds.org/products/hydrorivers',generated:new Date().toISOString().slice(0,10),note:'Network, flow direction and distances: HydroRIVERS (modelled from a 15 arc-second DEM, ~500 m). Where a reach clearly follows an OpenStreetMap river, its line is redrawn on the OSM channel and it carries the OSM river name; elsewhere the HydroRIVERS line is kept (it may be offset from the real river). Dam points are approximate and snapped to the nearest reach.',osm:osmWays.length?{source:'OpenStreetMap waterway=river in Laos via Overpass API',licence:'© OpenStreetMap contributors, ODbL 1.0 (names and redrawn lines in this file are an ODbL derivative)',fetched:new Date(fs.statSync(OSM_FILE).mtimeMs).toISOString().slice(0,10)}:null,box:BOX,routeKm:ROUTE_KM,dams:damRoutes,names:aligned.names,reaches};
fs.writeFileSync('dist/data/rivers.json',JSON.stringify(out));
const size=fs.statSync('dist/data/rivers.json').size;
console.log(`rivers.json: ${reaches.length} reaches (${reaches.filter(r=>r[4]).length} shown), ${(size/1024).toFixed(0)} KB, dams snapped ${Object.keys(damRoutes).length}/${dams.dams.length}`);
const far=Object.entries(damRoutes).filter(([,v])=>v.snapKm>1.5).map(([n,v])=>`  ${n}: ${v.snapKm} km (upland ${v.upland} km²)`);
if(far.length)console.log('Dams snapped more than 1.5 km away (check):\n'+far.join('\n'));
if(report.length)console.log(report.join('\n'));
// Optional check against today's MRC level stations (one request), for the log only.
if(process.argv.includes('--stations')){
 const list=await (await fetch('https://api.mrcmekong.org/api/v1/time-series/telemetry/recent/stations')).json();
 const net=indexRivers(out),st=list.filter(s=>s.country==='Lao PDR'&&s.wlSensor&&/^\d{6}$/.test(s.stationId||'')).map(s=>({id:s.stationId,name:s.name,river:s.river,lon:s.longitude,lat:s.latitude}));
 for(const s of st){const snap=stationReach(net,s);console.log(`${s.id} ${s.name} (${s.river}): ${snap?snap.km.toFixed(1)+' km, upland '+snap.reach.upland:'NOT SNAPPED'}`)}
 for(const d of dams.dams){const below=stationsBelowDam(net,d,st);if(below.length)console.log(`${d.name} → ${below.map(b=>b.station.name+' '+Math.round(b.km)+' km').join(', ')}`)}
}
