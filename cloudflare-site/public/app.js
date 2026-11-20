import {AWS_TIMES,awsFrames,CLOUD_CDN_BASE,cdnIndexURL} from './aws-satellite.js?v=20261009-cdn-live';
import {terrainAt,terrainCell,screenLevel,elevationColor} from './terrain.js?v=20261026-fast';
import {serviceTime,fetchResponse} from './data-service.js?v=20261025-ios';
import {installSmoothImagery} from './imagery-display.js?v=20261025-ios';
import {buildTimeline,timelineWindow,HISTORY_WINDOW,TIMELINE_POSITIONS,LIVE_REFRESH_MS,nextRefreshDelay,nextImageryRefreshDelay,awsPublicationCheckDelay} from './timeline.js?v=20261026-fast';
import {setupAIChat} from './ai-chat.js?v=20261026-fast';
import {setupFeedback} from './feedback.js?v=20261025-ios';
import {startVisits} from './visits.js?v=20261017-visits';
import {setupAppShell} from './app-shell.js?v=20261029-zoom';
import {setupPush} from './push.js?v=20261030-privacy';
import {setupHistoryDialog} from './history-chart.js?v=20261019-history';
import {forecastPeriods,forecastRaster,forecastCellAt,FORECAST_MIN_HOURS} from './forecast-data.js?v=20261019-12h';
import {buildCloudNowcast,CLOUD_REGION,cloudFutureSlots} from './cloud-nowcast.js?v=20261025-ios';
import {cloudTimesURL,cloudDomainTimes,imergTimesURL,imergDomainTimes} from './satellite-times.js?v=20261026-fast';
import {Playback,cursorAtTime,playbackIndices} from './playback.js?v=20261008-speed';
import {FrameRenderer,awsMosaic,jmaMosaic,viewportSpec,prepareAWSFrame,IMERG_LOOK} from './frame-renderer.js?v=20261026-fast';
import {demPlan,assembleDEM,simulatePonding,pondingRaster,planLngLat} from './ponding.js?v=20261009-pond2';
import {imergDayTimes,imergFrameURL,accumulate,accumulationAt,accumulationRaster,accumulationCoordinates,ACCUM_REGION,ACCUM_FRAMES,IMERG_STEP_MS} from './imerg-accumulation.js?v=20261026-fast';
import {recentWarnings,activeNotices,riverAlerts,riverAlertText,damsForStation,damListText,rainAlerts,rainAlertText,RIVER_STATUS} from './alerts.js?v=20261021-bar';
import {setupStormLayer,STORM_LAYERS,headingLao} from './storm-layer.js?v=20261027-nio';
import {indexRivers,downstream,routeLines,stationsBelowDam,roundKm,popupSide,routeRivers,damBarAngle,ROUTE_KM} from './river-network.js?v=20261021-bar';
import {gaugeBand,gaugeLabel,validGaugeData,nearestGauge,levelTube,tubeLabels,trendText,trendIcon} from './rain-stations.js?v=20261026-align';
import {uiIconNode} from './ui-icons.js?v=20261026-icons';
import {chooseCloudSource,cloudSourceLabel,cloudTimelineTitle,sourceLate} from './cloud-source.js?v=20261009-nasa-primary';
let playToken=0,preparedSkipped=0;
let frameRenderer,frameTicket=0,followLatest=true,selectedTime=null,liveFrameRetry=null,latestRetryKey='',latestRetries=0;
const shownTimes={};let imageLoading=false;
function updateImageFreshness(){
 if(forecastMode||motionMode)return;
 const shown=shownTimes[activeTime],latest=activeTime==='cloud'?cloudTimes.at(-1):activeTime==='imerg'?imergTimes.at(-1):frames.at(-1)?.time*1000;
 $('timelineFreshness').textContent=(imageLoading?'⟳ ກຳລັງໂຫຼດພາບ':followLatest?'● ຕິດຕາມພາບລ່າສຸດ':'◷ ກຳລັງເບິ່ງຍ້ອນຫຼັງ')+(shown?' · ອາຍຸພາບທີ່ສະແດງ '+age(shown):' · ລໍຖ້າພາບ')+(activeTime==='imerg'?' · NASA ເຜີຍແຜ່ຊ້າ 4–6 ຊມ: ເປັນຝົນທີ່ຕົກແລ້ວ ບໍ່ແມ່ນຕອນນີ້':'');
 // Not "loading" while the status line already says the source image is not ready yet.
 if(followLatest&&shown&&latest&&new Date(latest).getTime()>Date.parse(shown))$('timelineFreshness').textContent+=' · ພາບໃໝ່ '+timeFmt.format(new Date(latest))+($('playbackStatus').textContent?' ຍັງບໍ່ພ້ອມ':' ກຳລັງໂຫຼດ');
}
function windowLabel(ms){const m=Math.round(ms/60000);return m%60?Math.floor(m/60)+' ຊົ່ວໂມງ '+m%60+' ນາທີ':m/60+' ຊົ່ວໂມງ'}
function playbackStatus(text){$('playbackStatus').textContent=text}
const player=new Playback({render:timelineFrame,speed:2,onState(state,details){
 const round='Auto · ຮອບ '+details.round+'/'+details.rounds+' · '+details.speed+'×';
 if(state==='loading')playbackStatus(round+' · ລໍຖ້າພາບຄົບ…');
 if(state==='playing')playbackStatus(round+' · ພາບ '+(details.position+1)+'/'+details.total+' · ເລື່ອນ/ຊູມໄດ້');
 if(state==='skipped')playbackStatus(round+' · ຂ້າມພາບທີ່ຍັງບໍ່ພ້ອມ');
 if(state==='ended'||state==='error'){playing=null;$('playBtn').textContent=state==='ended'?'↻ Run ×3':'▶ Run ×3';$('playBtn').setAttribute('aria-label',state==='ended'?'ຫຼິ້ນອີກ 3 ຮອບ':'ລອງຫຼິ້ນໃໝ່');playbackStatus(state==='ended'?'ຈົບ Auto '+details.rounds+' ຮອບ'+(details.skipped||preparedSkipped?' · ມີພາບບໍ່ພ້ອມທີ່ຂ້າມ':''):'ບໍ່ມີພາບພ້ອມໃນຮອບນີ້ · ລອງອັບເດດ');if(state==='ended'&&!forecastMode&&!motionMode){followLatest=true;timelineKey='';queueMicrotask(updateTimeline)}}
}});
let maplibregl;
const $=id=>document.getElementById(id);
const places={vientiane:{name:'ວຽງຈັນ',lat:17.9757,lon:102.6331,zoom:11},pakse:{name:'ປາກເຊ',lat:15.1202,lon:105.7989,zoom:11},luangprabang:{name:'ຫຼວງພະບາງ',lat:19.8856,lon:102.135,zoom:11},savannakhet:{name:'ສະຫວັນນະເຂດ',lat:16.556,lon:104.750,zoom:11}};
const REGION_BOUNDS=[[73,0],[136,54]];
const EMPTY_COLLECTION={type:'FeatureCollection',features:[]};
const dates=new Intl.DateTimeFormat('lo-LA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Vientiane',hourCycle:'h23'});
const dayFmt=new Intl.DateTimeFormat('lo-LA',{day:'numeric',month:'short',timeZone:'Asia/Vientiane',hourCycle:'h23'});
const timeFmt=new Intl.DateTimeFormat('lo-LA',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Vientiane',hourCycle:'h23'});
const wxIcon=c=>c===0?'☀️':c<=3?'⛅':c<=48?'🌫️':c<=82?'🌧️':c<=86?'🌨️':'⛈️';
let current={...places.vientiane,id:'vientiane',zoom:4.5},map,marker,ready=false,grid=null,weather=null,radar=null,frames=[],imergTimes=[],imergIndex=0,radarIndex=0,activeTime='radar',playing=null,weatherAbort=null,terrainSequence=0;
let forecastMode=false,forecastData=null,forecastPeriodsNow=[],forecastJob=null,forecastError=false,forecastKey='';
let motionMode=false,motionData=null,motionJob=null,motionAbort=null,motionError='',motionKey='';
let cloudFrames=new Map(),cloudProvider='nasa',shownCloudProvider=null;
let cloudTimes=[],cloudIndex=0,cloudError=false,radarPast=[],radarNowcast=[];
async function satelliteTimes(url,parse){
 const response=await fetchResponse(url,{timeout:15000,attempts:2,cache:'no-store'}),xml=new DOMParser().parseFromString(await response.text(),'application/xml');
 if(xml.querySelector('parsererror')||xml.getElementsByTagName('Exception').length)throw new Error('domain');
 const domain=[...xml.getElementsByTagName('DimensionDomain')].find(d=>[...d.getElementsByTagNameNS('*','Identifier')].some(n=>n.textContent==='time'))?.getElementsByTagName('Domain')[0]?.textContent;
 return parse(domain);
}
function cloudFrame(){if(activeTime==='cloud'&&!playing)timelineFrame(timelineCursor)}

function loadCloud(){return feedJob('cloud',fetchCloud)}
async function fetchCloud(){
 try{
  const backup=async()=>{if(CLOUD_CDN_BASE){try{return awsFrames(await getJSON(cdnIndexURL(),null,true))}catch{}}return awsFrames(await getJSON(AWS_TIMES,null,true))};
  let {source,frames:incoming}=await chooseCloudSource({provider:cloudProvider,latest:cloudTimes.at(-1)},{nasa:async()=>(await satelliteTimes(cloudTimesURL(),cloudDomainTimes)).map(time=>({time,provider:'nasa'})),backup});
  const sameSource=source===cloudProvider;
  if(sameSource&&cloudTimes.length&&Date.parse(incoming.at(-1).time)<Date.parse(cloudTimes.at(-1)))incoming=[...cloudFrames.values()];
  cloudProvider=source;cloudFrames=new Map(incoming.map(frame=>[frame.time,frame]));cloudTimes=incoming.map(f=>f.time);cloudError=false;recordFeedCheck('cloud',Date.parse(cloudTimes.at(-1)));
  $('cloudSourceStatus').textContent=cloudSourceLabel(source)+' · ລ່າສຸດ '+stamp(cloudTimes.at(-1))+' · ອາຍຸ '+age(cloudTimes.at(-1));
 }
 catch{cloudError=true;recordFeedFailure('cloud');$('cloudSourceStatus').textContent='ອັບເດດບໍ່ສຳເລັດ · ຮັກສາພາບທີ່ໂຫຼດໄດ້';}
 updateTimeline();updateStatus();
}

function setForecastMode(value){
 if(motionMode){motionMode=false;motionAbort?.abort();motionJob=null;motionAbort=null}
 $('motionMode').setAttribute('aria-pressed','false');visibility('cloud-motion',false);visibility('cloud-motion-boundary',false);
 $('forecastModelLabel').textContent='NOAA GFS · ຂັ້ນ 1 ຊົ່ວໂມງ';
 stopPlay();followLatest=true;selectedTime=null;forecastMode=value;timelineKey='';forecastKey='';timelineCursor=value?0:TIMELINE_POSITIONS-1;
 $('workspace').dataset.timeMode=value?'forecast':'history';
 $('historyMode').setAttribute('aria-pressed',String(!value));$('forecastMode').setAttribute('aria-pressed',String(value));
 $('timelineSource').parentElement.hidden=value;$('forecastModelLabel').hidden=!value;$('forecastPointStatus').hidden=!value;
 syncLayers();if(value)loadForecast();
}
$('latestBtn').addEventListener('click',()=>{stopPlay();followLatest=true;selectedTime=null;timelineKey='';playbackStatus('');updateTimeline();if(activeTime==='cloud')loadCloud();else if(activeTime==='imerg')loadIMERG();else loadRadar()});
$('historyMode').addEventListener('click',()=>setForecastMode(false));
$('forecastMode').addEventListener('click',()=>setForecastMode(true));
$('motionMode').addEventListener('click',()=>{
 setForecastMode(false);motionMode=true;stopPlay();timelineCursor=0;motionKey='';
 $('workspace').dataset.timeMode='motion';$('historyMode').setAttribute('aria-pressed','false');$('motionMode').setAttribute('aria-pressed','true');
 $('timelineSource').parentElement.hidden=true;$('forecastModelLabel').hidden=false;$('forecastModelLabel').textContent='ພາບຄຳນວນ · ຂັ້ນ 10 ນາທີ';$('forecastPointStatus').hidden=false;
 syncLayers();loadCloudMotion();
});
async function loadCloudMotion(){
 if(playing&&motionMode)return;
 if(motionJob)return motionJob;motionError='';motionAbort=new AbortController();const abort=motionAbort;
 const job=(async()=>{
  if(!cloudTimes.length||cloudError)await loadCloud();
  const g=CLOUD_REGION,motionSpec=viewportSpec([g.west,g.south,g.east,g.north],512,512,4,1);
  // The motion solver uses a square Mercator grid of the exact calculation region.
  const merc=lat=>6378137*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
  motionSpec.coordinates=[[g.west,g.north],[g.east,g.north],[g.east,g.south],[g.west,g.south]];motionSpec.bbox=[g.west*Math.PI*6378137/180,merc(g.south),g.east*Math.PI*6378137/180,merc(g.north)];motionSpec.width=motionSpec.height=512;
  // Use the newest three consecutive observations whose imagery is filled in
  // (the newest listed GIBS time can still be blank); step back at most twice.
  let data;
  for(let back=0;back<3;back++){
   const times=cloudTimes.slice(Math.max(0,cloudTimes.length-3-back),cloudTimes.length-back).map(Date.parse);
   if(motionData?.base===times[2]&&motionData.slots[0]?.time>Date.now())return;
   const sourceFrames=times.map(t=>cloudFrames.get(new Date(t).toISOString())),motionProvider=cloudProvider;
   try{data=await buildCloudNowcast(times,{signal:abort.signal,loadImage:motionProvider==='aws'?async (time)=>(await awsMosaic({frame:sourceFrames[times.indexOf(time)],spec:motionSpec,smooth:true},{signal:abort.signal})).image:motionProvider==='jma'?(time)=>jmaMosaic({frame:sourceFrames[times.indexOf(time)],spec:motionSpec,smooth:true},{signal:abort.signal}):null});data.provider=motionProvider;break}
   catch(error){if(error.message!=='blank'||back===2)throw error}
  }
  if(playing){data.urls.forEach(URL.revokeObjectURL);return}motionData?.urls.forEach(URL.revokeObjectURL);motionData=data;
 })().catch(error=>{if(!abort.signal.aborted&&!playing){motionError=error.message;motionData?.urls.forEach(URL.revokeObjectURL);motionData=null}}).finally(()=>{if(motionAbort===abort){motionJob=null;if(motionMode)updateTimeline()}});
 motionJob=job;return job;
}
function updateMotionTimeline(){
 $('latestBtn').hidden=true;$('timelineFreshness').textContent='ພາບຄຳນວນ · ບໍ່ແມ່ນພາບອະນາຄົດຈິງ';
 activeTime='motion';const slots=motionData&&!motionError?motionData.slots.map((s,i)=>({...s,frame:i})).filter(s=>s.time>Date.now()):[];
 timeSlots=slots;const key=slots[0]?.time;if(key!==motionKey){motionKey=key;timelineCursor=cursorAtTime(slots,selectedTime)}
 $('timelineTitle').textContent='↗ ເມກເຄື່ອນ · ທົດລອງ';$('timeSlider').max=Math.max(0,slots.length-1);$('timeSlider').disabled=!slots.length;$('playBtn').disabled=!slots.length;
 $('timeSlider').setAttribute('aria-label','ເມກຄຳນວນລ່ວງໜ້າ · ຂັ້ນ 10 ນາທີ');
 $('timelineCoverage').textContent=motionData?'ຈາກພາບ '+stamp(motionData.base)+' · ອາຍຸ '+age(motionData.base)+' · ຂ້າງໜ້າສູງສຸດ 3 ຊົ່ວໂມງ (ຊົ່ວໂມງທຳອິດທຸກ 10 ນາທີ ຈາກນັ້ນທຸກ 20 ນາທີ)':'Himawari 3 ພາບ · ຫ່າງກັນ 10 ນາທີ';
 $('forecastPointStatus').textContent='ຄາດການເຄື່ອນຂອງລວດລາຍເມກ · ບໍ່ບອກປະລິມານຝົນ';
 if(slots.length)timelineFrame(timelineCursor);else{
  visibility('cloud-motion',false);visibility('cloud-motion-boundary',false);
  const reasons={blank:'ພາບຕົ້ນທາງຍັງບໍ່ຄົບ · ລອງໃໝ່ອັດຕະໂນມັດ',stale:'ພາບເກົ່າເກີນໄປ · ຄຳນວນອະນາຄົດບໍ່ໄດ້',history:'ພາບ 3 ຊ່ວງຕິດກັນບໍ່ຄົບ',tracking:'ລວດລາຍພາບຈັບຄູ່ບໍ່ພໍ · ບໍ່ຄາດການ',unchanged:'ຕົ້ນທາງສົ່ງພາບຊ້ຳ · ບໍ່ຄາດການ',image:'ພາບຕົ້ນທາງໂຫຼດບໍ່ສຳເລັດ'};const failed=motionError||motionData;$('frameTime').textContent=failed?(reasons[motionError]||'ຄຳນວນບໍ່ພ້ອມ · ກົດໂໝດເມກເພື່ອລອງໃໝ່'):'ກຳລັງໂຫຼດ / ຄຳນວນເມກ…';
 }
 updateLegend();
}

function cloudMotionLegend(){
 $('mapLegend').innerHTML='<span>ພາບຄຳນວນຈາກ Himawari Band 13 · ບໍ່ແມ່ນພາບສັງເກດໃນອະນາຄົດ</span><span>ໃຊ້ການຈັບຄູ່ລວດລາຍ 3 ພາບ · ບໍ່ມີການກໍ່ຕົວ/ສະລາຍເມກໃນການຄຳນວນ</span><span>ພື້ນທີ່ຈັບຄູ່ບໍ່ໄດ້ (ເມກ/ຟ້າສະເໝີກັນ) ໃຊ້ທິດທາງຈາກຈຸດໃກ້ຄຽງ ບໍ່ເກີນ ~400 km · ຍ້າຍພາບຈິງເທົ່ານັ້ນ</span><span>ຈຸດບໍ່ມີພາບ: ໄກຈາກຈຸດທີ່ຈັບຄູ່ໄດ້ ຫຼື ນອກຂອບ · ບໍ່ໄດ້ແປວ່າບໍ່ມີເມກ</span><span>ຕົ້ນທາງອາດຊ້າ · ຂ້າງໜ້າສູງສຸດ 3 ຊົ່ວໂມງ · ບໍ່ເກີນ 4 ຊົ່ວໂມງຈາກພາບຖານ · ເກີນ 1 ຊົ່ວໂມງ ຄວາມແມ່ນຫຼຸດລົງຫຼາຍ (ເມກກໍ່ຕົວ/ສະລາຍ ບໍ່ໄດ້ຄຳນວນ)</span><span>ຮູບຊົງເມກອິນຟຣາເຣດ ບໍ່ແມ່ນຄວາມລຶກ/ປະລິມານຝົນ ຫຼື ເວລາຝົນມາຮອດ · ຍັງບໍ່ປັບທຽບສະຖານີ</span><a href="https://www.data.jma.go.jp/mscweb/en/himawari89/space_segment/spsg_ahi.html" target="_blank" rel="noreferrer">Himawari-9 / JMA · NASA GIBS · NOAA AWS backup</a>';
 if(motionData){const status=document.createElement('span');status.textContent='ຈັບຄູ່ລວດລາຍໄດ້ '+motionData.valid+' / '+motionData.total+' ຈຸດ · ບໍ່ແມ່ນຄ່າຄວາມແມ່ນຍຳ';$('mapLegend').append(status)}
}
function loadForecast(){
 if(forecastJob)return forecastJob;
 forecastError=false;
 forecastJob=getJSON('/api/forecast/grid',null,true).then(data=>{
  if(data.kind!=='model_forecast'||!Array.isArray(data.cells)||data.grid?.step!==.5||!Array.isArray(data.times)||Date.now()-data.fetchedAt>8*3600000||forecastPeriods(data).length<FORECAST_MIN_HOURS)throw new Error('forecast');
  if(!playing)forecastData=data;
 }).catch(()=>{if(!playing){forecastError=true;forecastData=null}}).finally(()=>{forecastJob=null;if(forecastMode)updateTimeline()});
 return forecastJob;
}
function updateForecastTimeline(){
 $('latestBtn').hidden=true;$('timelineFreshness').textContent='ຝົນພະຍາກອນ · NOAA GFS';
 activeTime='forecast';forecastPeriodsNow=forecastData&&!forecastError?forecastPeriods(forecastData):[];
 if(forecastPeriodsNow.length<FORECAST_MIN_HOURS)forecastPeriodsNow=[];
 timeSlots=forecastPeriodsNow.map((p,i)=>({time:p.end,frame:i}));
 const key=forecastPeriodsNow[0]?.end;if(forecastKey!==key){forecastKey=key;timelineCursor=cursorAtTime(timeSlots,selectedTime)}
 $('timelineTitle').textContent='↗ ພະຍາກອນຝົນ '+(forecastPeriodsNow.length||12)+' ຊົ່ວໂມງ';$('timeSlider').max=Math.max(0,timeSlots.length-1);
 $('timeSlider').disabled=!timeSlots.length;$('playBtn').disabled=!timeSlots.length;
 $('timeSlider').setAttribute('aria-label','ພະຍາກອນຝົນ · '+forecastPeriodsNow.length+' ຊ່ວງ · ຂັ້ນ 1 ຊົ່ວໂມງ');
 $('timelineCoverage').textContent=forecastPeriodsNow.length+' ຊົ່ວໂມງ ເລີ່ມຊົ່ວໂມງເຕັມຖັດໄປ · ກຣິດ ~55 km · ສະແດງແບບນຸ່ມ'+(forecastData?(forecastData.run?' · GFS ຮອບ '+stamp(forecastData.run.init):'')+' · ດາວນ໌ໂຫຼດ '+stamp(forecastData.fetchedAt):'');
 if(timeSlots.length)timelineFrame(timelineCursor);
 else{visibility('forecast-rain',false);visibility('forecast-boundary',false);$('frameTime').textContent=forecastError||forecastData?'ພະຍາກອນບໍ່ພ້ອມ · ກົດໂໝດພະຍາກອນເພື່ອລອງໃໝ່':'ກຳລັງໂຫຼດພະຍາກອນ…';$('forecastPointStatus').textContent='ເປີດໂໝດພະຍາກອນອີກຄັ້ງເພື່ອໂຫຼດ · ບໍ່ໃຊ້ພາບຍ້ອນຫຼັງແທນ'}
 updateLegend();
}
function forecastPeriodText(p){return timeFmt.format(new Date(p.start))+'–'+timeFmt.format(new Date(p.end))}
let forecastRasterKey='';
function setForecastFrame(index){
 if(!forecastMode||!forecastData||!forecastPeriodsNow.length)return;
 timelineCursor=Math.max(0,Math.min(forecastPeriodsNow.length-1,index));const p=forecastPeriodsNow[timelineCursor];
 if(ready){
  // Smooth display raster of the model grid (values in popups still come from the cells).
  // Rebuild and reload only when the hour or the download changes; this runs on every
  // timeline refresh, and reloading the same image each time would keep it blank.
  const rasterKey=forecastData.fetchedAt+':'+p.index,source=map.getSource('forecast-rain');
  if(rasterKey!==forecastRasterKey){
  forecastRasterKey=rasterKey;
  const r=forecastRaster(forecastData,p.index),c=document.createElement('canvas');c.width=r.width;c.height=r.height;c.getContext('2d').putImageData(new ImageData(r.pixels,r.width,r.height),0,0);
  const url=c.toDataURL('image/png');
  if(source)source.updateImage({url,coordinates:r.coordinates});else{
   map.addSource('forecast-rain',{type:'image',url,coordinates:r.coordinates});
   map.addLayer({id:'forecast-rain',type:'raster',source:'forecast-rain',paint:{'raster-opacity':1,'raster-fade-duration':0,'raster-resampling':'linear'}});
   const g=forecastData.grid,h=g.step/2;map.addSource('forecast-boundary',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[g.west-h,g.south-h],[g.east+h,g.south-h],[g.east+h,g.north+h],[g.west-h,g.north+h],[g.west-h,g.south-h]]]}}});
   map.addLayer({id:'forecast-boundary',type:'line',source:'forecast-boundary',paint:{'line-color':'#7556be','line-width':2,'line-dasharray':[3,2]}});
  }
  }
  visibility('forecast-rain',true);visibility('forecast-boundary',true);bringAdminToFront();
 }
 $('frameTime').textContent=forecastPeriodText(p)+' · '+dayFmt.format(new Date(p.end));$('timeSlider').value=timelineCursor;$('timeSlider').setAttribute('aria-valuetext',$('frameTime').textContent);
 const mm=forecastCellAt(forecastData,current.lon,current.lat,p.index);
 $('forecastPointStatus').textContent=current.name+' · ກຣິດໃກ້ຈຸດກາງ: '+(mm===null?'ບໍ່ມີຂໍ້ມູນ':mm.toFixed(1)+' mm / ຊ່ວງນີ້')+' · ພະຍາກອນ ບໍ່ແມ່ນຝົນວັດຈິງ';
}
function showForecastPopup(point){
 const p=forecastPeriodsNow[timelineCursor],node=document.createElement('div'),strong=document.createElement('strong'),detail=document.createElement('p');strong.textContent='ຝົນພະຍາກອນ · NOAA GFS';
 const mm=p?forecastCellAt(forecastData,point.lng,point.lat,p.index):null;
 detail.textContent=mm===null?'ຈຸດນີ້ບໍ່ມີຂໍ້ມູນພະຍາກອນ':forecastPeriodText(p)+' · '+mm.toFixed(1)+' mm ໃນ 1 ຊົ່ວໂມງ · ກຣິດສະແດງ ~55 km · ບໍ່ຢືນຢັນເວລາຝົນມາຮອດຈຸດນີ້';
 node.append(strong,detail);new maplibregl.Popup().setLngLat(point).setDOMContent(node).addTo(map);
}

