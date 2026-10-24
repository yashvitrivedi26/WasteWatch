@echo off
title WasteWatch backend (port 8000)
cd /d "%~dp0"
if not exist ".venv\Scripts\activate.bat" (
  echo Run setup.bat first.
  pause & exit /b 1
)
call .venv\Scripts\activate.bat
cd backend
python manage.py runserver 127.0.0.1:8000
pause
