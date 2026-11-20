// Copies the page assets (dist/ without the Sites server bundle) into cloudflare-site/public.
import {cp,rm} from 'node:fs/promises';
import path from 'node:path';
const here=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')),root=path.resolve(here,'..'),out=path.join(here,'public');
await rm(out,{recursive:true,force:true});
await cp(path.join(root,'dist'),out,{recursive:true,filter:src=>{const rel=path.relative(path.join(root,'dist'),src).split(path.sep)[0];return rel!=='server'&&rel!=='.openai'}});
console.log('Prepared',out);
