// GIBS rejects fractional seconds even though Date.toISOString() includes them.
export function serviceTime(value){return new Date(value).toISOString().replace(/\.\d{3}Z$/,'Z')}

// Request signal = caller's signal + a time limit. Built by hand: AbortSignal.any only exists from
// iOS 17.4 and AbortSignal.timeout from iOS 16, and older iPhones then failed every download (25 Oct 2026).
export function timeoutSignal(ms,parent){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(new DOMException('timeout','TimeoutError')),ms);
 c.signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
 if(parent){if(parent.aborted)c.abort(parent.reason);else parent.addEventListener('abort',()=>c.abort(parent.reason),{once:true})}
 return c.signal;
}
export async function fetchResponse(url,{signal,timeout=15000,attempts=3,cache='default'}={}){
 for(let attempt=0;attempt<attempts;attempt++){
  if(signal?.aborted)throw signal.reason??new DOMException('aborted','AbortError');
  try{
   const requestSignal=timeoutSignal(timeout,signal);
   const response=await fetch(url,{signal:requestSignal,cache});
   if(response.ok)return response;
   const error=new Error('HTTP '+response.status);error.status=response.status;
   throw error;
  }catch(error){
   if(signal?.aborted)throw error;
   const transient=!error.status||[408,425,429].includes(error.status)||error.status>=500;
   if(!transient||attempt===attempts-1)throw error;
   await new Promise(resolve=>setTimeout(resolve,800*2**attempt));
  }
 }
}
