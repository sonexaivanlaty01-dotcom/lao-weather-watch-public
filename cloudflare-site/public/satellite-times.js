import {serviceTime} from './data-service.js?v=20261025-ios';
import {HISTORY_WINDOW,TIMELINE_POSITIONS} from './timeline.js?v=20261026-fast';
export const CLOUD_CADENCE=600000;
// GIBS caches each domain response for 30 minutes. Move the actual query window
// each minute to discover publications between native observation boundaries.
function timesURL(layer,lookback,now){
 const end=Math.floor(now/60000)*60000,start=end-lookback;
 // DescribeDomains currently rejects percent-encoded ':' and '/' in TIME.
 return 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi?SERVICE=WMTS&REQUEST=DescribeDomains&VERSION=1.0.0&LAYER='+layer+'&TILEMATRIXSET=GoogleMapsCompatible_Level6&TIME='+serviceTime(start)+'/'+serviceTime(end);
}
export function cloudTimesURL(now=Date.now()){return timesURL('Himawari_AHI_Band13_Clean_Infrared',6*3600000,now)}
// Satellite rain is processed hours later; a six-hour search can miss its
// complete five-hour history. Query its own domain, not global capabilities.
export function imergTimesURL(now=Date.now()){return timesURL('IMERG_Precipitation_Rate_30min',48*3600000,now)}
function domainTimes(domain,now,cadence,period,lookback,count){
 if(typeof domain!=='string'||!domain.trim())throw new Error('empty_cloud_domain');
 const times=[];
 for(const range of domain.split(',')){
  const parts=range.trim().split('/'),start=Date.parse(parts[0]),end=Date.parse(parts[1]||parts[0]);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||(parts.length>1&&parts[2]!==period)||end-start>7*86400000)throw new Error('invalid_cloud_domain');
  for(let t=start;t<=end;t+=cadence)if(t<=now&&t>=now-lookback)times.push(t);
 }
 const ordered=[...new Set(times)].sort((a,b)=>a-b),latest=ordered.at(-1);
 const result=ordered.filter(t=>t>=latest-HISTORY_WINDOW).slice(-count).map(serviceTime);if(!result.length)throw new Error('empty_cloud_domain');return result;
}
export function cloudDomainTimes(domain,now=Date.now()){return domainTimes(domain,now,CLOUD_CADENCE,'PT10M',6*3600000,TIMELINE_POSITIONS)}
export function imergDomainTimes(domain,now=Date.now()){return domainTimes(domain,now,1800000,'PT30M',48*3600000,HISTORY_WINDOW/1800000+1)}
export function mergeCloudTimes(previous,incoming){
 const previousEnd=Math.max(...previous.map(Date.parse)),incomingEnd=Math.max(...incoming.map(Date.parse)),keep=previousEnd>incomingEnd?previous:incoming,latest=Math.max(previousEnd,incomingEnd);
 return [...new Set(keep)].filter(t=>Date.parse(t)>=latest-HISTORY_WINDOW).sort((a,b)=>Date.parse(a)-Date.parse(b)).slice(-TIMELINE_POSITIONS);
}
