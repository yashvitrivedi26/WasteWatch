@echo off
title WasteWatch on your phone
cd /d "%~dp0"
rem Gives the running app a free https:// link (Cloudflare quick tunnel, no account) so a phone can open and install it.
rem Start the app first with start_all.bat.

set "CF="
for %%P in (cloudflared.exe) do if not "%%~$PATH:P"=="" set "CF=%%~$PATH:P"
if not defined CF if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not defined CF if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles%\cloudflared\cloudflared.exe"
if not defined CF if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\cloudflared.exe" set "CF=%LOCALAPPDATA%\Microsoft\WinGet\Links\cloudflared.exe"
if not defined CF for /f "delims=" %%F in ('dir /b /s "%LOCALAPPDATA%\Microsoft\WinGet\Packages\cloudflared.exe" 2^>nul') do set "CF=%%F"

if not defined CF (
  echo Installing Cloudflare Tunnel, one time...
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
  if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles%\cloudflared\cloudflared.exe"
  if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\cloudflared.exe" set "CF=%LOCALAPPDATA%\Microsoft\WinGet\Links\cloudflared.exe"
)
if not defined CF (
  echo Could not find cloudflared.exe. Restart the PC, then run this file again.
  pause & exit /b 1
)

echo.
echo  1. Wait for a line like  https://something.trycloudflare.com
echo  2. Open that link on your phone (Chrome on Android, Safari on iPhone)
echo  3. Tap "Install app" (or Share ^> Add to Home Screen on iPhone)
echo  Keep this window open while you use the app. Press Ctrl+C to stop.
echo.
"%CF%" tunnel --url http://localhost:5173
pause
