import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mrcTime,mrcCandidates,mrcStation,rainStationsRoute,MRC_TELEMETRY,MRC_MAX_STATIONS} from './worker/rain-stations.mjs';
import {gaugeBand,gaugeLabel,validGaugeData,nearestGauge,levelTube,tubeLabels,trendText,trendIcon} from './dist/rain-stations.js';
// Station popup option C (25 Oct 2026): tube scale keeps the water and both lines inside 0–100 %.
{const t=levelTube(4.21,11.5,12.5);assert(t.water>26&&t.water<30&&t.alarm<t.flood&&t.flood<=84,'Vientiane KM4: water ~28 %, lines below the rounded top');
 // Labels sit at their lines (owner 26 Oct 2026); close lines share one label; the water label never moves.
 let L=tubeLabels(t,{level:4.21,alarm:11.5,flood:12.5});assert.deepEqual(L.map(x=>x.cls),['lines','now'],'Vientiane: lines 6 px apart share a label');
 const far=levelTube(2,5,12);L=tubeLabels(far,{level:2,alarm:5,flood:12});assert.deepEqual(L.map(x=>x.cls),['flood','alarm','now']);assert(L.every(x=>x.at===x.pct),'lines far apart: every label exactly at its line');
 const lp=levelTube(9.54,17.5,18);L=tubeLabels(lp,{level:9.54,alarm:17.5,flood:18});assert.deepEqual(L.map(x=>x.cls),['lines','now']);assert.equal(L[0].text,'ເຕືອນ 17.5 · ຖ້ວມ 18 m');assert(Math.abs(L[0].at-(lp.alarm+lp.flood)/2)<.01);
 const hi=levelTube(17.3,17.5,18);L=tubeLabels(hi,{level:17.3,alarm:17.5,flood:18});const now=L.find(x=>x.now);assert.equal(now.at,hi.water,'water label stays at the water');assert(L[0].at-now.at>=17,'line label moved clear of the water label');
 const over=levelTube(13.2,11.5,12.5);assert(over.water>over.flood&&over.water<=100,'above flood still fits');
 const none=levelTube(3,null,null);assert.equal(none.alarm,null);assert(none.water>55&&none.water<70,'no lines: tube not drawn full');
 const neg=levelTube(-0.4,2,3);assert.equal(neg.water,0);assert(neg.alarm>0);
 assert.equal(trendText(0.01),'ຄົງທີ່ 6 ຊມ');assert.equal(trendText(0.32),'ຂຶ້ນ +0.32 m ໃນ 6 ຊມ');assert.equal(trendText(-0.2),'ລົງ 0.20 m ໃນ 6 ຊມ');assert.equal(trendText(null),null);
 assert.deepEqual([trendIcon(0.01),trendIcon(0.3),trendIcon(-0.3),trendIcon(null)],['flat','up','down','flat'])}
