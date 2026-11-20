@echo off
title Lao Himawari setup
cd /d "%~dp0.."
echo.
echo [1/4] Checking Node.js
where node >nul 2>nul || (echo Node.js was not found. Install Node.js 20 or newer, then run this again. & pause & exit /b 1)
node -v
echo.
echo [2/4] Cloudflare sign-in
call npx --yes wrangler@4 whoami > "converter\whoami.txt" 2>&1
findstr /i /c:"not authenticated" "converter\whoami.txt" >nul && (
  echo A browser window will open. Please click "Allow" for Wrangler.
  call npx --yes wrangler@4 login
)
call npx --yes wrangler@4 whoami
echo.
echo [3/4] Converting the last five hours and deploying. First run can take 5-15 minutes.
node converter\convert.mjs --deploy --force-deploy --max 31 > "converter\setup.log" 2>&1
type "converter\setup.log"
findstr /c:"workers.dev" "converter\setup.log"
echo.
echo [4/4] Scheduling every 10 minutes (at :02, :12, :22 ...)
schtasks /Create /F /TN "LaoHimawariFrames" /SC MINUTE /MO 10 /ST 00:02 /TR "wscript.exe \"%~dp0run-hidden.vbs\""
echo.
echo Done. Logs: converter\last-run.log
pause
