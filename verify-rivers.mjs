import assert from 'node:assert/strict';
import fs from 'node:fs';
import {indexRivers,snapPoint,downstream,routeLines,stationReach,damsUpstreamOf,stationsBelowDam,roundKm,popupSide,damBarAngle,ROUTE_KM} from './dist/river-network.js';
import {damsForStation,damListText} from './dist/alerts.js';
import {riverName,riverGroups,alignReaches} from './prepare-osm-align.mjs';
import {routeRivers} from './dist/river-network.js';
// Small synthetic network: a tributary (1→2) joins a main river (10→11→12); lines run downstream.
const toy=indexRivers({kind:'river_network',dams:{A:{reach:1},M:{reach:10}},reaches:[
 [1,2,330,500,0,[100,18.2,100.05,18.1]],[2,11,320,900,0,[100.05,18.1,100.1,18]],
 [10,11,340,50000,1,[100.3,18.2,100.2,18.1]],[11,12,310,51000,1,[100.1,18,100.2,17.9]],[12,0,10,52000,1,[100.2,17.9,100.3,17.5]]]});
assert(toy&&toy.byId.size===5);assert.equal(indexRivers({kind:'x'}),null);
assert.deepEqual(downstream(toy,1).map(p=>[p.reach.id,p.km]),[[1,0],[2,10],[11,20]]); // 12 is 320 km below: beyond ROUTE_KM
assert.deepEqual(downstream(toy,1,1000).map(p=>p.reach.id),[1,2,11,12]);assert.equal(routeLines(downstream(toy,1)).length,3);
const dams={dams:[{name:'A',river:'Nam A',lon:100.02,lat:18.16},{name:'M',river:'Mekong',lon:100.29,lat:18.19},{name:'Far',river:'Nam X'}]};
// A gauge on the main river below the confluence gets both dams, nearest first.
const below={name:'Below',river:'Nam Main',lon:100.15,lat:17.95};
assert.deepEqual(damsUpstreamOf(toy,dams,below).map(f=>[f.dam.name,f.km]),[['A',20],['M',30]]);
// A gauge on the tributary sees only the tributary dam; one far from any river sees none.
assert.deepEqual(damsUpstreamOf(toy,dams,{lon:100.07,lat:18.06}).map(f=>f.dam.name),['A']);
assert.deepEqual(damsUpstreamOf(toy,dams,{lon:101.5,lat:19}),[]);
// Same reach: a gauge upstream of the dam is not "below" it.
assert.deepEqual(damsUpstreamOf(toy,dams,{lon:100.005,lat:18.19}).map(f=>f.dam.name),[]);
assert.deepEqual(stationsBelowDam(toy,dams.dams[0],[below,{name:'Up',lon:100.005,lat:18.19}]).map(f=>f.station.name),['Below']);
// Main-stem gauges ignore a small tributary nearer to them.
assert.equal(snapPoint(toy,100.1,18.0,{mainStem:true}).reach.id,11);
assert.equal(roundKm(3),'<10');assert.equal(roundKm(123),'125');
// Alerts: routed list when rivers are loaded; name match only for diversion dams (two rivers).
const nt={dams:[{name:'Nam Theun 2',river:'Nam Theun/Xe Bangfai'},{name:'Nam Ngum 1',river:'Nam Ngum'}]};
assert.deepEqual(damsForStation(null,nt,{river:'Nam Ngum'}).map(f=>[f.dam.name,f.km]),[['Nam Ngum 1',null]]);
assert.deepEqual(damsForStation(toy,nt,{river:'Se Bang Fai',lon:101.5,lat:19}).map(f=>f.dam.name),['Nam Theun 2']);
assert.deepEqual(damsForStation(toy,nt,{river:'Nam Ngum',lon:101.5,lat:19}),[]);
assert.equal(damListText([{dam:{name:'A'},km:20},{dam:{name:'B'},km:null}]),'A ~20 km, B (ຜັນນ້ຳ/ຕາມຊື່ລຳນ້ຳ)');
// The real file: source and licence named, every dam routed, size kept small, lines downstream-ordered.
const raw=JSON.parse(fs.readFileSync('dist/data/rivers.json','utf8')),net=indexRivers(raw),damsFile=JSON.parse(fs.readFileSync('dist/data/dams.json','utf8'));
assert(/HydroRIVERS/.test(raw.source)&&/attribution/.test(raw.licence)&&/Lehner/.test(raw.citation)&&raw.routeKm===ROUTE_KM);
assert(fs.statSync('dist/data/rivers.json').size<900*1024);
for(const d of damsFile.dams){const r=raw.dams[d.name];assert(r&&net.byId.has(r.reach)&&r.snapKm<=4,d.name)}
for(const r of net.byId.values()){const n=net.byId.get(r.next);if(!n)continue;const L=r.line;assert(Math.hypot(L.at(-2)-n.line[0],L.at(-1)-n.line[1])<.01,'line direction '+r.id)}
// Known geography (MRC station positions, October 2026).
const st=(name,river,lat,lon)=>({name,river,lat,lon});
const stations=[st('Ban Pakhoung','Mekong',19.19707,101.82158),st('Luang Prabang','Mekong',19.8928,102.13418),st('Hat Gna','Nam Ou',20.087,102.263),st('Paksane','Mekong',18.373404,103.66321),st('Phonesy','Nam Ca Ding',18.30233,104.09739),st('Ban Veunkhen','Se Kong',14.8192,106.80566)];
for(const s of stations)assert(stationReach(net,s),'snap '+s.name);
const byName=n=>damsFile.dams.find(d=>d.name===n),names=(d)=>stationsBelowDam(net,byName(d),stations).map(f=>f.station.name);
assert.deepEqual(names('Xayaburi'),['Ban Pakhoung']);              // Xayaburi is below Luang Prabang
assert(names('Nam Ou 1').includes('Luang Prabang')&&names('Nam Ou 1').includes('Hat Gna'));
assert(names('Nam Ngiep 1').includes('Paksane'));assert(names('Nam Theun 1').includes('Phonesy'));
assert(names('Xe Kaman 1').includes('Ban Veunkhen'));assert(!names('Xe Kaman 1').includes('Paksane'));
assert(!damsUpstreamOf(net,damsFile,stations[1]).some(f=>f.dam.name==='Xayaburi'));
// The page wires the layer, the route and the alerts.
const app=fs.readFileSync('dist/app.js','utf8'),html=fs.readFileSync('dist/index.html','utf8');
assert(app.includes("getJSON('./data/rivers.json')")&&app.includes('showDamRoute(d)')&&app.includes('damsForStation(riverNet')&&app.includes("visibility('rivers',enabled('rivers'))"));
assert(html.includes('id="riversToggle"')&&html.includes('HydroRIVERS'));
// The dam popup sits on the side away from the route, and the camera makes room for it.
const pt={lon:105,lat:18};
assert.equal(popupSide(pt,[[105,17.5],[105.1,17]]),'bottom');assert.equal(popupSide(pt,[[105,18.5]]),'top');
assert.equal(popupSide(pt,[[105.6,18.1]]),'right');assert.equal(popupSide(pt,[[104.4,17.9]]),'left');
for(const d of damsFile.dams){const r=raw.dams[d.name],pts=routeLines(downstream(net,r.reach)).flat();assert(['top','bottom','left','right'].includes(popupSide(d,pts)))}
assert.equal(popupSide(byName('Xe Kaman 1'),routeLines(downstream(net,raw.dams['Xe Kaman 1'].reach)).flat()),'left'); // Xe Kaman runs west: popup to the right of the dam
// Dam bar icon (option C): laid across the river. Mekong at Don Sahong flows south → horizontal bar;
// Nam Ngum below Nam Ngum 1 flows west → near-vertical bar. Every angle in (-90, 90].
assert(Math.abs(damBarAngle(net,byName('Don Sahong')))<=10&&Math.abs(damBarAngle(net,byName('Nam Ngum 1')))>=60,'dam bars cross the river');
for(const d of damsFile.dams){const a=damBarAngle(net,d);assert(a>-90&&a<=90,d.name)}assert.equal(damBarAngle(net,{name:'nowhere',lat:18,lon:103}),0);
assert(app.includes("'icon-rotate':['get','angle']")&&app.includes("['case',['get','warn'],'dam-bar-warn','dam-bar']")&&app.includes('angle:damBarAngle(riverNet,d)'),'bar symbol wired');
assert(app.includes('function damCard(d,routed)')&&app.includes("className:'dam-pop'")&&app.includes('stationsBelowDam(riverNet,d,riverData.stations)')&&app.includes("el('li','dam-node end'")&&fs.readFileSync('dist/app-ui.css','utf8').includes('.dam-flow::before'),'dam card: water path top to bottom (option C)');
assert(app.includes('anchor:popupSide(d,routed)')&&app.includes('if(routed)frameDamRoute(d,routed,popup)')&&app.includes('map.fitBounds([[w,s],[e,n]],{padding:pad'));
// Dams are drawn with the dam symbol (not circles), sized by MW; the SVG is served as an image.
assert(app.includes("map.addLayer({id:'dams',type:'symbol'")&&app.includes("'icon-image':['case',['get','warn'],'dam-bar-warn','dam-bar']")&&!app.includes("id:'dams',type:'circle'"));
const svg=fs.readFileSync('dist/dam-icon.svg','utf8');assert(svg.startsWith('<svg')&&/width="128"/.test(svg)&&/<circle/.test(svg));assert(html.includes('src="./dam-icon.svg'));
assert(fs.readFileSync('build-radar-site.mjs','utf8').includes("'.svg':'image/svg+xml'"));
// OpenStreetMap names: Lao first; spellings of one river grouped; names follow the main stem.
assert.equal(riverName({name:'မဲခေါင်မြစ် ແມ່ນ້ຳຂອງ','name:en':'Mekong'}),'ແມ່ນ້ຳຂອງ');assert.equal(riverName({name:'Nam Lik'}),'Nam Lik');assert.equal(riverName({'name:en':'Ou River',name:'ນ້ຳອູ'}),'ນ້ຳອູ');assert.equal(riverName({}),null);
{const ways=[{id:1,tags:{name:'ນ້ຳງຶ່ມ','name:en':'Nam Ngum River'}},{id:2,tags:{name:'ນ້ຳງືມ'}},{id:3,tags:{name:'ນ້ຳງືມ'}},{id:4,tags:{name:'Nam Ngum River'}}],g=riverGroups(ways);assert.deepEqual(ways.map(g),['ນ້ຳງືມ','ນ້ຳງືມ','ນ້ຳງືມ','ນ້ຳງືມ'])}
{const way=(id,name,pts)=>({id,tags:{name},geometry:pts.map(([lon,lat])=>({lon,lat}))});
 const ways=[way(1,'ນ້ຳໃຫຍ່',[[100,18],[100,17]]),way(2,'ຫ້ວຍນ້ອຍ',[[100.01,17.5],[100.01,17]])];
 const rs=[[1,2,500,60000,1,[100,18,100,17.5],-1],[2,0,440,61000,1,[100.012,17.5,100.012,17],-1]].map(r=>r.slice(0,6));
 const a=alignReaches(rs,ways);assert.deepEqual(a.reaches.map(r=>a.names[r[6]]),['ນ້ຳໃຫຍ່','ນ້ຳໃຫຍ່'],'a large river keeps its name next to a stream');}
