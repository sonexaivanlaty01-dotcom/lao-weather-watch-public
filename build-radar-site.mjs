import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const assets={};
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.geojson':'application/geo+json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
async function collect(dir,relative=''){
 for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  if(['server','.openai'].includes(entry.name))continue;
  const rel=relative+'/'+entry.name,full=path.join(dir,entry.name);
  if(entry.isDirectory())await collect(full,rel);
  else assets[rel]=[types[path.extname(entry.name)]||'application/octet-stream',(await fs.readFile(full)).toString('base64')];
 }
}
await collect(path.join(root,'dist'));
const optionalCache=await fs.readFile(path.join(root,'worker/optional-cache.mjs'),'utf8')+'\n'+await fs.readFile(path.join(root,'worker/snapshot-store.mjs'),'utf8');
const removeCacheImport=text=>text.replace("import {readOptionalCache,writeOptionalCache} from './optional-cache.mjs';",'').replace("import {readSnapshot,saveSnapshot} from './snapshot-store.mjs';",'');
const radar=removeCacheImport(await fs.readFile(path.join(root,'worker/radar.mjs'),'utf8'));
const ai=(await fs.readFile(path.join(root,'worker/ai.mjs'),'utf8')).replace("import {radarRoute} from './radar.mjs';",'');
const forecastData=await fs.readFile(path.join(root,'dist/forecast-data.js'),'utf8');
const forecast=removeCacheImport((await fs.readFile(path.join(root,'worker/forecast.mjs'),'utf8')).replace("import {FORECAST_GRID,forecastPoints} from '../dist/forecast-data.js';",''));
const jma=await fs.readFile(path.join(root,'dist/jma-satellite.js'),'utf8');
const satellite=removeCacheImport((await fs.readFile(path.join(root,'worker/satellite.mjs'),'utf8')).replace("import {jmaTimestamp} from '../dist/jma-satellite.js';",''));
const awsPalette=await fs.readFile(path.join(root,'dist/aws-palette.js'),'utf8');
const awsBzip=await fs.readFile(path.join(root,'worker/vendor/bzip2.mjs'),'utf8');
const awsHsd=(await fs.readFile(path.join(root,'worker/himawari-hsd.mjs'),'utf8')).replace("import {bunzipBytes} from './vendor/bzip2.mjs';",'').replace("import {AWS_PALETTE} from '../dist/aws-palette.js';",'');
const rainStations=removeCacheImport(await fs.readFile(path.join(root,'worker/rain-stations.mjs'),'utf8'));
const riverLevels=removeCacheImport(await fs.readFile(path.join(root,'worker/river-levels.mjs'),'utf8'));
const weatherNews=removeCacheImport(await fs.readFile(path.join(root,'worker/weather-news.mjs'),'utf8'));
const aws=removeCacheImport((await fs.readFile(path.join(root,'worker/aws-satellite.mjs'),'utf8')).replace("import {readHSD,cropLayout,copySegment,renderHSDIndexed,encodeIndexedPNG,AWS_REGION} from './himawari-hsd.mjs';",''));
const source=awsBzip+'\n'+awsPalette+'\n'+awsHsd+'\n'+aws+'\n'+optionalCache+'\n'+jma+'\n'+satellite+'\n'+radar+'\n'+ai+'\n'+forecastData+'\n'+forecast+'\n'+rainStations+'\n'+riverLevels+'\n'+weatherNews+`\nconst assets=${JSON.stringify(assets)};\nfunction lookupAIAsset(path){const item=assets[path];if(!item)throw new Error('missing_asset');return new TextDecoder().decode(Uint8Array.from(atob(item[1]),c=>c.charCodeAt(0)))}\nexport default {async fetch(request,env,ctx){const u=new URL(request.url);if(u.pathname.startsWith('/api/satellite/aws/'))return awsSatelliteRoute(request,ctx);if(u.pathname.startsWith('/api/satellite/jma/'))return satelliteRoute(request,ctx);if(u.pathname==='/api/forecast/grid')return forecastRoute(request,ctx);if(u.pathname==='/api/rain/stations')return rainStationsRoute(request,ctx);if(u.pathname==='/api/rivers/levels')return riverLevelsRoute(request,ctx);if(u.pathname==='/api/news/weather')return weatherNewsRoute(request,ctx);if(u.pathname.startsWith('/api/ai/'))return aiRoute(request,env,lookupAIAsset);if(u.pathname.startsWith('/api/radar/'))return radarRoute(request,ctx);if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const item=assets[u.pathname==='/'?'/index.html':u.pathname];if(!item)return new Response('Not found',{status:404});return new Response(request.method==='HEAD'?null:Uint8Array.from(atob(item[1]),c=>c.charCodeAt(0)),{headers:{'Content-Type':item[0],'Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'}})}};\n`;
await fs.mkdir(path.join(root,'dist/server'),{recursive:true});
await fs.writeFile(path.join(root,'dist/server/index.js'),source);
await fs.mkdir(path.join(root,'dist/.openai'),{recursive:true});
await fs.copyFile(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json'));
console.log(`Built existing site with ${Object.keys(assets).length} assets and live radar routes (${source.length} characters)`);
