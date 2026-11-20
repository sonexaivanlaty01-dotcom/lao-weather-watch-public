import assert from 'node:assert/strict';
import fs from 'node:fs';
import {riverStatus,riverLevelsRoute,RISE_6H,parseSeasonHistory,historyFor,attachHistory,HISTORY_STATIONS} from './worker/river-levels.mjs';
import {kplHeadlines,kplDetail,newsTopic,weatherNewsRoute} from './worker/weather-news.mjs';
import {recentWarnings,activeNotices,riverAlerts,riverAlertText,damsOnRiver,alertCount,rainAlerts,rainAlertText,HEAVY_RAIN_24H} from './dist/alerts.js';
const now=Date.parse('2026-10-09T12:00:00Z'),q=(h,w)=>({d:new Date(now-h*3600000).toISOString(),w});
const series=(f)=>Array.from({length:4*30},(_,i)=>q(i/4,f(i/4)));
const station={stationId:'013806',name:'Ban Mai',river:'Mekong',latitude:15,longitude:105.8,alarmStage:12,floodStage:13};
// Steady river: normal. Rise of 1 m over the last 6 h: rising. Above alarm / flood levels.
assert.equal(riverStatus(station,series(()=>6),now).status,'normal');
const rising=riverStatus(station,series(h=>h<6?7-h/6:6),now);assert.equal(rising.status,'rising');assert(Math.abs(rising.rise6-1)<.1);assert.equal(rising.hourly.length,25);
assert.equal(riverStatus(station,series(()=>12.2),now).status,'alarm');assert.equal(riverStatus(station,series(()=>13.4),now).status,'flood');
assert(RISE_6H===.5);assert.equal(riverStatus({...station,alarmStage:null,floodStage:null},series(()=>20),now).status,'normal');
// A one-reading spike cannot trigger an alert (median of readings around each time).
const spiky=series(()=>6);spiky[0]={...spiky[0],w:9};assert.equal(riverStatus(station,spiky,now).status,'normal');
// Old data is marked stale and stale stations never alert.
const old=riverStatus(station,series(h=>h<6?7-h/6:6).map(m=>({...m,d:new Date(Date.parse(m.d)-4*3600000).toISOString()})),now);assert.equal(old.stale,true);assert.equal(riverAlerts({stations:[old]}).length,0);
assert.equal(riverStatus(station,[],now),null);
// Real cases of 10 Oct 2026. Sensor dropout at -0.01 m for hours, then back to 11 m: not a rise.
const dropout=series(h=>h<6?11.13:h<20?-0.01:11.25);const so=riverStatus({...station,alarmStage:19,floodStage:20},dropout,now);assert.equal(so.status,'normal');assert(so.rise6===null||Math.abs(so.rise6)<.5);
// Recovery after a dip (dam operation below Xayaburi): +0.55 m in 6 h but still below the day's high.
const dip=series(h=>h<6?5.53-(6-h)*0.0:h<12?4.9:h<16?5.84:5.4);const sd=riverStatus({...station,alarmStage:null,floodStage:null},dip,now);assert(sd.rise6>=.5);assert.equal(sd.status,'normal');
// A river that rose 1 m and has already peaked and is falling (Ban Nape): not "rising".
const peaked=series(h=>h<3?1.85:h<5?2.15:h<10?1.8:h<20?1.2:0.86);assert.equal(riverStatus({...station,alarmStage:4.5,floodStage:5.5},peaked,now).status,'normal');
// Still rising to a new high: rising.
assert.equal(riverStatus({...station,alarmStage:4.5,floodStage:5.5},series(h=>h<20?2.2-h*0.06:0.86),now).status,'rising');
// KPL parsing: list format with dates, topic filter, detail metadata.
const list=`<li><a href = 'detail.aspx?id=105832'>Laos Issues Heavy Rain Warning for August 18–21</a><p class='x'>18/08/2026 10:05</p></li><li><a href = 'detail.aspx?id=105900'>Restoration of That Dam Suspended</a><p class='x'>02/10/2026 09:00</p></li><li><a href = 'detail.aspx?id=105901'>Anping Bridge: The Stone Rainbow</a></li>`;
const heads=kplHeadlines(list,'en');assert.equal(heads.length,3);assert.equal(heads[0].date,'2026-08-18');assert.equal(heads[2].date,null);
assert.deepEqual(heads.filter(h=>newsTopic('en',h.title)).map(h=>h.id),['105832']);
assert(newsTopic('lo','ກົມອຸຕຸນິຍົມ ແຈ້ງເຕືອນ ຝົນຕົກໜັກ'));assert(newsTopic('lo','ເຂື່ອນ ລະບາຍນໍ້າ'));assert(!newsTopic('lo','ກອງປະຊຸມ ລາວ-ຫວຽດນາມ'));
const detail=kplDetail(`<meta property="og:title" content="Laos Issues Heavy Rain Warning" /><meta name="Description" content="The Department of Meteorology and Hydrology has issued a warning."><meta property="og:image" content="https://kpl.gov.la/Media/Upload/News/Hot/2026/08/18/strom.jpeg" />`);
assert.deepEqual(detail,{title:'Laos Issues Heavy Rain Warning',summary:'The Department of Meteorology and Hydrology has issued a warning.',date:'2026-08-18'});
// Alerts: KPL warnings within 72 h, open dam notices with a source, river alerts by severity.
const news={items:[{title:'Heavy rain warning',warning:true,date:'2026-10-08'},{title:'Old warning',warning:true,date:'2026-09-20'},{title:'Dam training',warning:false,date:'2026-10-09'}]};
assert.deepEqual(recentWarnings(news,now).map(i=>i.title),['Heavy rain warning']);
const notices=JSON.parse(fs.readFileSync(new URL('./dist/data/dam-notices.json',import.meta.url)));assert(notices.notices.every(n=>/^https:\/\//.test(n.source)));
assert.equal(activeNotices(notices,Date.parse('2026-08-12T00:00:00Z')).length,1);assert.equal(activeNotices(notices,Date.parse('2026-08-28T00:00:00Z'))[0].dam,'Nam Theun 2');assert.equal(activeNotices(notices,now).length,0);
assert.equal(activeNotices({notices:[{dam:'X',announced:'2026-10-08',from:'2026-10-09',until:null}]},now).length,0);
const levels={stations:[{...rising,status:'rising',stale:false},{...rising,id:'2',status:'flood',stale:false,rise6:0},{...rising,id:'3',status:'normal',stale:false}]};
assert.deepEqual(riverAlerts(levels).map(s=>s.status),['flood','rising']);assert.match(riverAlertText(levels.stations[0]),/ນ້ຳຂຶ້ນໄວ/);
const dams=JSON.parse(fs.readFileSync(new URL('./dist/data/dams.json',import.meta.url)));assert.equal(dams.count,dams.dams.length);assert(dams.dams.every(d=>Number.isFinite(d.lat)&&Number.isFinite(d.lon)&&d.lat>13&&d.lat<23&&d.lon>100&&d.lon<108));
assert(damsOnRiver(dams,'Se Bang Fai').some(d=>d.name==='Nam Theun 2'));assert.equal(damsOnRiver(dams,'Mekong').length,0);
assert.equal(alertCount(news,notices,levels,now),3);
// Routes: signed-in GET only.
for(const route of [riverLevelsRoute,weatherNewsRoute]){assert.equal((await route(new Request('https://x.test/a'))).status,401);assert.equal((await route(new Request('https://x.test/a',{method:'POST',headers:{'oai-authenticated-user-id':'o'}}))).status,405)}
console.log('Alerts: river status rules (alarm/flood/rise, spike-proof, stale), KPL headline/date/topic parsing, 72 h warnings, dam notices with sources, dam-river matching and route auth passed.');
// Phones show only the warning sign and the alert count.
{const app=fs.readFileSync('dist/app.js','utf8'),css=fs.readFileSync('dist/compact-ui.css','utf8');assert(app.includes("banner.dataset.count=first?String(items.length):'';"));assert(css.includes("alert-banner[data-count]:not([data-count=''])::after{content:attr(data-count)"))}
// Season history from MRC FFW: JavaScript-style array parsed; same-day stats attached only when gauges agree.
{const text=`[{date_gmt:"2026-10-10",Max:8.53,Min:2.10,AVG:6.36,1992:3.1,2025:0,2026:4.08,floodLevel:12.5,alarmLevel:11.5},{date_gmt:"2026-10-11",Max:8.4,Min:2.0,AVG:6.3,2026:0,},]`;
 const rows=parseSeasonHistory(text);assert.equal(rows.length,2);const h=historyFor(rows,'2026-10-10');assert.deepEqual(h,{date:'2026-10-10',avg:6.36,max:8.53,min:2.1,observed:4.08});assert.equal(historyFor(rows,'2026-12-01'),null);assert.equal(historyFor(rows,'2026-10-11').observed,null);
 const hourly=Array(25).fill(4.2);const st={time:'2026-10-10T05:15:00Z',level:4.2,hourly};
 const ok=attachHistory(st,h);assert.equal(ok.history.comparable,true);assert(Math.abs(ok.history.offset-.12)<1e-9);
 assert.equal(attachHistory({...st,hourly:Array(25).fill(5)},h).history.comparable,false);assert.equal(attachHistory(st,null),st);
 assert.deepEqual(Object.values(HISTORY_STATIONS),['LUA','VIE','PAK','THA','SAV','PKS']);
 const app=fs.readFileSync('dist/app.js','utf8');assert(app.includes('hist?.comparable&&hist.avg!==null')&&app.includes('MRC Flood Forecasting'))}
// Workers send no User-Agent and ffw.mrcmekong.org answers 403 without one.
{const src=fs.readFileSync('worker/river-levels.mjs','utf8');assert(src.includes("headers:{'User-Agent':HISTORY_AGENT}"))}
// Very heavy rain (≥90 mm/24 h) at fresh MRC gauges in Laos becomes an alert, heaviest first.
{const g=(name,country,rain24h,extra={})=>({id:'000001',name,country,rain24h,rain6h:10,rain1h:1.5,stale:false,time:'2026-10-10T06:00:00Z',...extra});
 const gauges={stations:[g('Ban Nape','Lao PDR',113.5),g('Nong Khai','Thailand',120),g('Old','Lao PDR',150,{stale:true}),g('Pakse','Lao PDR',89.9),g('Mahaxai','Lao PDR',95)]};
 assert.equal(HEAVY_RAIN_24H,90);assert.deepEqual(rainAlerts(gauges).map(s=>s.name),['Ban Nape','Mahaxai']);assert.equal(rainAlerts(null).length,0);
 assert.match(rainAlertText(gauges.stations[0]),/114 mm/);assert(!rainAlertText(gauges.stations[0]).includes('ເບົາລົງ'));
 assert(rainAlertText(g('X','Lao PDR',100,{rain1h:0,rain6h:.2})).includes('ຝົນເບົາລົງແລ້ວ'));
 assert.equal(alertCount(null,null,null,Date.now(),gauges),2);
 const app=fs.readFileSync('dist/app.js','utf8');assert(app.includes("for(const s of rainAlerts(gaugeData))")&&app.includes('renderGauges();renderAlerts()'))}
