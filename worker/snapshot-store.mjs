// Last good download of a slow source, kept in KV. The Cache API does nothing on workers.dev and
// each isolate's memory starts empty, so without this a visitor could wait 5–6 s for MRC or KPL
// (owner, 29 Oct 2026: "โหลดช้า"). Callers serve the snapshot at once and refresh in the background.
export async function readSnapshot(store,name){
 if(!store)return null;
 try{const d=await store.get(name,'json');return d&&Number.isFinite(d.fetchedAt)?d:null}catch{return null}
}
export function saveSnapshot(store,name,data,ctx={}){
 if(!store)return null;
 const p=store.put(name,JSON.stringify(data),{expirationTtl:2*86400}).catch(()=>{});
 ctx.waitUntil?.(p);return p;
}
