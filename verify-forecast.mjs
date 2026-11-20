import assert from 'node:assert/strict';
import {FORECAST_GRID,forecastPoints,forecastPeriods,forecastCells,forecastCellAt,forecastRaster,FORECAST_HOUR} from './dist/forecast-data.js';
import {parseForecastRows,forecastRoute,forecastStale,GFS_META_URL,GFS_META_CHECK_MS,FORECAST_HOURS,FORECAST_MAX_AGE,FORECAST_FALLBACK_TTL} from './worker/forecast.mjs';
const now=Date.UTC(2026,9,7,5,20),base=Math.floor(now/FORECAST_HOUR)*3600,times=Array.from({length:12},(_,i)=>base+i*3600);
const rows=forecastPoints().map(()=>({hourly_units:{precipitation:'mm'},hourly:{time:times,precipitation:times.map((_,i)=>i)}}));
const data=parseForecastRows(rows,now),periods=forecastPeriods(data,now,3);assert.equal(data.cells.length,529);assert.equal(periods.length,3);assert(periods[0].start>=now);assert.equal(periods.at(-1).end-periods[0].start,3*FORECAST_HOUR);assert.equal(periods[0].end-periods[0].start,FORECAST_HOUR);
// Map: up to 12 consecutive hours, stopping where the grid ends (here 10 hours remain).
const all=forecastPeriods(data,now);assert.equal(all.length,10);assert(all.every((p,i)=>!i||p.start===all[i-1].end));assert.equal(FORECAST_HOURS,24);
assert.equal(forecastCellAt(data,98,13,periods[0].index),2);assert.equal(forecastCellAt(data,70,13,2),null);assert.equal(forecastCellAt(data,110,25,2),null);assert.equal(forecastCells(data,2).features.length,529);
assert.equal(forecastCellAt(data,109.25,24.25,2),2);assert.equal(forecastCellAt(data,97.75,12.75,2),2);assert.equal(forecastCellAt(data,109.251,24.25,2),null);
rows[0].hourly.precipitation[2]=null;const missing=parseForecastRows(rows,now);assert.equal(forecastCells(missing,2).features[0].properties.mm,null);assert.equal(forecastCellAt(missing,98,13,2),null);assert.equal(missing.missingValues,1);
assert.equal(forecastPeriods({...data,times:[]},now).length,0);assert.throws(()=>parseForecastRows(rows.slice(1)));assert.throws(()=>parseForecastRows(rows.map(r=>({...r,hourly_units:{precipitation:'inch'}}))));
const request=()=>new Request('https://example.com/api/forecast/grid',{headers:{'oai-authenticated-user-id':'owner'}});
assert.equal((await forecastRoute(new Request('https://example.com/api/forecast/grid'))).status,401);
assert.equal((await forecastRoute(new Request('https://example.com/api/forecast/grid',{method:'POST'}))).status,405);
// Downloads follow GFS runs: one download per new run (Open-Meteo metadata), not per request or per 2 hours.
const original=globalThis.fetch,realNow=Date.now;let calls=0,metaCalls=0,meta={last_run_initialisation_time:1760000000,last_run_availability_time:1760020000},clock=realNow();
const mock=async url=>{const u=new URL(url);assert.equal(u.hostname,'api.open-meteo.com');if(url===GFS_META_URL){metaCalls++;return Response.json(meta)}calls++;assert.equal(u.pathname,'/v1/gfs');assert.equal(u.searchParams.get('forecast_hours'),String(FORECAST_HOURS));return Response.json(rows)};
try{
 globalThis.fetch=mock;Date.now=()=>clock;
 const a=await forecastRoute(request()),b=await forecastRoute(request());assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(calls,1);
 const body=await a.json();assert.equal(body.kind,'model_forecast');assert.equal(body.run.init,meta.last_run_initialisation_time*1000);
 clock+=3*3600000;await forecastRoute(request());assert.equal(calls,1,'same run after 3 h: no download');
 meta={last_run_initialisation_time:meta.last_run_initialisation_time+21600,last_run_availability_time:meta.last_run_availability_time+21600};
 clock+=60000;await forecastRoute(request());assert.equal(calls,1,'metadata is re-read at most every 10 minutes');
 clock+=GFS_META_CHECK_MS;await forecastRoute(request());assert.equal(calls,2,'new run: one download');assert(metaCalls<=4);
}finally{globalThis.fetch=original;Date.now=realNow}
// Staleness rule.
const run={init:1000*3600000,available:1000*3600000+5*3600000},t0=run.available+600000,grid=f=>({fetchedAt:t0,run,...f});
assert.equal(forecastStale(null,run,t0),true);assert.equal(forecastStale(grid(),run,t0+5*3600000),false);assert.equal(forecastStale(grid(),{...run,init:run.init+21600000},t0),true);
assert.equal(forecastStale(grid(),run,t0+FORECAST_MAX_AGE),true);assert.equal(forecastStale(grid({run:null}),null,t0+FORECAST_FALLBACK_TTL-1),false);assert.equal(forecastStale(grid({run:null}),null,t0+FORECAST_FALLBACK_TTL),true);
// Shared store (Cloudflare KV): the scheduled job writes once per run; requests only read it.
const shared=await import('./worker/forecast.mjs?store');let saved=null,puts=0;const store={get:async()=>saved,put:async d=>{saved=JSON.parse(JSON.stringify(d));puts++}};
calls=0;try{globalThis.fetch=mock;
 assert.equal(await shared.refreshForecastStore(store),'updated');assert.equal(await shared.refreshForecastStore(store),'current');assert.equal(calls,1);assert.equal(puts,1);
 meta={last_run_initialisation_time:meta.last_run_initialisation_time+21600,last_run_availability_time:meta.last_run_availability_time+21600};
 assert.equal(await shared.refreshForecastStore(store),'updated');assert.equal(calls,2);
 const viaStore=await shared.forecastRoute(request(),{},{store});assert.equal(viaStore.status,200);assert.equal(calls,2,'requests read the store');
}finally{globalThis.fetch=original}
const empty=await import('./worker/forecast.mjs?empty-store');saved=null;puts=0;calls=0;
try{globalThis.fetch=mock;assert.equal((await empty.forecastRoute(request(),{},{store})).status,200);assert.equal(calls,1);assert.equal(puts,1,'empty store: the request fills it')}finally{globalThis.fetch=original}
const failed=await import('./worker/forecast.mjs?failure');calls=0;
try{globalThis.fetch=async url=>{if(url!==GFS_META_URL)calls++;throw new Error('upstream unavailable')};assert.equal((await failed.forecastRoute(request())).status,503);assert.equal((await failed.forecastRoute(request())).status,503);assert.equal(calls,1)}finally{globalThis.fetch=original}// Smooth display raster: same bounds as the cells, no colour below 0.1 mm, grey only where data is missing.
const rain=parseForecastRows(forecastPoints().map(([lon])=>({hourly_units:{precipitation:'mm'},hourly:{time:times,precipitation:times.map(()=>lon<103.5?0:8)}})),now),raster=forecastRaster(rain,2,220);
assert.deepEqual(raster.coordinates,[[97.75,24.25],[109.25,24.25],[109.25,12.75],[97.75,12.75]]);assert.equal(raster.pixels.length,raster.width*raster.height*4);assert(raster.height>raster.width);
const alphaAt=(x,y)=>raster.pixels[(y*raster.width+x)*4+3],mid=raster.height>>1;assert.equal(alphaAt(5,mid),0);assert(alphaAt(raster.width-5,mid)>150);
for(let x=0;x<raster.width;x++)assert.notEqual(alphaAt(x,mid),72);
const hole=forecastRaster(missing,2,220);assert.equal(hole.pixels[((hole.height-2)*hole.width+1)*4+3],72);assert.equal(hole.pixels[((hole.height-2)*hole.width+1)*4],119);
console.log('Forecast intervals/units, 529 sample cells, missing values, coverage bounds, authentication, run-based downloads, shared store and failure/backoff passed.');
