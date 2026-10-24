import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { getDevicePosition, readPhotoGps, reversePlace, searchPlace } from '../geo.js';
import { fmt, useLang } from '../i18n/index.jsx';
import { fmtMin } from '../util.js';
import Phone from '../components/Phone.jsx';
import { LevelBadge } from '../components/ui.jsx';
import WardMap from '../components/WardMap.jsx';

export default function Report() {
  const { t } = useLang();
  const [cfg, setCfg] = useState({ wards: [], emergency_contacts: [] });
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [ai, setAi] = useState(null); // OpenCV result: { level, coverage_pct, eta_min, eta_max, overlay, waste_found }
  const [analysing, setAnalysing] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [mode, setMode] = useState('live'); // live | search
  const [point, setPoint] = useState(null); // { lat, lng, source: 'gps' | 'exif' | 'map' | 'search', accuracy? }
  const [address, setAddress] = useState('');
  const [finding, setFinding] = useState(false);
  const [geoMsg, setGeoMsg] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [type, setType] = useState('mixed');
  const [emergency, setEmergency] = useState(false);
  const [note, setNote] = useState('');
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState({ text: '', ok: false });
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const runId = useRef(0);

  useEffect(() => { api('/api/public-config').then(setCfg).catch(() => {}); }, []);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const codeMsg = (e) => t['err_' + e.code] || e.message;

  // OpenCV analysis runs as soon as a photo is chosen (and again if the waste type changes the time estimate).
  useEffect(() => {
    if (!photo) { setAi(null); return undefined; }
    const id = ++runId.current;
    setAnalysing(true);
    const form = new FormData();
    form.append('photo', photo);
    form.append('type', type);
    api('/api/analyze', { method: 'POST', form })
      .then((r) => { if (id === runId.current) { setAi(r); setMsg({ text: '', ok: false }); } })
      .catch((e) => { if (id === runId.current) { setAi(null); setMsg({ text: codeMsg(e), ok: false }); } })
      .finally(() => { if (id === runId.current) setAnalysing(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, type]);

  // Address for whatever spot is chosen.
  useEffect(() => {
    if (!point) { setAddress(''); return; }
    if (point.name) { setAddress(point.name.split(', ').slice(0, 4).join(', ')); return; }
    let live = true;
    reversePlace(point.lat, point.lng).then((a) => live && setAddress(a));
    return () => { live = false; };
  }, [point?.lat, point?.lng]); // eslint-disable-line

  async function findLive(file) {
    setFinding(true);
    setGeoMsg('');
    try {
      // live updates: the pin moves closer as the GPS locks on
      const p = await getDevicePosition({ onProgress: (f) => setPoint({ lat: f.lat, lng: f.lng, source: 'gps', accuracy: f.accuracy }) });
      setPoint({ lat: p.lat, lng: p.lng, source: 'gps', accuracy: p.accuracy });
    } catch (e) {
      const g = file ? await readPhotoGps(file) : null;
      if (g) setPoint({ ...g, source: 'exif' });
      else setGeoMsg(t['geo_' + e.code] || t.geo_unavailable);
    }
    setFinding(false);
  }

  function onPhoto(e) {
    const f = e.target.files[0];
    setPhoto(f || null);
    setPreview(f ? URL.createObjectURL(f) : '');
    setDone(null);
    setMsg({ text: '', ok: false });
    if (f && mode === 'live' && !point) findLive(f);
  }

  async function doSearch(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    setGeoMsg('');
    try {
      const w = cfg.wards[0];
      const r = await searchPlace(q, w && { lat: w.center[0], lng: w.center[1] });
      setResults(r);
      if (!r.length) setGeoMsg(t.rp_noresult);
    } catch {
      setGeoMsg(t.rp_searchfail);
    }
    setSearching(false);
  }

  async function submit(e) {
    e.preventDefault();
    if (!photo || !point) return setMsg({ text: t.rp_need, ok: false });
    const form = new FormData();
    form.append('photo', photo);
    form.append('lat', point.lat.toFixed(6));
    form.append('lng', point.lng.toFixed(6));
    form.append('type', type);
    form.append('location_source', point.source);
    if (point.accuracy) form.append('accuracy_m', String(point.accuracy));
    form.append('address', address);
    form.append('note', note);
    form.append('phone', phone);
    form.append('is_emergency', emergency ? '1' : '');
    setBusy(true);
    try {
      setDone(await api('/api/reports', { method: 'POST', form }));
      setMsg({ text: '', ok: true });
    } catch (err) {
      setMsg({ text: codeMsg(err), ok: false });
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setDone(null); setPhoto(null); setPreview(''); setAi(null); setPoint(null); setNote(''); setEmergency(false); setResults([]); setQ('');
  }

  const sourceText = point ? `${{ gps: t.rp_gps, exif: t.rp_exif, map: t.rp_map, search: t.rp_searched }[point.source]}${point.accuracy ? ` · ${fmt(t.rp_accuracy, { m: point.accuracy })}` : ''}` : finding ? t.rp_finding : t.rp_loc_none;
  const center = cfg.wards[0]?.center;

  if (done) {
    return (
      <main className="wrap narrow">
        <section className="card done-card">
          <div className="tick">✓</div>
          <h2>{t.thanks}</h2>
          <p className="muted">{t.rp_id}</p>
          <div className="big-code">{done.code}</div>
          <button className="link" onClick={() => navigator.clipboard?.writeText(done.code)}>{t.rp_copy}</button>
          <div className="done-grid">
            <div><small>{t.rp_level}</small><LevelBadge level={done.level} /></div>
            <div><small>{t.rp_cover}</small><b>{done.coverage_pct}%</b></div>
            <div><small>{t.rp_eta}</small><b>{fmtMin(done.eta_min)} – {fmtMin(done.eta_max)}</b></div>
            <div><small>{t.rp_ward}</small><b>{done.ward}</b></div>
          </div>
          <p className="muted">{t.rp_next}</p>
          {done.is_emergency && <p className="msg">{fmt(t.rp_em_done, { phone: done.ward_phone || '112' })}</p>}
          <div className="cta-row">
            <Link className="btn primary" to={`/track?code=${done.code}`}>{t.rp_track}</Link>
            <button className="btn" onClick={again}>{t.rp_again}</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="wrap">
      <section className="stage">
        <Phone who={t.role_citizen} title={t.brand}>
          <div className="bubble">{t.chatHello}<small>{t.brand}</small></div>
          {preview && (
            <div className="bubble out">
              <img className="photo" src={preview} alt="" />
              {point && <small>{t.rp_hello_user}</small>}
            </div>
          )}
          {analysing && <div className="bubble">{t.rp_analysing}</div>}
          {ai && !analysing && (
            <div className="bubble">
              <b>{t.rp_result}</b><br />
              <span className="chip">{t.rp_level}: {t['lv_' + ai.level]}</span>
              <span className="chip">{ai.coverage_pct}%</span>
              <div style={{ marginTop: 4 }}>{t.rp_eta}: <b>{fmtMin(ai.eta_min)} – {fmtMin(ai.eta_max)}</b></div>
            </div>
          )}
          {!preview && <div className="hint">{t.rp_photo}</div>}
        </Phone>

        <form className="card form" onSubmit={submit}>
          <h2>{t.rp_title}</h2>

          <label className="file-btn">
            {preview ? <img src={ai && showOverlay ? ai.overlay : preview} alt="" /> : <span>📷 {t.rp_photo}</span>}
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} hidden />
          </label>
          {preview && <div className="cap-row"><label className="check"><input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} disabled={!ai} /> {t.rp_show_detect}</label><span className="muted">{t.rp_change_photo}</span></div>}

          {analysing && <div className="ai-card"><div className="spin" />{t.rp_analysing}</div>}
          {ai && !analysing && (
            <div className={`ai-card lv-${ai.level}`}>
              <div className="ai-top"><LevelBadge level={ai.level} /><b>{t.rp_waste_level}</b></div>
              <div className="meter"><i style={{ width: `${Math.min(100, ai.coverage_pct * 2)}%` }} /></div>
              {ai.model && (
                <div className="ai-probs" title={ai.model.method}>
                  {['clean', 'low', 'medium', 'high'].map((k) => (
                    <div key={k} className={ai.model.level === k ? 'on' : ''}><small>{t['ai_' + k]}</small><span><i style={{ width: `${Math.round(ai.model.probs[k] * 100)}%` }} /></span><b>{Math.round(ai.model.probs[k] * 100)}%</b></div>
                  ))}
                  <p className="muted">{ai.model.method === 'trained' ? t.ai_trained : t.ai_zeroshot}</p>
                </div>
              )}
              <div className="ai-grid">
                <div><small>{t.rp_cover}</small><b>{ai.coverage_pct}%</b></div>
                <div><small>{t.rp_eta}</small><b>{fmtMin(ai.eta_min)} – {fmtMin(ai.eta_max)}</b></div>
              </div>
              <p className="muted">{ai.waste_found ? t.rp_eta_note : t.rp_little}</p>
            </div>
          )}

          <div className="loc">
            <div className="seg wide">
              <button type="button" className={mode === 'live' ? 'on' : ''} onClick={() => { setMode('live'); setGeoMsg(''); }}>📡 {t.rp_mode_live}</button>
              <button type="button" className={mode === 'search' ? 'on' : ''} onClick={() => { setMode('search'); setGeoMsg(''); }}>🔎 {t.rp_mode_search}</button>
            </div>
            <div className={`loc-status ${point ? 'ok' : ''}`}>
              <b>{sourceText}</b>
              {point && <span className="muted"> {point.lat.toFixed(5)}, {point.lng.toFixed(5)}</span>}
              {address && <div className="addr">📍 {address}</div>}
            </div>
            {mode === 'live' ? (
              <div className="loc-btns">
                <button type="button" className="btn" onClick={() => findLive(photo)} disabled={finding}>{finding ? t.rp_finding : t.rp_use_gps}</button>
                <button type="button" className="btn" disabled={!photo || finding} onClick={async () => { const g = photo ? await readPhotoGps(photo) : null; if (g) { setPoint({ ...g, source: 'exif' }); setGeoMsg(''); } else setGeoMsg(t.geo_noexif); }}>{t.rp_use_photo}</button>
              </div>
            ) : (
              <>
                <div className="search-row">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.rp_search_ph} onKeyDown={(e) => e.key === 'Enter' && doSearch(e)} />
                  <button type="button" className="btn dark" onClick={doSearch} disabled={searching}>{searching ? '…' : t.rp_search}</button>
                </div>
                {results.length > 0 && (
                  <ul className="results">
                    {results.map((r, i) => <li key={i}><button type="button" onClick={() => { setPoint({ lat: r.lat, lng: r.lng, source: 'search', name: r.name }); setResults([]); setGeoMsg(''); }}>{r.name}</button></li>)}
                  </ul>
                )}
              </>
            )}
          </div>
          {geoMsg && <p className="msg">{geoMsg}</p>}

          <WardMap marker={point ? [point.lat, point.lng] : null} markerAccuracy={point?.accuracy} center={center || undefined}
            onMarkerMove={([lat, lng]) => { setPoint({ lat, lng, source: 'map' }); setGeoMsg(''); }}
            onMapClick={([lat, lng]) => { setPoint({ lat, lng, source: 'map' }); setGeoMsg(''); }} className="map small-map" />
          {point?.source === 'gps' && point.accuracy > 30 && !finding && <p className="msg warn">{fmt(t.rp_weak_gps, { m: point.accuracy })}</p>}
          <p className="muted">{t.rp_drag}</p>

          <label>{t.rp_type}
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {['household', 'plastic', 'organic', 'construction', 'mixed'].map((k) => <option key={k} value={k}>{t['type_' + k]}</option>)}
            </select>
          </label>
          <label>{t.rp_note}<input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={t.rp_note_ph} /></label>
          <label>{t.rp_phone}<input value={phone} maxLength={15} inputMode="tel" onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, ''))} /></label>

          <div className={`em-box ${emergency ? 'on' : ''}`}>
            <label className="check"><input type="checkbox" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} /> <b>🚨 {t.rp_emergency}</b></label>
            <p className="muted">{t.rp_emergency_d}</p>
            {emergency && <div className="em-btns">{cfg.emergency_contacts.map((c) => <a key={c.number} className="btn" href={`tel:${c.number}`}>📞 {c.label} · {c.number}</a>)}</div>}
          </div>

          {msg.text && <p className={msg.ok ? 'msg ok' : 'msg'}>{msg.text}</p>}
          <button className="btn primary" disabled={busy || finding || analysing || !ai}>{busy ? t.rp_sending : t.rp_submit}</button>
        </form>
      </section>
    </main>
  );
}
