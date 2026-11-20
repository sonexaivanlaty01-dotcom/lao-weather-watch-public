// Phone layout "C": place search over the real 18 provinces / 148 districts, applying a place
// through the existing pickers, icons, and page wiring.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {searchKey,placeIndex,searchPlaces,choosePlace,icon} from './dist/app-shell.js';
const provinces=JSON.parse(fs.readFileSync('dist/data/admin/provinces.geojson','utf8')).features,districts=JSON.parse(fs.readFileSync('dist/data/admin/districts.geojson','utf8')).features;
const index=placeIndex(provinces,districts);assert.equal(index.length,18+148);
assert.equal(searchKey('ມ. ປາກເຊ'),searchKey('ປາກເຊ'),'district prefix "ມ." is ignored');
// Lao query: Pakse district, with its province values for the pickers.
const pakse=searchPlaces(index,'ປາກເຊ');assert.equal(pakse[0].label,'ມ. ປາກເຊ');assert.equal(pakse[0].province,'LA-CH');assert(pakse[0].district);assert.equal(pakse[0].sub,'ແຂວງຈຳປາສັກ');
// Prefix matches come before "contains" matches; provinces before districts on a tie.
const pak=searchPlaces(index,'ປາກ');assert(pak.length===8&&pak.every(p=>p.keys.some(k=>k.startsWith(searchKey('ປາກ')))));
const champa=searchPlaces(index,'ຈຳປາສັກ');assert.equal(champa[0].district,null,'province first');
// English names work too (visitors typing in Latin script).
assert.equal(searchPlaces(index,'pakse')[0].label,'ມ. ປາກເຊ');assert.equal(searchPlaces(index,'vientiane')[0].district,null);
assert.deepEqual(searchPlaces(index,'   '),[]);assert.deepEqual(searchPlaces(index,'zzzz'),[]);
// choosePlace sets province first (which fills the district list), then the district.
const events=[],sel=name=>({value:'',dispatchEvent(e){events.push(name+':'+this.value+':'+e.type)}});
const province=sel('province'),district=sel('district');choosePlace(pakse[0],{province,district});
assert.deepEqual(events,['province:LA-CH:change','district:'+pakse[0].district+':change']);
events.length=0;choosePlace(champa[0],{province,district});assert.deepEqual(events,['province:LA-CH:change'],'province only');
assert.match(icon('map'),/^<svg[^>]+aria-hidden="true"/);
// Wiring: stylesheet and module loaded, shell set up before feedback binds its buttons, phone padding.
const html=fs.readFileSync('dist/index.html','utf8'),app=fs.readFileSync('dist/app.js','utf8'),css=fs.readFileSync('dist/app-ui.css','utf8');
assert(html.includes('./app-ui.css?v=')&&html.indexOf('app-ui.css')>html.indexOf('compact-ui.css'),'loaded after compact-ui.css');
// iPhone Safari (25 Oct 2026): dark dropdowns need appearance:none, or Safari paints them white under white text.
for(const sel of ['body.app-c .timeline select{','body.app-c .control-dock select:not([multiple]){','body.app-c .timeline-head .app-mode-select{']){const rule=css.slice(css.indexOf(sel),css.indexOf('}',css.indexOf(sel)));assert(css.includes(sel)&&/-webkit-appearance:none/.test(rule)&&/(^|;)appearance:none/.test(rule.replace(sel,'')),'iPhone: '+sel+' has appearance:none')}
assert(app.indexOf('setupAppShell({controlDock})')<app.indexOf('setupFeedback({'),'feedback button in the search bar gets bound');
assert(/<nav class="mobile-nav"[\s\S]*data-view="map"[\s\S]*data-view="weather"[\s\S]*data-view="layers"[\s\S]*data-view="news"[\s\S]*data-ai-open/.test(html),'bottom bar keeps all five entries');
assert(/@media\(max-width:760px\)/.test(css)&&css.includes('.app-top,.app-weather,.app-palette,.app-layers-more,.app-note-m,.app-mode-select{display:none}'),'shell parts stay hidden until the shell is set up');
// One dark-glass theme for all sizes: shared block before both layouts; phone = design 3 (card top-left, layer column).
{const shared=css.indexOf('Shared dark-glass theme'),phone=css.indexOf('@media(max-width:760px)'),desk=css.indexOf('@media(min-width:761px)');
 assert(shared>0&&shared<phone&&phone<desk,'theme shared, then phone layout, then desktop layout');
 const sharedBlock=css.slice(shared,phone);assert(sharedBlock.includes('body.app-c{--glass:')&&sharedBlock.includes('.control-dock .panel'),'glass variables and dark panels apply on phones too');
 const phoneBlock=css.slice(phone,desk);assert(phoneBlock.includes('.app-weather{display:grid')&&phoneBlock.includes('top:calc(66px')&&phoneBlock.includes('.app-layers-more{display:grid'),'phone: weather card top-left, layer column with all-layers button');
 assert(!phoneBlock.includes('background:#fff;border:0;border-top'),'no light timeline left on phones');
 assert(fs.readFileSync('dist/app-shell.js','utf8').includes("moreLayers.className='app-layers-more'"));
 // Compact option A: one-line weather chip under the search, edge layer column, mode dropdown.
 const compact=phoneBlock.slice(phoneBlock.indexOf('Compact option A'));
 assert(compact.includes('border-radius:999px')&&compact.includes('top:calc(52px')&&compact.includes('right:0;gap:2px')&&compact.includes('.timeline-mode{display:none!important}')&&compact.includes('.app-mode-select{display:block'),'phone: compact option A');}
