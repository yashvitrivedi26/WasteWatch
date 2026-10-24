import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { LEVEL_COLOR } from '../util.js';

// Free fallback map (OpenStreetMap). Used when no Google Maps key is set. One pin per real report / office. Colour = waste level (red high, orange medium, green low, grey cleared).
const icons = new Map();
function pinIcon(color, label, { emergency, selected, office }) {
  const key = [color, label, emergency, selected, office].join('|');
  if (!icons.has(key)) {
    icons.set(key, L.divIcon({
      className: 'pin-wrap',
      html: `<div class="pin2 ${emergency ? 'em' : ''} ${selected ? 'sel' : ''} ${office ? 'office' : ''}" style="--c:${color}"><span>${label ?? ''}</span></div>`,
      iconSize: [30, 40], iconAnchor: [15, 38], tooltipAnchor: [0, -34],
    }));
  }
  return icons.get(key);
}

function ClickCatcher({ onClick }) {
  useMapEvents({ click: (e) => onClick?.([e.latlng.lat, e.latlng.lng]) });
  return null;
}

function Fit({ pts, focus, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (!pts.length) return;
    if (pts.length === 1) map.setView(pts[0], 16);
    else map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 17 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);
  useEffect(() => { if (focus) map.flyTo(focus, Math.max(map.getZoom(), 16), { duration: 0.6 }); }, [map, focus?.[0], focus?.[1]]); // eslint-disable-line
  return null;
}

/**
 * points: [{ id, lat, lng, level, label, emergency, kind: 'report' | 'office', tip: ReactNode }]
 * marker: [lat, lng] of the spot a citizen picked. circles: [{ lat, lng, radius, level, tip }]. route: [[lat, lng], ...]
 */
export default function LeafletMap({ points = [], circles = [], route, selected, onSelect, onMapClick, marker, markerAccuracy, onMarkerMove, focus, fitKey, center = [21.7645, 72.149], className = 'map' }) {
  const fitPts = useMemo(() => [...points.map((p) => [p.lat, p.lng]), ...(marker ? [marker] : [])], [points, marker]); // eslint-disable-line
  const key = fitKey ?? `${points.map((p) => p.id).join()}|${marker ? marker.join() : ''}`;
  return (
    <MapContainer center={center} zoom={13} scrollWheelZoom className={className}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Fit pts={fitPts} focus={focus} fitKey={key} />
      {onMapClick && <ClickCatcher onClick={onMapClick} />}
      {circles.map((c, i) => (
        <Circle key={`c${i}`} center={[c.lat, c.lng]} radius={c.radius} pathOptions={{ color: LEVEL_COLOR[c.level], weight: 2, dashArray: '5 5', fillColor: LEVEL_COLOR[c.level], fillOpacity: 0.16 }}>
          {c.tip && <Tooltip sticky>{c.tip}</Tooltip>}
        </Circle>
      ))}
      {route && route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#7c2d6e', weight: 4, dashArray: '8 6' }} />}
      {points.map((p) => (
        <Marker key={`${p.kind || 'r'}${p.id}`} position={[p.lat, p.lng]} zIndexOffset={p.id === selected ? 1000 : p.emergency ? 500 : 0}
          icon={pinIcon(p.kind === 'office' ? '#1e293b' : LEVEL_COLOR[p.level] || LEVEL_COLOR.low, p.label, { emergency: p.emergency, selected: p.id === selected, office: p.kind === 'office' })}
          eventHandlers={onSelect ? { click: () => onSelect(p.id) } : {}}>
          {p.tip && <Tooltip direction="top" className="pin-tip" opacity={1}>{p.tip}</Tooltip>}
        </Marker>
      ))}
      {marker && markerAccuracy > 0 && <Circle center={marker} radius={markerAccuracy} pathOptions={{ color: '#1d6fd9', weight: 1, fillColor: '#1d6fd9', fillOpacity: 0.12 }} />}
      {marker && (
        <Marker position={marker} icon={pinIcon('#1d6fd9', '★', {})} draggable={!!onMarkerMove} zIndexOffset={2000}
          eventHandlers={onMarkerMove ? { dragend: (e) => { const p = e.target.getLatLng(); onMarkerMove([p.lat, p.lng]); } } : {}} />
      )}
    </MapContainer>
  );
}
