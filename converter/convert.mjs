#!/usr/bin/env node
// Portable Himawari-9 converter: runs anywhere Node 20+ runs (a PC, GitHub
// Actions, Cloud Run, a VM). It converts each complete NOAA/AWS Band 13
// observation once and keeps the newest five hours as static files:
//   public/himawari9/b13/index.json and public/himawari9/b13/<YYYYMMDDHHmm>.png
// `--deploy` then publishes the folder as Cloudflare Workers static assets,
// which Cloudflare serves free and without request limits.
// Usage: node converter/convert.mjs [--out public] [--base https://cdn] [--deploy] [--wait 240]
import {mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {updateFrames,PREFIX,INDEX_KEY} from '../cloudflare/src/index.mjs';

const args=process.argv.slice(2),flag=name=>args.includes('--'+name),value=(name,fallback)=>{const i=args.indexOf('--'+name);return i>=0&&args[i+1]&&!args[i+1].startsWith('--')?args[i+1]:fallback};
const here=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));

// R2-like adapter over a folder, so the same tested update logic is reused.
export function folderBucket(root){
 const file=key=>{const full=path.resolve(root,key);if(!full.startsWith(path.resolve(root)+path.sep))throw new Error('bad_key');return full};
 return {
  async get(key){try{const bytes=await readFile(file(key));return {json:async()=>JSON.parse(bytes.toString('utf8')),arrayBuffer:async()=>bytes}}catch(error){if(error.code==='ENOENT')return null;throw error}},
  async put(key,valueToWrite){const full=file(key);await mkdir(path.dirname(full),{recursive:true});await writeFile(full,typeof valueToWrite==='string'?valueToWrite:Buffer.from(valueToWrite))},
  async delete(keys){for(const key of [].concat(keys))await rm(file(key),{force:true})}
 };
}

// A fresh runner (GitHub Actions, Cloud Run) starts empty: restore the frames
// already published so the next deployment still contains the full history.
async function restoreFromBase(bucket,out,base){
 if(!base||existsSync(path.join(out,INDEX_KEY)))return 0;
 const r=await fetch(`${base}/${INDEX_KEY}`,{cache:'no-store',signal:AbortSignal.timeout(15000)}).catch(()=>null);if(!r?.ok)return 0;
 const index=await r.json(),kept=[];
 await Promise.all((index.frames||[]).map(async f=>{if(!/^\d{12}$/.test(f.stamp))return;const p=await fetch(`${base}/${PREFIX}${f.stamp}.png`,{signal:AbortSignal.timeout(20000)}).catch(()=>null);if(p?.ok){await bucket.put(PREFIX+f.stamp+'.png',new Uint8Array(await p.arrayBuffer()));kept.push(f)}}));
 await bucket.put(INDEX_KEY,JSON.stringify({...index,frames:index.frames.filter(f=>kept.some(k=>k.stamp===f.stamp))}));return kept.length;
}

const HEADERS=`/himawari9/b13/*
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff
/himawari9/b13/index.json
  Cache-Control: public, max-age=15
/himawari9/b13/*.png
  Cache-Control: public, max-age=31536000, immutable
`;

export async function convertOnce({out,base='',waitSeconds=0,maxFrames=6,deploy=false,forceDeploy=false,now}={}){
 out=path.resolve(out);base=base.replace(/\/+$/,'');
 await mkdir(out,{recursive:true});const bucket=folderBucket(out),restored=await restoreFromBase(bucket,out,base);
 let result,deadline=Date.now()+waitSeconds*1000;
 for(;;){
  result=await updateFrames({FRAMES:bucket},{maxFrames,deadline:Date.now()+8*60000,...(now?{now}:{})});
  // Optionally wait for the next observation instead of exiting with nothing new.
  if(result.converted?.length||Date.now()+20000>deadline)break;
  await new Promise(r=>setTimeout(r,20000));
 }
 await writeFile(path.join(out,'_headers'),HEADERS);
 const changed=(result.converted?.length||0)+(result.removed||0)+restored>0;
 if(deploy&&(changed||forceDeploy)){
  const config=path.join(here,'wrangler.toml'),r=spawnSync('npx',['--yes','wrangler@4','deploy','--config',config],{stdio:'inherit',shell:process.platform==='win32',env:process.env});
  if(r.status!==0)throw new Error('wrangler deploy failed ('+r.status+')');
 }
 return {restored,changed,...result};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(here,'convert.mjs'))convertOnce({out:value('out',path.join(here,'public')),base:value('base',process.env.HIMAWARI_CDN_BASE||''),waitSeconds:Number(value('wait','0'))||0,maxFrames:Number(value('max','6'))||6,deploy:flag('deploy'),forceDeploy:flag('force-deploy')}).then(r=>console.log(JSON.stringify(r))).catch(error=>{console.error(error);process.exit(1)});