function selectRadarMode(){
 $('radarLayerDescription').textContent=radarName()+(radar?.units?' · '+radar.units:' · ພາບລວມ');
 frames=$('radarMode').value==='nowcast'?radarNowcast:radarPast;radarIndex=Math.max(0,frames.length-1);
 visibility('radar',enabled('radar')&&frames.length>0);
 $('radarFeedStatus').textContent=radarError?'ອັບເດດບໍ່ສຳເລັດ · ກວດເວລາພາບເດີມ':frames.length?radarName()+' · '+stamp(frames.at(-1).time*1000)+($('radarMode').value==='nowcast'?' · ພະຍາກອນ':' · ອາຍຸ '+age(frames.at(-1).time*1000)):'ບໍລິການບໍ່ໄດ້ສົ່ງພາບພະຍາກອນ · ເລືອກພາບກວດວັດ';
 if(frames.length&&Date.now()-frames.at(-1).time*1000>3600000)$('radarFeedStatus').textContent+=' · ພາບລ່າຊ້າ';
 if(radar?.display==='chart'&&frames.length)$('radarFeedStatus').textContent+=' · ເບິ່ງໃນປ່ອງພາບຈີນ';
 updateTimeline();updateStatus();
}
let timeSlots=[],timelineCursor=TIMELINE_POSITIONS-1,timelineKey='',radarHistory=[];
const countryHistory=new Map();
function rememberFrames(previous,incoming){const byTime=new Map([...previous,...incoming].map(f=>[f.time,f]));const end=Math.max(...incoming.map(f=>f.time));return [...byTime.values()].filter(f=>f.time>=(end-HISTORY_WINDOW/1000)).sort((a,b)=>a.time-b.time)}
function frameContext(){return {id:activeTime,slots:timeSlots.map(s=>({...s})),cloud:[...cloudTimes],cloudFrames:new Map(cloudFrames),imerg:[...imergTimes],frames:[...frames],radar,motion:motionData,forecast:forecastData,periods:[...forecastPeriodsNow],spec:ready?frameRenderer.spec():null,smooth:$('smoothImageryToggle').checked}}
function frameDescriptor(context,slot){
 const {id,spec,smooth}=context;
 if(slot.frame<0)return null;
 if(id==='motion'){const g=CLOUD_REGION;return {id:'cloud-motion',kind:'image',smooth,time:slot.time,url:context.motion.urls[slot.frame],coordinates:[[g.west,g.north],[g.east,g.north],[g.east,g.south],[g.west,g.south]]}}
 if(id==='cloud'){const time=context.cloud[slot.frame],frame=context.cloudFrames.get(time);if(frame?.provider==='aws')return {id,kind:'aws',time,frame,spec,smooth,opacity:.8};if(frame?.provider==='jma')return {id,kind:'jma',time,frame,spec,smooth,opacity:.72}}
 if(id==='cloud'||id==='imerg')return {id,kind:'nasa',time:(id==='cloud'?context.cloud:context.imerg)[slot.frame],spec,smooth,opacity:id==='imerg'?IMERG_LOOK.opacity:.8};
 if(id==='radar'){const f=context.frames[slot.frame],r=context.radar;if(!f||!r)return null;return r.coordinates?{id,kind:'image',smooth,spec,time:f.time,url:f.url+'?time='+f.time,coordinates:r.coordinates,opacity:.75}:r.display==='chart'?{id,kind:'chart',url:f.url,time:f.time}:{id,kind:'tiles',smooth,time:f.time,path:f.path,host:r.host,spec,opacity:.7}}
 return null;
}
function prefetchHistory(context,index){
 if(context.id==='forecast'||(context.id==='cloud'&&!playing))return;
 const ordered=[...context.slots.slice(index+1),...context.slots.slice(0,index+1)],keys=new Set(),next=[];
 for(const slot of ordered){const d=frameDescriptor(context,slot);if(!d||d.kind==='chart')continue;const key=frameRenderer.key(d);if(keys.has(key))continue;keys.add(key);next.push(d);if(next.length===(context.id==='cloud'&&cloudProvider==='aws'?2:3))break}
 frameRenderer.prefetch(next);
}
async function timelineFrame(index,context=frameContext(),fallback=0){
 if(!ready||!context.slots.length)return false;
 if(playing)context.spec=frameRenderer.spec();
 const ticket=++frameTicket,target=Math.max(0,Math.min(context.slots.length-1,index)),slot=context.slots[target],id=context.id;
 $('timeSlider').value=timelineCursor;
 try{
  if(id==='forecast'){forecastData=context.forecast;forecastPeriodsNow=context.periods;setForecastFrame(target);selectedTime=slot.time;return true}
  const descriptor=frameDescriptor(context,slot);
  if(slot.frame<0){frameRenderer.cancel(id);visibility(id,false);if(id==='radar'&&context.radar?.display==='chart')$('countryRadarImage').hidden=true;$('frameTime').textContent=timeFmt.format(new Date(slot.time))+' · ບໍ່ມີພາບໃນຊ່ວງນີ້';shownTimes[id]=null}
  else{
   if(!descriptor)return false;if(descriptor.kind==='aws'&&context.skipStamps?.has(descriptor.frame.stamp))return false;
   // Loading is shown inside the one-line freshness text: a status line that appears
   // and disappears changes the time bar's height, which moved the map on every zoom.
   if(!playing){imageLoading=true;updateImageFreshness()}
   if(descriptor.kind==='chart'){
    const prepared=new Image();prepared.src=descriptor.url;await prepared.decode();if(ticket!==frameTicket)return false;
    clearRadarImage();const image=$('countryRadarImage');image.src=descriptor.url;image.dataset.frame=descriptor.url;image.hidden=false;
    $('countryRadarTime').textContent=stamp(descriptor.time*1000);$('countryRadarSlider').max=context.frames.length-1;$('countryRadarSlider').value=slot.frame;
   }else{const showing=frameRenderer.show(descriptor.id,descriptor);if(playing)prefetchHistory(context,target);if(!await showing)return false}
   if(ticket!==frameTicket)return false;
   const actual=id==='motion'?slot.time:id==='cloud'?Date.parse(context.cloud[slot.frame]):id==='imerg'?Date.parse(context.imerg[slot.frame]):context.frames[slot.frame].time*1000;
   shownTimes[id]=new Date(actual).toISOString();if(id==='cloud'){shownCloudProvider=descriptor.kind==='aws'?'aws':descriptor.kind==='jma'?'jma':'nasa';updateLegend()}
   if(id==='motion'){
    const coordinates=descriptor.coordinates;if(!map.getSource('cloud-motion-boundary')){map.addSource('cloud-motion-boundary',{type:'geojson',attribution:'Himawari-9 / JMA · NASA GIBS · NOAA AWS backup · experimental calculated imagery',data:{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[...coordinates,coordinates[0]]]}}});map.addLayer({id:'cloud-motion-boundary',type:'line',source:'cloud-motion-boundary',paint:{'line-color':'#168986','line-width':2,'line-dasharray':[3,2]}})}visibility('cloud-motion-boundary',true);
    $('frameTime').textContent=stamp(slot.time)+' · ຄຳນວນ +'+Math.round(slot.lead*10)+' ນາທີຈາກພາບ'+(slot.far?' · ແນວໂນ້ມ ຄວາມແມ່ນຕ່ຳ':'');
   }else{
    if(id==='cloud'){cloudIndex=slot.frame;$('cloudFrameStatus').textContent=stamp(actual)+' · ອາຍຸ '+age(actual)}else if(id==='imerg')imergIndex=slot.frame;else radarIndex=slot.frame;
    $('frameTime').textContent=timeFmt.format(new Date(actual))+' · '+dayFmt.format(new Date(actual))+(id==='cloud'?(descriptor.kind==='aws'?' · AWS':descriptor.kind==='jma'?' · JMA':' · NASA'):'');
   }
   clearTimeout(liveFrameRetry);liveFrameRetry=null;latestRetryKey='';latestRetries=0;
   bringAdminToFront();if(!playing)playbackStatus('');
   // Three distinct ready frames ahead, wrapping to the next replay round.
   prefetchHistory(context,target);
  }
  if(ticket!==frameTicket)return false;imageLoading=false;timelineCursor=target;selectedTime=slot.time;$('timeSlider').value=target;$('timeSlider').setAttribute('aria-valuetext',$('frameTime').textContent);updateImageFreshness();return true;
 }catch(error){if(ticket!==frameTicket)return false;imageLoading=false;updateImageFreshness();
  // Leave the committed image in place; do not jump to another observation or
  // schedule a special retry when the next image is still unavailable.
  // Exception: with no cloud image on the map yet (first load), or one that does not cover the
  // view any more (e.g. the map opened zoomed out on a storm), and the newest NASA frame still
  // blank, show the newest earlier observation with its own real time.
  if(id==='cloud'&&!playing&&(!shownTimes.cloud||!frameRenderer?.covers('cloud',frameRenderer.spec()))&&fallback<3){const previous=context.slots.slice(0,target).findLastIndex(s=>s.frame>=0&&s.frame!==slot.frame);if(previous>=0){const shown=await timelineFrame(previous,context,fallback+1);if(shown&&!fallback){playbackStatus('ພາບ '+timeFmt.format(new Date(context.cloud[slot.frame]))+' ຕົ້ນທາງຍັງບໍ່ພ້ອມ · ສະແດງພາບກ່ອນໜ້າ');updateImageFreshness()}return shown}}
  if(!playing)playbackStatus('ພາບໂຫຼດບໍ່ສຳເລັດ · ຮັກສາພາບເດີມ · ລອງໃໝ່');return false}
}
let adminData={provinces:EMPTY_COLLECTION,districts:EMPTY_COLLECTION},selectedAdmin=null;
let toastTimer,scenarioRain=50,radarError=false,imergError=false;
const enabled=id=>!((forecastMode||motionMode)&&['radar','imerg','cloud','coverage','elevation','risk','stations','accum','ponding'].includes(id))&&$(id+'Toggle').checked;

