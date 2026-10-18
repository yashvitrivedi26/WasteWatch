import { MapContainer, TileLayer, Rectangle, CircleMarker, Tooltip, useMapEvents } from 'react-leaflet';

export const LEVEL_COLOR = { high: '#c8664f', medium: '#e0b15a', low: '#9cb380' };
const LANDMARK_ICON = { market: 'M', bus: 'B', construction: 'C', plot: 'P' };

function ClickCatcher({ onClick }) {
  useMapEvents({ click: (e) => onClick?.([e.latlng.lat, e.latlng.lng]) });
  return null;
}

// Ward grid on OpenStreetMap. `neutral` hides risk colours (used on the citizen page).
export default function WardMap({ blocks, landmarks, selected, onSelect, onMapClick, marker, neutral, className = 'map' }) {
  if (!blocks.length) return <div className={`${className} map-empty`}>Loading map…</div>;
  const sw = [Math.min(...blocks.map((b) => b.bounds[0][0])), Math.min(...blocks.map((b) => b.bounds[0][1]))];
  const ne = [Math.max(...blocks.map((b) => b.bounds[1][0])), Math.max(...blocks.map((b) => b.bounds[1][1]))];

  return (
    <MapContainer bounds={[sw, ne]} scrollWheelZoom className={className}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickCatcher onClick={onMapClick} />
      {blocks.map((b) => (
        <Rectangle
          key={b.code}
          bounds={b.bounds}
          pathOptions={{
            color: b.code === selected ? '#3e2f24' : '#fffaf3',
            weight: b.code === selected ? 3 : 1,
            fillColor: neutral ? '#d9c4a8' : LEVEL_COLOR[b.level],
            fillOpacity: neutral ? 0.25 : 0.6,
          }}
          eventHandlers={onSelect ? { click: () => onSelect(b.code) } : {}}
          interactive={!!onSelect}
        >
          {!neutral && <Tooltip>{b.code} · {Math.round(b.prob * 100)}%</Tooltip>}
        </Rectangle>
      ))}
      {landmarks.map((l) => (
        <CircleMarker
          key={l.type}
          center={l.center}
          radius={9}
          interactive={false}
          pathOptions={{ color: '#3e2f24', weight: 2, fillColor: '#fffaf3', fillOpacity: 1 }}
        >
          <Tooltip permanent direction="center" className="landmark-label">{LANDMARK_ICON[l.type]}</Tooltip>
        </CircleMarker>
      ))}
      {marker && (
        <CircleMarker center={marker} radius={8} pathOptions={{ color: '#fffaf3', weight: 3, fillColor: '#8b5e3c', fillOpacity: 1 }} />
      )}
    </MapContainer>
  );
}
