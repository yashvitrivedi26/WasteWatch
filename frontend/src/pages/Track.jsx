import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { fmt, useLang } from '../i18n/index.jsx';
import { fmtDur, fmtMin, fmtTime } from '../util.js';
import { LevelBadge } from '../components/ui.jsx';
import WardMap from '../components/WardMap.jsx';
import { mapsLink } from '../util.js';

const STEPS = ['received', 'assigned', 'started', 'cleared'];

export default function Track() {
  const { t, lang } = useLang();
  const [params, setParams] = useSearchParams();
  const [code, setCode] = useState(params.get('code') || '');
  const [r, setR] = useState(null);
  const [error, setError] = useState('');

  async function lookup(c) {
    setError('');
    setR(null);
    try {
      setR(await api(`/api/track/${encodeURIComponent(c.trim())}`));
    } catch (e) {
      setError(e.status === 404 ? t.tr_notfound : e.message);
    }
  }
  useEffect(() => { if (params.get('code')) lookup(params.get('code')); }, []); // eslint-disable-line

  const at = (k) => r?.events.find((e) => e.k === k)?.at;
  const reached = r ? STEPS.filter((k) => at(k)).length : 0;

  return (
    <main className="wrap narrow">
      <form className="card form" onSubmit={(e) => { e.preventDefault(); if (code.trim()) { setParams({ code: code.trim() }); lookup(code); } }}>
        <h2>{t.tr_title}</h2>
        <p className="muted">{t.tr_sub}</p>
        <div className="search-row">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WW-2610-0001" />
          <button className="btn primary">{t.tr_btn}</button>
        </div>
        {error && <p className="msg">{error}</p>}
      </form>

      {r && (
        <section className="card track">
          <div className="track-h"><div><small>{t.rp_id}</small><h2>{r.code}</h2></div><LevelBadge level={r.level} /></div>
          <p className="muted">{r.address || r.ward} · {r.ward}</p>
          <WardMap points={[{ id: 1, lat: r.lat, lng: r.lng, level: r.status === 'cleared' ? 'cleared' : r.level, label: '!' }]}
            marker={null} markerAccuracy={0} circles={r.accuracy_m ? [{ lat: r.lat, lng: r.lng, radius: r.accuracy_m, level: r.level }] : []}
            center={[r.lat, r.lng]} fitKey={r.code} className="map track-map" />
          <div className="track-loc">
            <span>📍 {r.lat.toFixed(5)}, {r.lng.toFixed(5)}{r.accuracy_m ? ` · ±${r.accuracy_m} m` : ''}</span>
            <a className="btn" href={mapsLink(r.lat, r.lng)} target="_blank" rel="noreferrer">{t.tr_open_map}</a>
          </div>
          {r.team && r.status !== 'cleared' && r.status !== 'rejected' && (
            <p className="track-team">🧹 {fmt(t.tr_team, { team: r.team })}{r.deadline && <> · ⏱ {t.dl_due} <b>{fmtTime(r.deadline, lang)}</b></>}</p>
          )}
          {r.status === 'rejected' ? <p className="msg">{t.tr_rejected}</p> : (
            <ol className="timeline">
              {STEPS.map((k, i) => (
                <li key={k} className={i < reached ? 'done' : i === reached ? 'now' : ''}>
                  <i>{i < reached ? '✓' : i + 1}</i>
                  <div><b>{t['tl_' + k]}</b><small>{at(k) ? fmtTime(at(k), lang) : t['tl_' + k + '_wait']}</small></div>
                </li>
              ))}
            </ol>
          )}
          {r.status !== 'cleared' && r.status !== 'rejected' && <p>{t.rp_eta}: <b>{fmtMin(r.eta_min)} – {fmtMin(r.eta_max)}</b></p>}
          {r.status === 'cleared' && <p className="ok-text">{fmt(t.tr_done, { t: fmtDur(r.work_sec) })}</p>}
          <div className="photos">
            <figure><img className="photo" src={r.photo} alt="" /><figcaption>{t.wk_before}</figcaption></figure>
            {r.after_photo && <figure><img className="photo" src={r.after_photo} alt="" /><figcaption>{t.wk_after}</figcaption></figure>}
          </div>
          {r.ward_phone && <a className="btn" href={`tel:${r.ward_phone}`}>📞 {t.tr_call} {r.ward_phone}</a>}
        </section>
      )}
    </main>
  );
}