const imageryIds=['radar','imerg','cloud'];
const feedJobs=new Map(),imageHealth=Object.fromEntries(imageryIds.map(id=>[id,{state:'waiting',errors:0}]));
const feedChecks=Object.fromEntries(imageryIds.map(id=>[id,{checkedAt:0,latest:0,state:'waiting'}]));
function recordFeedCheck(id,latest){const previous=feedChecks[id].latest;feedChecks[id]={checkedAt:Date.now(),latest,state:previous?latest>previous?'new':'unchanged':'loaded'};renderImageHealth()}
function recordFeedFailure(id){feedChecks[id]={...feedChecks[id],checkedAt:Date.now(),state:'error'};renderImageHealth()}
function renderImageHealth(){
 for(const id of imageryIds){
  const node=$('imageStatus-'+id);if(!node)continue;
  const metaError=id==='radar'?radarError:id==='imerg'?imergError:cloudError;
  const count=id==='radar'?frames.length:id==='imerg'?imergTimes.length:cloudTimes.length;
  const h=imageHealth[id];
  const state=!enabled(id)?'off':!count?'unavailable':h.errors?'error':h.state;
  node.dataset.state=state;
  node.textContent=state==='off'?'ຊັ້ນປິດຢູ່':state==='unavailable'?'ຍັງບໍ່ມີພາບ':state==='error'?'ພາບບາງສ່ວນໂຫຼດບໍ່ສຳເລັດ':state==='ready'?'ໂຫຼດພາບສຳເລັດ':'ກຳລັງໂຫຼດພາບ…';
  if(metaError&&count)node.textContent+=' · ອັບເດດບໍ່ສຳເລັດ / ພາບເດີມ';
  const check=feedChecks[id],checkNode=$('checked-'+id);if(checkNode){checkNode.textContent=check.checkedAt?'ເຊັກ '+timeFmt.format(new Date(check.checkedAt))+' · '+(check.state==='error'?'ຕິດຕໍ່ບໍ່ສຳເລັດ':check.state==='unchanged'?'ຕົ້ນທາງຍັງບໍ່ມີພາບໃໝ່':check.state==='new'?'ພົບພາບໃໝ່':'ໂຫຼດລາຍການພາບແລ້ວ'):'ລໍຖ້າກວດຕົ້ນທາງ';checkNode.dataset.state=check.state}
 }
}
function feedJob(id,task){
 if(feedJobs.has(id))return feedJobs.get(id);
 const job=task().finally(()=>{feedJobs.delete(id);renderImageHealth()});feedJobs.set(id,job);return job;
}
function activateImagery(id){
 stopPlay();followLatest=true;selectedTime=null;timelineKey='';
 $('frameTime').textContent=shownTimes[id]?stamp(shownTimes[id]):'ລໍຖ້າພາບຊັ້ນທີ່ເລືອກ…';
 if(forecastMode||motionMode)setForecastMode(false);
 $('timelineSource').value=id;
 for(const key of imageryIds)$(key+'Toggle').checked=key===id;
 syncLayers();
}
async function retryImagery(id){
 const button=document.querySelector('[data-retry-feed="'+id+'"]');button.disabled=true;
 try{
  if(id!=='radar')gibsRequest=null;
  if(id==='radar'&&radar?.display==='chart'){$('countryRadarImage').dataset.frame='';$('countryRadarImage').removeAttribute('src')}
  if(ready&&map.getLayer(id))map.removeLayer(id);
  if(ready&&map.getSource(id))map.removeSource(id);
  imageHealth[id]={state:'loading',errors:0};activateImagery(id);
  await (id==='radar'?loadRadar():id==='imerg'?loadIMERG():loadCloud());
  if(id==='radar'&&frames.length)setRadarFrame(radarIndex);
  if(id==='imerg'&&imergTimes.length)setIMERGFrame(imergIndex);
  if(id==='cloud'&&cloudTimes.length)cloudFrame(cloudIndex);
 }finally{button.disabled=false;renderImageHealth()}
}
document.querySelectorAll('[data-retry-feed]').forEach(b=>b.addEventListener('click',()=>retryImagery(b.dataset.retryFeed)));

