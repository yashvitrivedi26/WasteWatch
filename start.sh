#!/usr/bin/env bash
# Starts backend (8000) and frontend (5173). Ctrl+C stops both.
cd "$(dirname "$0")"
source .venv/bin/activate
(cd backend && python manage.py runserver 127.0.0.1:8000) &
BACK=$!
trap "kill $BACK" EXIT
cd frontend && npm run dev
