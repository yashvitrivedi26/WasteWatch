# WasteWatch

Garbage reporting and clean-up management for Indian city wards. A citizen sends one photo with a location. OpenCV
measures how much waste is in it, marks it **High / Medium / Low** and estimates the minimum time to clear it. The report
lands on the ward officer's map as a coloured pin, the officer sends a batch of locations to a sanitation team, and the
team uploads a **before** and an **after** photo. The time between notification, before photo and after photo is recorded
automatically and the officer is notified that the waste was collected.

Free and open-source. The map is OpenStreetMap by default; add a Google Maps key (see below) to switch every map to Google Maps with real road directions.

## Quick start (Windows)

Needs **Python 3.11+** (tick "Add python.exe to PATH") and **Node.js 18+ LTS**.

1. Double-click **`setup.bat`** once (needs internet, a few minutes). It installs everything and creates the database
   with the wards, teams and staff accounts. It creates **no sample reports**.
2. Double-click **`start_all.bat`**. The browser opens http://localhost:5173.

macOS / Linux: `./setup.sh` once, then `./start.sh`.

If you ran the previous version, `setup.bat` keeps your old database as `backend/db.sqlite3.old` (the data model changed).
Staff usernames and passwords are given separately, not on the website. Change them in **Admin > Users**.

## Who sees what

| Role | Where | What they do |
| --- | --- | --- |
| Citizen (no login) | `/report`, `/track`, `/contact` | Photo, live or typed location, emergency flag. Gets a report ID such as `WW-2610-0001` and can track it. |
| Ward officer | `/officer` | Sees only their ward. Map with red / orange / green pins, incoming reports, 48-hour forecast, assigns batches to teams, sees collection times. |
| Sanitation worker | `/worker` | Sees the batch given to their team in route order, navigates, uploads before / after photos. |
| Administrator | `/admin` | Everything: all wards, reports, tasks, teams, users, every piece of website text, settings, activity log, CSV export. |

## The flow

1. **Citizen** picks a photo. OpenCV runs immediately and shows the waste level, % of the photo covered, the area it
   detected, and the minimum time to clear. The location is the phone's live GPS, an address typed in the search box
   (OpenStreetMap Nominatim) or a tap on the map. The report goes to the nearest ward.
2. **Officer** gets a notification (bell icon, plus a browser pop-up if allowed). The pin appears on the map in the colour of its
   level; hovering the pin shows photo, address, level, % covered, time to clear, type, time and status. The officer
   selects reports and assigns them to a team as one **batch**; stops are ordered by nearest-neighbour.