function toast(message,ms=6500){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',ms)}
async function getJSON(url,signal,fresh=false){return (await fetchResponse(url,{signal,cache:fresh?'no-store':'default'})).json()}
function stamp(time){return dates.format(new Date(time))}
function age(time){const hours=Math.max(0,(Date.now()-new Date(time).getTime())/3600000);return hours<1?`${Math.round(hours*60)} ນາທີ`:`${hours.toFixed(1)} ຊົ່ວໂມງ`}
let weatherCollapsed=false;
// One dock owns all panels; changing tabs never stacks multiple floating cards.
const controlDock=document.createElement('div');controlDock.className='control-dock';
const dockTabs=document.createElement('div');dockTabs.className='dock-tabs';dockTabs.setAttribute('role','tablist');dockTabs.setAttribute('aria-label','ແຜງຄວບຄຸມ');
for(const [view,label,panel] of [['map','ແຜນທີ່',null],['weather','ອາກາດ','weatherPanel'],['layers','ຊັ້ນຂໍ້ມູນ','layersPanel'],['news','ຂ່າວ','newsPanel']]){
 const button=document.createElement('button');button.textContent=label;button.dataset.view=view;button.id='dock-tab-'+view;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(view==='map'));button.tabIndex=view==='map'?0:-1;
 if(panel){button.setAttribute('aria-controls',panel);$(panel).setAttribute('role','tabpanel');$(panel).setAttribute('aria-labelledby',button.id)}
 dockTabs.append(button);
}
controlDock.append(dockTabs,document.querySelector('.quick-layers'),$('weatherPanel'),$('layersPanel'),$('newsPanel'));$('workspace').append(controlDock);
dockTabs.addEventListener('keydown',event=>{const tabs=[...dockTabs.children],index=tabs.indexOf(document.activeElement);if(index<0)return;let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();tabs[next].focus();showView(tabs[next].dataset.view)});
const mobileLayout=()=>window.matchMedia('(max-width:760px)').matches;
function syncWeatherPanel(){
 const open=$('workspace').dataset.view==='weather',layers=$('workspace').dataset.view==='layers';
 $('weatherPanel').hidden=!open;$('weatherPanelToggle').setAttribute('aria-expanded',String(open));
 $('weatherPanelToggle').textContent=open?'‹ ປິດແຜງ':'⌖ ພື້ນທີ່ / ອາກາດ';
 $('newsPanel').hidden=$('workspace').dataset.view!=='news';$('layersPanel').hidden=!layers;$('layersPanelToggle').setAttribute('aria-expanded',String(layers));
 $('layersPanelToggle').textContent=layers?'ປິດແຜງ ›':'☷ ຊັ້ນຂໍ້ມູນ';
 $('workspace').classList.toggle('weather-collapsed',!open);map?.resize();
}
function adminPadding(){
 const timeline=document.querySelector('.timeline'),height=$('map').getBoundingClientRect().height,bottom=Math.min(height*.45,timeline.getBoundingClientRect().height+parseFloat(getComputedStyle(timeline).bottom)+16);
 // Phones (compact A): leave room for the search row and weather chip (top), the edge layer column
 // (right) and the timeline on the bottom bar.
 if(mobileLayout())return {top:Math.min(height*.2,110),right:52,bottom:Math.min(height*.4,bottom),left:12};
 return {top:120,right:45,bottom,left:$('workspace').dataset.view==='map'?45:controlDock.getBoundingClientRect().width+24};
}
$('weatherPanelToggle').addEventListener('click',()=>showView($('workspace').dataset.view==='weather'?'map':'weather'));
$('layersPanelToggle').addEventListener('click',()=>showView($('workspace').dataset.view==='layers'?'map':'layers'));
window.matchMedia('(max-width:760px)').addEventListener('change',syncWeatherPanel);
syncWeatherPanel();
function showView(view){if(view==='weather')weatherCollapsed=false;$('workspace').dataset.view=view;document.querySelectorAll('button[data-view]').forEach(b=>{const active=b.dataset.view===view;b.classList.toggle('active',active);if(b.getAttribute('role')==='tab'){b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1}});if(view==='weather')$('weatherPanel').scrollTop=0;if(view==='layers')$('layersPanel').scrollTop=0;if(view==='news')$('newsPanel').scrollTop=0;syncWeatherPanel()}
document.querySelectorAll('button[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
const panelGroups=['map','map','radar','radar','terrain','terrain','terrain'];
[...$('layersPanel').querySelectorAll(':scope > section')].forEach((section,i)=>section.dataset.layerGroup=panelGroups[i]);
function showLayerTab(tab){$('layersPanel').querySelectorAll('[data-layer-group]').forEach(s=>s.hidden=s.dataset.layerGroup!==tab);document.querySelectorAll('[data-layer-tab]').forEach(b=>{const active=b.dataset.layerTab===tab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});$('layersPanel').scrollTop=0}
document.querySelectorAll('[data-layer-tab]').forEach(b=>b.addEventListener('click',()=>showLayerTab(b.dataset.layerTab)));
showLayerTab('map');
document.querySelectorAll('[data-sources]').forEach(b=>b.addEventListener('click',()=>$('sourcesDialog').showModal()));
// Phone layout: search, weather card, floating layer buttons, icon bar (before feedback binds its buttons).
setupAppShell({controlDock});
// Phone alerts: invitation bar + News-tab settings (dist/push.js). Shows nothing until the server has its key.
setupPush({toast}).catch(()=>{});
// Station history (saved by the cron every 30 min); opened from the rain-gauge popups.
const historyDialog=setupHistoryDialog({dialog:$('historyDialog')});
// Visitor feedback (anonymous, Lao): button in the top bar, dialog in index.html.
setupFeedback({openButtons:[...document.querySelectorAll('[data-feedback-open]')],dialog:$('feedbackDialog'),currentView:()=>$('workspace').dataset.view});
// Anonymous "online now / visitors today" counts for the owner's admin page.
startVisits({currentView:()=>$('workspace').dataset.view});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}}));
function baseStyle(){return{version:8,sources:{satellite:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,attribution:'Tiles © Esri'},street:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,attribution:'© OpenStreetMap contributors'}},layers:[{id:'satellite',type:'raster',source:'satellite',paint:{'raster-saturation':-.3,'raster-brightness-max':.88}},{id:'street',type:'raster',source:'street',layout:{visibility:'none'}}]}}
function adminLabel(feature){return feature.properties.name_lo}
function setAdminSources(){if(!ready)return;map.getSource('lao-provinces')?.setData(adminData.provinces);map.getSource('lao-districts')?.setData(adminData.districts)}
async function loadAdminBoundaries(){try{const [provinces,districts]=await Promise.all([getJSON('./data/admin/provinces.geojson'),getJSON('./data/admin/districts.geojson')]);if(provinces.features?.length!==18||districts.features?.length!==148||districts.features.some(feature=>!feature.properties.name_lo))throw new Error('admin');adminData={provinces,districts};$('adminSummary').textContent=`ຄົບ ${provinces.features.length} ແຂວງ · ${districts.features.length} ເມືອງທົ່ວປະເທດ`;populateProvinces();setAdminSources()}catch(e){$('adminSummary').textContent='ຂອບເຂດປົກຄອງໂຫຼດບໍ່ສຳເລັດ';$('provinceSelect').innerHTML='<option value="">ລາຍຊື່ແຂວງບໍ່ພ້ອມ</option>';toast('ລາຍຊື່ແຂວງ/ເມືອງບໍ່ພ້ອມ')}}
function addAdminLayers(){map.addSource('lao-provinces',{type:'geojson',data:adminData.provinces,attribution:'geoBoundaries / OpenStreetMap / ODbL 1.0'});map.addSource('lao-districts',{type:'geojson',data:adminData.districts,attribution:'geoBoundaries / OpenStreetMap / ODbL 1.0'});map.addSource('admin-selection',{type:'geojson',data:EMPTY_COLLECTION});map.addLayer({id:'admin-province-fill',type:'fill',source:'lao-provinces',paint:{'fill-color':'#1684ef','fill-opacity':.025}});map.addLayer({id:'admin-province-line',type:'line',source:'lao-provinces',paint:{'line-color':'#e9f5ff','line-width':['interpolate',['linear'],['zoom'],5,1.4,9,2.5],'line-opacity':.95}});map.addLayer({id:'admin-district-line',type:'line',source:'lao-districts',minzoom:6.6,paint:{'line-color':'#aad5f5','line-width':['interpolate',['linear'],['zoom'],6.6,.45,11,1.4],'line-opacity':.8,'line-dasharray':[2,2]}});map.addLayer({id:'admin-selection-fill',type:'fill',source:'admin-selection',paint:{'fill-color':'#24a4ff','fill-opacity':.18}});map.addLayer({id:'admin-selection-line',type:'line',source:'admin-selection',paint:{'line-color':'#ffe066','line-width':4,'line-opacity':1}})}
// Boundary colours follow the base map: light lines on satellite imagery, dark gray (option D,
// 21 Oct 2026) on the light street map where white lines disappear.
const ADMIN_LINES={satellite:{province:'#e9f5ff',district:'#aad5f5',fill:'#1684ef',fillOpacity:.025,provinceWidth:[1.4,2.5],districtWidth:[.45,1.4],districtOpacity:.8},street:{province:'#334155',district:'#64748b',fill:'#334155',fillOpacity:.04,provinceWidth:[1.8,3],districtWidth:[.8,1.6],districtOpacity:.85}};
function styleAdminLines(satellite){
 if(!ready||!map.getLayer('admin-province-line'))return;const s=ADMIN_LINES[satellite?'satellite':'street'];
 map.setPaintProperty('admin-province-line','line-color',s.province);map.setPaintProperty('admin-province-line','line-width',['interpolate',['linear'],['zoom'],5,s.provinceWidth[0],9,s.provinceWidth[1]]);
 map.setPaintProperty('admin-district-line','line-color',s.district);map.setPaintProperty('admin-district-line','line-width',['interpolate',['linear'],['zoom'],6.6,s.districtWidth[0],11,s.districtWidth[1]]);map.setPaintProperty('admin-district-line','line-opacity',s.districtOpacity);
 map.setPaintProperty('admin-province-fill','fill-color',s.fill);map.setPaintProperty('admin-province-fill','fill-opacity',s.fillOpacity);
}
function bringAdminToFront(){if(!ready)return;['admin-province-fill','admin-province-line','admin-district-line','admin-selection-fill','admin-selection-line','dam-route','dams',...STORM_LAYERS].forEach(id=>{if(map.getLayer(id))map.moveLayer(id)})}
function replaceSelectOptions(select,placeholder,features){select.replaceChildren(new Option(placeholder,''));for(const feature of features){const p=feature.properties;select.add(new Option(p.name_lo,p.id))}}
function populateProvinces(){const provinces=[...adminData.provinces.features].sort((a,b)=>adminLabel(a).localeCompare(adminLabel(b),'lo'));replaceSelectOptions($('provinceSelect'),'ເລືອກແຂວງ',provinces);$('provinceSelect').disabled=false}
function populateDistricts(provinceId){const districts=adminData.districts.features.filter(feature=>feature.properties.parent_id===provinceId).sort((a,b)=>adminLabel(a).localeCompare(adminLabel(b),'lo'));replaceSelectOptions($('districtSelect'),districts.length?'ເລືອກເມືອງ':'ບໍ່ພົບລາຍຊື່ເມືອງ',districts);$('districtSelect').disabled=!districts.length;$('adminSummary').textContent=districts.length?`${districts.length} ເມືອງໃນແຂວງນີ້ · 148 ເມືອງທົ່ວປະເທດ`:'ບໍ່ພົບລາຍຊື່ເມືອງໃນແຂວງນີ້'}
function selectAdmin(feature){selectedAdmin=feature;const p=feature.properties,[lon,lat]=p.center,b=p.bbox;current={name:adminLabel(feature),lat,lon,zoom:p.level==='province'?7:9,id:null};$('selectedPlace').querySelector('strong').textContent=adminLabel(feature);$('selectedPlace').querySelector('span').textContent=p.level==='province'?'ຂອບເຂດແຂວງ':`ເມືອງໃນແຂວງ${p.parent_lo}`;$('googleMapsLink').href=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat+','+lon)}`;map?.getSource('admin-selection')?.setData({type:'FeatureCollection',features:[feature]});map?.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:adminPadding(),maxZoom:p.level==='province'?8.2:10.5,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:900});marker?.setLngLat([lon,lat]);$('mapHint').textContent=p.level==='province'?`${adminLabel(feature)} · ກຳລັງສະແດງຂອບເຂດແຂວງ`:`${adminLabel(feature)} · ກຳລັງສະແດງຂອບເຂດເມືອງ`;loadWeather();loadTerrain()}
function setupAdminPickers(){$('provinceSelect').addEventListener('change',e=>{const feature=adminData.provinces.features.find(item=>item.properties.id===e.target.value);$('districtSelect').value='';if(!feature){replaceSelectOptions($('districtSelect'),'ເລືອກແຂວງກ່ອນ',[]);$('districtSelect').disabled=true;return}populateDistricts(feature.properties.id);selectAdmin(feature)});$('districtSelect').addEventListener('change',e=>{const feature=adminData.districts.features.find(item=>item.properties.id===e.target.value);if(feature)selectAdmin(feature)})}
function visibility(id,on){if(ready&&map.getLayer(id))map.setLayoutProperty(id,'visibility',on?'visible':'none')}
function updateStatus(){const parts=[];if(radarPast.length)parts.push(`${radarError?'ເຣດາອັບເດດບໍ່ສຳເລັດ · ':''}ເຣດາ ${stamp((radarPast.at(-1)||frames.at(-1)).time*1000)} · ອາຍຸ ${age((radarPast.at(-1)||frames.at(-1)).time*1000)}`);else parts.push(radarError?'ເຣດາບໍ່ພ້ອມ':'ເຣດາກຳລັງໂຫຼດ');if(imergTimes.length)parts.push(`${imergError?'IMERG ອັບເດດບໍ່ສຳເລັດ · ':''}IMERG ${stamp(imergTimes.at(-1))} · ອາຍຸ ${age(imergTimes.at(-1))}`);else parts.push(imergError?'IMERG ບໍ່ພ້ອມ':'IMERG ກຳລັງໂຫຼດ');parts.push(cloudTimes.length?(cloudError?'Himawari ອັບເດດບໍ່ສຳເລັດ · ':'')+'Himawari '+stamp(cloudTimes.at(-1))+' · ອາຍຸ '+age(cloudTimes.at(-1)):cloudError?'Himawari ບໍ່ພ້ອມ':'Himawari ກຳລັງໂຫຼດ');$('dataStatus').textContent=parts.find(p=>p.includes(activeTime==='cloud'||activeTime==='motion'?'Himawari':activeTime==='imerg'?'IMERG':'ເຣດາ'))||parts[0];$('dataStatus').title=parts.join(' | ')}
function raster(id,tiles,attribution,opacity=.7,maxzoom=7){if(!ready)return;if(['cloud','imerg'].includes(id)&&$('smoothImageryToggle').checked)tiles=tiles.map(url=>url.replace(/^https:\/\//,'smooth-gibs://'));if(map.getSource(id)){if(map.getSource(id).tiles?.[0]!==tiles[0]){if(imageHealth[id])imageHealth[id]={state:'loading',errors:0};map.getSource(id).setTiles(tiles)}renderImageHealth();return}if(imageHealth[id])imageHealth[id]={state:'loading',errors:0};map.addSource(id,{type:'raster',tiles,tileSize:256,maxzoom,attribution});map.addLayer({id,type:'raster',source:id,layout:{visibility:enabled(id)?'visible':'none'},paint:{'raster-opacity':opacity,'raster-fade-duration':0,'raster-resampling':'linear'}});bringAdminToFront();renderImageHealth()}
function clearRadarImage(){if(!ready)return;if(map.getLayer('radar'))map.removeLayer('radar');if(map.getSource('radar'))map.removeSource('radar')}
function radarName(){return radar?.name||'RainViewer'}
function setRadarFrame(){if(activeTime==='radar'&&!playing)timelineFrame(timelineCursor)}

function setIMERGFrame(){if(activeTime==='imerg'&&!playing)timelineFrame(timelineCursor)}

function stopPlay(){playToken++;clearTimeout(liveFrameRetry);liveFrameRetry=null;player.cancel();frameTicket++;frameRenderer?.cancelAll();playing=null;playbackStatus('');$('playBtn').textContent='▶ Run ×3';$('playBtn').setAttribute('aria-label',motionMode?'ຫຼິ້ນເມກເຄື່ອນ':forecastMode?'ຫຼິ້ນພະຍາກອນຝົນ':'ຫຼິ້ນພາບຍ້ອນຫຼັງ')}
function updateTimeline(){
 if(playing)return;if(motionMode){updateMotionTimeline();return}visibility('cloud-motion',false);visibility('cloud-motion-boundary',false);if(forecastMode){updateForecastTimeline();return}visibility('forecast-rain',false);visibility('forecast-boundary',false);const selected=$('timelineSource').value;activeTime=selected==='auto'?(enabled('cloud')?'cloud':enabled('imerg')?'imerg':'radar'):selected;
 const times=activeTime==='cloud'?cloudTimes.map(Date.parse):activeTime==='imerg'?imergTimes.map(Date.parse):frames.map(f=>f.time*1000),on=enabled(activeTime);
 const hold=activeTime==='imerg'?30:activeTime==='cloud'?10:radar?.provider==='thailand'?15:radar?.provider==='china'?6:10;
 const stepMs=(activeTime==='imerg'?30:activeTime==='radar'&&radar?.provider==='thailand'?15:10)*60000,windowMs=timelineWindow(times,stepMs);timeSlots=buildTimeline(times,hold,windowMs,stepMs);const key=activeTime+':'+(radar?.provider||'')+':'+times.at(-1);if(key!==timelineKey){timelineCursor=followLatest?timeSlots.length-1:cursorAtTime(timeSlots,selectedTime,timeSlots.length-1);timelineKey=key}else if(followLatest)timelineCursor=timeSlots.length-1;timelineCursor=Math.min(timelineCursor,Math.max(0,timeSlots.length-1));
 $('timelineTitle').textContent=activeTime==='cloud'?cloudTimelineTitle(cloudProvider):activeTime==='imerg'?'IMERG · ຝົນ':radarName()+' · ເຣດາ';
 $('timeSlider').max=Math.max(0,timeSlots.length-1);$('timeSlider').disabled=!times.length||!on;$('playBtn').disabled=!times.length||!on;
 $('timeSlider').setAttribute('aria-label','ຍ້ອນຫຼັງ '+windowLabel(windowMs)+' · ຂັ້ນ '+stepMs/60000+' ນາທີ');
 const available=times.length?Math.min(HISTORY_WINDOW/60000,Math.round((times.at(-1)-times[0])/60000)):0;
 $('latestBtn').hidden=false;$('latestBtn').setAttribute('aria-pressed',String(followLatest));
 updateImageFreshness();
 $('timelineCoverage').textContent=windowLabel(windowMs)+(windowMs<HISTORY_WINDOW?' (ແຫຼ່ງນີ້ມີຍ້ອນຫຼັງເທົ່ານີ້'+(activeTime==='radar'?' · ຢາກເບິ່ງຍາວກວ່າ ເລືອກເຣດາໄທ TMD ຫຼື ພາບເມກ':'')+')':'')+' · ຂັ້ນ '+stepMs/60000+' ນາທີ (ຕາມພາບຕົ້ນທາງ) · ເຊັກພາບໃໝ່ທຸກ 1 ນາທີ'+(followLatest?' · ຕິດຕາມພາບໃໝ່ອັດຕະໂນມັດ':' · ກຳລັງເບິ່ງຍ້ອນຫຼັງ')+(available<windowMs/60000-10?' · ຊ່ວງພາບທີ່ມີ '+available+' ນາທີ · ຂ້າມຊ່ວງທີ່ຂາດ':'');
 const check=feedChecks[activeTime];if(check?.checkedAt)$('timelineCoverage').textContent+=' · ເຊັກ '+timeFmt.format(new Date(check.checkedAt))+(check.state==='unchanged'?' · ຍັງບໍ່ມີພາບໃໝ່':check.state==='error'?' · ຕິດຕໍ່ບໍ່ສຳເລັດ':'');
 if(activeTime==='cloud'&&cloudTimes.length)$('timelineCoverage').textContent+=' · ພາບໃໝ່ສຸດ '+timeFmt.format(new Date(cloudTimes.at(-1)))+' · ອາຍຸ '+age(cloudTimes.at(-1))+(sourceLate(cloudProvider,cloudTimes.at(-1))?' · ຕົ້ນທາງລ່າຊ້າ':'');
 if(!times.length)$('frameTime').textContent=(activeTime==='cloud'?cloudError:activeTime==='imerg'?imergError:radarError)?'ຂໍ້ມູນບໍ່ພ້ອມ · ລອງໃໝ່ອັດຕະໂນມັດ':'ກຳລັງໂຫຼດພາບ…';else if(!on)$('frameTime').textContent='ຊັ້ນຂໍ້ມູນປິດຢູ່';else timelineFrame(timelineCursor);updateLegend();updateStatus()
}
function updateLegend(){if(motionMode){cloudMotionLegend();return}if(forecastMode){$('mapLegend').innerHTML='<span>ຝົນພະຍາກອນ · mm / 1 ຊົ່ວໂມງ</span><span class="forecast-swatches"><i style="background:#9a82e5"></i>0.1–1 <i style="background:#7357d1"></i>1–5 <i style="background:#5840b1"></i>5–10 <i style="background:#b747a0"></i>10–20 <i style="background:#dd6580"></i>20+</span><span>ສີເທົາ: ຂາດຂໍ້ມູນ · ບໍ່ມີຂໍ້ມູນນອກເສັ້ນສີມ່ວງ</span><span>ສີລະຫວ່າງຈຸດກຣິດ ~55 km ປັບໃຫ້ນຸ່ມເພື່ອອ່ານງ່າຍ · ຄ່າ mm ໃນປ໊ອບອັບມາຈາກກຣິດ</span><span>ບໍ່ມີສີໃນຂອບ: &lt;0.1 mm · ບໍ່ຢືນຢັນວ່າບໍ່ມີຝົນ</span><span>GFS ອອກຮອບໃໝ່ທຸກ 6 ຊົ່ວໂມງ · ດາວນ໌ໂຫຼດໃໝ່ເມື່ອມີຮອບໃໝ່ · ເວລາຮອບ ແລະ ເວລາດາວນ໌ໂຫຼດສະແດງໃນລາຍລະອຽດ</span><a href="https://open-meteo.com/en/docs/gfs-api" target="_blank" rel="noreferrer">NOAA GFS / Open-Meteo</a>';return}if(enabled('radar')&&radar?.coordinates){$('mapLegend').textContent=radarName()+' · '+radar.units+' · ສີຕາມຕົ້ນທາງ';return}if(enabled('radar')&&radar?.display==='chart'){$('mapLegend').textContent='NMC · ກົດເບິ່ງພາບຈີນ · ບໍ່ມີເຣດາຈີນຊ້ອນແຜນທີ່';return}if(enabled('cloud')&&(shownCloudProvider||cloudProvider)==='jma'){$('mapLegend').innerHTML='<span>JMA Himawari · Band 13 · ພາບອິນຟຣາເຣດສີເທົາ</span><span class="jma-gray-scale" aria-hidden="true"></span><span>ສີອ່ອນ: ຍອດເມກເຢັນ · ບໍ່ແມ່ນອັດຕາຝົນ</span><span>ປັບຂະໜາດພາບໃຫ້ນຸ່ມ · ບໍ່ເພີ່ມລາຍລະອຽດຕົ້ນທາງ</span><a href="https://www.jma.go.jp/bosai/himawari/" target="_blank" rel="noreferrer">JMA · ປັບການສະແດງຜົນສຳລັບແຜນທີ່ນີ້</a>';return}if(enabled('cloud')){$('mapLegend').innerHTML='<span>Himawari · ອຸນຫະພູມຄວາມສະຫວ່າງ (°C) · ບໍ່ແມ່ນປະລິມານຝົນ</span><img class="cloud-legend" src="https://gibs.earthdata.nasa.gov/legends/Clean_Longwave_Infrared_Window_Band_H.svg" alt="Himawari brightness temperature °C">';return}if(enabled('risk')){$('mapLegend').innerHTML='<span class="swatch" style="background:#f4cc62"></span>ຄັດກອງຕ່ຳ <span class="swatch" style="background:#f09933"></span>ປານກາງ <span class="swatch" style="background:#db4c40"></span>ສູງ · ພື້ນທີ່ບໍ່ມີສີບໍ່ໄດ້ແປວ່າປອດໄພ';return}if(enabled('elevation')&&grid){const min=Math.min(...grid.values),max=Math.max(...grid.values);$('mapLegend').innerHTML=`<span>${Math.round(min)} m</span><div style="background:linear-gradient(to right,#2d98cf,#eb4325);height:8px;width:90px;border-radius:4px"></div><span>${Math.round(max)} m · ຄວາມສູງ</span>`;return}if(enabled('imerg')){$('mapLegend').innerHTML='<span>IMERG · mm/h · ບໍ່ແມ່ນຄວາມເລິກນ້ຳ</span><a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noreferrer">ສີ/ຄ່າໃນ Worldview</a>';return}$('mapLegend').innerHTML='<span>ເຣດາ: ອ່ອນ</span><div class="legend-gradient" style="width:85px;margin:0"></div><span>ແຮງ · ບໍ່ມີສີອາດບໍ່ມີຂໍ້ມູນ</span>'}
// Official pages (Facebook etc.) listed in data/news-links.json; https links only.
function safePageLinks(data){return (data?.links||[]).filter(l=>l&&typeof l.name==='string'&&/^https:\/\/[^\s"'<>]+$/.test(l.url||'')).slice(0,20)}
function loadPageLinks(){return getJSON('./data/news-links.json',null,true).then(data=>{const box=$('pageLinks');if(!box)return;box.replaceChildren(...safePageLinks(data).map(l=>{const a=document.createElement('a'),name=document.createElement('strong'),note=document.createElement('span'),host=new URL(l.url).hostname.replace(/^(www|m)\./,'');a.className='page-link'+(/facebook\.com$|fb\.com$/.test(host)?' facebook':'');a.href=l.url;a.target='_blank';a.rel='noopener noreferrer';name.textContent=l.name;note.textContent=(l.note?l.note+' · ':'')+host;a.append(name,note);return a}))}).catch(()=>{})}// ---------- Dams, river levels, dam release notices and DMH/KPL news ----------
let damData=null,noticeData=null,riverData=null,newsData=null;
function loadDams(){return getJSON('./data/dams.json').then(d=>{if(d?.kind!=='hydropower_dams'||!Array.isArray(d.dams))throw new Error('dams');damData=d;renderDams();renderAlerts()}).catch(()=>{})}
function loadNotices(){return getJSON('./data/dam-notices.json',null,true).then(d=>{noticeData=d;renderDams();renderAlerts()}).catch(()=>{})}
function loadRiverLevels(){return getJSON('/api/rivers/levels',null,true).then(d=>{if(d?.kind!=='river_levels')throw new Error('levels');riverData=d;gaugeRendered=null;renderGauges();renderAlerts()}).catch(()=>{renderAlerts()})}
function loadNews(){return getJSON('/api/news/weather',null,true).then(d=>{if(d?.kind!=='weather_news')throw new Error('news');newsData=d;renderAlerts()}).catch(()=>{newsData=newsData||{items:[],failed:true};renderAlerts()})}
// Dam bar symbol (option C, 21 Oct 2026): a blue capsule laid across the river, orange when the dam
// has an active release notice. Drawn at 2×; the transparent margin above and below keeps a
// finger-sized tap area around the thin bar.
function addDamBars(){
 for(const [id,fill] of [['dam-bar','#0ea5e9'],['dam-bar-warn','#f59e0b']]){if(map.hasImage(id))continue;
  const c=document.createElement('canvas');c.width=76;c.height=44;const g=c.getContext('2d'),x=4,y=12,w=68,h=20,r=h/2;
  g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();
  g.fillStyle=fill;g.fill();g.lineWidth=4;g.strokeStyle='#fff';g.stroke();map.addImage(id,g.getImageData(0,0,c.width,c.height),{pixelRatio:2})}
}
// Dam card (option C, 21 Oct 2026): the water path drawn top to bottom — the dam and its release
// notices, then each MRC station below it with distance and level, then the end of the route.
function damCard(d,routed){
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
 const node=el('div','dam-card'),flow=el('ol','dam-flow');
 node.append(el('strong','dam-name','ເຂື່ອນ '+d.name),el('div','dam-sub',[d.mw&&d.mw+' MW',d.year&&'ເປີດໃຊ້ '+d.year,d.province&&'ແຂວງ'+d.province].filter(Boolean).join(' · ')));
 if(d.river)node.append(el('div','dam-sub','ແມ່ນ້ຳ '+d.river));
 const notices=activeNotices(noticeData).filter(n=>n.dam===d.name),top=el('li','dam-node dam-top'+(notices.length?' warn':''));
 top.append(el('b','','ເຂື່ອນ'),el('span','dam-note',notices.length?' · ມີປະກາດລະບາຍນ້ຳ':' · ບໍ່ມີປະກາດລະບາຍນ້ຳທີ່ບັນທຶກໄວ້'));
 for(const n of notices){const a=el('a','dam-notice','⚠ '+n.from+' · '+n.summary);a.href=n.source;a.target='_blank';a.rel='noreferrer';top.append(a)}
 flow.append(top);
 if(routed){
  if(!riverData)flow.append(el('li','dam-node st wait','ກຳລັງໂຫຼດລະດັບນ້ຳ MRC…'));
  else{const below=stationsBelowDam(riverNet,d,riverData.stations).slice(0,4);
   if(!below.length)flow.append(el('li','dam-node st none','ບໍ່ມີສະຖານີວັດລະດັບນ້ຳ MRC ໃນ '+ROUTE_KM+' km ທ້າຍເຂື່ອນ'));
   for(const b of below){const s=b.station,state=s.stale?'stale':s.status,li=el('li','dam-node st '+state);
    li.append(el('b','',s.name),el('span','dam-km',' · '+(b.km<10?'ໃກ້ເຂື່ອນ':'+'+roundKm(b.km)+' km')),el('div','dam-level',s.level.toFixed(2)+' m · '+(s.stale?'ຂໍ້ມູນເກົ່າ':RIVER_STATUS[s.status]||'ປົກກະຕິ')));flow.append(li)}}
  const rivers=routeRivers(downstream(riverNet,riverNet.dams[d.name].reach,ROUTE_KM));
  flow.append(el('li','dam-node end','ເສັ້ນສີສົ້ມ: ທາງນ້ຳທ້າຍເຂື່ອນ '+ROUTE_KM+' km'+(rivers.length?' · '+rivers.map(r=>r.name).join(' → '):'')));
 }
 node.append(flow);
 const second=String(d.river||'').split('/')[1];if(routed&&second)node.append(el('p','dam-sub','ເຂື່ອນນີ້ຜັນນ້ຳຜ່ານກັງຫັນໄປລຳນ້ຳ '+second.trim()+' · ເສັ້ນສີສົ້ມແມ່ນລຳນ້ຳທຳມະຊາດ (ທາງນ້ຳລົ້ນ)'));
 node.append(el('p','dam-src',[d.source==='osm'?'OpenStreetMap':'Wikipedia',routed&&'HydroRIVERS + OpenStreetMap',routed&&'MRC','ຕຳແໜ່ງໂດຍປະມານ · ບໍ່ແມ່ນລາຍຊື່ທາງການ'].filter(Boolean).join(' · ')));
 return node;
}
function renderDams(){
 if(!ready||!damData)return;addDamBars();const warned=new Set(activeNotices(noticeData).map(n=>n.dam));
 const data={type:'FeatureCollection',features:damData.dams.map((d,i)=>({type:'Feature',id:i,properties:{i,mw:d.mw||1,angle:damBarAngle(riverNet,d),warn:warned.has(d.name)},geometry:{type:'Point',coordinates:[d.lon,d.lat]}}))};
 if(map.getSource('dams'))map.getSource('dams').setData(data);
 else{map.addSource('dams',{type:'geojson',attribution:'Dams: Wikipedia (CC BY-SA) · © OpenStreetMap',data});map.addLayer({id:'dams',type:'symbol',source:'dams',layout:{'icon-image':['case',['get','warn'],'dam-bar-warn','dam-bar'],'icon-rotate':['get','angle'],'icon-rotation-alignment':'map','icon-size':['interpolate',['linear'],['zoom'],5,['interpolate',['linear'],['sqrt',['get','mw']],1,.28,36,.55],10,['interpolate',['linear'],['sqrt',['get','mw']],1,.7,36,1.2]],'icon-allow-overlap':true,'icon-ignore-placement':true,'symbol-sort-key':['case',['get','warn'],100000,['-',0,['get','mw']]]}});
  map.on('click','dams',e=>{const d=damData.dams[e.features[0].properties.i];if(!d)return;
   const routed=showDamRoute(d),node=damCard(d,routed);
   const popup=new maplibregl.Popup({offset:10,className:'dam-pop',maxWidth:'300px',...(routed?{anchor:popupSide(d,routed)}:{})}).setLngLat([d.lon,d.lat]).setDOMContent(node).addTo(map);popup.on('close',()=>{if(shownRoute===d.name)showDamRoute(null)});
   if(routed)frameDamRoute(d,routed,popup)});
  map.on('mouseenter','dams',()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave','dams',()=>map.getCanvas().style.cursor='')}
 visibility('dams',enabled('dams'));bringAdminToFront();
}
// ---------- Rivers (HydroRIVERS) and the route below a dam ----------
let riverNet=null,shownRoute=null;
function loadRivers(){return getJSON('./data/rivers.json').then(d=>{riverNet=indexRivers(d);if(!riverNet)throw new Error('rivers');renderRivers();renderDams();renderAlerts()}).catch(()=>{})}
function lineFeature(coordinates,properties={}){return {type:'Feature',properties,geometry:{type:'LineString',coordinates}}}
function renderRivers(){
 if(!ready||!riverNet||map.getSource('rivers'))return visibility('rivers',enabled('rivers'));
 const features=[];for(const r of riverNet.byId.values())if(r.cls)features.push(lineFeature(routeLines([{reach:r}])[0],{upland:r.upland}));
 const before=map.getLayer('dams')?'dams':undefined;
 map.addSource('rivers',{type:'geojson',attribution:'HydroRIVERS © WWF / HydroSHEDS · river names and channels © OpenStreetMap (ODbL)',data:{type:'FeatureCollection',features}});
 map.addLayer({id:'rivers',type:'line',source:'rivers',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#4db8ff','line-opacity':.9,'line-width':['interpolate',['linear'],['zoom'],5,['interpolate',['linear'],['get','upland'],5000,1.1,100000,2,500000,3.4],10,['interpolate',['linear'],['get','upland'],5000,2,100000,3.5,500000,6]]}},before);
 map.addSource('dam-route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
 map.addLayer({id:'dam-route',type:'line',source:'dam-route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ef6c00','line-width':['interpolate',['linear'],['zoom'],5,2.5,10,5],'line-opacity':.95}},before);
 visibility('rivers',enabled('rivers'));
}
// Draws the dam's downstream route (ROUTE_KM) in orange; null clears it.
function showDamRoute(dam){
 shownRoute=dam?.name||null;const src=ready&&map.getSource('dam-route');if(!src)return false;
 const route=dam&&riverNet?.dams?.[dam.name],path=route?downstream(riverNet,route.reach,ROUTE_KM):[];
 const lines=routeLines(path);src.setData({type:'FeatureCollection',features:lines.map(c=>lineFeature(c))});return path.length?lines.flat():null;
}
// Fit dam + route with room for the popup on its side (see popupSide), so it never covers the route.
function frameDamRoute(dam,points,popup){
 const box=popup.getElement().getBoundingClientRect(),anchor=popup.options.anchor,pad={top:40,bottom:40,left:40,right:40};
 // Anchor 'bottom' = popup above the point, so the room is needed at the top, etc.
 const side={bottom:'top',top:'bottom',right:'left',left:'right'}[anchor];pad[side]+=Math.round(side==='top'||side==='bottom'?box.height:box.width);
 const c=map.getContainer();if(pad.top+pad.bottom>c.clientHeight*.9||pad.left+pad.right>c.clientWidth*.9)pad[side]=40;
 let w=dam.lon,e=dam.lon,s=dam.lat,n=dam.lat;for(const [lon,lat] of points){w=Math.min(w,lon);e=Math.max(e,lon);s=Math.min(s,lat);n=Math.max(n,lat)}
 map.fitBounds([[w,s],[e,n]],{padding:pad,maxZoom:9,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:700});
}
function alertItem(kind,title,detail,href){
 const li=document.createElement('li');li.className='alert-item '+kind;const strong=document.createElement('strong');strong.textContent=title;li.append(strong);
 if(detail){const p=document.createElement('span');p.textContent=detail;li.append(p)}
 if(href){const a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noreferrer';a.textContent='ເບິ່ງຕົ້ນທາງ ↗';li.append(a)}
 return li;
}
// Active tropical cyclones (JMA, /api/storms) for the alerts list; the button opens /storm.
let stormList=[];const loadStorms=()=>fetch('/api/storms').then(r=>r.ok?r.json():null).then(d=>{stormList=(d?.storms||[]).filter(s=>s.category&&s.category!=='LOW').sort((a,b)=>a.closest.km-b.closest.km);renderAlerts()}).catch(()=>{});
function renderAlerts(){
 const list=$('alertList'),news=$('newsList');if(!list||!news)return;const now=Date.now(),items=[];
 for(const w of recentWarnings(newsData,now))items.push(alertItem('warning','⚠ '+w.title,w.date+' · KPL'+(w.dmh?' · ກົມອຸຕຸນິຍົມ':''),w.url));
 // Very heavy rain at MRC gauges in Laos (measured, not forecast).
 for(const s of rainAlerts(gaugeData))items.push(alertItem('rain','🌧 ຝົນຕົກໜັກຫຼາຍ · '+s.name+(s.river?' · ແມ່ນ້ຳ '+s.river:''),rainAlertText(s)+' · ວັດ '+timeFmt.format(new Date(s.time))+' · MRC','https://monitoring.mrcmekong.org/station/'+s.id));
 for(const n of activeNotices(noticeData,now))items.push(alertItem('dam','🌊 ເຂື່ອນ '+n.dam+' ປະກາດລະບາຍນ້ຳ',(n.province?n.province+' · ':'')+'ເລີ່ມ '+n.from+' · '+n.summary,n.source));
 for(const s of riverAlerts(riverData)){const dams=damsForStation(riverNet,damData,s);items.push(alertItem('river','〰 '+s.name+' · ແມ່ນ້ຳ '+s.river,riverAlertText(s)+' · ວັດ '+timeFmt.format(new Date(s.time))+(dams.length?' · ເຂື່ອນເໜືອນ້ຳ'+(riverNet?' (ຕາມເສັ້ນທາງນ້ຳ ≤'+ROUTE_KM+' km)':'')+': '+damListText(dams)+' (ອາດມາຈາກການລະບາຍນ້ຳ ຫຼື ຝົນຕົ້ນນ້ຳ)':''),'https://monitoring.mrcmekong.org/station/'+s.id))}
 // Tropical cyclones (JMA): each with a button into storm tracking mode. One within 1,000 km of Laos is
 // listed first; a far one last.
 const STORM_CAT={TY:'ໄຕ້ຝຸ່ນ',STS:'ພາຍຸໂຊນຮ້ອນແຮງ',TS:'ພາຍຸໂຊນຮ້ອນ',TD:'ພາຍຸດີເປຣຊັນ',SCS:'ພາຍຸໄຊໂຄລນກຳລັງແຮງ',CS:'ພາຍຸໄຊໂຄລນ'},stormItems=[];
 for(const s of stormList){const p=s.points[0],li=alertItem('storm'+(s.level==='far'?' far':''),(STORM_CAT[s.category]||'ພາຍຸ')+' '+(s.name||'')+(s.level==='near'?' · ໃກ້ລາວ':s.level==='watch'?' · ເຝົ້າລະວັງ':' · ບໍ່ມຸ່ງໜ້າມາລາວ'),
  [Number.isFinite(p.w)?'ລົມ '+Math.round(p.w*3.6)+' km/h':'',p.p?p.p+' hPa':'',headingLao(p.course)?'ໄປ'+headingLao(p.course)+(Number.isFinite(p.kmh)?' '+p.kmh+' km/h':''):'','ຫ່າງຊາຍແດນລາວ '+p.laoKm.toLocaleString()+' km',s.agency||'JMA'].filter(Boolean).join(' · '));
  const b=document.createElement('button');b.type='button';b.className='alert-storm-go';b.textContent='ຕິດຕາມພາຍຸ ›';b.onclick=()=>{document.querySelector('.mobile-nav [data-view=map]')?.click();document.querySelector('.app-tabs [data-view=map],.dock-tabs [data-view=map]')?.click();window.stormMode?.enter(s.id)};li.append(b);stormItems.push({li,far:s.level==='far'})}
 const urgent=stormItems.filter(x=>!x.far).map(x=>x.li),calm=stormItems.filter(x=>x.far).map(x=>x.li);
 // Every active storm counts in the alert badge (it replaced the banner on the map, 22 Oct 2026).
 list.replaceChildren(...urgent,...items,...calm);items.unshift(...urgent);items.push(...calm);
 $('alertEmpty').hidden=items.length>0;$('alertEmpty').textContent=(riverData||newsData)?'ບໍ່ມີແຈ້ງເຕືອນໃນຕອນນີ້ · ກວດ '+timeFmt.format(new Date())+' · ລະດັບນ້ຳ MRC '+(riverData?riverData.stations.length+' ສະຖານີ':'ບໍ່ພ້ອມ'):'ກຳລັງກວດແຈ້ງເຕືອນ…';
 news.replaceChildren(...(newsData?.items||[]).slice(0,6).map(i=>{const li=document.createElement('li'),a=document.createElement('a'),meta=document.createElement('span');a.href=i.url;a.target='_blank';a.rel='noreferrer';a.textContent=i.title;meta.textContent=i.date+' · KPL'+(i.lang==='en'?' · EN':'');li.append(a,meta);return li}));
 $('newsEmpty').hidden=!!newsData?.items?.length;$('newsEmpty').textContent=newsData?.failed?'ດຶງຂ່າວ KPL ບໍ່ສຳເລັດ · ລອງໃໝ່ພາຍຫຼັງ':newsData?'ບໍ່ມີຂ່າວອາກາດ/ນ້ຳ ໃນ 30 ມື້ຜ່ານມາ':'ກຳລັງໂຫຼດຂ່າວ…';
 const banner=$('alertBanner'),first=items[0];banner.hidden=false;banner.classList.toggle('has-alerts',!!first);banner.querySelector('span').textContent=first?items.length+' ແຈ້ງເຕືອນ · '+first.querySelector('strong').textContent:'ແຈ້ງເຕືອນ';banner.dataset.count=first?String(items.length):'';banner.setAttribute('aria-label',first?items.length+' ແຈ້ງເຕືອນ · ເປີດລາຍລະອຽດ':'ເປີດແຈ້ງເຕືອນ');
}// ---------- Satellite rain total: IMERG, last 24 hours ----------
let accumData=null,accumJob=null;
function bitmapPixels(bitmap,width,height){const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,width,height);return ctx.getImageData(0,0,width,height).data}
function setAccumStatus(text){const n=$('accumStatus');if(n)n.textContent=text}
function loadAccumulation(){
 if(accumJob)return accumJob;
 accumJob=(async()=>{
  const day=await satelliteTimes(imergTimesURL(),domain=>imergDayTimes(domain));
  if(accumData?.latest===day.latest)return accumData;
  const times=Array.from({length:ACCUM_FRAMES},(_,i)=>day.first+i*IMERG_STEP_MS),listed=new Set(day.times),frames=new Array(times.length).fill(null),g=ACCUM_REGION;let cursor=0,done=0;
  setAccumStatus('ກຳລັງລວມຝົນ IMERG 0/'+times.length);
  await Promise.all(Array.from({length:4},async()=>{while(cursor<times.length){const i=cursor++;if(listed.has(times[i])){try{const r=await fetchResponse(imergFrameURL(times[i]),{attempts:2,timeout:15000});const bitmap=await createImageBitmap(await r.blob());try{if(bitmap.width===g.width&&bitmap.height===g.height)frames[i]=bitmapPixels(bitmap,g.width,g.height)}finally{bitmap.close()}}catch{/* Counted as missing, never filled. */}}done++;setAccumStatus('ກຳລັງລວມຝົນ IMERG '+done+'/'+times.length)}}));
  const acc=accumulate(frames);if(!acc.loaded)throw new Error('imerg');acc.latest=day.latest;accumData=acc;renderAccumulation();return acc;
 })().catch(error=>{setAccumStatus('ລວມຝົນ IMERG ບໍ່ສຳເລັດ · ລອງໃໝ່ພາຍຫຼັງ');throw error}).finally(()=>{accumJob=null});
 return accumJob;
}
function renderAccumulation(){
 if(!accumData)return;
 setAccumStatus('24 ຊົ່ວໂມງ ຈົນເຖິງ '+stamp(accumData.latest+IMERG_STEP_MS)+' · ພາບຄົບ '+accumData.loaded+'/'+accumData.expected+(accumData.complete?'':' · ຄ່າອາດຕ່ຳກວ່າຈິງ'));
 if(!ready)return;const c=document.createElement('canvas');c.width=accumData.width;c.height=accumData.height;c.getContext('2d').putImageData(new ImageData(accumulationRaster(accumData),c.width,c.height),0,0);
 const url=c.toDataURL('image/png'),coordinates=accumulationCoordinates();
 if(map.getSource('imerg-accum'))map.getSource('imerg-accum').updateImage({url,coordinates});else map.addLayer({id:'imerg-accum',type:'raster',source:(map.addSource('imerg-accum',{type:'image',url,coordinates}),'imerg-accum'),paint:{'raster-opacity':.85,'raster-fade-duration':0,'raster-resampling':'linear'}});
 visibility('imerg-accum',enabled('accum'));bringAdminToFront();
}
// ---------- Ponding screening: rain on a 10 × 10 km DEM window ----------
let pondResult=null;
function setPond(text){$('pondStatus').textContent=text}
async function pondRainInput(){
 const source=$('pondRainSource').value;
 const gauge=()=>{const near=gaugeData&&nearestGauge(gaugeData.stations,current.lon,current.lat);return near?{mm:near.station.rain24h,label:'ສະຖານີ '+near.station.name+' ('+Math.round(near.km)+' km) · 24 ຊມ ວັດ '+timeFmt.format(new Date(near.station.time))}:null};
 const imerg=async()=>{try{const acc=await loadAccumulation(),mm=accumulationAt(acc,current.lon,current.lat);return mm===null?null:{mm,label:'IMERG 24 ຊມ ຈົນເຖິງ '+stamp(acc.latest+IMERG_STEP_MS)+(acc.complete?'':' · ພາບຄົບ '+acc.loaded+'/'+acc.expected)}}catch{return null}};
 const forecast=async()=>{if(!forecastData)await loadForecast();if(!forecastData)return null;const periods=forecastPeriods(forecastData,Date.now(),3);if(periods.length!==3)return null;let sum=0;for(const p of periods){const v=forecastCellAt(forecastData,current.lon,current.lat,p.index);if(v===null)return null;sum+=v}return {mm:sum,label:'ພະຍາກອນ GFS 3 ຊມ ຂ້າງໜ້າ (ກຣິດ ~55 km)'}};
 const manual=()=>({mm:scenarioRain,label:'ຝົນສົມມຸດ (ຕັ້ງເອງ)'});
 if(source==='gauge')return gauge();if(source==='imerg')return imerg();if(source==='forecast')return forecast();if(source==='manual')return manual();
 const auto=gauge()||await imerg();return auto||{...manual(),label:'ບໍ່ມີສະຖານີ/IMERG · ໃຊ້ຝົນສົມມຸດ'};
}
async function runPonding(){
 const button=$('pondRun');button.disabled=true;const place={...current};
 try{
  setPond('ກຳລັງຫາຂໍ້ມູນຝົນ…');const rain=await pondRainInput();
  if(!rain||!Number.isFinite(rain.mm)){setPond('ບໍ່ມີຂໍ້ມູນຝົນຈາກແຫຼ່ງທີ່ເລືອກ · ລອງແຫຼ່ງອື່ນ ຫຼື ຕັ້ງເອງ');return}
  setPond('ກຳລັງໂຫຼດຄວາມສູງ…');const plan=demPlan(place.lon,place.lat),tiles=new Map();
  await Promise.all(plan.tiles.map(async t=>{const r=await fetchResponse(t.url,{attempts:2,timeout:15000}),bitmap=await createImageBitmap(await r.blob());try{tiles.set(t.x+'/'+t.y,bitmapPixels(bitmap,256,256))}finally{bitmap.close()}}));
  setPond('ກຳລັງຈຳລອງ…');await new Promise(r=>setTimeout(r,20));
  const runoff=Number($('pondRunoff').value),result=simulatePonding(assembleDEM(plan,tiles),plan.width,plan.height,plan.cell,{rainMm:rain.mm,runoff});
  pondResult={plan,result,rain,place};showPonding();describePonding();
 }catch{setPond('ຈຳລອງບໍ່ສຳເລັດ · ກວດອິນເຕີເນັດແລ້ວລອງໃໝ່')}finally{button.disabled=false}
}
function showPonding(){
 if(!ready||!pondResult)return;const {plan,result}=pondResult,c=document.createElement('canvas');c.width=plan.width;c.height=plan.height;c.getContext('2d').putImageData(new ImageData(pondingRaster(result),plan.width,plan.height),0,0);
 const url=c.toDataURL('image/png'),coordinates=plan.coordinates,box={type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[...coordinates,coordinates[0]]]}};
 if(map.getSource('ponding')){map.getSource('ponding').updateImage({url,coordinates});map.getSource('ponding-box').setData(box)}
 else{map.addSource('ponding',{type:'image',url,coordinates});map.addLayer({id:'ponding',type:'raster',source:'ponding',paint:{'raster-opacity':.9,'raster-fade-duration':0,'raster-resampling':'nearest'}});map.addSource('ponding-box',{type:'geojson',data:box});map.addLayer({id:'ponding-box',type:'line',source:'ponding-box',paint:{'line-color':'#0b7fa8','line-width':2,'line-dasharray':[2,2]}})}
 $('pondingToggle').checked=true;visibility('ponding',enabled('ponding'));visibility('ponding-box',enabled('ponding'));bringAdminToFront();
 const [w,s,e,n]=plan.bounds;map.fitBounds([[w,s],[e,n]],{padding:40,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:700});
}
function describePonding(){
 const {plan,result,rain,place}=pondResult,st=result.stats,list=$('pondList');list.replaceChildren();
 const ha=v=>(v/10000).toFixed(v<100000?1:0);
 setPond(place.name+' · '+rain.label+': '+(rain.mm>=10?Math.round(rain.mm):rain.mm.toFixed(1))+' mm · ໄຫຼເປັນນ້ຳ '+Math.round(st.runoff*100)+'% · '+(st.ponds?'ພົບ '+st.ponds+' ຈຸດນ້ຳຂັງ (ເລິກ ≥10 cm) · ລວມ '+ha(st.wetArea)+' ha · ເລິກສຸດ ~'+st.maxDepth.toFixed(1)+' m':'ຝົນເທົ່ານີ້ບໍ່ພໍໃຫ້ເກີດນ້ຳຂັງເລິກ ≥10 cm ໃນກອບນີ້'));
 result.ponds.slice(0,5).forEach((p,i)=>{const [lon,lat]=planLngLat(plan,p.x,p.y),li=document.createElement('li'),b=document.createElement('button');b.type='button';b.className='link-button';b.textContent='ຈຸດ '+(i+1)+' · ເລິກສຸດ ~'+p.maxDepth.toFixed(1)+' m · '+ha(p.area)+' ha'+(p.full?' · ເຕັມແອ່ງ ນ້ຳລົ້ນຕໍ່':'');b.addEventListener('click',()=>{map.flyTo({center:[lon,lat],zoom:Math.max(map.getZoom(),14)})});li.append(b);list.append(li)});
}// ---------- Measured rainfall: MRC rain gauges ----------
let gaugeData=null,gaugeMarkers=[],gaugeError=false,gaugeRendered=null;
function loadRainStations(){return getJSON('/api/rain/stations',null,true).then(data=>{if(!validGaugeData(data))throw new Error('gauges');gaugeData=data;gaugeError=false;renderGauges();renderAlerts()}).catch(()=>{gaugeError=true}).finally(updateGaugeSummary)}
// Station popup, option C (owner's choice 25 Oct 2026): a water tube with the alarm / flood lines, then short
// chips (trend, rain, status) in plain Lao. Rain-only gauges show the rain part only. Icons are the site's
// line icons (ui-icons.js), not emoji (26 Oct 2026).
const POP_STATE={normal:['ok','check','ປອດໄພ'],rising:['warn','up',RIVER_STATUS.rising],alarm:['alarm','alert',RIVER_STATUS.alarm],flood:['flood','alert',RIVER_STATUS.flood]};
const popClock=new Intl.DateTimeFormat('lo-LA',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Vientiane',hourCycle:'h23'});
function popNode(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function popChip(iconName,text,cls=''){const c=popNode('span','gpop-chip'+(cls?' '+cls:''));if(iconName)c.append(uiIconNode(iconName));c.append(text);return c}
function gaugePopup(s){
 const node=popNode('div','gpop'),lv=riverData?.stations.find(r=>r.id===s.id),band=gaugeBand(s.rain24h);
 const head=popNode('div','gpop-head');head.append(popNode('strong','gpop-title',s.name));node.append(head);
 const when=lv&&!lv.stale?lv.time:s.time;
 node.append(popNode('div','gpop-sub',(s.river?'ແມ່ນ້ຳ '+s.river+' · ':'')+'ວັດເມື່ອ '+popClock.format(new Date(when))+' ('+age(when)+'ກ່ອນ)'));
 const chips=popNode('div','gpop-chips');
 if(lv&&Number.isFinite(lv.level)){
  const t=levelTube(lv.level,lv.alarm,lv.flood),wrap=popNode('div','gpop-tube'),tube=popNode('div','gpop-tb'),marks=popNode('div','gpop-marks');
  for(const [pct,cls] of [[t.flood,'flood'],[t.alarm,'alarm']])if(pct!==null){const l=popNode('i','gpop-line '+cls);l.style.bottom=pct+'%';tube.append(l)}
  const w=popNode('i','gpop-water');w.style.height=t.water+'%';tube.append(w);
  // Every label sits exactly at its own line (owner, 26 Oct 2026). Lines too close for two labels
  // (Luang Prabang: alarm 17.5, flood 18) share one label; only a line label next to the water label moves.
  for(const x of tubeLabels(t,lv)){const m=popNode('div',x.cls);for(const d of x.dashes)m.append(popNode('i','gpop-dash '+d));if(x.now)m.append(uiIconNode('pointer'));m.append(x.text);m.style.bottom=x.at+'%';marks.append(m)}
  wrap.append(tube,marks);node.append(wrap);
  if(lv.alarm!==null&&lv.level<lv.alarm)node.append(popNode('div','gpop-note','ຍັງຕ່ຳກວ່າຂີດເຕືອນ '+(lv.alarm-lv.level).toFixed(2)+' m'));
  // Without official lines there is nothing to compare with: say so instead of "safe".
  if(lv.alarm===null&&lv.flood===null)node.append(popNode('div','gpop-note','ສະຖານີນີ້ບໍ່ມີຂີດເຕືອນທາງການ · ກົດເບິ່ງກຣາຟເພື່ອທຽບກັບມື້ກ່ອນໆ'));
  if(lv.stale)node.append(popNode('div','gpop-note warn','ລະດັບນ້ຳບໍ່ອັບເດດເກີນ 3 ຊົ່ວໂມງ'));
  const trend=trendText(lv.rise6);if(trend)chips.append(popChip(trendIcon(lv.rise6),trend));
 }
 chips.append(popChip('rain','ຝົນ 24 ຊມ: '+(s.rain24h===null?'ບໍ່ມີຂໍ້ມູນ':gaugeLabel(s.rain24h)+' mm'+(band?'':' · ບໍ່ມີຝົນ'))));
 if(s.rain1h>0)chips.append(popChip(null,'ຊົ່ວໂມງນີ້ '+gaugeLabel(s.rain1h)+' mm'));
 const hasLines=lv&&(lv.alarm!==null||lv.flood!==null);
 // Status badge sits beside the title (saves a row on small phones).
 if(lv&&!lv.stale&&(hasLines||lv.status!=='normal')){const [cls,iconName,label]=POP_STATE[lv.status]||POP_STATE.normal;head.append(popChip(iconName,label,'state-'+cls))}
 node.append(chips);
 // Same calendar day in MRC's records (wet season only; shown when the two gauges agree).
 const hist=lv?.history;if(hist?.comparable&&hist.avg!==null){const diff=lv.level-hist.avg,note=popNode('div','gpop-note',Math.abs(diff)<.05?'ເທົ່າກັບສະເລ່ຍຂອງວັນນີ້ໃນອະດີດ':(diff>0?'ສູງກວ່າ':'ຕ່ຳກວ່າ')+'ສະເລ່ຍຂອງວັນນີ້ໃນອະດີດ '+Math.abs(diff).toFixed(2)+' m');note.append(popNode('span','gpop-src',' · ສະຖິຕິ: MRC Flood Forecasting'));node.append(note)}
 if(s.stale&&!lv)node.append(popNode('div','gpop-note warn','ສະຖານີບໍ່ສົ່ງຂໍ້ມູນເກີນ 3 ຊົ່ວໂມງ'));
 const help=popNode('div','gpop-help');if(hasLines)help.append(uiIconNode('info'),'ເຕືອນ = ຄວນເລີ່ມລະວັງ · ນ້ຳຖ້ວມ = ນ້ຳອາດລົ້ນຝັ່ງ · ');help.append('ຂໍ້ມູນ: ເຄື່ອງວັດ MRC');node.append(help);
 const histBtn=popNode('button','hist-open');histBtn.append(uiIconNode('chart'),'ເບິ່ງກຣາຟຍ້ອນຫຼັງ');histBtn.type='button';histBtn.addEventListener('click',()=>historyDialog.open({id:s.id,name:s.name,kinds:lv?['rain','level']:['rain']}));node.append(histBtn);
 return node;
}
// Phones: the time bar and the top row cover the map edges, so move the map until the whole popup shows.
function keepPopupVisible(popup){requestAnimationFrame(()=>{
 const box=popup.getElement()?.getBoundingClientRect();if(!box)return;
 const bar=document.querySelector('.workspace .timeline')?.getBoundingClientRect(),bottom=bar&&bar.top>innerHeight/2?bar.top-8:innerHeight-8,top=112;
 const dy=box.height>bottom-top?box.top-top:box.bottom>bottom?box.bottom-bottom:box.top<top?box.top-top:0;
 if(dy)map.panBy([0,dy],{duration:250});
})}
function renderGauges(){
 // Rebuild only for a new download, so an open popup survives routine refreshes.
 const renderKey=gaugeData?.fetchedAt+':'+(riverData?.fetchedAt||0);if(!ready||!gaugeData||gaugeRendered===renderKey){syncGauges();return}gaugeRendered=renderKey;gaugeMarkers.forEach(m=>m.remove());
 gaugeMarkers=gaugeData.stations.map(s=>{
  const band=gaugeBand(s.rain24h),el=document.createElement('button');el.type='button';
  const lv=riverData?.stations.find(r=>r.id===s.id&&!r.stale);el.className='gauge'+(band?'':' dry')+(band&&band[0]<10?' light':'')+(s.stale?' stale':'')+(lv&&lv.status!=='normal'?' river-'+lv.status:'');if(band){el.style.setProperty('--gauge',band[1]);el.textContent=gaugeLabel(s.rain24h)}
  el.setAttribute('aria-label',s.name+' · ຝົນ 24 ຊົ່ວໂມງ '+(s.rain24h===null?'ບໍ່ມີຂໍ້ມູນ':gaugeLabel(s.rain24h)+' mm'));
  // Popup.on() does not return the popup in MapLibre 6, so it is not chained.
  const popup=new maplibregl.Popup({offset:14,focusAfterOpen:false,maxWidth:'290px',className:'gauge-pop'}).setDOMContent(gaugePopup(s));popup.on('open',()=>keepPopupVisible(popup));
  return new maplibregl.Marker({element:el}).setLngLat([s.lon,s.lat]).setPopup(popup).addTo(map);
 });
 syncGauges();
}
function syncGauges(){const on=enabled('stations');gaugeMarkers.forEach(m=>{m.getElement().style.display=on?'':'none';if(!on)m.getPopup()?.remove()})}
function updateGaugeSummary(){
 const node=$('gaugeSummary');if(!node)return;
 if(!gaugeData){node.textContent=gaugeError?'ສະຖານີວັດຝົນ MRC ບໍ່ພ້ອມ · ລອງໃໝ່ພາຍຫຼັງ':'ກຳລັງໂຫຼດສະຖານີວັດຝົນ…';return}
 const near=nearestGauge(gaugeData.stations,current.lon,current.lat);
 node.textContent=near?'ຝົນວັດຈິງໃກ້ສຸດ · '+near.station.name+' ('+Math.round(near.km)+' km): '+gaugeLabel(near.station.rain24h)+' mm ໃນ 24 ຊົ່ວໂມງ · ວັດ '+timeFmt.format(new Date(near.station.time)):'ບໍ່ມີສະຖານີວັດຝົນ MRC ໃນ 60 km · ເບິ່ງຈຸດສະຖານີເທິງແຜນທີ່';
}function loadRadar(){return feedJob('radar',()=> $('radarProvider').value==='rainviewer'?fetchRadar():fetchCountryRadar())}
async function fetchCountryRadar(){
 const provider=$('radarProvider').value;
 try{const data=await getJSON('/api/radar/'+provider,null,true);if(provider!==$('radarProvider').value)return;if(!data.frames?.length)throw new Error('frames');radar=data;radarPast=rememberFrames(countryHistory.get(provider)||[],data.frames);countryHistory.set(provider,radarPast);radarNowcast=[];radarError=false;recordFeedCheck('radar',radarPast.at(-1).time*1000);selectRadarMode();$('radarSourceStatus').textContent=data.name+' · '+stamp(frames.at(-1).time*1000);$('countryRadarOpen').hidden=data.display!=='chart'}
 catch{if(provider!==$('radarProvider').value)return;radarError=true;recordFeedFailure('radar');$('radarSourceStatus').textContent='ແຫຼ່ງເຣດາບໍ່ພ້ອມ · ລອງໂຫຼດໃໝ່ ຫຼື RainViewer';selectRadarMode()}
 updateStatus();
}
async function fetchRadar(){try{const data=await getJSON('https://api.rainviewer.com/public/weather-maps.json',null,true);if(!data.radar?.past?.length||new URL(data.host).hostname!=='tilecache.rainviewer.com')throw new Error('empty');radar={...data,provider:'rainviewer'};$('countryRadarOpen').hidden=true;const valid=f=>Number.isFinite(f.time)&&/^\/v2\/radar\/[a-zA-Z0-9]+$/.test(f.path);radarHistory=rememberFrames(radarHistory,data.radar.past.filter(valid));radarPast=radarHistory;radarNowcast=(data.radar.nowcast||[]).filter(valid).sort((a,b)=>a.time-b.time);if(!radarPast.length)throw new Error('frames');radarError=false;recordFeedCheck('radar',radarPast.at(-1).time*1000);selectRadarMode();$('radarSourceStatus').textContent=`ພາບລ່າສຸດ ${stamp((radarPast.at(-1)||frames.at(-1)).time*1000)} · ອາຍຸ ${age((radarPast.at(-1)||frames.at(-1)).time*1000)}`;raster('coverage',[`${data.host}/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png`],'RainViewer coverage',.5);visibility('coverage',enabled('coverage'));updateTimeline()}catch(e){radarError=true;recordFeedFailure('radar');$('radarSourceStatus').textContent='API ບໍ່ພ້ອມ · ຍັງບໍ່ຢືນຢັນຝົນ';selectRadarMode()}updateStatus()}
function loadIMERG(){return feedJob('imerg',fetchIMERG)}
async function fetchIMERG(){try{const incoming=await satelliteTimes(imergTimesURL(),imergDomainTimes);if(!imergTimes.length||Date.parse(incoming.at(-1))>=Date.parse(imergTimes.at(-1)))imergTimes=incoming;if(!imergTimes.length)throw new Error('time');imergIndex=imergTimes.length-1;imergError=false;recordFeedCheck('imerg',Date.parse(imergTimes.at(-1)));$('imergSourceStatus').textContent='ລ່າສຸດ '+stamp(imergTimes.at(-1))+' · ອາຍຸ '+age(imergTimes.at(-1));updateTimeline()}catch(e){imergError=true;recordFeedFailure('imerg');$('imergSourceStatus').textContent='ອັບເດດ IMERG ບໍ່ສຳເລັດ'}updateStatus()}
function spark(id,values){const max=Math.max(1,...values);$(id).innerHTML=values.map(v=>`<i style="height:${Math.max(8,v/max*100)}%"></i>`).join('')}
// 7-day outlook (Open-Meteo GFS): days 1–3 are a forecast; days 4–7 only show the trend
// (model skill drops with lead time), so those cards are marked and drawn lighter.
const FORECAST_CONFIDENT_DAYS=3;
function forecastConfidence(lead){return lead<=0?'':lead<=FORECAST_CONFIDENT_DAYS?'confident':'trend'}
function clearWeather(){weather=null;['tempValue','rainValue','chanceValue','windValue'].forEach(id=>$(id).textContent='—');$('forecastList').replaceChildren();$('rainSpark').replaceChildren();$('tempSpark').replaceChildren();$('riskLevel').textContent='ຍັງບໍ່ມີຂໍ້ມູນຝົນ';$('riskReason').textContent='ກຳລັງໂຫຼດ · ຍັງບໍ່ຢືນຢັນນ້ຳຖ້ວມ';$('useWeatherRain').disabled=true}
async function loadWeather(){updateGaugeSummary();weatherAbort?.abort();weatherAbort=new AbortController();const abort=weatherAbort;clearWeather();$('offlineBanner').style.display='none';$('updatedText').textContent='ກຳລັງໂຫຼດ '+current.name;const timeout=setTimeout(()=>abort.abort(),15000);try{const qs=new URLSearchParams({latitude:current.lat,longitude:current.lon,current:'temperature_2m,weather_code',daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',hourly:'precipitation,temperature_2m',past_days:'1',forecast_days:'8',timezone:current.far?'auto':'Asia/Vientiane'});const data=await getJSON('https://api.open-meteo.com/v1/forecast?'+qs,abort.signal);if(abort!==weatherAbort)return;const d=data.daily;if(!d?.time?.length)throw new Error('empty');const date=data.current.time.slice(0,10),idx=d.time.indexOf(date);if(idx<0)throw new Error('today');weather={data,idx,rain:Number(d.precipitation_sum[idx])};document.dispatchEvent(new CustomEvent('weather:update',{detail:{data,idx}}));const rain=weather.rain;$('rainValue').textContent=rain.toFixed(1)+' mm';$('tempValue').textContent=Math.round(data.current.temperature_2m)+' °C';$('windValue').textContent=Math.round(d.wind_speed_10m_max[idx])+' km/h';$('chanceValue').textContent=Math.round(d.precipitation_probability_max[idx])+' %';$('updatedText').textContent=`${current.name} · ເວລາແບບຈຳລອງ ${data.current.time.replace('T',' ')} (${current.far?'ເວລາທ້ອງຖິ່ນ':'ລາວ'})`;$('riskLevel').textContent=rain>=100?'ຝົນພະຍາກອນສູງຫຼາຍ · ເຝົ້າລະວັງ':rain>=50?'ຝົນພະຍາກອນສູງ · ເຝົ້າລະວັງ':rain>=20?'ຕິດຕາມຝົນພະຍາກອນ':'ຝົນພະຍາກອນບໍ່ສູງ';$('riskReason').textContent=`ຝົນລວມ ${rain.toFixed(1)} mm ໃນມື້ນີ້ · ກົດທົດລອງບໍ່ປັບທຽບ · ບໍ່ຢືນຢັນນ້ຳຖ້ວມ`;const dayIndices=data.hourly.time.map((t,i)=>t.startsWith(date)?i:-1).filter(i=>i>=0);spark('rainSpark',dayIndices.map(i=>data.hourly.precipitation[i]));spark('tempSpark',dayIndices.map(i=>data.hourly.temperature_2m[i]));$('forecastList').innerHTML=d.time.map((t,i)=>`<article class="day ${i===idx?'today':''} ${forecastConfidence(i-idx)}"><span class="day-tag">${i<idx?'ມື້ວານ':i===idx?'ມື້ນີ້':i-idx<=FORECAST_CONFIDENT_DAYS?'ພະຍາກອນ':'ແນວໂນ້ມ'}</span><div class="small">${dayFmt.format(new Date(t+'T12:00:00+07:00'))}</div><div class="day-icon">${wxIcon(d.weather_code[i])}</div><div class="day-temp">${Math.round(d.temperature_2m_min[i])}° / ${Math.round(d.temperature_2m_max[i])}°</div><div class="day-rain">${Number(d.precipitation_sum[i]).toFixed(1)} mm</div></article>`).join('');$('useWeatherRain').disabled=false}catch(e){if(abort!==weatherAbort)return;$('updatedText').textContent=current.name+' · ຂໍ້ມູນບໍ່ພ້ອມ';$('offlineBanner').style.display='block';$('riskReason').textContent='ລອງກົດອັບເດດອີກຄັ້ງ · ບໍ່ປະເມີນຝົນຈາກຂໍ້ມູນຕົວຢ່າງ'}finally{clearTimeout(timeout);if(forecastMode)setForecastFrame(timelineCursor)}}
function overlayImage(kind){const canvas=document.createElement('canvas');canvas.width=grid.width;canvas.height=grid.height;const ctx=canvas.getContext('2d');const img=ctx.createImageData(grid.width,grid.height);const min=Math.min(...grid.values),max=Math.max(...grid.values);let count=0;for(let y=0;y<grid.height;y++)for(let x=0;x<grid.width;x++){const idx=y*grid.width+x;let color;if(kind==='elevation')color=elevationColor(grid.values[idx],min,max);else{const level=screenLevel(terrainCell(grid,x,y),scenarioRain);color=level===3?[219,76,64,200]:level===2?[240,153,51,195]:level===1?[244,204,98,190]:[0,0,0,0];if(level)count++}img.data.set(color,idx*4)}ctx.putImageData(img,0,0);if(kind==='risk')$('screeningText').textContent=`ຝົນສົມມຸດ ${scenarioRain.toFixed(1)} mm · ພົບຈຸດຕ່ຳທີ່ຖືກຄັດກອງ ${count} ຊ່ອງ · ບໍ່ແມ່ນຜົນຈຳລອງນ້ຳ`;return canvas.toDataURL()}
function terrainOverlays(){if(!ready)return;for(const id of ['elevation','risk']){if(!grid){visibility(id,false);continue}const b=grid.bounds,coords=[[b[0],b[3]],[b[2],b[3]],[b[2],b[1]],[b[0],b[1]]];const image=overlayImage(id);if(map.getSource(id))map.getSource(id).updateImage({url:image,coordinates:coords});else{map.addSource(id,{type:'image',url:image,coordinates:coords});map.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':.75,'raster-fade-duration':0}})}visibility(id,enabled(id))}updateLegend()}
function terrainReadout(lon,lat){const cell=grid?terrainAt(grid,lon,lat):null;$('elevationValue').textContent=cell?Math.round(cell.elevation)+' m':'— m';$('slopeValue').textContent=cell?cell.slope.toFixed(1)+'°':'— °';return cell}
async function loadTerrain(){const sequence=++terrainSequence;grid=null;terrainOverlays();$('terrainStatus').textContent='ກຳລັງໂຫຼດພູມປະເທດ…';terrainReadout(0,0);if(!current.id){$('terrainStatus').textContent='ຕຳແໜ່ງນີ້ຢູ່ນອກ 4 ພື້ນທີ່ນຳຮ່ອງ';$('elevationToggle').disabled=true;$('riskToggle').disabled=true;return}try{const data=await getJSON('./data/'+current.id+'.json');if(sequence!==terrainSequence)return;if(data.values?.length!==data.width*data.height||data.values.some(v=>!Number.isFinite(v)))throw new Error('grid');grid=data;$('terrainStatus').textContent=`${current.name} · ປະມານ 4.7 × 4.7 km · ກຣິດ ${grid.displayGridMeters} m`;$('elevationToggle').disabled=false;$('riskToggle').disabled=false;terrainReadout(current.lon,current.lat);terrainOverlays()}catch(e){if(sequence!==terrainSequence)return;$('terrainStatus').textContent='ຂໍ້ມູນພູມປະເທດບໍ່ພ້ອມ';$('elevationToggle').disabled=true;$('riskToggle').disabled=true}}
function updateScenario(value){scenarioRain=value;$('scenarioValue').textContent=value.toFixed(1)+' mm';$('scenarioRain').value=Math.round(value/10)*10;if(grid)terrainOverlays()}
function move(fly=true){selectedAdmin=null;map?.getSource('admin-selection')?.setData(EMPTY_COLLECTION);if(fly){map?.flyTo({center:[current.lon,current.lat],zoom:current.zoom,essential:false});marker?.setLngLat([current.lon,current.lat])}$('mapHint').textContent=current.name+' · ແຕະເພື່ອເບິ່ງຄວາມສູງ';$('selectedPlace').querySelector('strong').textContent=current.name;$('selectedPlace').querySelector('span').textContent='ຕຳແໜ່ງຈຸດ · ບໍ່ມີເສັ້ນຂອບເຂດ';$('googleMapsLink').href=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(current.lat+','+current.lon)}`;loadWeather();loadTerrain()}
function initMap(){try{map=new maplibregl.Map({container:'map',style:baseStyle(),center:[current.lon,current.lat],zoom:current.zoom,minZoom:2.5,maxZoom:16,maxBounds:REGION_BOUNDS,renderWorldCopies:false,attributionControl:{compact:window.matchMedia('(max-width: 760px)').matches,customAttribution:'Himawari-9 / JMA · NASA GIBS · NOAA AWS backup · GPM IMERG · RainViewer / source agencies · MRC · Open-Meteo (CC BY 4.0) · <a href="/privacy">ຄວາມເປັນສ່ວນຕົວ</a>'}});
 // The time bar sits just above the map credits, whatever height they wrap to.
 const credits=map.getContainer().querySelector('.maplibregl-ctrl-bottom-right');if(credits)new ResizeObserver(()=>$('workspace').style.setProperty('--attribution-height',credits.getBoundingClientRect().height+'px')).observe(credits);
 // On phones the credits start folded behind the ⓘ button, leaving room for the map.
 if(credits&&window.matchMedia('(max-width: 760px)').matches)map.once('load',()=>{const a=credits.querySelector('.maplibregl-ctrl-attrib');a?.classList.remove('maplibregl-compact-show');a?.removeAttribute('open')});
 frameRenderer=new FrameRenderer(map,{onState(id,state){if(imageHealth[id]){imageHealth[id]={state,errors:state==='error'?1:0};renderImageHealth()}},onCommit:bringAdminToFront,reducedMotion:()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches});map.addControl(new maplibregl.NavigationControl(),'top-right');map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-left');map.on('load',()=>{ready=true;loadStorms();setInterval(loadStorms,10*60000);window.stormMode=setupStormLayer(map,{homeBounds:REGION_BOUNDS,markerClass:maplibregl.Marker,cloudOn:()=>{const c=document.getElementById('cloudToggle');if(c&&!c.checked)c.click()},laoView:()=>map.flyTo({center:[places.vientiane.lon,places.vientiane.lat],zoom:4.5}),padding:()=>mobileLayout()?{top:30,bottom:250,left:16,right:30}:{top:40,bottom:230,left:60,right:90}});queueMicrotask(()=>{renderGauges();renderAccumulation();showPonding();renderDams();renderRivers()});marker=new maplibregl.Marker({color:'#1284ff'}).setLngLat([current.lon,current.lat]).addTo(map);addAdminLayers();map.addSource('terrain-dem',{type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],encoding:'terrarium',tileSize:256,maxzoom:15,attribution:'Mapzen terrain / SRTM / GMTED'});map.on('click',e=>{if(e.originalEvent?.target?.closest?.('.gauge'))return;if(map.getLayer('dams')&&map.queryRenderedFeatures(e.point,{layers:['dams']}).length)return;if(motionMode){toast('ພາບເມກຄຳນວນ · ບໍ່ມີຄ່າຝົນ mm ຫຼື ເວລາຝົນມາຮອດ');return}if(forecastMode){showForecastPopup(e.lngLat);return}const cell=terrainReadout(e.lngLat.lng,e.lngLat.lat);if(!cell)return;// outside the 4 DEM pilot areas: no popup (owner, 29 Oct 2026)
const node=document.createElement('div');const strong=document.createElement('strong');strong.textContent=`ຄວາມສູງ ${Math.round(cell.elevation)} m · ຊັນ ${cell.slope.toFixed(1)}°`;node.append(strong);const p=document.createElement('p');p.textContent=`${cell.candidate?'ອາດເປັນຈຸດຕ່ຳທຽບຂ້າງຄຽງ':'ບໍ່ຖືກຄັດກອງເປັນຈຸດຕ່ຳ'} · ບໍ່ຢືນຢັນນ້ຳຖ້ວມ/ຄວາມປອດໄພ. DSM ອາດລວມຕົ້ນໄມ້/ອາຄານ.`;node.append(p);new maplibregl.Popup().setLngLat(e.lngLat).setDOMContent(node).addTo(map)});terrainOverlays();if(frames.length){if(radar.host)raster('coverage',[`${radar.host}/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png`],'RainViewer coverage',.5);visibility('coverage',enabled('coverage'))}syncLayers()});map.on('movestart',()=>clearTimeout(viewportTimer));map.on('moveend',()=>{clearTimeout(viewportTimer);viewportTimer=setTimeout(refreshViewportImagery,VIEWPORT_SETTLE_MS)});map.on('sourcedata',e=>{if(!frameRenderer.states.has(e.sourceId)&&imageHealth[e.sourceId]&&e.isSourceLoaded&&(e.tile?.state==='loaded'||e.sourceDataType==='content'||(e.source?.type==='image'&&e.sourceDataType==='idle'))){imageHealth[e.sourceId].state='ready';renderImageHealth()}});map.on('error',e=>{const id=e.sourceId;if(['radar','imerg','cloud','coverage','terrain-dem'].includes(id)){if(imageHealth[id]){imageHealth[id].errors++;imageHealth[id].state='error';renderImageHealth()}if(id==='cloud'){$('cloudFrameStatus').textContent='ພາບໂຫຼດບໍ່ສຳເລັດ · ລອງອັບເດດ'}$('dataStatus').textContent='ບາງຊັ້ນແຜນທີ່ໂຫຼດບໍ່ສຳເລັດ · ກົດອັບເດດ/ກວດແຫຼ່ງຂໍ້ມູນ'}})}catch(e){$('mapFallback').style.display='flex';toast('ແຜນທີ່ບໍ່ພ້ອມ · ຂໍ້ມູນອາກາດຍັງໃຊ້ໄດ້')}}
// After a zoom or pan: wait until the map has settled, then download a new viewport
// image only when the one on screen no longer covers the view or is too coarse.
const VIEWPORT_SETTLE_MS=350;let viewportTimer=null;
function refreshViewportImagery(){
 if(!ready||playing||map.isMoving())return;
 if(!forecastMode&&!motionMode&&['cloud','imerg','radar'].includes(activeTime)&&frameRenderer.covers(activeTime,frameRenderer.spec()))return;
 updateTimeline();
}
function syncLayers(){visibility('satellite',enabled('satellite'));visibility('street',!enabled('satellite'));styleAdminLines(enabled('satellite'));visibility('radar',enabled('radar')&&frames.length>0);visibility('cloud',enabled('cloud'));visibility('coverage',enabled('coverage')&&radar?.provider==='rainviewer');visibility('imerg',enabled('imerg'));['admin-province-fill','admin-province-line','admin-district-line','admin-selection-fill','admin-selection-line'].forEach(id=>visibility(id,enabled('admin')));visibility('elevation',enabled('elevation')&&!!grid);visibility('risk',enabled('risk')&&!!grid);if(ready){map.setTerrain(enabled('terrain')?{source:'terrain-dem',exaggeration:1}:null);map.easeTo({pitch:enabled('terrain')?55:0,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:600});bringAdminToFront()}syncGauges();visibility('dams',enabled('dams'));visibility('rivers',enabled('rivers'));visibility('imerg-accum',enabled('accum'));visibility('ponding',enabled('ponding'));visibility('ponding-box',enabled('ponding'));if(enabled('accum')&&!accumData)loadAccumulation().catch(()=>{});updateQuickLayers();updateTimeline();renderImageHealth()}
// One-tap switch between the three time-based layers; mirrors the layer panel toggles.
function updateQuickLayers(){document.querySelectorAll('[data-quick-layer]').forEach(b=>b.setAttribute('aria-pressed',String(!forecastMode&&!motionMode&&$(b.dataset.quickLayer+'Toggle').checked)))}
document.querySelectorAll('[data-quick-layer]').forEach(b=>b.addEventListener('click',()=>{if(b.getAttribute('aria-pressed')==='true')return;activateImagery(b.dataset.quickLayer)}));
document.querySelectorAll('.switch').forEach(input=>input.addEventListener('change',()=>{stopPlay();if(imageryIds.some(id=>input.id===id+'Toggle')&&input.checked){if(forecastMode||motionMode)setForecastMode(false);for(const id of imageryIds)if(input.id!==id+'Toggle')$(id+'Toggle').checked=false;$('timelineSource').value=input.id.replace('Toggle','');followLatest=true;selectedTime=null;timelineKey=''}if(input.id==='riskToggle'&&input.checked)$('elevationToggle').checked=false;if(input.id==='elevationToggle'&&input.checked)$('riskToggle').checked=false;syncLayers()}));
$('timeSlider').addEventListener('input',e=>{stopPlay();timelineCursor=Number(e.target.value);followLatest=!forecastMode&&!motionMode&&timelineCursor===Number(e.target.max);selectedTime=timeSlots[timelineCursor]?.time??null;updateTimeline()});
$('smoothImageryToggle').addEventListener('change',()=>{stopPlay();updateTimeline();$('imageryDisplayNote').textContent=$('smoothImageryToggle').checked?'ພາບປັບໃຫ້ນຸ່ມ · ບໍ່ເພີ່ມຄວາມລະອຽດຂໍ້ມູນ':'ສະແດງພາບຕົ້ນທາງ · ອາດເຫັນຊ່ອງຂໍ້ມູນ'});
// AWS history is converted on demand by the Worker. Prepare every observation
// first (two at a time, shown as progress), then play only frames that are
// ready, in time order. Stalls mid-run and uneven jumps between rounds are
// avoided; failed observations are skipped consistently, never replaced.
// Pre-converted CDN frames are static files: start once the first few are in,
// keep downloading the rest in order (four at a time) while playing.
async function prepareCloudPlayback(context,indices,token){
 const awsFrame=i=>{const frame=context.cloudFrames.get(context.cloud[context.slots[i].frame]);return frame?.provider==='aws'?frame:null};
 const unique=[...new Map(indices.map(awsFrame).filter(Boolean).map(f=>[f.stamp,f])).values()];if(!unique.length)return indices;
 const cdn=unique.every(f=>f.source==='cdn'),failed=new Set(),done=new Set();context.skipStamps=failed;let cursor=0;
 const progress=()=>{if(token===playToken&&!started)playbackStatus('ກຳລັງກຽມພາບຍ້ອນຫຼັງ '+done.size+'/'+unique.length+(cdn?'':' · ພາບທີ່ເຄີຍໂຫຼດຈະໄວຂຶ້ນ'))};let started=false;progress();
 const all=Promise.all(Array.from({length:Math.min(cdn?4:2,unique.length)},async()=>{while(cursor<unique.length&&token===playToken){const frame=unique[cursor++];try{await prepareAWSFrame(frame)}catch{failed.add(frame.stamp)}done.add(frame.stamp);progress()}}));
 await all;
 started=true;return indices.filter(i=>!failed.has(awsFrame(i)?.stamp));
}
$('playBtn').addEventListener('click',async()=>{
 if(playing){stopPlay();return}if(!ready)return;
 const context=frameContext(),first=context.slots.findIndex(s=>s.frame>=0);if(first<0)return;
 stopPlay();followLatest=false;playing=true;preparedSkipped=0;$('playBtn').textContent='Ⅱ ຢຸດ';$('playBtn').setAttribute('aria-label','ຢຸດການຫຼິ້ນ');
 const token=playToken;let indices=playbackIndices(context.slots,first);
 if(context.id==='cloud'){const all=indices.length;indices=await prepareCloudPlayback(context,indices,token);if(token!==playToken)return;preparedSkipped=all-indices.length+(context.skipStamps?.size||0);if(!indices.length){stopPlay();playbackStatus('ບໍ່ມີພາບພ້ອມໃນຮອບນີ້ · ລອງອັບເດດ');return}}
 player.run(indices,context,{rounds:3,skipUnavailable:true});
});
$('playbackSpeed').addEventListener('change',()=>player.setSpeed(Number($('playbackSpeed').value)));
$('scenarioRain').addEventListener('input',e=>updateScenario(Number(e.target.value)));
$('useWeatherRain').addEventListener('click',()=>{if(weather){updateScenario(weather.rain);$('riskToggle').checked=true;$('elevationToggle').checked=false;syncLayers()}});
$('radarMode').addEventListener('change',()=>{stopPlay();followLatest=true;selectedTime=null;timelineKey='';selectRadarMode()});
$('radarProvider').addEventListener('change',async()=>{
 const select=$('radarProvider');select.disabled=true;stopPlay();await feedJobs.get('radar');
 clearRadarImage();radar=null;frames=[];radarPast=[];radarNowcast=[];radarError=false;feedChecks.radar={checkedAt:0,latest:0,state:'waiting'};imageHealth.radar={state:'waiting',errors:0};$('radarMode').value='past';$('radarMode').disabled=select.value!=='rainviewer';$('countryRadarOpen').hidden=true;
 activateImagery('radar');await loadRadar();select.disabled=false;
 if(radar?.display==='chart'&&frames.length)$('countryRadarDialog').showModal();
});
$('countryRadarOpen').addEventListener('click',()=>{if(radar?.display==='chart')$('countryRadarDialog').showModal()});
$('countryRadarSlider').addEventListener('input',e=>{stopPlay();followLatest=false;const index=timeSlots.findIndex(s=>s.frame===Number(e.target.value));if(index>=0)timelineFrame(index)});
$('countryRadarImage').addEventListener('load',()=>{if(radar?.display==='chart'){imageHealth.radar={state:'ready',errors:0};renderImageHealth()}});
$('countryRadarImage').addEventListener('error',()=>{if(radar?.display==='chart'){imageHealth.radar={state:'error',errors:1};renderImageHealth();$('countryRadarTime').textContent='ພາບຈີນໂຫຼດບໍ່ສຳເລັດ · ລອງໂຫຼດໃໝ່'}});
$('timelineSource').addEventListener('change',()=>{stopPlay();followLatest=true;selectedTime=null;timelineKey='';const id=$('timelineSource').value;if(id!=='auto')activateImagery(id);else updateTimeline()});
setupAdminPickers();
$('alertBanner').addEventListener('click',()=>showView('news'));
$('pondRun').addEventListener('click',runPonding);
function aiSnapshot(){
 const display={radarProvider:$('radarProvider').value,activeLayer:activeTime};
 const lists={radar:frames.map(f=>new Date(f.time*1000).toISOString()),cloud:cloudTimes,imerg:imergTimes},indices={radar:radarIndex,cloud:cloudIndex,imerg:imergIndex};
 for(const id of imageryIds){const list=lists[id];display[id]={enabled:enabled(id),displayedTime:shownTimes[id]||null,latestTime:list.at(-1)||null,state:imageHealth[id].state};}
 const kind=selectedAdmin?.properties.level||'point',id=selectedAdmin?.properties.id||null,label=selectedAdmin?adminLabel(selectedAdmin):current.name;
 const summary=[label,weather?'ຝົນລວມມື້ນີ້ (ພະຍາກອນ): '+weather.rain.toFixed(1)+' mm':'ຂໍ້ມູນພະຍາກອນຍັງບໍ່ພ້ອມ',...imageryIds.filter(enabled).map(key=>key+' · ພາບ '+(display[key].displayedTime?stamp(display[key].displayedTime):'ບໍ່ພ້ອມ')),'AI ອ່ານຕົວເລກ/ເວລາພາບ · ບໍ່ໄດ້ວິເຄາະພິກເຊລຂອງພາບ'].join('\n');
 return {label,summary,payload:{location:{lat:current.lat,lon:current.lon,kind,id},display}};
}
setupAIChat(aiSnapshot,()=>showView('weather'));
// GPS works anywhere (owner, 29 Oct 2026). Inside the map region the map flies there; elsewhere the map
// stays on Asia (radar and satellite images cover only this region) and the weather shows the phone's
// own place in its local time.
// Each error gets its own message (iPhone report 29 Oct 2026: a slow fix was shown as "no permission").
// iOS settings stay in English because iPhones have no Lao menu language.
// The phone, not the page, shows the permission prompt; once refused it stays silent, so the help
// window (#gpsHelpDialog) shows the steps for this phone: app browser, iPhone or Android.
function gpsDevice(){const ua=navigator.userAgent;return /FBAN|FBAV|FB_IAB|Instagram|Line\/|Messenger/i.test(ua)?'app':/iPhone|iPad|iPod/.test(ua)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1?'ios':'android'}
function gpsHelp(e){if(e&&e.code===1)return gpsDevice()==='app'?'ແອັບນີ້ບໍ່ໃຫ້ໃຊ້ GPS · ເປີດເວັບໃນ Safari ຫຼື Chrome':'GPS ຖືກປິດຢູ່ໃນໂທລະສັບ';
 if(e&&e.code===3)return 'ຊອກຫາຕຳແໜ່ງດົນເກີນ · ລອງອອກໄປບ່ອນເປີດໂລ່ງ ຫຼື ກົດ GPS ອີກຄັ້ງ';
 return 'ໂທລະສັບຫາຕຳແໜ່ງບໍ່ໄດ້ · ກວດວ່າເປີດ Location ແລ້ວ'}
