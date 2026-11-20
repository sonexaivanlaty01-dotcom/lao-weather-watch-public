@echo off
rem Converts new Himawari observations and deploys them to Cloudflare.
rem Started every 10 minutes by Task Scheduler (task "LaoHimawariFrames") through run-hidden.vbs.
rem Uses the Cloudflare login saved by "npx wrangler login" on this Windows account.
cd /d "%~dp0.."
echo ===== %date% %time% >> "converter\last-run.log"
node converter\convert.mjs --deploy --wait 240 --max 31 >> "converter\last-run.log" 2>&1