3. **Worker** is notified at once (this is the *notified* time). At the spot they upload the **before** photo (time 2; their
   phone's GPS is compared with the report location), clean, and upload the **after** photo (time 3). Work time = after - before,
   reach time = before - notified.
4. The officer is notified "Waste collected" with both times, the report leaves the officer's list and the map for good (it stays in "Waste collected"), and the citizen's tracking page shows the after photo.

## How the waste level is measured (OpenCV)

`backend/core/photo_ai.py`: quality check (size, blur, darkness) -> ignore sky and green foliage -> a "clutter" score per pixel
from Canny edge density and local colour/brightness variation (LAB) -> threshold, clean with morphology, drop tiny blobs ->
**coverage %** of the photo -> level and time. A perceptual hash rejects the same photo sent twice for the same area.

This is classical computer vision, not a trained garbage detector. It measures how much of the picture is cluttered
material; it does not know whether that material is garbage. Thresholds were set on synthetic test pictures, so **calibrate with
real photos**: `python manage.py analyze_image photo.jpg --save-overlay out.jpg` (run inside `backend`, venv active) prints the
coverage, then adjust the limits in **Admin > Settings**. The rest of the app only uses the dictionary returned by `analyze()`, so a
trained model (YOLO, MobileNet) can replace it later without touching anything else. `docs/sample_photos/` holds four synthetic
pictures for a quick check.

## The 48-hour forecast

Built only from real uploaded reports (`backend/core/forecast.py`). Reports within 120 m form one hotspot. The score combines how much waste the
latest photos show, reports in 7 days, hours waiting, spots cleared in the last 30 days that came back, wet waste with the
Open-Meteo rain forecast, and emergencies. With no reports the forecast is empty. The old synthetic grid and the synthetic model were removed.

## Website content

Every heading, sentence, button and the footer is editable per language in **Admin > Website content**. Changes are live at once and can be reset. The
language selector itself is unchanged (English, Hindi, Gujarati). The Admin panel is in English only.

## Offices and emergency numbers

The Contact page shows emergency numbers (112, 100, 101, 108) and each ward's office with address, phone, e-mail, hours and a map pin.
**Replace the placeholder office details** in Admin > Wards & offices with the real ones.

## Phone and GPS

Browsers allow GPS only on `https://` or `http://localhost`. To use live location on a phone, run `start_frontend_https.bat`, open the
`https://192.168.x.x:5173` address on the phone on the same Wi-Fi and accept the certificate warning once.

## Internet needed for

Map tiles (OpenStreetMap), address search and address lookup (Nominatim), rain forecast (Open-Meteo; if offline, 0 mm is assumed).

## Folders

| Folder | What it is |
| --- | --- |
| `frontend/` | React + Vite, React Router, Leaflet + OpenStreetMap |
| `backend/` | Django + Django REST Framework, SQLite, token auth, OpenCV analysis, notifications, admin API |
| `ml/` | Geo helpers (distance, route order) |
| `docs/` | Presentation of the original idea (describes the first demo version) and sample photos |

## API

Send the token as `Authorization: Token <token>`.

| Method | Endpoint | Who |
| --- | --- | --- |
| POST | `/api/auth/login` | anyone (`username`, `password`, `role`) |
| POST | `/api/analyze`, `/api/reports` | anyone (photo, lat, lng, type, address, note, phone, is_emergency) |
| GET | `/api/track/<code>`, `/api/public-config`, `/api/public-stats`, `/api/content` | anyone |
| GET | `/api/officer/overview` | officer / admin |
| POST | `/api/officer/batches` | officer: `team`, `reports: [ids]` |
| PATCH | `/api/officer/reports/<id>` | officer |
| GET / POST | `/api/notifications` | any logged-in user |
| GET | `/api/worker/batches` | worker |
| POST | `/api/worker/tasks/<id>/start`, `/finish` | worker: `before_photo` / `after_photo`, `lat`, `lng` |
| * | `/api/admin/...` (wards, teams, users, reports, tasks, content, settings, audit, export, summary) | admin |

## Notes for a real deployment

Set `DJANGO_DEBUG=0`, a real `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS` and `CORS_ORIGINS`; serve `/media` through a web server; use PostgreSQL;
run behind https. Login, report, analyze and track endpoints are rate-limited (see `REST_FRAMEWORK` in `settings.py`).

## License

MIT, see [LICENSE](LICENSE).

## Google Maps (optional)

1. Google Cloud Console: enable **Maps JavaScript API** and **Directions API**, create an API key.
2. In `frontend/` copy `.env.example` to `.env` and set `VITE_GOOGLE_MAPS_KEY=your_key`, then restart the frontend.
3. Every map now uses Google Maps. The worker page also draws the road route and shows real drive times and turn-by-turn steps.
   If the key is empty or rejected, the app falls back to OpenStreetMap automatically.

## Bhavnagar offices

`python manage.py seed_ward` creates the real BMC offices (Head Office, East Zone, West Zone, Ghogha Circle, Sardarnagar,
Takhteshwar) with their published addresses and phone numbers. The Head Office pin is exact; the others are looked up on
OpenStreetMap and can be corrected in Admin > Offices. Existing wards are never overwritten.


## v3 changes

**Trash-level AI model.** Each photo is now judged by a pretrained CLIP vision model (OpenAI ViT-B/32, free,
quantized ONNX, runs offline on the server). It compares the photo with descriptions of *clean*, *low*, *medium*
and *high* garbage (`ml/clip_prompts.py`) and rejects photos that are not of a place (selfies, screenshots).
OpenCV is still used for the coverage %, the overlay, blur/dark checks and duplicate detection.

```bat
python -m ml.download_model          :: one time, ~150 MB from huggingface.co (setup.bat does this)
```

To make it more accurate for your ward, train it on your own labelled photos
(folders `clean/ low/ medium/ high/`, about 20+ photos each):

```bat
cd backend
python manage.py train_trash_model C:\path\to\photos
```

Without the model files the app falls back to the OpenCV coverage only.

**Deadlines.** When the officer assigns a batch, they pick a deadline (or quick buttons: +2 h, +6 h, today 6 PM,
tomorrow 10 AM). With no deadline picked, it is set from the strictest level in the batch (High 6 h, Medium 24 h,
Low 48 h, Emergency 2 h). Workers see a live countdown; late batches are flagged to the officer and citizens.

**Accurate location.** The report page keeps listening to the GPS until it is accurate to 15 m (or 20 s pass),
shows the accuracy circle, and lets the citizen drag the pin to the exact spot. The accuracy is saved with the
report and shown on the officer dashboard and on the tracking page map.

**Checking the AI model.** Under the level bars, the report page shows the model version
(`trash-model v3 …`). If you see a yellow "Basic check only" box instead, run `python -m ml.download_model`.
The level is the most likely class from CLIP, weighted by how much of the photo the waste covers, so a close-up
of one bin and a whole dump yard are told apart.

**Staff accounts cannot file citizen reports.** A logged-in officer, worker or admin sees a "Citizen reports only"
page on /report (and the API returns 403), so every report comes from a citizen.