const shellJs=fs.readFileSync('dist/app-shell.js','utf8');
assert(shellJs.includes("note.className='app-note-m'")&&shellJs.includes("sel.className='app-mode-select'")&&shellJs.includes('$(sel.value)?.click()'),'mode dropdown drives the existing mode buttons');
assert(app.includes("street:{province:'#334155'")&&app.includes("styleAdminLines(enabled('satellite'))"),'dark gray boundaries on the street map (option D)');
assert(html.includes('<body class="app-c app-boot">')&&css.includes('body.app-boot .quick-layers')&&shellJs.includes("classList.remove('app-boot')"),'new layout from the first paint (no flash of the old header)');
assert(app.includes('top:Math.min(height*.2,110),right:52'),'map padding follows the compact phone layout');
assert(css.includes('ຕົ້ນແບບ')===false&&shellJs.includes('ຕົ້ນແບບ · ບໍ່ແມ່ນປະກາດທາງການ'),'disclaimer stays visible on phones (caption under the chip)');
// Desktop design 1: palette switches point at real layer switches; desktop section exists; the
// forecast covers 7 days with days 4–7 marked as a trend; weather card gets its data by event.
const {PALETTE_SWITCHES}=await import('./dist/app-shell.js');
for(const [id] of PALETTE_SWITCHES)assert(html.includes(`id="${id}"`),'palette switch '+id+' exists in the layers panel');
assert(css.includes('@media(min-width:761px)')&&css.includes('.app-palette')&&css.includes('--glass'),'desktop dark-glass section');
assert(app.includes("past_days:'1',forecast_days:'8'")&&app.includes('FORECAST_CONFIDENT_DAYS=3')&&html.includes('ພະຍາກອນ 7 ມື້'),'7-day forecast with confidence');
assert(app.includes("new CustomEvent('weather:update'"),'weather card is fed by the weather loader');
// Lao-only site: browsers must not auto-translate it (Thai-language phones turned it into overflowing Thai).
assert(/<html lang="lo" translate="no">/.test(html)&&html.includes('<meta name="google" content="notranslate">'),'no auto-translation');
assert(!/[฀-๿]/.test(html+app+fs.readFileSync('dist/app-shell.js','utf8')),'no Thai text in the public page');
console.log('App shell: place search (Lao + English), picker hand-off, icons and phone wiring passed.');
