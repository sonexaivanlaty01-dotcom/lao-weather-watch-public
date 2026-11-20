// GPS button (owner's option A, 29 Oct 2026) that also works outside Laos and outside the map region.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync('dist/app.js','utf8'),shell=fs.readFileSync('dist/app-shell.js','utf8'),css=fs.readFileSync('dist/app-ui.css','utf8');
// Outside the region: no refusal; weather for the phone's place in local time, map not moved.
assert(!app.includes('ຕຳແໜ່ງ GPS ຢູ່ນອກຂອບເຂດແຜນທີ່ພາກພື້ນ'),'no refusal outside the region');
assert(app.includes("current={name:'ຕຳແໜ່ງຂອງທ່ານ',lat,lon,zoom:12,id:key||null,far}")&&app.includes('move(!far)'));
assert(app.includes("function move(fly=true)")&&app.includes('if(fly){map?.flyTo('));
assert(app.includes("timezone:current.far?'auto':'Asia/Vientiane'")&&app.includes("current.far?'ເວລາທ້ອງຖິ່ນ':'ລາວ'"));
assert(shell.includes("data.timezone!=='Asia/Vientiane'?' (ເວລາທ້ອງຖິ່ນ)'"));
// Visible buttons press the existing #locateBtn; busy while the phone looks for its position.
assert(shell.includes("gps.className='app-gps'")&&shell.includes('locate.click()')&&shell.includes("top.querySelector('.app-search').append(gpsSearch)")&&shell.includes("attributeFilter:['disabled']"));
assert(css.includes('.app-gps,.app-gps-search{display:none}')&&css.includes('@media(min-width:761px){body.app-c .app-gps-search{display:grid'),'desktop: icon at the end of the search box');
assert(shell.includes("gps:'<circle"),'line icon in the shared icon set');
// Phones only, map view only, hidden in storm mode.
assert(css.includes('@media(max-width:760px){body.app-c .app-gps{display:grid')&&css.includes('body.app-c .workspace:not([data-view=map]) .app-gps,body.storm-mode .app-gps{display:none!important}'));
for(const f of ['dist/app.js','dist/push.js'])assert(fs.readFileSync(f,'utf8').includes('app-shell.js?v=20261029-zoom'));
assert(fs.readFileSync('dist/index.html','utf8').includes('app.js?v=20261030-privacy')&&fs.readFileSync('dist/index.html','utf8').includes('app-ui.css?v=20261029-gps4'));
// Desktop zoom buttons move beside the palette when they would touch it (short screens).
assert(shell.includes('const placeZoom=()=>')&&shell.includes('a.top<p.bottom+8&&a.right>p.left-8')&&shell.includes("z.style.right='';if(mq.matches)return;"));
// iPhone report (29 Oct 2026): every error said "ບໍ່ໄດ້ຮັບສິດ". Each error code now has its own message,
// a timeout is retried once with a longer wait, and denial explains how to switch it on (iPhone / in-app browser).
assert(!app.includes("toast('GPS ບໍ່ໄດ້ຮັບສິດ · ທ່ານຍັງເລືອກເມືອງໄດ້')"),'no single message for all errors');
assert(app.includes('function gpsHelp(e)')&&app.includes('e&&e.code===1')&&app.includes('e&&e.code===3'));
assert(app.includes('FBAN|FBAV|FB_IAB|Instagram|Line\\/|Messenger'));
// "ວິທີເປີດ GPS" (owner OK 29 Oct 2026): button in the message opens step-by-step help for the phone in use.
const html=fs.readFileSync('dist/index.html','utf8');
assert(html.includes('<dialog id="gpsHelpDialog"')&&html.includes('data-gps="app"')&&html.includes('data-gps="ios"')&&html.includes('data-gps="android"'));
assert(html.includes('Safari Websites')&&html.includes('Website Settings')&&html.includes('id="gpsRetry"'));
assert(app.includes('function openGpsHelp(why)')&&app.includes('else openGpsHelp(gpsHelp(e))')&&html.includes('id="gpsHelpWhy"')&&app.includes("x.open=x.dataset.gps===pick"));
assert(app.includes('function toast(message,ms=6500)')&&!css.includes('.toast-action{')&&css.includes('.gps-path b{')&&css.includes('.gps-why{'));
assert(app.includes('if(e&&e.code===3&&!retry)return ask(true)')&&app.includes('timeout:retry?25000:15000'));
assert(app.includes('function toast(message,ms=6500)')&&css.includes('body.app-c .toast{width:max-content;max-width:min(440px,calc(100% - 30px))'));
console.log('gps ok');
