@echo off
title WasteWatch frontend HTTPS (for phone GPS)
cd /d "%~dp0frontend"
if not exist node_modules (
  echo Run setup.bat first.
  pause & exit /b 1
)
echo Open the https://192.168.x.x:5173 link shown below on your phone, then accept the certificate warning.
call npm run dev:https
pause
