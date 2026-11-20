// Builds the data for the province weather pages (SEO, 20 Oct 2026):
//   worker/seo-provinces.mjs  18 provinces: slug, Lao/English name, centre, hero map frame (Web
//                             Mercator, 780x600) and simplified province/district outlines as SVG paths
//   dist/sitemap.xml          home, about, /weather, 18 province pages, /th
// Source: dist/data/admin/*.geojson (NGD Lao names, geoBoundaries shapes). Run: node build-seo.mjs
import fs from 'node:fs';
export const SITE='https://lao-weather-watch.sonexaivanlaty01.workers.dev',HERO={w:780,h:600};
const R=6378137,mx=lon=>lon*Math.PI/180*R,my=lat=>R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
export const slugOf=nameEn=>nameEn.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// Frame around a lon/lat box: padded, then widened/heightened to the hero aspect.
export function heroFrame([w,s,e,n],pad=.14){
 let x0=mx(w),x1=mx(e),y0=my(s),y1=my(n);const px=(x1-x0)*pad,py=(y1-y0)*pad;x0-=px;x1+=px;y0-=py;y1+=py;
 const want=HERO.w/HERO.h,cw=x1-x0,ch=y1-y0;
 if(cw/ch<want){const add=(ch*want-cw)/2;x0-=add;x1+=add}else{const add=(cw/want-ch)/2;y0-=add;y1+=add}
 return [x0,y0,x1,y1].map(v=>Math.round(v));
}
const toPx=([x0,y0,x1,y1])=>([lon,lat])=>[(mx(lon)-x0)/(x1-x0)*HERO.w,(y1-my(lat))/(y1-y0)*HERO.h];
// Douglas–Peucker in pixels.
function simplify(pts,tol){if(pts.length<3)return pts;const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;const stack=[[0,pts.length-1]];
 while(stack.length){const [a,b]=stack.pop();const [ax,ay]=pts[a],[bx,by]=pts[b],dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1;let best=-1,bi=-1;
  for(let i=a+1;i<b;i++){const d=Math.abs(dy*pts[i][0]-dx*pts[i][1]+bx*ay-by*ax)/len;if(d>best){best=d;bi=i}}
  if(best>tol){keep[bi]=1;stack.push([a,bi],[bi,b])}}
 return pts.filter((_,i)=>keep[i]);}
const rings=g=>g.type==='Polygon'?g.coordinates:g.coordinates.flat();
// A closed ring starts and ends on the same point, which Douglas–Peucker would collapse to a line:
// simplify the two halves separately.
const simplifyRing=(pts,tol)=>{if(pts.length<4)return pts;const mid=pts.length>>1;return [...simplify(pts.slice(0,mid+1),tol).slice(0,-1),...simplify(pts.slice(mid),tol)]};
export function svgPath(geometry,frame,tol=1.2){
 const p=toPx(frame);return rings(geometry).map(r=>simplifyRing(r.map(p),tol)).filter(r=>r.length>2).map(r=>'M'+r.map(([x,y])=>x.toFixed(1)+' '+y.toFixed(1)).join('L')+'Z').join('');
}
export function buildProvinces(provinces,districts){
 return provinces.map(f=>{const p=f.properties,frame=heroFrame(p.bbox);
  const ds=districts.filter(d=>d.properties.parent_id===p.id).sort((a,b)=>a.properties.name_lo.localeCompare(b.properties.name_lo,'lo'));
  return {id:p.id,slug:slugOf(p.name_en),name_lo:p.name_lo,name_en:p.name_en,center:p.center.map(v=>Math.round(v*1e4)/1e4),frame,
   outline:svgPath(f.geometry,frame,1),districtLines:ds.map(d=>svgPath(d.geometry,frame,1.6)).join(''),
   districts:ds.map(d=>({id:d.properties.id,name_lo:d.properties.name_lo}))};
 }).sort((a,b)=>a.name_lo.localeCompare(b.name_lo,'lo'));
}
// Thai landing page (/th): for Thai speakers who search "พยากรณ์อากาศลาว". The site itself stays Lao.
export const THAI_NAMES={'vientiane-capital':'นครหลวงเวียงจันทน์','luang-prabang':'หลวงพระบาง',champasak:'จำปาสัก',savannakhet:'สะหวันนะเขต',khammouane:'คำม่วน',salavan:'สาละวัน',xekong:'เซกอง',attapeu:'อัตตะปือ',xiangkhouang:'เชียงขวาง',xaisomboun:'ไซสมบูน',xaignabouli:'ไซยะบุรี',bokeo:'บ่อแก้ว',bolikhamsai:'บอลิคำไซ',phongsaly:'ผ้งสาลี',vientiane:'แขวงเวียงจันทน์',houaphan:'หัวพัน','luang-namtha':'หลวงน้ำทา',oudomxay:'อุดมไซ'};
export function thaiPage(list,frame,lines){
 const img=`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${frame.join(',')}&bboxSR=3857&imageSR=3857&size=780,600&format=jpg&f=image`;
 const faq=[['วันนี้ที่ลาวฝนตกไหม?','ดูคำตอบรายแขวงได้ในหน้าพยากรณ์ของแต่ละแขวง เช่น เวียงจันทน์ หลวงพระบาง จำปาสัก มีโอกาสฝนเป็นเปอร์เซ็นต์และปริมาณฝน (มม.) ของวันนี้และพรุ่งนี้ อัปเดตจากแบบจำลอง GFS'],['ระดับน้ำโขงที่ลาววันนี้เท่าไร?','ดูระดับน้ำจริงจากสถานีของคณะกรรมาธิการแม่น้ำโขง (MRC) ในลาว อัปเดตทุก 30 นาที พร้อมแจ้งเตือนเมื่อน้ำขึ้นเร็ว'],['ดูภาพเมฆและเรดาร์ฝนของลาวได้ที่ไหน?','บนแผนที่สดของเว็บ: ภาพเมฆดาวเทียม Himawari-9 ทุก 10 นาที เรดาร์ฝนจากไทย เวียดนาม และจีน และฝนจากดาวเทียม NASA'],['เว็บนี้เป็นของหน่วยงานรัฐไหม?','ไม่ใช่ เป็นโครงการชุมชนไม่หวังผลกำไร ไม่ใช่ประกาศเตือนภัยทางการ ควรติดตามประกาศของกรมอุตุนิยมวิทยาและอุทกวิทยาลาวด้วย']];
 const ld={'@context':'https://schema.org','@graph':[{'@type':'WebPage',name:'พยากรณ์อากาศลาว วันนี้',inLanguage:'th',url:SITE+'/th'},{'@type':'FAQPage',mainEntity:faq.map(([q,a])=>({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}}))}]};
 return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b1424">
