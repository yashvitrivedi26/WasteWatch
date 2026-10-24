import { useEffect, useState } from 'react';
import { hasGoogle } from '../maps.js';
import GoogleMap from './GoogleMap.jsx';
import LeafletMap from './LeafletMap.jsx';

// One map component for the whole app. Google Maps when VITE_GOOGLE_MAPS_KEY is set (and valid), otherwise OpenStreetMap.
export default function WardMap(props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const f = () => setFailed(true);
    window.addEventListener('ww-maps-fail', f);
    return () => window.removeEventListener('ww-maps-fail', f);
  }, []);
  return hasGoogle && !failed ? <GoogleMap {...props} /> : <LeafletMap {...props} />;
}
