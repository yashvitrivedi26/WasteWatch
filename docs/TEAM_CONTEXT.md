# WasteWatch: context prompt for Claude

Copy everything below the line into a new Claude chat before asking for help with WasteWatch.

---

I'm working on **WasteWatch**, a hackathon project by our team (lead: Yashvi Trivedi). Use this context for all answers.

## What it is
A predictive sanitation web app for Bhavnagar (Gujarat) city wards. Citizens report garbage with a photo + GPS. An AI model judges the waste level (Low / Medium / High). Ward officers see reports on a live map, confirm emergencies, and assign sanitation teams with a deadline. Workers upload before/after photos to prove the spot is cleared. Citizens track progress with a report ID. Also installable as a phone app (PWA). Everything is free and open-source: no paid APIs, no API keys.

## Repo
- GitHub: `yashvitrivedi26/WasteWatch`, branch **`claude/relaxed-keller-xhlhys`** (latest work; not merged to `main` yet)
- Windows setup: `setup.bat` (one time), then `start_all.bat` → http://localhost:5173. Phone: `start_app_phone.bat` (free Cloudflare https tunnel).
- AI model download (one time, ~350 MB): `.venv\Scripts\python -m ml.download_model`
- Demo logins are in `README.md` (2 ward officers, 2 workers, 1 admin; citizens need no login).

## Stack
- **frontend/**: React 18 + Vite 5, React Router, Leaflet + OpenStreetMap (Google Maps only if `VITE_GOOGLE_MAPS_KEY` is set). Plain CSS in `src/styles.css` (Civic Navy palette, accent `#2f4b7c`). UI text in English / Hindi / Gujarati via `src/i18n/` (new strings go in `i18n/v3.js`). PWA: `public/manifest.webmanifest`, `public/sw.js`, `components/InstallApp.jsx`.
- **backend/**: Django 5 + Django REST Framework, SQLite, token auth, django-cors-headers. App code in `backend/core/` (`models.py`, `views.py`, `urls.py`, `photo_ai.py`, `trash_model.py`, `forecast.py`, `config.py`).
- **ml/**: `clip_prompts.py` (text prompts per level), `download_model.py`, `models/` (`text_embeds.npy` + `classes.json` are committed; `vision.onnx` is downloaded and git-ignored).
- External free services: Open-Meteo (rain forecast), OSM Nominatim (address search), OSM Overpass (nearby hospital/school check).

## How the AI works
1. `photo_ai.py` (OpenCV): rejects blurry/dark photos, measures **coverage %** of the photo covered by waste, draws the overlay, detects duplicate photos (dHash).
2. `trash_model.py`: **CLIP ViT-B/32** (ONNX, runs offline) compares the photo with text prompts for clean / low / medium / high / other. Final level = CLIP probability × a coverage prior (fixes "dump shown as medium"). Rejects selfies/screenshots. Tested: dump yard → HIGH, overflowing bin → MEDIUM.
3. Optional training on local photos: `python manage.py train_trash_model <folder with clean/ low/ medium/ high/>` (logistic regression on CLIP embeddings).
4. Without the model file, it falls back to the coverage check and the UI shows a yellow "Basic check only" warning. When the model runs, the UI shows the label "trash-model v3".
5. `forecast.py`: 48-hour hotspot risk from real reports (waste level, report count, waiting time, repeat dumping, rain, emergencies).

## Key features and rules
- **Roles:** citizen (no login), officer, worker, admin. Staff accounts are blocked from submitting citizen reports (UI + API 403).
- **Active wards:** Central Zone (CZ) and East Zone (EZ). A report goes to the nearest active ward. Officer and worker pairs share a zone.
- **Report:** photo, GPS that refines to ~15 m with an accuracy circle, draggable pin, address lookup, waste type, note, phone. **Emergency request:** citizen picks a category (hospital, school, water, …) + a required reason. Nearby hospitals etc. are suggested from OSM. **Only the officer can confirm or reject it.**
- **Officer dashboard:** KPI cards, searchable inbox with filters, map (Reports / Forecast layers), detail panel (photo + detected area, confirm emergency, set level, reject), assign a batch to a team **with a deadline** (default from SLA: High 6 h, Medium 24 h, Low 48 h, Emergency 2 h).
- **Worker:** batch with a deadline countdown, route + Google Maps navigation, before photo → after photo. The after photo is verified by the model.
- **Track page:** report ID → timeline, map pin, team, deadline, before/after photos. The report ID has a Copy button.
- **API (main):** `POST /api/reports`, `POST /api/analyze`, `GET /api/track/<code>`, `GET /api/officer/overview`, `POST /api/officer/batches`, `PATCH /api/officer/reports/<id>`, `GET /api/worker/batches`, `POST /api/worker/tasks/<id>/start|finish`, `POST /api/auth/login`.
- **Database changes:** always add a Django migration. `start_backend.bat` runs `migrate` automatically.

## Known limits (be honest about these)
- The app runs on a laptop; a phone uses it through the temporary Cloudflare link. Not deployed online yet.
- CLIP is general-purpose. Low/medium/high borders improve a lot after training on ~20 local photos per level.
- No real ward data yet; the forecast is rule-based from real reports, not trained on history.

## How to help me
- I'm a student. Explain briefly and give copy-paste commands for **Windows PowerShell** (we use `.\file.bat` and `.venv\Scripts\python`).
- Keep the existing stack and style; don't add paid services, API keys or new frameworks.
- Before changing code, tell me which files you'll touch. After changes, tell me exactly how to test them.
- Tell me if something I ask for is a bad idea, and suggest the better option.