// 26 Oct 2026: iPhones draw ☂ ☁ ⚠ and emoji in colour, which clashed with the line icons. The popup and the
// fixed screen parts (index.html) use ui-icons.js instead.
{const app=fs.readFileSync('dist/app.js','utf8'),pop=app.slice(app.indexOf('// Station popup, option C'),app.indexOf('// Phones: the time bar')),html=fs.readFileSync('dist/index.html','utf8');
 const emoji=/[←-⇿☀-➿⬀-⯿\u{1F300}-\u{1FAFF}]/u;assert(!emoji.test(pop),'popup has no emoji / symbol glyphs');
 for(const g of ['☂','☁','⚠','♨'])assert(!html.replace(/<nav class="mobile-nav"[\s\S]*?<\/nav>/,'').includes(g),'index.html still uses '+g);
 assert(html.match(/class="ui-icon"/g).length>=19,'line icons in layers menu, quick bar, metrics, alert button')}
{const app=fs.readFileSync('dist/app.js','utf8');assert(app.includes("node=popNode('div','gpop')")&&app.includes('levelTube(lv.level,lv.alarm,lv.flood)')&&app.includes('ເບິ່ງກຣາຟຍ້ອນຫຼັງ'),'popup C wired');assert(fs.readFileSync('dist/app-ui.css','utf8').includes('.gpop-tb{'))}
// MRC times are Indochina Time without an offset.
assert.equal(mrcTime('2026-10-09T17:00:00'),Date.parse('2026-10-09T10:00:00Z'));assert.equal(mrcTime('2026-10-09T17:00:00Z'),null);assert.equal(mrcTime(null),null);
const list=[{stationId:'011901',name:'Vientiane KM4',latitude:17.93,longitude:102.62,country:'Lao PDR',rainfallSensor:true,showOnWebsite:true},{stationId:'019803',name:'Tan Chau',latitude:10.8,longitude:105.2,rainfallSensor:true},{stationId:'013901',latitude:15.1,longitude:105.8,rainfallSensor:false},{stationId:'../x',latitude:18,longitude:102,rainfallSensor:true},{stationId:'092600',latitude:22.0,longitude:100.8,rainfallSensor:true,showOnWebsite:false}];
assert.deepEqual(mrcCandidates(list).map(s=>s.stationId),['011901']);assert.throws(()=>mrcCandidates({}));
assert.equal(mrcCandidates(Array.from({length:80},(_,i)=>({stationId:String(100000+i),latitude:18,longitude:103,rainfallSensor:true}))).length,MRC_MAX_STATIONS);
const now=Date.parse('2026-10-09T10:30:00Z'),detail={stationId:'011901',name:'Vientiane KM4',country:'Lao PDR',river:'Mekong',latitude:17.93,longitude:102.62,rainFall1H:1.23,rainFall6H:12.04,rainFall24H:48.66,lastMeasurement:'2026-10-09T17:15:00'};
const station=mrcStation(detail,now);assert.deepEqual({...station},{id:'011901',name:'Vientiane KM4',country:'Lao PDR',river:'Mekong',lat:17.93,lon:102.62,time:'2026-10-09T10:15:00.000Z',rain1h:1.2,rain6h:12,rain24h:48.7,stale:false});
assert.equal(mrcStation({...detail,lastMeasurement:'2026-10-09T13:00:00'},now).stale,true);assert.equal(mrcStation({...detail,rainFall24H:-1},now).rain24h,null);assert.equal(mrcStation({...detail,lastMeasurement:''},now),null);
// Route: signed-in GET only, fixed upstream, one shared download, last good list kept on failure.
assert.equal((await rainStationsRoute(new Request('https://x.test/api/rain/stations'))).status,401);
assert.equal((await rainStationsRoute(new Request('https://x.test/api/rain/stations',{method:'POST',headers:{'oai-authenticated-user-id':'o'}}))).status,405);
const original=globalThis.fetch;let calls=[];
try{
 globalThis.fetch=async url=>{calls.push(String(url));assert(String(url).startsWith(MRC_TELEMETRY+'/'));if(String(url).endsWith('/stations'))return Response.json(list);return Response.json({...detail,lastMeasurement:'2026-10-09T'+new Date(Date.now()+7*3600000).toISOString().slice(11,19)})};
 const req=()=>new Request('https://x.test/api/rain/stations',{headers:{'oai-authenticated-user-id':'o'}});
 const [a,b]=await Promise.all([rainStationsRoute(req()),rainStationsRoute(req())]);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(calls.length,2);
 const data=await a.json();assert.equal(data.kind,'rain_gauge');assert.equal(data.stations.length,1);assert.equal(data.stations[0].rain24h,48.7);assert(validGaugeData(data));
 assert.equal((await rainStationsRoute(req())).status,200);assert.equal(calls.length,2);
}finally{globalThis.fetch=original}
const failing=await import('./worker/rain-stations.mjs?failure');
try{globalThis.fetch=async()=>{throw new Error('down')};const r=await failing.rainStationsRoute(new Request('https://x.test/api/rain/stations',{headers:{'oai-authenticated-user-id':'o'}}));assert.equal(r.status,503)}finally{globalThis.fetch=original}
// 25 Oct 2026: a refresh that hangs must not hold the page. Old data is answered at once; with no data
// the wait is capped (the route then answers 503 instead of hanging for minutes).
const hang=await import('./worker/rain-stations.mjs?hang');const realNow=Date.now;
try{
 globalThis.fetch=async url=>String(url).endsWith('/stations')?Response.json(list):Response.json({...detail,lastMeasurement:'2026-10-09T'+new Date(realNow()+7*3600000).toISOString().slice(11,19)});
 const req=()=>new Request('https://x.test/api/rain/stations',{headers:{'oai-authenticated-user-id':'o'}});
 assert.equal((await hang.rainStationsRoute(req())).status,200);
 globalThis.fetch=()=>new Promise(()=>{});Date.now=()=>realNow()+11*60000;let waited=[];
 const t0=realNow(),r=await hang.rainStationsRoute(req(),{waitUntil:p=>waited.push(p)});
 assert.equal(r.status,200);assert((await r.json()).stations.length===1,'old list served');assert(realNow()-t0<1000,'answered at once while MRC hangs');assert.equal(waited.length,1,'refresh continues in the background');
}finally{globalThis.fetch=original;Date.now=realNow}
// Client: colour bands, labels, nearest reporting station.
assert.equal(gaugeBand(0),null);assert.equal(gaugeBand(.05),null);assert.equal(gaugeBand(.1)[0],.1);assert.equal(gaugeBand(10)[0],10);assert.equal(gaugeBand(35)[0],35);assert.equal(gaugeBand(120)[0],90);
assert.equal(gaugeLabel(4.26),'4.3');assert.equal(gaugeLabel(48.7),'49');assert.equal(gaugeLabel(null),'–');
const stations=[{id:'1',lat:17.93,lon:102.62,rain24h:5,stale:false},{id:'2',lat:17.95,lon:102.6,rain24h:9,stale:true},{id:'3',lat:19.9,lon:102.1,rain24h:20,stale:false}];
assert.equal(nearestGauge(stations,102.63,17.97).station.id,'1');assert(nearestGauge(stations,102.63,17.97).km<10);assert.equal(nearestGauge(stations,106,14),null);
assert(!validGaugeData({kind:'rain_gauge',stations:[{id:'x'}]}));
console.log('MRC rain gauges: ICT timestamps, region/sensor filtering, station cap, stale marking, auth, shared caching, failure handling and display bands passed.');
