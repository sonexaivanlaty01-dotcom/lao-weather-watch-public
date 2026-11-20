// MRC rain gauges: totals measured and reported by each station (not estimates).
// Bands follow common daily-rain categories (TMD/WMO style), in mm per 24 hours.
export const GAUGE_BANDS=[[90,'#c62828','ໜັກຫຼາຍ'],[35,'#ef6c00','ໜັກ'],[10,'#1e6fd9','ປານກາງ'],[.1,'#6fb1ee','ເລັກນ້ອຍ']];
export function gaugeBand(mm){if(!Number.isFinite(mm)||mm<.1)return null;return GAUGE_BANDS.find(([min])=>mm>=min)||null}
export function gaugeLabel(mm){return !Number.isFinite(mm)?'–':mm>=10?String(Math.round(mm)):mm.toFixed(1)}
export function validGaugeData(data){return data?.kind==='rain_gauge'&&Array.isArray(data.stations)&&data.stations.every(s=>/^\d{6}$/.test(s.id)&&Number.isFinite(s.lat)&&Number.isFinite(s.lon))}
const km=(a,b,c,d)=>{const r=Math.PI/180,x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 12742*Math.asin(Math.sqrt(x))};
// Nearest reporting (non-stale) gauge within maxKm of a place, with its distance.
export function nearestGauge(stations,lon,lat,maxKm=60){
 let best=null;for(const s of stations){if(s.stale||s.rain24h===null)continue;const d=km(lat,lon,s.lat,s.lon);if(d<=maxKm&&(!best||d<best.km))best={station:s,km:d}}return best;
}
// Station popup (option C, 25 Oct 2026).
// Tube scale: from 0 (or a lower reading) to a little above the flood line, so the lines always fit.
export function levelTube(level,alarm,flood){
 // No official lines: leave room above, so a normal level does not look like a full (alarming) tube.
 const top=(alarm===null&&flood===null?Math.max(level,0)*1.6:Math.max(level,flood??-Infinity,alarm??-Infinity,0)*1.2)||1,bottom=Math.min(0,level),pct=v=>Math.max(0,Math.min(100,(v-bottom)/(top-bottom)*100));
 return {water:pct(level),alarm:alarm===null?null:pct(alarm),flood:flood===null?null:pct(flood)};
}
// Labels beside the tube. Each sits at its line (at = pct). Alarm + flood closer than GAP share one label;
// a line label that would touch the water label moves away from it, never the water label itself.
export function tubeLabels(t,lv,GAP=17){
 const out=[],near=(a,b)=>a!==null&&b!==null&&Math.abs(a-b)<GAP;
 if(near(t.alarm,t.flood))out.push({cls:'lines',dashes:['alarm','flood'],text:'ເຕືອນ '+lv.alarm+' · ຖ້ວມ '+lv.flood+' m',pct:(t.alarm+t.flood)/2});
 else{if(t.flood!==null)out.push({cls:'flood',dashes:['flood'],text:'ນ້ຳຖ້ວມ '+lv.flood+' m',pct:t.flood});if(t.alarm!==null)out.push({cls:'alarm',dashes:['alarm'],text:'ເຕືອນ '+lv.alarm+' m',pct:t.alarm})}
 for(const x of out){x.at=x.pct;if(Math.abs(x.pct-t.water)<GAP)x.at=x.pct>=t.water?Math.min(100,t.water+GAP):Math.max(0,t.water-GAP)}
 out.push({cls:'now',dashes:[],now:true,text:'ຕອນນີ້ '+lv.level.toFixed(2)+' m',pct:t.water,at:t.water});
 return out;
}
export function trendText(rise6){if(rise6===null||!Number.isFinite(rise6))return null;if(Math.abs(rise6)<.05)return 'ຄົງທີ່ 6 ຊມ';return (rise6>0?'ຂຶ້ນ +':'ລົງ ')+Math.abs(rise6).toFixed(2)+' m ໃນ 6 ຊມ'}
export const trendIcon=rise6=>!Number.isFinite(rise6)||Math.abs(rise6)<.05?'flat':rise6>0?'up':'down';
