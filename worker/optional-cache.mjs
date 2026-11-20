// Sites' hosted Worker can deny the default cache even when the API exists.
// Caching is optional: an unavailable cache must never block the live source.
export async function readOptionalCache(key){
 try{return await globalThis.caches?.default?.match(key)||null}catch{return null}
}
export function writeOptionalCache(key,response,ctx={}){
 const pending=(async()=>{try{await globalThis.caches?.default?.put(key,response)}catch{/* Browser and process caches remain available. */}})();
 if(ctx.waitUntil)ctx.waitUntil(pending);
 return pending;
}
