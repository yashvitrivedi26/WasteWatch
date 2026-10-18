import { useEffect, useState } from 'react';
import { api } from '../api.js';
import WardMap from '../components/WardMap.jsx';

export default function Report() {
  const [ward, setWard] = useState({ blocks: [], landmarks: [] });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [point, setPoint] = useState(null);
  const [size, setSize] = useState('medium');
  const [type, setType] = useState('mixed');
  const [msg, setMsg] = useState({ text: '', ok: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/risk-map').then(setWard).catch((e) => setMsg({ text: e.message }));
  }, []);

  function onPhoto(e) {
    const f = e.target.files[0];
    setPhoto(f || null);
    setPreview(f ? URL.createObjectURL(f) : '');
  }

  function useGps() {
    if (!navigator.geolocation) return setMsg({ text: 'GPS not available. Tap the map instead.' });
    navigator.geolocation.getCurrentPosition(
      (p) => setPoint([p.coords.latitude, p.coords.longitude]),
      () => setMsg({ text: 'Could not get your location. Tap the map instead.' }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function submit(e) {
    e.preventDefault();
    if (!photo || !point) return setMsg({ text: 'Add a photo and a location first.' });
    const form = new FormData();
    form.append('photo', photo);
    form.append('lat', point[0].toFixed(6));
    form.append('lng', point[1].toFixed(6));
    form.append('size', size);
    form.append('type', type);
    setBusy(true);
    try {
      const r = await api('/api/reports', { method: 'POST', form });
      setMsg({ text: `Thanks! Report saved for block ${r.block}.`, ok: true });
      setPhoto(null);
      setPreview('');
      setPoint(null);
    } catch (err) {
      setMsg({ text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <form className="card form" onSubmit={submit}>
        <h2>Report garbage</h2>

        <label className="file-btn">
          {preview ? <img src={preview} alt="Garbage preview" /> : <span>Take or choose a photo</span>}
          <input type="file" accept="image/*" capture="environment" onChange={onPhoto} hidden />
        </label>

        <div className="row-between">
          <span className="small">{point ? `Location: ${point[0].toFixed(5)}, ${point[1].toFixed(5)}` : 'No location yet'}</span>
          <button type="button" className="secondary" onClick={useGps}>Use my GPS</button>
        </div>
        <WardMap {...ward} neutral marker={point} onMapClick={setPoint} className="map small-map" />
        <p className="muted small">Or tap the map to place the spot.</p>

        <div className="two-col">
          <label>Size
            <select value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="small">Small (bag)</option>
              <option value="medium">Medium (pile)</option>
              <option value="large">Large (dump)</option>
            </select>
          </label>
          <label>Type
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="household">Household</option>
              <option value="plastic">Plastic</option>
              <option value="organic">Organic / food</option>
              <option value="construction">Construction debris</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
        </div>

        {msg.text && <p className={msg.ok ? 'success' : 'error'}>{msg.text}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Submit report'}</button>
      </form>
    </main>
  );
}
