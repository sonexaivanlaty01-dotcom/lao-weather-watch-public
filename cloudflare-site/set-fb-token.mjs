// Connects the Facebook Page for the bot. The owner copies a long-lived User token (Meta's Access Token
// Debugger, "Extend Access Token") and runs this script: it reads the token from the clipboard (pasting
// into a hidden prompt confused the owner, and a stray paste lands in the PowerShell prompt), asks Facebook
// for the Page token that belongs to it (a Page token from a long-lived User token does not expire) and
// stores FB_PAGE_ID + FB_PAGE_TOKEN as Worker secrets through stdin. Tokens are never shown or written to
// disk; the clipboard is emptied afterwards. Progress also goes to set-fb-token.log (no tokens in it).
import readline from 'node:readline';
import fs from 'node:fs';
import {spawnSync,execFileSync} from 'node:child_process';
const GRAPH='https://graph.facebook.com/v23.0',cwd=new URL('.',import.meta.url),LOG=new URL('set-fb-token.log',cwd);
fs.writeFileSync(LOG,'');
const say=(...a)=>{const t=a.join(' ');console.log(t);fs.appendFileSync(LOG,t+'\n')};
process.on('uncaughtException',e=>{say('❌ ไม่สำเร็จ:',e.message);process.exit(1)});
process.on('unhandledRejection',e=>{say('❌ ไม่สำเร็จ:',e?.message||String(e));process.exit(1)});

const ps=cmd=>execFileSync('powershell.exe',['-NoProfile','-Command',cmd],{encoding:'utf8'});
function ask(question){
 const rl=readline.createInterface({input:process.stdin,output:process.stdout});
 return new Promise(res=>rl.question(question,a=>{rl.close();res(a.trim())}));
}
async function graph(path,token){
 const r=await fetch(`${GRAPH}/${path}${path.includes('?')?'&':'?'}access_token=${encodeURIComponent(token)}`);
 const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error?.message||'HTTP '+r.status);return d;
}
function putSecret(name,value){
 const r=spawnSync('npx.cmd',['wrangler@4.149.0','secret','put',name],{cwd,input:value,encoding:'utf8',shell:true});
 const out=(r.stdout+r.stderr).replaceAll(value,'[hidden]');
 if(r.status!==0)throw new Error(name+': '+out.split('\n').filter(l=>/error/i.test(l)).join(' ').slice(0,300));
 say('  ✅',name,'บันทึกแล้ว');
}

// Copying this command from the chat replaces the clipboard, so wait (up to 5 minutes) for the owner to
// copy the token after starting the script.
const isToken=s=>/^EAA[A-Za-z0-9]{50,}$/.test(s),clip=()=>{try{return ps('Get-Clipboard -Raw').replace(/\s+/g,'')}catch{return ''}};
let user=clip();
if(!isToken(user)){
 say('⏳ รอ Token ... ไปที่หน้า Facebook แล้วกด Copy กุญแจอายุยาว (ไม่ต้องวางที่นี่ ตัวช่วยจะเห็นเอง)');
 for(let i=0;i<300&&!isToken(user);i++){await new Promise(r=>setTimeout(r,1000));user=clip()}
 if(!isToken(user))throw new Error('รอ 5 นาทีแล้วยังไม่เห็น Token ในคลิปบอร์ด: รันคำสั่งใหม่ แล้วไปกด Copy กุญแจ');
}
ps('Set-Clipboard -Value " "');   // the token does not stay in the clipboard
say('อ่าน Token จากคลิปบอร์ดแล้ว (ล้างคลิปบอร์ดแล้ว)');
const me=await graph('me?fields=name',user);say('บัญชี Facebook:',me.name);
const pages=(await graph('me/accounts?fields=id,name,access_token,tasks&limit=50',user)).data||[];
if(!pages.length)throw new Error('ไม่เจอเพจ: ตอนกด Generate Access Token ต้องติ๊กเลือกเพจ และให้สิทธิ์ pages_manage_posts');
pages.forEach((p,i)=>say(` ${i+1}. ${p.name} (Page ID ${p.id})`));
const n=pages.length===1?1:Number(await ask('เลือกเพจหมายเลข: '));
const page=pages[n-1];if(!page)throw new Error('หมายเลขไม่ถูกต้อง');
if(!(page.tasks||[]).includes('CREATE_CONTENT'))throw new Error('บัญชีนี้ไม่มีสิทธิ์โพสต์ในเพจ '+page.name);
// The Page token must work on its own before it is stored.
const check=await graph('me?fields=id,name',page.access_token);
if(check.id!==page.id)throw new Error('Page token ใช้ไม่ได้');
say('กำลังบันทึกลง Cloudflare ...');
putSecret('FB_PAGE_ID',page.id);putSecret('FB_PAGE_TOKEN',page.access_token);
say(`\nเสร็จแล้ว: เชื่อมเพจ "${page.name}" เรียบร้อย · บอทยังไม่โพสต์อะไร จนกว่าจะดีพลอยตัวบอท และคุณกดอนุมัติโพสต์ในหน้าแอดมิน`);