assert.deepEqual(routeRivers([{reach:{name:'A'},km:0},{reach:{name:'A'},km:5},{reach:{name:null},km:8},{reach:{name:'B'},km:20},{reach:{name:'B'},km:30}]).map(r=>[r.name,r.km]),[['A',0],['B',20]]);
assert.deepEqual(routeRivers([{reach:{name:'A'},km:0},{reach:{name:'X'},km:10},{reach:{name:'A'},km:12},{reach:{name:'B'},km:40}]).map(r=>r.name),['A','B']);
{const names=d=>routeRivers(downstream(net,raw.dams[d].reach)).map(r=>r.name);
 assert(/ODbL/.test(raw.osm.licence)&&raw.names.length>20);
 assert.deepEqual(names('Nam Ngum 1'),['ນ້ຳງືມ','ແມ່ນ້ຳຂອງ']);assert.deepEqual(names('Xayaburi'),['ແມ່ນ້ຳຂອງ']);assert.deepEqual(names('Nam Ou 1'),['ນ້ຳອູ','ແມ່ນ້ຳຂອງ']);
 assert(names('Xe Kaman 1').includes('ເຊກອງ')&&!names('Xe Kaman 1').includes('ເຊປຽນ'));
 for(const d of damsFile.dams){const n=names(d.name),i=n.indexOf('ແມ່ນ້ຳຂອງ');assert(i<0||i===n.length-1,'nothing after the Mekong: '+d.name)}
 assert(app.includes("rivers.map(r=>r.name).join(' → ')")&&app.includes('river names and channels © OpenStreetMap (ODbL)'))}
// Dams start hidden on first visit (owner's choice, 10 Oct 2026); users switch them on in Layers.
assert(/<input type="checkbox" class="switch" id="damsToggle">/.test(html)&&!/id="damsToggle" checked/.test(html));
console.log('rivers ok:',net.byId.size,'reaches,',Object.keys(raw.dams).length,'dams routed');
