// Location helpers: device GPS (with fallbacks and clear error codes) and GPS tags inside a photo (EXIF).

const geoError = (code) => Object.assign(new Error(code), { code });

const once = (opts) => new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, opts));

/**
 * Accurate current position. Phones first return a rough Wi-Fi/cell fix (often 100-2000 m off) and then
 * improve as the GPS chip locks on, so we WATCH the position and keep the best fix until it is good enough
 * (<= goodM metres) or maxMs has passed. onProgress(fix) is called with every better fix so the UI can show it live.
 * Rejects with an Error whose .code is: insecure | unsupported | denied | unavailable | timeout
 */
export function getDevicePosition({ goodM = 15, maxMs = 20000, onProgress } = {}) {
  // Browsers only allow GPS on https:// pages or on http://localhost. http://192.168.x.x on a phone is blocked.
  if (!window.isSecureContext) return Promise.reject(geoError('insecure'));
  if (!navigator.geolocation) return Promise.reject(geoError('unsupported'));
  return new Promise((resolve, reject) => {
    let best = null;
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(id);
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(err || geoError('timeout'));
    };
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy || 9999) };
        if (!best || fix.accuracy < best.accuracy) {
          best = fix;
          onProgress?.(fix);
        }
        if (best.accuracy <= goodM) finish();
      },
      (e) => {
        if (e.code === 1) finish(geoError('denied'));
        else if (!best && e.code !== 3) finish(geoError('unavailable'));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs },
    );
    const timer = setTimeout(() => finish(geoError('timeout')), maxMs);
  });
}

/* ---------- EXIF GPS reader (JPEG only; no library needed) ---------- */

export function parseExifGps(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 12 || v.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 4 < v.byteLength) {
    const marker = v.getUint16(off);
    if (marker === 0xffda || (marker & 0xff00) !== 0xff00) break;
    if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return tiffGps(v, off + 10);
    off += 2 + v.getUint16(off + 2);
  }
  return null;
}

function tiffGps(v, base) {
  const le = v.getUint16(base) === 0x4949;
  const u16 = (o) => v.getUint16(o, le);
  const u32 = (o) => v.getUint32(o, le);
  if (u16(base + 2) !== 42) return null;
  const entry = (ifd, tag) => {
    const n = u16(ifd);
    for (let i = 0; i < n; i++) if (u16(ifd + 2 + i * 12) === tag) return ifd + 2 + i * 12;
    return -1;
  };
  const gpsPtr = entry(base + u32(base + 4), 0x8825);
  if (gpsPtr < 0) return null;
  const gps = base + u32(gpsPtr + 8);
  const ascii = (tag) => { const e = entry(gps, tag); return e < 0 ? '' : String.fromCharCode(v.getUint8(e + 8)); };
  const dms = (tag) => {
    const e = entry(gps, tag);
    if (e < 0) return null;
    const p = base + u32(e + 8);
    const r = (i) => (u32(p + i * 8 + 4) ? u32(p + i * 8) / u32(p + i * 8 + 4) : 0);
    return r(0) + r(1) / 60 + r(2) / 3600;
  };
  let lat = dms(2), lng = dms(4);
  if (lat == null || lng == null) return null;
  if (ascii(1) === 'S') lat = -lat;
  if (ascii(3) === 'W') lng = -lng;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng } : null;
}

export async function readPhotoGps(file) {
  try {
    return parseExifGps(await file.slice(0, 512 * 1024).arrayBuffer());
  } catch {
    return null;
  }
}

/* ---------- Place search and address lookup (OpenStreetMap Nominatim: free, no key; the visitor's browser calls it) ---------- */

export async function searchPlace(q, near) {
  const bias = near ? `&viewbox=${near.lng - 0.4},${near.lat + 0.4},${near.lng + 0.4},${near.lat - 0.4}` : '';
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=in&accept-language=en${bias}&q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error('search');
  return (await res.json()).map((p) => ({ name: p.display_name, lat: +p.lat, lng: +p.lon }));
}

export async function reversePlace(lat, lng) {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=en&lat=${lat}&lon=${lng}`, { signal: ctl.signal });
    clearTimeout(timer);
    const d = await res.json();
    return (d.display_name || '').split(', ').slice(0, 4).join(', ');
  } catch {
    return '';
  }
}

/* ---------- Sensitive places nearby (OpenStreetMap Overpass API: free, no key) ---------- */
const KIND_CAT = { hospital: 'hospital', clinic: 'hospital', doctors: 'hospital', school: 'school', college: 'school',
  kindergarten: 'school', university: 'school', place_of_worship: 'worship', drinking_water: 'water', marketplace: 'food' };

// Nearest hospital / school / temple / water point / market within `radius` metres, or null.
export async function nearbySensitive(lat, lng, radius = 200) {
  const q = `[out:json][timeout:8];nwr(around:${radius},${lat},${lng})[amenity~"^(hospital|clinic|doctors|school|college|kindergarten|university|place_of_worship|drinking_water|marketplace)$"];out center 20;`;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), signal: ctl.signal });
    clearTimeout(timer);
    const els = (await res.json()).elements || [];
    const items = els.map((e) => {
      const p = e.center || e;
      const d = Math.round(6371000 * 2 * Math.asin(Math.sqrt(Math.sin(((p.lat - lat) * Math.PI) / 360) ** 2
        + Math.cos((lat * Math.PI) / 180) * Math.cos((p.lat * Math.PI) / 180) * Math.sin(((p.lon - lng) * Math.PI) / 360) ** 2)));
      return { name: e.tags?.name || e.tags?.['name:en'] || '', kind: e.tags?.amenity, category: KIND_CAT[e.tags?.amenity] || 'other', dist: d };
    });
    // hospitals first, then nearest
    items.sort((a, b) => (a.category !== 'hospital') - (b.category !== 'hospital') || a.dist - b.dist);
    return items[0] || null;
  } catch {
    return null;
  }
}
