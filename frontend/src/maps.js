// Google Maps loader. The key comes from frontend/.env  ->  VITE_GOOGLE_MAPS_KEY=...
// Without a key the app keeps using the free OpenStreetMap map, so nothing breaks.
const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;
export const hasGoogle = Boolean(KEY);

let loading;
export function loadGoogle() {
  if (!KEY) return Promise.reject(new Error('no-key'));
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      // Google calls this when the key is wrong, billing is off or the domain is not allowed: the app falls back to OpenStreetMap.
      window.gm_authFailure = () => window.dispatchEvent(new Event('ww-maps-fail'));
      window.__wwMapsReady = () => resolve(window.google.maps);
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&callback=__wwMapsReady&region=IN&language=en&v=weekly`;
      s.async = true;
      s.onerror = () => { loading = null; reject(new Error('load')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}
