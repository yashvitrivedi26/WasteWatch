import { fmt } from './i18n/index.jsx';

export const LEVEL_COLOR = { high: '#d64545', medium: '#e8a33d', low: '#4ca86a', cleared: '#8a93aa' };
const LOCALES = { en: 'en-IN', hi: 'hi-IN', gu: 'gu-IN' };

export const fmtTime = (iso, lang = 'en') => (iso ? new Date(iso).toLocaleString(LOCALES[lang] || 'en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const fmtClock = (iso, lang = 'en') => (iso ? new Date(iso).toLocaleTimeString(LOCALES[lang] || 'en-IN', { timeStyle: 'short' }) : '—');

// 45 s | 3 min 20 s | 25 min | 1 h 05 min   (seconds in)
export function fmtDur(sec) {
  if (sec == null) return '—';
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec} s`;
  if (sec < 600) return `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, '0')} s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  return `${Math.floor(sec / 3600)} h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')} min`;
}
export const fmtMin = (min) => (min == null ? '—' : fmtDur(min * 60));

export const reasonText = (t, r) => fmt(t['fr_' + r.k] || r.k, { ...r, level: t['lv_' + r.level] || r.level });
export const mapsLink = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
export const levelOf = (r) => (r.status === 'cleared' ? 'cleared' : r.level);

// ---- distance / time helpers (used when Google road directions are not available) ----
export function distM(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}
export const CITY_KMH = 22; // average speed of a collection vehicle inside the city
// straight line x 1.3 approximates the road distance
export function estLeg(a, b) {
  const m = Math.round(distM(a, b) * 1.3);
  return { distance_m: m, duration_s: Math.round((m / 1000 / CITY_KMH) * 3600), steps: [] };
}
export const fmtKm = (m) => (m == null ? '—' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
export const fmtHM = (ms, lang = 'en') => new Date(ms).toLocaleTimeString(LOCALES[lang] || 'en-IN', { timeStyle: 'short' });
// one Google Maps link with every stop: opens turn-by-turn navigation on the phone
export function mapsRouteLink(origin, stops) {
  if (!stops.length) return '#';
  const pt = (p) => `${p.lat},${p.lng}`;
  const dest = stops[stops.length - 1];
  const via = stops.slice(0, -1).map(pt).join('|');
  return `https://www.google.com/maps/dir/?api=1${origin ? `&origin=${pt(origin)}` : ''}&destination=${pt(dest)}${via ? `&waypoints=${encodeURIComponent(via)}` : ''}&travelmode=driving`;
}

// "just now" | "12 min ago" | "3 h ago" | "2 d ago"
export function ago(iso, t) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return t.ago_now;
  if (m < 60) return fmt(t.ago_min, { n: m });
  if (m < 48 * 60) return fmt(t.ago_h, { n: Math.round(m / 60) });
  return fmt(t.ago_d, { n: Math.round(m / 1440) });
}
