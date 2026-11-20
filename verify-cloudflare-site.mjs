// Cloudflare deployment entry: private by default, Access identity mapped to the
// existing owner check, AWS on-demand route disabled, static assets served.
import assert from 'node:assert/strict';
import site,{accessUser,forecastStore} from './cloudflare-site/worker.mjs';
import fs from 'node:fs';
const assets={fetch:async req=>new URL(req.url).pathname==='/index.html'||new URL(req.url).pathname==='/'?new Response('<html>ok</html>',{headers:{'Content-Type':'text/html'}}):new Response('nf',{status:404})};
const env={ASSETS:assets,ACCESS_REQUIRED:'true'},ctx={waitUntil(){}};
const req=(path,headers={})=>new Request('https://lao-weather-watch.example.workers.dev'+path,{headers});
let r=await site.fetch(req('/'),env,ctx);assert.equal(r.status,401,'no Access identity: locked');assert.match(await r.text(),/ສ່ວນຕົວ/);
r=await site.fetch(req('/api/forecast/grid'),env,ctx);assert.equal(r.status,401,'APIs locked too');
const signed={'cf-access-authenticated-user-email':'owner@example.org','cf-access-jwt-assertion':'jwt'};
assert.equal(await accessUser(req('/',{'cf-access-authenticated-user-email':'x@y.z'}),env),null,'email header alone is not trusted');
// Real RS256 token signed by a test key, checked against a mocked JWKS.
const team='https://lao-test.cloudflareaccess.com',aud='aud-123';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...(await crypto.subtle.exportKey('jwk',pair.publicKey)),kid:'k1'};
const enc=o=>btoa(JSON.stringify(o)).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
const sign=async payload=>{const head=enc({alg:'RS256',kid:'k1'})+'.'+enc(payload),sig=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(head)));return head+'.'+btoa(String.fromCharCode(...sig)).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_')};
const fetchImpl=async()=>Response.json({keys:[jwk]}),envA={...env,ACCESS_TEAM_DOMAIN:team,ACCESS_AUD:aud};
const good=await sign({iss:team,aud:[aud],email:'owner@example.org',exp:Math.floor(Date.now()/1000)+600});
assert.equal(await accessUser(req('/',{'cf-access-jwt-assertion':good}),envA,{fetchImpl}),'owner@example.org');
assert.equal(await accessUser(req('/',{'cf-access-jwt-assertion':await sign({iss:team,aud:['other'],email:'x',exp:Math.floor(Date.now()/1000)+600})}),envA,{fetchImpl}),null,'wrong audience');
assert.equal(await accessUser(req('/',{'cf-access-jwt-assertion':await sign({iss:team,aud:[aud],email:'x',exp:Math.floor(Date.now()/1000)-10})}),envA,{fetchImpl}),null,'expired');
assert.equal(await accessUser(req('/',{'cf-access-jwt-assertion':good.slice(0,-4)+'AAAA'}),envA,{fetchImpl}),null,'bad signature');
r=await site.fetch(req('/',signed),{...env,ACCESS_REQUIRED:'false'},ctx);assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'private, no-cache');
r=await site.fetch(req('/api/satellite/aws/times',signed),{...env,ACCESS_REQUIRED:'false'},ctx);assert.equal(r.status,404);
r=await site.fetch(req('/api/radar/unknown',signed),{...env,ACCESS_REQUIRED:'false'},ctx);assert.ok([400,404].includes(r.status),'unknown radar provider rejected: '+r.status);
// Shared GFS forecast: KV adapter only with the binding; the cron handler does nothing without it.
assert.equal(forecastStore({}),null);const kvData=new Map(),kv={get:async(k,type)=>{assert.equal(type,'json');return kvData.has(k)?JSON.parse(kvData.get(k)):null},put:async(k,v)=>{kvData.set(k,v)}};
const fstore=forecastStore({FORECAST_KV:kv});await fstore.put({a:1});assert.deepEqual(await fstore.get(),{a:1});
let waited=0;await site.scheduled({},{},{waitUntil(){waited++}});assert.equal(waited,0);
const toml=fs.readFileSync('cloudflare-site/wrangler.toml','utf8');assert(/crons = \["\*\/30 \* \* \* \*",/.test(toml)&&/binding = "FORECAST_KV"/.test(toml));// Public community mode: everyone reads; static files bypass the Worker, data routes run it.
assert.equal(await accessUser(req('/'),{PUBLIC_SITE:'true',ACCESS_REQUIRED:'true'}),'public');
assert.equal(await accessUser(req('/'),{PUBLIC_SITE:'false',ACCESS_REQUIRED:'true'}),null);
r=await site.fetch(req('/'),{...env,PUBLIC_SITE:'true'},ctx);assert.equal(r.status,200);
assert(/run_worker_first = \["\/api\/\*", "\/weather", "\/weather\/\*", "\/storm\/\*"\]/.test(toml)&&/PUBLIC_SITE = "true"/.test(toml));console.log('Cloudflare site: private by default, Access JWT verified (signature, audience, expiry), on-demand AWS route disabled, assets served with private caching, shared forecast store and cron, public community mode.');
