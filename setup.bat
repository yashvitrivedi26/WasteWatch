@echo off
title WasteWatch setup
cd /d "%~dp0"
echo === WasteWatch: one-time setup ===
where python >nul 2>nul
if errorlevel 1 (
  echo Python is not installed or not in PATH. Install Python 3.11+ from python.org and tick "Add python.exe to PATH".
  pause & exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from nodejs.org, then run this again.
  pause & exit /b 1
)
if not exist ".venv\Scripts\activate.bat" python -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt || (echo pip install failed. Check your internet. & pause & exit /b 1)
echo --- Trash-level AI model (one time, about 150 MB) ---
python -m ml.download_model || echo Model download failed. The app still works with basic photo analysis. Run: python -m ml.download_model
echo --- Database ---
cd backend
rem The data model changed in this version. An old database from the previous version is kept as db.sqlite3.old
if exist db.sqlite3 (
  if not exist db.sqlite3.old move /Y db.sqlite3 db.sqlite3.old >nul
)
python manage.py migrate || (pause & exit /b 1)
python manage.py seed_ward || (pause & exit /b 1)
python manage.py seed_demo
cd ..\frontend
echo --- Frontend packages ---
call npm install || (echo npm install failed. & pause & exit /b 1)
echo.
echo Setup done. Now double-click start_all.bat
pause
