// Trigger Worker builds one authenticated workflow_dispatch request and rejects a malformed repository name.
import assert from 'node:assert/strict';
import trigger,{dispatchRequest} from './cloudflare/trigger/index.mjs';
const env={REPO:'lao-weather/watch',GITHUB_TOKEN:'test-token',WORKFLOW:'himawari.yml',REF:'main'};
const r=dispatchRequest(env);assert.equal(r.method,'POST');assert.equal(r.url,'https://api.github.com/repos/lao-weather/watch/actions/workflows/himawari.yml/dispatches');
assert.equal(r.headers.get('Authorization'),'Bearer test-token');assert.deepEqual(await r.json(),{ref:'main'});
assert.throws(()=>dispatchRequest({...env,REPO:'https://evil.example/x'}));
let sent;globalThis.fetch=async req=>{sent=req;return new Response(null,{status:204})};const waits=[];await trigger.scheduled({},env,{waitUntil:p=>waits.push(p)});await Promise.all(waits);assert.equal(sent.url,r.url);
console.log('Trigger: authenticated workflow_dispatch to the configured repository only.');
