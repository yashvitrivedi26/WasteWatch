@echo off
cd /d "%~dp0"
start "WasteWatch backend" "%~dp0start_backend.bat"
timeout /t 4 >nul
start "WasteWatch frontend" "%~dp0start_frontend.bat"
timeout /t 6 >nul
start "" http://localhost:5173
