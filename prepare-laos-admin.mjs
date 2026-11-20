import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('.', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const OUT = path.join(ROOT, 'dist', 'data', 'admin');
const API = 'https://www.geoboundaries.org/api/current/gbOpen/LAO';
const NGD_NAMES = 'https://data.opendevelopmentmekong.net/geoserver/ODMekong/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=ODMekong%3Alao_admbnda_adm2_ngd_20191112&outputFormat=application%2Fjson&propertyName=ADM2_EN%2CADM2_LO%2CADM2_PCODE%2CADM1_EN%2CADM1_LO%2CADM1_PCODE';
const provincePcodes = {
  'LA-VT':'LA01','LA-PH':'LA02','LA-LM':'LA03','LA-OU':'LA04','LA-BK':'LA05','LA-LP':'LA06',
  'LA-HO':'LA07','LA-XA':'LA08','LA-XI':'LA09','LA-VI':'LA10','LA-BL':'LA11','LA-KH':'LA12',
  'LA-SV':'LA13','LA-SL':'LA14','LA-XE':'LA15','LA-CH':'LA16','LA-AT':'LA17','LA-XN':'LA18'
};

const allCoords = geometry => geometry.type === 'Polygon'
  ? geometry.coordinates.flat(1)
  : geometry.coordinates.flat(2);

function bboxOf(geometry) {
  const pts = allCoords(geometry);
  return pts.reduce((b,[x,y]) => [Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)], [Infinity,Infinity,-Infinity,-Infinity]);
}

function pointInRing([x,y], ring) {
  let inside = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [xi,yi]=ring[i], [xj,yj]=ring[j];
    if (((yi>y)!==(yj>y)) && x < (xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}

function pointInGeometry(point, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(poly => pointInRing(point,poly[0]) && !poly.slice(1).some(hole=>pointInRing(point,hole)));
}

function representativePoint(geometry) {
  const bbox = bboxOf(geometry);
  const center = [(bbox[0]+bbox[2])/2,(bbox[1]+bbox[3])/2];
  if (pointInGeometry(center,geometry)) return center;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const ring = polygons.sort((a,b)=>b[0].length-a[0].length)[0][0];
  const mean = ring.reduce((p,c)=>[p[0]+c[0]/ring.length,p[1]+c[1]/ring.length],[0,0]);
  return pointInGeometry(mean,geometry) ? mean : ring[Math.floor(ring.length/3)];
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

const normalizeEnglish = value => (value||'').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g,'');

const [metadata,officialNames] = await Promise.all([
  Promise.all(['ADM1','ADM2'].map(level=>fetchJson(`${API}/${level}/`))),
  fetchJson(NGD_NAMES)
]);
const [adm1Raw,adm2Raw] = await Promise.all(metadata.map(meta=>fetchJson(meta.simplifiedGeometryGeoJSON)));
if (adm1Raw.features.length !== 18 || adm2Raw.features.length !== 148 || officialNames.features.length !== 148) throw new Error('Unexpected Lao boundary/name counts');

const officialDistricts = officialNames.features.map(feature=>feature.properties);
const officialProvinces = new Map(officialDistricts.map(item=>[item.ADM1_PCODE,item]));

const adm1Features = adm1Raw.features.map(feature => {
  const {shapeISO,shapeName,shapeID}=feature.properties;
  const pcode=provincePcodes[shapeISO], official=officialProvinces.get(pcode);
  if (!official?.ADM1_LO) throw new Error(`Missing official Lao province name for ${shapeISO}`);
  const bbox=bboxOf(feature.geometry), center=representativePoint(feature.geometry);
  return {...feature,properties:{id:shapeISO||shapeID,pcode,level:'province',name_en:shapeName,name_lo:official.ADM1_LO,bbox,center}};
});

const adm2Features = adm2Raw.features.map(feature => {
  const {shapeName,shapeID}=feature.properties;
  const bbox=bboxOf(feature.geometry), center=representativePoint(feature.geometry);
  const parent=adm1Features.find(item=>pointInGeometry(center,item.geometry)) || adm1Features.find(item=>{
    const b=item.properties.bbox;
    return center[0]>=b[0]&&center[0]<=b[2]&&center[1]>=b[1]&&center[1]<=b[3];
  });
  const official=officialDistricts.find(item=>item.ADM1_PCODE===parent?.properties.pcode&&normalizeEnglish(item.ADM2_EN)===normalizeEnglish(shapeName));
  if (!official?.ADM2_LO) throw new Error(`Missing official Lao district name for ${parent?.properties.name_en}/${shapeName}`);
  return {...feature,properties:{id:shapeID,pcode:official.ADM2_PCODE,level:'district',name_en:shapeName,name_lo:official.ADM2_LO,parent_id:parent.properties.id,parent_en:parent.properties.name_en,parent_lo:parent.properties.name_lo,bbox,center}};
});

if (new Set(adm2Features.map(feature=>feature.properties.pcode)).size !== 148) throw new Error('Official Lao district codes are not unique');

await mkdir(OUT,{recursive:true});
await Promise.all([
  writeFile(path.join(OUT,'provinces.geojson'),JSON.stringify({type:'FeatureCollection',features:adm1Features})),
  writeFile(path.join(OUT,'districts.geojson'),JSON.stringify({type:'FeatureCollection',features:adm2Features}))
]);

console.log(JSON.stringify({provinces:adm1Features.length,districts:adm2Features.length,laoNames:adm2Features.filter(feature=>feature.properties.name_lo).length,nameSource:'National Geographic Department (NGD) via Open Development Mekong',boundaryLicense:metadata[0].licenseDetail,boundarySource:metadata[0].boundarySource}));
