// Combines the three alert sources shown in the weather panel and the map banner.
// Each alert keeps its own source and time; nothing is merged into a new claim.
import {damsUpstreamOf,roundKm} from './river-network.js?v=20261021-bar';
export const WARNING_HOURS=72,NOTICE_OPEN_DAYS=7;
const day=86400000;
// KPL/DMH warnings published within the last 72 hours.
export function recentWarnings(news,now=Date.now()){
 return (news?.items||[]).filter(i=>i.warning&&Number.isFinite(Date.parse(i.date))&&now-Date.parse(i.date)<=WARNING_HOURS*3600000+day);
}
// Dam release notices that are running or about to start. A notice without an end
// date stays open for 7 days after its start.
export function activeNotices(notices,now=Date.now()){
 return (notices?.notices||[]).filter(n=>{const from=Date.parse(n.from||n.announced),until=n.until?Date.parse(n.until)+day:from+NOTICE_OPEN_DAYS*day;return Number.isFinite(from)&&now>=Date.parse(n.announced||n.from)&&now<=until&&!!n.source});
}
// River stations at alarm/flood level or rising fast, freshest data only.
export const RIVER_STATUS={flood:'ເຖິງລະດັບນ້ຳຖ້ວມ',alarm:'ເຖິງລະດັບເຕືອນ',rising:'ນ້ຳຂຶ້ນໄວ'};
export function riverAlerts(levels){
 const rank={flood:0,alarm:1,rising:2};
 return (levels?.stations||[]).filter(s=>!s.stale&&rank[s.status]!==undefined).sort((a,b)=>rank[a.status]-rank[b.status]||(b.rise6??0)-(a.rise6??0));
}
export function riverAlertText(s){
 const parts=[RIVER_STATUS[s.status],'ລະດັບ '+s.level.toFixed(2)+' m'];
 if(s.rise6!==null)parts.push((s.rise6>=0?'+':'')+s.rise6.toFixed(2)+' m ໃນ 6 ຊມ');
 if(s.alarm!==null)parts.push('ເຕືອນ '+s.alarm+' m');if(s.flood!==null)parts.push('ຖ້ວມ '+s.flood+' m');
 return parts.join(' · ');
}
// Dams on the same river as a station, by name only (fallback while rivers.json loads).
const riverKey=s=>String(s||'').toLowerCase().replace(/\bxe\b|\bse\b/g,'se').replace(/[^a-z]/g,'');
export function damsOnRiver(dams,river){
 const key=riverKey(river);if(!key||key==='mekong')return [];
 return (dams?.dams||[]).filter(d=>String(d.river||'').split('/').some(r=>riverKey(r)===key));
}
// Dams upstream of a station along the HydroRIVERS network (km = river distance).
// Dams listed with two rivers (e.g. "Nam Theun/Xe Bangfai") divert water through their
// turbines into the second river, which the natural network cannot know: those still
// match by name, with km null.
export function damsForStation(net,dams,station){
 if(!net)return damsOnRiver(dams,station.river).map(dam=>({dam,km:null}));
 const routed=damsUpstreamOf(net,dams,station),names=new Set(routed.map(r=>r.dam.name));
 return [...routed,...damsOnRiver(dams,station.river).filter(d=>String(d.river).includes('/')&&!names.has(d.name)).map(dam=>({dam,km:null}))];
}
export function damListText(found,max=5){
 return found.slice(0,max).map(f=>f.dam.name+(f.km===null?' (ຜັນນ້ຳ/ຕາມຊື່ລຳນ້ຳ)':' ~'+roundKm(f.km)+' km')).join(', ')+(found.length>max?' ແລະ ອີກ '+(found.length-max):'');
}
// Very heavy rain measured by MRC gauges in Laos: ≥90 mm in 24 hours (the red band of the
// gauge labels, TMD/WMO "very heavy"). Fresh data only; heaviest first.
export const HEAVY_RAIN_24H=90;
export function rainAlerts(gauges){
 return (gauges?.stations||[]).filter(s=>!s.stale&&s.country==='Lao PDR'&&Number.isFinite(s.rain24h)&&s.rain24h>=HEAVY_RAIN_24H).sort((a,b)=>b.rain24h-a.rain24h);
}
export function rainAlertText(s){
 const fmt=v=>Number.isFinite(v)?(v>=10?String(Math.round(v)):v.toFixed(1))+' mm':'–';
 return 'ຝົນ 24 ຊົ່ວໂມງ '+fmt(s.rain24h)+' · 6 ຊົ່ວໂມງ '+fmt(s.rain6h)+' · 1 ຊົ່ວໂມງ '+fmt(s.rain1h)+(s.rain1h!==null&&s.rain1h<.1&&s.rain6h!==null&&s.rain6h<1?' · ຝົນເບົາລົງແລ້ວ':'')+' · ລະວັງນ້ຳປ່າ ແລະ ດິນເຈື່ອນ ໃນເຂດພູ';
}
export function alertCount(news,notices,levels,now=Date.now(),gauges=null){return recentWarnings(news,now).length+activeNotices(notices,now).length+riverAlerts(levels).length+rainAlerts(gauges).length}
