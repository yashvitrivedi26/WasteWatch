@echo off
title WasteWatch on your phone
cd /d "%~dp0"
rem Gives the running app a free https:// link (Cloudflare quick tunnel, no account) so a phone can open and install it.
rem Start the app first with start_all.bat.
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo Installing Cloudflare Tunnel, one time...
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  echo.
  echo Installed. Close this window and double-click start_app_phone.bat again.
  pause & exit /b 0
)
echo.
echo  1. Wait for a line like  https://something.trycloudflare.com
echo  2. Open that link on your phone (Chrome on Android, Safari on iPhone)
echo  3. Tap "Install app" (or Share ^> Add to Home Screen on iPhone)
echo  Keep this window open while you use the app. Press Ctrl+C to stop.
echo.
cloudflared tunnel --url http://localhost:5173
pause
