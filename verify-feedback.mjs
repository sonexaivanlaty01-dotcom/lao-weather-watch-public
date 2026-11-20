// Visitor feedback: validation, spam controls, storage, admin listing and page wiring.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateFeedback,feedbackRoute,feedbackListRoute,FEEDBACK_PER_HOUR,FEEDBACK_MAX_CHARS} from './worker/feedback.mjs';
import {feedbackPayload} from './dist/feedback.js';
// Minimal in-memory stand-in for the two D1 statements the route uses.
function fakeD1(){const rows=[];return {rows,prepare(sql){return {bind(...a){return {
 first:async()=>({n:rows.filter(r=>r.visitor===a[0]&&r.created_at>=a[1]).length}),
 run:async()=>{rows.push({id:rows.length+1,created_at:a[0],rating:a[1],topic:a[2],message:a[3],view:a[4],viewport:a[5],country:a[6],visitor:a[7]});return {success:true}}}},
 all:async()=>{assert(/ORDER BY id DESC/.test(sql));return {results:[...rows].reverse().map(({visitor,...r})=>r)}}}}}}
const ok={rating:4,topic:'request',message:'ຢາກໃຫ້ມີແຜນທີ່ນ້ຳຖ້ວມ',website:'',elapsedMs:9000,view:'map',viewport:'375x812'};
// Validation.
assert.deepEqual(validateFeedback(ok),{ok:true,entry:{rating:4,topic:'request',message:'ຢາກໃຫ້ມີແຜນທີ່ນ້ຳຖ້ວມ',view:'map',viewport:'375x812'}});
assert.equal(validateFeedback({...ok,website:'http://spam'}).bot,true,'honeypot');
assert.equal(validateFeedback({...ok,elapsedMs:500}).bot,true,'too fast');
assert.equal(validateFeedback({...ok,rating:null,message:'ok'}).reason,'empty');
assert.equal(validateFeedback({...ok,rating:9,topic:'hack'}).entry.rating,null);assert.equal(validateFeedback({...ok,rating:9,topic:'hack'}).entry.topic,null);
assert.equal(validateFeedback({...ok,message:'x'.repeat(5000)}).entry.message.length,FEEDBACK_MAX_CHARS);
assert.equal(validateFeedback({...ok,view:'<script>',viewport:'1;DROP'}).entry.view,'script');assert.equal(validateFeedback({...ok,viewport:'1;DROP'}).entry.viewport,'1');
// Route: stores anonymously, limits per visitor and hour, rejects other origins.
const site='https://lao-weather-watch.example.workers.dev';
const post=(body,ip='1.2.3.4',origin=site)=>new Request(site+'/api/feedback',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':ip,...(origin?{Origin:origin}:{})},body:typeof body==='string'?body:JSON.stringify(body)});
const db=fakeD1(),env={FEEDBACK_DB:db,ADMIN_KEY:'test-admin-key-123456'},now=Date.parse('2026-10-16T05:00:00Z');
let r=await feedbackRoute(post(ok),env,{now});assert.equal(r.status,200);assert.equal(db.rows.length,1);
const row=db.rows[0];assert.equal(row.message,ok.message);assert(!JSON.stringify(row).includes('1.2.3.4'),'no IP stored');assert.match(row.visitor,/^[0-9a-f]{24}$/);
assert.equal((await feedbackRoute(post({...ok,website:'x'}),env,{now})).status,200);assert.equal(db.rows.length,1,'bots are not stored');
assert.equal((await feedbackRoute(post({...ok,rating:null,message:''}),env,{now})).status,400);
assert.equal((await feedbackRoute(post('not json'),env,{now})).status,400);
assert.equal((await feedbackRoute(post(ok,'1.2.3.4','https://evil.example'),env,{now})).status,403);
assert.equal((await feedbackRoute(new Request(site+'/api/feedback'),env,{now})).status,405);
assert.equal((await feedbackRoute(post(ok),{},{now})).status,503);
for(let i=1;i<FEEDBACK_PER_HOUR;i++)assert.equal((await feedbackRoute(post(ok),env,{now:now+i})).status,200);
assert.equal((await feedbackRoute(post(ok),env,{now:now+10})).status,429,'6th within the hour');
assert.equal((await feedbackRoute(post(ok,'5.6.7.8'),env,{now:now+10})).status,200,'other visitor');
assert.equal((await feedbackRoute(post(ok),env,{now:now+3700000})).status,200,'next hour');
// Admin listing needs the key.
const list=key=>new Request(site+'/api/feedback/list',{headers:key?{'X-Admin-Key':key}:{}});
assert.equal((await feedbackListRoute(list(),env)).status,401);assert.equal((await feedbackListRoute(list('wrong-key-wrong-key'),env)).status,401);
assert.equal((await feedbackListRoute(list('short'),{...env,ADMIN_KEY:'short'})).status,401,'keys under 12 characters are refused');
r=await feedbackListRoute(list(env.ADMIN_KEY),env);assert.equal(r.status,200);const data=await r.json();
assert.equal(data.count,db.rows.length);assert.equal(data.averageRating,4);assert.equal(data.byTopic.request,db.rows.length);assert(!('visitor' in data.entries[0]));assert(data.entries[0].id>data.entries.at(-1).id);
// Page payload and wiring.
assert.deepEqual(feedbackPayload({rating:'5',topic:'data',message:'  ok  ',view:'news'},1000,4000),{rating:5,topic:'data',message:'ok',website:'',elapsedMs:3000,view:'news',viewport:null});
const html=fs.readFileSync('dist/index.html','utf8'),app=fs.readFileSync('dist/app.js','utf8'),admin=fs.readFileSync('dist/admin.html','utf8'),robots=fs.readFileSync('dist/robots.txt','utf8'),worker=fs.readFileSync('cloudflare-site/worker.mjs','utf8'),schema=fs.readFileSync('cloudflare-site/feedback-schema.sql','utf8');
assert(/class="feedback-nav-button" data-feedback-open[^>]*>💬 ຕິຊົມ<\/button><button class="ai-nav-button"/.test(html),'button sits next to Ask AI in the top bar');
assert(html.includes('id="feedbackDialog"')&&html.includes('id="fbWebsite"')&&html.includes('ບໍ່ເກັບຊື່ ອີເມວ ຫຼື ທີ່ຢູ່ IP'));
assert(app.includes("setupFeedback({openButtons:[...document.querySelectorAll('[data-feedback-open]')]"));
assert(admin.includes('noindex')&&admin.includes("'X-Admin-Key'")&&robots.includes('Disallow: /admin.html'));
assert(worker.includes("if(path==='/api/feedback')return feedbackRoute(request,env)")&&worker.includes("if(path==='/api/feedback/list')return feedbackListRoute(request,env)"));
assert(/CREATE TABLE IF NOT EXISTS feedback/.test(schema)&&!/\bip\b/i.test(schema.replace(/no IP/,'')));
// Through the real Worker entry: the body must still be readable (regression, 16 Oct 2026:
// "Body has already been read" because the request was copied before the feedback route).
{const {default:entry}=await import('./cloudflare-site/worker.mjs');const d=fakeD1();
 const res=await entry.fetch(post(ok,'9.9.9.9',site),{PUBLIC_SITE:'true',FEEDBACK_DB:d},{waitUntil(){}});
 assert.equal(res.status,200);assert.equal(d.rows.length,1);}
// Kept one year (30 Oct 2026, stated on /privacy), dropped by the */30 cron.
{const {pruneFeedback,FEEDBACK_KEEP_DAYS}=await import('./worker/feedback.mjs');let q;
 await pruneFeedback({FEEDBACK_DB:{prepare:sql=>({bind:(...a)=>({run:async()=>{q={sql,a}}})})}},Date.parse('2027-10-30T00:00:00Z'));
 assert.equal(FEEDBACK_KEEP_DAYS,365);assert.equal(q.sql,'DELETE FROM feedback WHERE created_at<?1');assert.equal(q.a[0],'2026-10-30T00:00:00.000Z');
 assert(worker.includes('pruneFeedback(env)'),'cron prunes');assert(fs.readFileSync('dist/privacy.html','utf8').includes('ລຶບເອງຫຼັງ 1 ປີ'),'privacy page says one year')}
console.log('Feedback: validation, honeypot/timing, anonymous storage, hourly limit, origin check, admin key and page wiring passed.');