// Owner's option A (29 Oct 2026): a refusal opens the help straight away, with the reason on top.
function openGpsHelp(why){const d=$('gpsHelpDialog');if(!d)return;const pick=gpsDevice();$('gpsHelpWhy').textContent=why||'';$('gpsHelpWhy').hidden=!why;d.querySelectorAll('details[data-gps]').forEach(x=>{x.open=x.dataset.gps===pick});d.showModal()}
$('gpsRetry')?.addEventListener('click',()=>{$('gpsHelpDialog').close();$('locateBtn').click()});
$('locateBtn').addEventListener('click',()=>{if(!navigator.geolocation){toast('GPS ບໍ່ພ້ອມ');return}$('locateBtn').disabled=true;
 // A timeout is retried once with a longer wait and an older fix allowed (WebKit can count the permission prompt in the timeout).
 const ask=retry=>navigator.geolocation.getCurrentPosition(p=>{const lat=p.coords.latitude,lon=p.coords.longitude,far=lon<REGION_BOUNDS[0][0]||lon>REGION_BOUNDS[1][0]||lat<REGION_BOUNDS[0][1]||lat>REGION_BOUNDS[1][1];const key=far?null:Object.keys(places).find(id=>Math.abs(places[id].lat-lat)<.018&&Math.abs(places[id].lon-lon)<.018);current={name:'ຕຳແໜ່ງຂອງທ່ານ',lat,lon,zoom:12,id:key||null,far};$('provinceSelect').value='';replaceSelectOptions($('districtSelect'),'ເລືອກແຂວງກ່ອນ',[]);$('districtSelect').disabled=true;$('adminSummary').textContent='ຄົບ 18 ແຂວງ · 148 ເມືອງທົ່ວປະເທດ';move(!far);if(far)toast('ອາກາດຢູ່ຕຳແໜ່ງຂອງທ່ານ · ແຜນທີ່ເຣດາ/ພາບເມກ ມີສະເພາະອາຊີ');$('locateBtn').disabled=false},e=>{if(e&&e.code===3&&!retry)return ask(true);$('locateBtn').disabled=false;if(e&&e.code===3)toast(gpsHelp(e),8000);else openGpsHelp(gpsHelp(e))},{timeout:retry?25000:15000,maximumAge:retry?600000:60000});
 ask(false)});
