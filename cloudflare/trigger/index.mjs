// Free-plan cron Worker: only asks GitHub to start the converter workflow at
// the minute NOAA/AWS usually publishes (about 12 minutes after each
// observation). It does no image work, so it fits the 10 ms CPU limit.
export function dispatchRequest(env){
 if(!/^[\w.-]+\/[\w.-]+$/.test(env.REPO||''))throw new Error('REPO must be owner/name');
 return new Request(`https://api.github.com/repos/${env.REPO}/actions/workflows/${env.WORKFLOW||'himawari.yml'}/dispatches`,{method:'POST',headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'lao-himawari-trigger','Content-Type':'application/json'},body:JSON.stringify({ref:env.REF||'main'})});
}
export default {
 async scheduled(event,env,ctx){ctx.waitUntil(fetch(dispatchRequest(env)).then(r=>{if(r.status!==204)console.warn('GitHub dispatch failed',r.status)}))}
};
