#!/usr/bin/env bash
# One-time setup for macOS / Linux
set -e
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
# The data model changed in this version: keep any old database as db.sqlite3.old
[ -f backend/db.sqlite3 ] && [ ! -f backend/db.sqlite3.old ] && mv backend/db.sqlite3 backend/db.sqlite3.old
(python -m ml.download_model || echo 'Model download failed; run: python -m ml.download_model'
cd backend && python manage.py migrate && python manage.py seed_ward)
(cd frontend && npm install)
echo "Setup done. Run ./start.sh"