async function refreshImagery(){await Promise.allSettled([loadRadar(),loadIMERG(),loadCloud()]);if(motionMode&&!playing)await loadCloudMotion();updateTimeline()}
async function refreshLiveData(){await Promise.allSettled([loadWeather(),loadRainStations(),loadRiverLevels(),loadNews(),loadNotices(),refreshImagery(),...(forecastMode?[loadForecast()]:[])]);updateTimeline()}
$('refreshBtn').addEventListener('click',async()=>{stopPlay();followLatest=true;selectedTime=null;timelineKey='';const b=$('refreshBtn');b.disabled=true;try{await refreshLiveData()}finally{b.disabled=false}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlay();else refreshLiveData()});
window.addEventListener('online',refreshLiveData);
// Keep the map centered when the mobile layout or browser viewport changes size.
new ResizeObserver(()=>map?.resize()).observe($('map'));
// Measure the controls for layout only. Loading/status changes must not move
// the map camera or trigger another viewport image download.
new ResizeObserver(([entry])=>{const h=entry.target.getBoundingClientRect().height;$('workspace').style.setProperty('--timeline-height',h+'px')}).observe(document.querySelector('.timeline'));
// Mobile details continue below the map in document flow. Opening them never
// changes the map height or raises the bottom playback controls.
const timelineDetails=document.querySelector('.timeline-legend'),mobileDetails=document.createElement('section');
mobileDetails.className='timeline-mobile-details';mobileDetails.setAttribute('aria-label','ລາຍລະອຽດແຜນທີ່');$('workspace').after(mobileDetails);
const detailNodes=[$('playbackStatus'),$('timelineFreshness'),$('forecastPointStatus'),$('timelineCoverage'),$('mapLegend')];
const originalDetailPositions=detailNodes.map(node=>({node,parent:node.parentNode,next:node.nextSibling}));
function layoutTimelineDetails(){
 if(mobileLayout()){for(const node of detailNodes)mobileDetails.append(node)}
 else for(const {node,parent,next} of [...originalDetailPositions].reverse()){parent.insertBefore(node,next?.parentNode===parent?next:null)}
 mobileDetails.hidden=!mobileLayout()||!timelineDetails.open;
 const headerHeight=document.querySelector('.topbar').getBoundingClientRect().height+document.querySelector('.prototype').getBoundingClientRect().height;
 document.body.style.setProperty('--page-header-height',headerHeight+'px');
}
timelineDetails.addEventListener('toggle',()=>{layoutTimelineDetails();if(mobileLayout()&&!timelineDetails.open)window.scrollTo({top:0,behavior:'instant'})});
window.matchMedia('(max-width:760px)').addEventListener('change',layoutTimelineDetails);
new ResizeObserver(layoutTimelineDetails).observe(document.querySelector('.topbar'));
layoutTimelineDetails();
loadWeather();loadRainStations();loadRiverLevels();loadNews();loadNotices();loadDams();loadRivers();loadPageLinks();loadRadar();loadIMERG();loadCloud();loadTerrain();loadAdminBoundaries();
import('./vendor/maplibre-gl-6.11.2/maplibre-gl.mjs').then(module=>{maplibregl=module;installSmoothImagery(maplibregl);initMap()}).catch(()=>{$('mapFallback').style.display='flex';toast('ແຜນທີ່ໂຫຼດບໍ່ສຳເລັດ')});
function scheduleLiveRefresh(){setTimeout(()=>{scheduleLiveRefresh();if(!document.hidden)refreshLiveData()},nextRefreshDelay())}
scheduleLiveRefresh();
function scheduleImageryRefresh(){setTimeout(()=>{scheduleImageryRefresh();if(!document.hidden)refreshImagery()},nextImageryRefreshDelay())}
scheduleImageryRefresh();
// AWS normally publishes a Himawari observation about 12 minutes after its
// nominal time. Check more often only inside that window; never relabel times.
function scheduleCloudPublicationCheck(){setTimeout(()=>{scheduleCloudPublicationCheck();const expected=Math.floor((Date.now()-11*60000)/600000)*600000;if(!document.hidden&&cloudProvider==='aws'&&(!cloudTimes.length||Date.parse(cloudTimes.at(-1))<expected))loadCloud().then(()=>{if(!playing)updateTimeline()}).catch(()=>{})},awsPublicationCheckDelay())}
scheduleCloudPublicationCheck();
// Expire calculated future frames when wall-clock time catches up, without extra source polling.
setInterval(()=>{if(motionMode&&!playing&&!document.hidden&&timeSlots.some(slot=>slot.time<=Date.now())){stopPlay();updateTimeline()}},1000);
