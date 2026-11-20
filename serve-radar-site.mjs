import http from 'node:http';
import {Readable} from 'node:stream';
import worker from './dist/server/index.js';
const port=Number(process.env.PORT||8765);
http.createServer(async (req,res)=>{
 try{const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','local-preview-owner');const options={method:req.method,headers};if(!['GET','HEAD'].includes(req.method)){options.body=Readable.toWeb(req);options.duplex='half'}const env={GEMINI_API_KEY:process.env.GEMINI_API_KEY,GEMINI_FREE_TIER_ONLY:process.env.GEMINI_FREE_TIER_ONLY};const response=await worker.fetch(new Request(`http://127.0.0.1:${port}${req.url}`,options),env,{});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}
 catch{res.writeHead(500);res.end('Local preview error');}
}).listen(port,'127.0.0.1',()=>console.log(`Local URL: http://127.0.0.1:${port}`));
