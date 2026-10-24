import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadGoogle } from '../maps.js';
import { LEVEL_COLOR } from '../util.js';

const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Same pins as the OpenStreetMap version: colour = waste level, rounded square = office, black outline = emergency.
function pinIcon(g, color, label, { emergency, selected, office }) {
  const w = selected ? 38 : 32;
  const h = Math.round(w * 1.25);
  const stroke = selected ? '#2f4b7c' : emergency ? '#111' : '#fff';
  const body = office
    ? `<rect x="3" y="3" width="26" height="26" rx="7" fill="${color}" stroke="${stroke}" stroke-width="3"/><path d="M16 29v9" stroke="${color}" stroke-width="4"/>`
    : `<path d="M16 39C16 39 3 24 3 15a13 13 0 0 1 26 0c0 9-13 24-13 24z" fill="${color}" stroke="${stroke}" stroke-width="3"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 32 40">${body}<text x="16" y="${office ? 21 : 20}" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="#fff">${esc(label)}</text></svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new g.Size(w, h), anchor: new g.Point(w / 2, h - 1) };
}

/**
 * Same props as the OpenStreetMap map (points, circles, route, selected, onSelect, onMapClick, marker, markerAccuracy, onMarkerMove, focus, fitKey, center)
 * plus:  directions = { origin: {lat,lng}, stops: [{lat,lng}, ...] }  -> road route drawn with Google Directions
 *        onDirections({ ok, legs: [{ distance_m, duration_s, steps: [{ html, distance, duration }] }] })
 */
export default function GoogleMap({ points = [], circles = [], route, selected, onSelect, onMapClick, marker, focus, fitKey, center = [21.7717, 72.1459], className = 'map', directions, onDirections }) {
  const box = useRef(null);
  const g = useRef(null);
  const map = useRef(null);
  const info = useRef(null);
  const pins = useRef(new Map());
  const shapes = useRef([]);
  const line = useRef(null);
  const pick = useRef(null);
  const renderer = useRef(null);
  const tipBox = useRef(null);
  if (!tipBox.current) tipBox.current = document.createElement('div');
  const cb = useRef({});
  cb.current = { onSelect, onMapClick, onDirections };
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState(null);
  const [roadOk, setRoadOk] = useState(false);

  // ---- create the map once
  useEffect(() => {
    let dead = false;
    loadGoogle().then((gm) => {
      if (dead || !box.current) return;
      g.current = gm;
      map.current = new gm.Map(box.current, { center: { lat: center[0], lng: center[1] }, zoom: 13, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, gestureHandling: 'greedy' });
      info.current = new gm.InfoWindow({ content: tipBox.current, disableAutoPan: true, headerDisabled: true });
      map.current.addListener('click', (e) => { info.current.close(); cb.current.onMapClick?.([e.latLng.lat(), e.latLng.lng()]); });
      setReady(true);
    }).catch(() => window.dispatchEvent(new Event('ww-maps-fail')));
    return () => {
      dead = true;
      pins.current.forEach((p) => p.m.setMap(null));
      pins.current.clear();
      shapes.current.forEach((s) => s.setMap(null));
      line.current?.setMap(null);
      pick.current?.setMap(null);
      renderer.current?.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showTip = (node, anchor, pos) => {
    setTip(node);
    if (pos) info.current.setPosition(pos);
    info.current.open(anchor ? { map: map.current, anchor } : { map: map.current });
  };

  // ---- pins
  useEffect(() => {
    if (!ready) return;
    const gm = g.current;
    const seen = new Set();
    points.forEach((p) => {
      const key = `${p.kind || 'r'}${p.id}`;
      seen.add(key);
      const color = p.kind === 'office' ? '#1c2433' : LEVEL_COLOR[p.level] || LEVEL_COLOR.low;
      const sel = p.id === selected;
      const sig = [color, p.label, p.emergency, sel, p.kind].join('|');
      let rec = pins.current.get(key);
      if (!rec) {
        const m = new gm.Marker({ map: map.current });
        rec = { m, sig: '' };
        pins.current.set(key, rec);
      }
      rec.p = p;
      rec.m.setPosition({ lat: p.lat, lng: p.lng });
      rec.m.setZIndex(sel ? 1000 : p.emergency ? 500 : 1);
      if (rec.sig !== sig) {
        rec.m.setIcon(pinIcon(gm, color, p.label, { emergency: p.emergency, selected: sel, office: p.kind === 'office' }));
        rec.sig = sig;
      }
      gm.event.clearInstanceListeners(rec.m);
      rec.m.addListener('click', () => onSelect && cb.current.onSelect(p.id));
      rec.m.addListener('mouseover', () => p.tip && showTip(p.tip, rec.m));
      rec.m.addListener('mouseout', () => info.current.close());
    });
    pins.current.forEach((rec, key) => { if (!seen.has(key)) { rec.m.setMap(null); pins.current.delete(key); } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, points, selected]);

  // ---- forecast circles
  useEffect(() => {
    if (!ready) return;
    const gm = g.current;
    shapes.current.forEach((s) => s.setMap(null));
    shapes.current = circles.map((c) => {
      const color = LEVEL_COLOR[c.level];
      const s = new gm.Circle({ map: map.current, center: { lat: c.lat, lng: c.lng }, radius: c.radius, strokeColor: color, strokeWeight: 2, fillColor: color, fillOpacity: 0.16 });
      if (c.tip) {
        s.addListener('mouseover', (e) => showTip(c.tip, null, e.latLng));
        s.addListener('mouseout', () => info.current.close());
      }
      return s;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, circles]);

  // ---- straight "route" line (hidden once a real road route is drawn)
  useEffect(() => {
    if (!ready) return;
    line.current?.setMap(null);
    line.current = null;
    if (!route || route.length < 2 || roadOk) return;
    line.current = new g.current.Polyline({
      map: map.current, path: route.map(([lat, lng]) => ({ lat, lng })), strokeOpacity: 0, strokeColor: '#2f4b7c',
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeWeight: 3, scale: 3 }, offset: '0', repeat: '14px' }],
    });
  }, [ready, route, roadOk]);

  // ---- the spot a citizen picked
  useEffect(() => {
    if (!ready) return;
    pick.current?.setMap(null);
    pick.current = null;
    if (marker) {
      pick.current = new g.current.Marker({ map: map.current, position: { lat: marker[0], lng: marker[1] }, icon: pinIcon(g.current, '#1d6fd9', '★', {}), draggable: !!onMarkerMove, zIndex: 2000 });
      if (onMarkerMove) pick.current.addListener('dragend', (e) => onMarkerMove([e.latLng.lat(), e.latLng.lng()]));
    }
  }, [ready, marker]);

  // ---- fit all pins, and fly to a focus point
  const fitPts = useMemo(() => [...points.map((p) => [p.lat, p.lng]), ...(marker ? [marker] : [])], [points, marker]); // eslint-disable-line
  const key = fitKey ?? `${points.map((p) => p.id).join()}|${marker ? marker.join() : ''}`;
  useEffect(() => {
    if (!ready || !fitPts.length) return;
    const gm = g.current;
    if (fitPts.length === 1) { map.current.setCenter({ lat: fitPts[0][0], lng: fitPts[0][1] }); map.current.setZoom(16); return; }
    const b = new gm.LatLngBounds();
    fitPts.forEach(([lat, lng]) => b.extend({ lat, lng }));
    map.current.fitBounds(b, 48);
    gm.event.addListenerOnce(map.current, 'idle', () => { if (map.current.getZoom() > 17) map.current.setZoom(17); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);
  useEffect(() => {
    if (!ready || !focus) return;
    map.current.panTo({ lat: focus[0], lng: focus[1] });
    map.current.setZoom(Math.max(map.current.getZoom() || 0, 16));
  }, [ready, focus?.[0], focus?.[1]]); // eslint-disable-line

  // ---- road directions: origin -> every stop, in the given order
  const dirKey = directions ? `${directions.origin?.lat},${directions.origin?.lng}|${directions.stops.map((s) => `${s.lat},${s.lng}`).join(';')}` : '';
  useEffect(() => {
    if (!ready) return;
    const gm = g.current;
    if (!renderer.current) renderer.current = new gm.DirectionsRenderer({ suppressMarkers: true, polylineOptions: { strokeColor: '#2f4b7c', strokeWeight: 5, strokeOpacity: 0.85 } });
    if (!directions || !directions.stops.length || !directions.origin) {
      renderer.current.setMap(null);
      setRoadOk(false);
      return;
    }
    const stops = directions.stops.slice(0, 24);
    const ll = (p) => ({ lat: p.lat, lng: p.lng });
    let live = true;
    new gm.DirectionsService().route({
      origin: ll(directions.origin), destination: ll(stops[stops.length - 1]),
      waypoints: stops.slice(0, -1).map((s) => ({ location: ll(s), stopover: true })),
      travelMode: gm.TravelMode.DRIVING, optimizeWaypoints: false, region: 'IN',
    }, (res, status) => {
      if (!live) return;
      if (status !== 'OK' || !res?.routes?.[0]) {
        renderer.current.setMap(null);
        setRoadOk(false);
        cb.current.onDirections?.({ ok: false, status });
        return;
      }
      renderer.current.setMap(map.current);
      renderer.current.setDirections(res);
      setRoadOk(true);
      cb.current.onDirections?.({
        ok: true,
        legs: res.routes[0].legs.map((l) => ({
          distance_m: l.distance.value, duration_s: l.duration.value,
          steps: l.steps.map((s) => ({ html: s.instructions, distance: s.distance.text, duration: s.duration.text })),
        })),
      });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, dirKey]);

  return (
    <>
      <div ref={box} className={className} />
      {tip && createPortal(tip, tipBox.current)}
    </>
  );
}
