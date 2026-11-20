// Security hardening (26 Oct 2026): per-IP limits on writing / owner routes, security headers on every
// answer, and the map library served from our own site (no third-party script host).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker,{rateLimited,secure,SECURITY_HEADERS} from './cloudflare-site/worker.mjs';

// Fake Cloudflare rate limiter: allows `limit` calls per key.
const limiter=limit=>{const n=new Map(),keys=[];return {keys,limit:async({key})=>{keys.push(key);const c=(n.get(key)||0)+1;n.set(key,c);return {success:c<=limit}}}};
const req=(path,method='GET',ip='203.0.113.7')=>new Request('https://x.test'+path,{method,headers:{'CF-Connecting-IP':ip}});
{const env={WRITE_LIMIT:limiter(3),ADMIN_LIMIT:limiter(2)};
 for(let i=0;i<3;i++)assert.equal(await rateLimited(req('/api/visits','POST'),env),null);
 const r=await rateLimited(req('/api/visits','POST'),env);assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');
 assert.equal(await rateLimited(req('/api/visits','POST','198.51.100.9'),env),null,'other visitors are not affected');
 assert.equal(await rateLimited(req('/api/feedback','POST'),env),null,'feedback has its own counter');
 assert.equal(await rateLimited(req('/api/visits'),env),null,'only POST writes are limited');
 assert.equal(await rateLimited(req('/api/storms'),env),null,'data routes are not limited');
 await rateLimited(req('/api/visits/stats'),env);await rateLimited(req('/api/feedback/list'),env);await rateLimited(req('/api/visits/stats'),env);
 assert.equal((await rateLimited(req('/api/visits/stats'),env)).status,429,'owner routes: 2 per minute here');
 assert.equal(await rateLimited(req('/api/fb/image/3'),env),null,'post pictures are not counted');
 assert(!env.WRITE_LIMIT.keys.some(k=>!k.includes('203.0.113.7')&&!k.includes('198.51.100.9')));
 // Without the binding (local tests) or if it fails, nothing is blocked.
 assert.equal(await rateLimited(req('/api/visits','POST'),{}),null);
 assert.equal(await rateLimited(req('/api/visits','POST'),{WRITE_LIMIT:{limit:async()=>{throw new Error('down')}}}),null)}

// Headers on Worker answers; existing values kept.
{const r=secure(new Response('x',{status:201,headers:{'X-Frame-Options':'DENY','Content-Type':'text/plain'}}));
 assert.equal(r.status,201);assert.equal(r.headers.get('X-Frame-Options'),'DENY');for(const k of Object.keys(SECURITY_HEADERS))assert(r.headers.has(k),k);assert.equal(await r.text(),'x');
 const env={PUBLIC_SITE:'true',ACCESS_REQUIRED:'true',WRITE_LIMIT:limiter(0)};
 const blocked=await worker.fetch(req('/api/visits','POST'),env,{});assert.equal(blocked.status,429);assert.equal(blocked.headers.get('X-Content-Type-Options'),'nosniff');
 const notFound=await worker.fetch(req('/api/radar/nowhere'),env,{waitUntil(){}});assert.equal(notFound.headers.get('X-Frame-Options'),'SAMEORIGIN');}

// Static files: _headers covers every path, admin page cannot be framed or cached.
{const h=fs.readFileSync('dist/_headers','utf8');for(const k of Object.keys(SECURITY_HEADERS))assert(h.includes(k+':'),'_headers has '+k);assert(/\/admin\.html\n\s+Cache-Control: no-store/.test(h),'admin page never cached (framing already blocked by SAMEORIGIN for all paths)');
 const toml=fs.readFileSync('cloudflare-site/wrangler.toml','utf8');assert(toml.includes('name = "WRITE_LIMIT"')&&toml.includes('name = "ADMIN_LIMIT"'));}

// Map library from our own site (supply-chain safety); the copy is MapLibre 6.11.2 from npm.
{const html=fs.readFileSync('dist/index.html','utf8'),app=fs.readFileSync('dist/app.js','utf8');
 for(const f of fs.readdirSync('dist').filter(f=>/\.(js|html|css)$/.test(f)))assert(!fs.readFileSync('dist/'+f,'utf8').includes('unpkg.com'),f+' loads from unpkg');
 assert(html.includes('href="./vendor/maplibre-gl-6.11.2/maplibre-gl.css"')&&app.includes("import('./vendor/maplibre-gl-6.11.2/maplibre-gl.mjs')"));
 for(const f of ['maplibre-gl.mjs','maplibre-gl-shared.mjs','maplibre-gl-worker.mjs','maplibre-gl.css','LICENSE.txt'])assert(fs.existsSync('dist/vendor/maplibre-gl-6.11.2/'+f),f);
 assert(fs.readFileSync('dist/vendor/maplibre-gl-6.11.2/maplibre-gl.mjs','utf8').includes('var Ar=`6.11.2`'),'version 6.11.2')}
// Speed (26 Oct 2026): scripts/styles are cached a day, so every local import needs a ?v= address and
// one file must never be imported under two addresses (it would load and run twice).
{const seen={};for(const f of fs.readdirSync('dist').filter(f=>f.endsWith('.js'))){const t=fs.readFileSync('dist/'+f,'utf8');
  for(const m of t.matchAll(/(?:from\s*|import\()'\.\/([a-z0-9-]+\.js)(\?v=[^']*)?'/g)){assert(m[2],f+' imports '+m[1]+' without ?v=');(seen[m[1]]??=new Set()).add(m[2])}}
 for(const [file,v] of Object.entries(seen))assert.equal(v.size,1,file+' imported under '+[...v].join(' and '));
 const h=fs.readFileSync('dist/_headers','utf8'),rules=h.split(/\n(?=\/)/).filter(b=>b.includes('Cache-Control'));
 assert(/\/vendor\/\*\.mjs\n\s+Cache-Control: public, max-age=31536000, immutable/.test(h)&&/\/\*\.js\n\s+Cache-Control: public, max-age=86400/.test(h)&&/\/data\/\*\n\s+Cache-Control: public, max-age=3600/.test(h));
 assert(!rules.some(b=>/^\/\*\n/.test(b)||/^\/\n/.test(b)||b.startsWith('/*.html')),'pages keep the default (checked on every visit)');
 const html=fs.readFileSync('dist/index.html','utf8');assert(html.includes('rel="modulepreload" href="./vendor/maplibre-gl-6.11.2/maplibre-gl.mjs"')&&html.includes('rel="preconnect" href="https://gibs.earthdata.nasa.gov"'))}
console.log('Security: per-IP write/owner limits, security headers on static files and Worker answers, self-hosted MapLibre passed.');
