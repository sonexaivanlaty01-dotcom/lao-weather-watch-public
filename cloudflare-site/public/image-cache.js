// Exact timestamp/viewport URLs only. Never substitute a different observation.
export class ImageBlobCache {
 constructor({maxBytes=32*1024*1024,maxEntries=256}={}){this.maxBytes=maxBytes;this.maxEntries=maxEntries;this.bytes=0;this.entries=new Map()}
 remove(key){const entry=this.entries.get(key);if(!entry)return;this.bytes-=entry.bytes;this.entries.delete(key)}
 get(key,loader){
  if(this.entries.has(key)){const entry=this.entries.get(key);this.entries.delete(key);this.entries.set(key,entry);return entry.promise}
  const entry={bytes:0,promise:null};this.entries.set(key,entry);
  entry.promise=Promise.resolve().then(loader).then(blob=>{
   if(this.entries.get(key)===entry){entry.bytes=blob.size;this.bytes+=entry.bytes;this.trim()}
   return blob;
  }).catch(error=>{if(this.entries.get(key)===entry)this.remove(key);throw error});
  return entry.promise;
 }
 trim(){for(const [key,entry] of this.entries){if(this.bytes<=this.maxBytes&&this.entries.size<=this.maxEntries)break;if(entry.bytes)this.remove(key)}}
}
