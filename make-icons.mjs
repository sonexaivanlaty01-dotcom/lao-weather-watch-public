// Writes the app icons in dist/icons from the site logo (cloud + rain, owner's choice 28 Oct 2026; same
// drawing as worker/brand.mjs) and the Facebook profile picture in docs/brand. Needs Playwright:
//   node make-icons.mjs   (run where `playwright` is installed, e.g. the scratchpad with npm i playwright)
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {LOGO_GLYPH,BRAND_NAVY} from './worker/brand.mjs';
const {chromium}=createRequire(process.env.PLAYWRIGHT_FROM||import.meta.url)('playwright');
const tile=(rx,scale=1)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${rx}" fill="${BRAND_NAVY}"/><g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${LOGO_GLYPH}</g></svg>`;
// Android status-bar badge: white only, on transparent.
const badge=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="translate(32 32) scale(1.18) translate(-32 -32)">${LOGO_GLYPH.replaceAll('#75c8ff','#fff')}</g></svg>`;
const files={'dist/icons/icon-192.png':[192,tile(14)],'dist/icons/icon-512.png':[512,tile(14)],'dist/icons/maskable-512.png':[512,tile(0,.74)],
 'dist/icons/apple-touch-icon.png':[180,tile(0,.88)],'dist/icons/badge-96.png':[96,badge],'docs/brand/facebook-profile.png':[1080,tile(0,.92)]};
// Favicon as real files (30 Oct 2026): Google Search ignores data: favicons and asks for /favicon.ico when
// there is none, so results showed a grey globe. favicon.ico holds 16, 32 and 48 px PNGs (48 = Google's size).
const ICO_SIZES=[16,32,48];
const out=file=>new URL('./'+file,import.meta.url).pathname.replace(/^\/(\w:)/,'$1');
const b=await chromium.launch(),p=await b.newPage(),png={};
for(const [file,[size,svg]] of [...Object.entries(files),...ICO_SIZES.map(s=>[`ico-${s}`,[s,tile(14)]])]){
 await p.setViewportSize({width:size,height:size});
 await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ',`<svg width="${size}" height="${size}" `)}</body></html>`);
 const shot={omitBackground:true,clip:{x:0,y:0,width:size,height:size}};
 if(file.startsWith('ico-')){png[size]=await p.screenshot(shot);continue}
 fs.mkdirSync(new URL('./'+file.split('/').slice(0,-1).join('/'),import.meta.url),{recursive:true});
 await p.screenshot({...shot,path:out(file)});console.log('ok',file);
}
await b.close();
// ICO = 6-byte header, one 16-byte entry per image, then the PNGs as they are.
const head=Buffer.alloc(6+16*ICO_SIZES.length);head.writeUInt16LE(1,2);head.writeUInt16LE(ICO_SIZES.length,4);
let at=head.length;ICO_SIZES.forEach((s,i)=>{const e=6+16*i;head[e]=s;head[e+1]=s;head.writeUInt16LE(1,e+4);head.writeUInt16LE(32,e+6);head.writeUInt32LE(png[s].length,e+8);head.writeUInt32LE(at,e+12);at+=png[s].length});
fs.writeFileSync(out('dist/favicon.ico'),Buffer.concat([head,...ICO_SIZES.map(s=>png[s])]));console.log('ok dist/favicon.ico');
fs.writeFileSync(out('dist/favicon.svg'),tile(14));console.log('ok dist/favicon.svg');