<title>พยากรณ์อากาศลาว วันนี้ · ฝน เรดาร์ ภาพเมฆ ระดับน้ำโขง | ลาวปลอดภัย</title>
<meta name="description" content="พยากรณ์อากาศลาววันนี้และ 7 วัน ทุกแขวง: ฝนตกไหม เรดาร์ฝน ภาพเมฆดาวเทียม ระดับน้ำโขงจากสถานี MRC ฟรี (เว็บหลักเป็นภาษาลาว)">
<link rel="canonical" href="${SITE}/th"><meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="website"><meta property="og:locale" content="th_TH"><meta property="og:site_name" content="ລາວປອດໄພ"><meta property="og:title" content="พยากรณ์อากาศลาว วันนี้ | ลาวปลอดภัย"><meta property="og:description" content="ฝน เรดาร์ ภาพเมฆ ระดับน้ำโขง และพยากรณ์ 7 วัน ทุกแขวงในลาว"><meta property="og:url" content="${SITE}/th"><meta property="og:image" content="${SITE}/og/home.jpg?v=3"><meta name="twitter:card" content="summary_large_image">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;600;800&family=Noto+Sans+Lao:wght@600&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0;padding:0}html{background:#0b1424}body{max-width:560px;margin:0 auto;background:#0b1424;color:#e9eef6;font:15px/1.6 'Noto Sans Thai','Noto Sans Lao',system-ui,sans-serif}a{color:inherit}.m{color:#9fb0c6}
.hero{position:relative;height:0;padding-bottom:76.9%;background:#13213a url('${img}') center/cover}.hero svg{position:absolute;inset:0;width:100%;height:100%}.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,20,36,.35),rgba(11,20,36,.05) 40%,#0b1424 96%)}
.title{position:absolute;left:16px;right:16px;bottom:14px}h1{font-size:28px;line-height:1.2;font-weight:800}
.card{margin:12px;border-radius:18px;padding:14px 16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09)}h2{font-size:17px;margin-bottom:6px}
.btn{display:block;margin:12px;padding:14px;border-radius:14px;background:#2563eb;color:#fff;text-align:center;font-weight:700;text-decoration:none}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chips a{border-radius:999px;padding:6px 12px;font-size:13.5px;background:rgba(255,255,255,.07);color:#cfe0f5;text-decoration:none}
.q{font-weight:700;margin-top:10px}ul{padding-left:20px}</style>
<script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>
<div class="hero"><svg viewBox="0 0 780 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path d="${lines}" fill="rgba(36,164,255,.10)" stroke="#ffe066" stroke-width="1.6"/></svg><div class="shade"></div><div class="title"><div class="m">ลาวปลอดภัย · ລາວປອດໄພ</div><h1>พยากรณ์อากาศลาว วันนี้</h1><div class="m">ฝน · เรดาร์ · ภาพเมฆ · ระดับน้ำโขง · ทุกแขวง</div></div></div>
<div class="card"><p>เว็บติดตามสภาพอากาศและภัยพิบัติในลาว <b>ฟรี</b> ไม่มีโฆษณา ใช้ได้ทั้งมือถือและคอมพิวเตอร์ ตัวเว็บหลักเป็น<b>ภาษาลาว</b></p><ul style="margin-top:8px"><li>พยากรณ์อากาศวันนี้ พรุ่งนี้ และ 7 วัน ทั้ง 18 แขวง</li><li>ภาพเมฆดาวเทียม Himawari-9 ทุก 10 นาที และเมฆคาดการณ์ 3 ชั่วโมง</li><li>เรดาร์ฝนจากไทย เวียดนาม จีน และฝนพยากรณ์ 12 ชั่วโมง</li><li>ระดับน้ำโขงและฝนวัดจริงจากสถานี MRC พร้อมแจ้งเตือนน้ำขึ้นเร็ว</li></ul></div>
<a class="btn" href="/">เปิดแผนที่สด (ภาษาลาว) ›</a>
<div class="card"><h2>พยากรณ์อากาศรายแขวง</h2><div class="chips">${list.map(p=>`<a href="/weather/${p.slug}">${THAI_NAMES[p.slug]||p.name_en} · ${p.name_lo}</a>`).join('')}</div></div>
<div class="card"><h2>คำถามที่พบบ่อย</h2>${faq.map(([q,a])=>`<div class="q">${q}</div><div class="m">${a}</div>`).join('')}</div>
<p class="m" style="font-size:12px;padding:6px 16px 28px">โครงการชุมชนไม่หวังผลกำไร · ไม่ใช่ประกาศเตือนภัยทางการ · ข้อมูล: Open-Meteo (NOAA GFS), MRC, NASA, JMA Himawari, RainViewer · ภาพดาวเทียม Esri</p>
</body></html>`;
}
export const provinceLinks=list=>'<div class="province-chips">'+list.map(p=>`<a href="/weather/${p.slug}">${p.name_lo}</a>`).join('')+'</div>';
export function sitemap(provinces,day){
 const urls=['/','/about','/weather',...provinces.map(p=>'/weather/'+p.slug),'/th'];
 return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(u=>`  <url><loc>${SITE}${u}</loc><lastmod>${day}</lastmod>${u.startsWith('/weather')?'<changefreq>hourly</changefreq>':''}</url>`).join('\n')+'\n</urlset>\n';
}
if(process.argv[1]?.endsWith('build-seo.mjs')){
 const read=f=>JSON.parse(fs.readFileSync(f,'utf8')).features;
 const list=buildProvinces(read('dist/data/admin/provinces.geojson'),read('dist/data/admin/districts.geojson'));
 if(list.length!==18)throw new Error('expected 18 provinces');
 // Whole-country frame for the /weather index hero, with every province outline.
 const provincesGeo=read('dist/data/admin/provinces.geojson'),laosFrame=heroFrame([100.08,13.9,107.7,22.5],.04);
 const laosLines=provincesGeo.map(f=>svgPath(f.geometry,laosFrame,1.4)).join('');
 fs.writeFileSync('worker/seo-provinces.mjs','// Generated by build-seo.mjs — do not edit by hand. Province page data (NGD Lao names, geoBoundaries shapes).\nexport const PROVINCES='+JSON.stringify(list)+';\nexport const LAOS={frame:'+JSON.stringify(laosFrame)+',lines:'+JSON.stringify(laosLines)+'};\n');
 fs.writeFileSync('dist/sitemap.xml',sitemap(list,new Date(Date.now()+7*3600000).toISOString().slice(0,10)));
 fs.mkdirSync('dist/th',{recursive:true});fs.writeFileSync('dist/th/index.html',thaiPage(list,laosFrame,laosLines));
 // Plain links to every province page inside the home page (so search engines find them).
 const home=fs.readFileSync('dist/index.html','utf8'),links=provinceLinks(list);
 if(!home.includes('<!--provinces-->'))throw new Error('province markers missing in dist/index.html');
 fs.writeFileSync('dist/index.html',home.replace(/<!--provinces-->[\s\S]*?<!--\/provinces-->/,'<!--provinces-->'+links+'<!--/provinces-->'));
 console.log('provinces',list.length,'module KB',Math.round(fs.statSync('worker/seo-provinces.mjs').size/1024),'| slugs:',list.map(p=>p.slug).join(' '));
}
