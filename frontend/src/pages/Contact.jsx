import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useLang } from '../i18n/index.jsx';
import { mapsLink } from '../util.js';
import WardMap from '../components/WardMap.jsx';

export default function Contact() {
  const { t } = useLang();
  const [cfg, setCfg] = useState(null);
  const [sel, setSel] = useState(null);
  useEffect(() => { api('/api/public-config').then((c) => { setCfg(c); setSel(c.wards[0]?.id ?? null); }).catch(() => setCfg({ wards: [], emergency_contacts: [] })); }, []);

  const points = useMemo(() => (cfg?.wards || []).map((w) => ({
    id: w.id, kind: 'office', lat: w.office[0], lng: w.office[1], label: '🏛',
    tip: <div className="tip-body"><b>{w.office_name || w.name}</b><div className="tip-a">{w.office_address}</div>{w.office_phone && <div>📞 {w.office_phone}</div>}<div>{w.office_hours}</div></div>,
  })), [cfg]);
  const cur = cfg?.wards.find((w) => w.id === sel);

  if (!cfg) return <main className="wrap"><p className="muted">{t.loading}</p></main>;
  return (
    <main className="wrap">
      <h1 className="page-h">{t.ct_title}</h1>
      <p className="sub">{t.ct_sub}</p>

      <section className="emerg-grid">
        {cfg.emergency_contacts.map((c) => (
          <a key={c.number} className="card em-card" href={`tel:${c.number}`}><b>{c.number}</b><span>{c.label}</span><small>{t.ct_tap}</small></a>
        ))}
      </section>
      <div className="card note-card"><b>🚨 {t.em_title}</b><p>{cfg.helpline_note}</p><Link to="/report" className="btn primary">{t.ctaReport}</Link></div>

      <h2 className="sec-h">{t.ct_offices}</h2>
      <section className="office-wrap">
        <div className="office-list">
          {cfg.wards.map((w) => (
            <div key={w.id} className={`card office ${w.id === sel ? 'active' : ''}`} onClick={() => setSel(w.id)}>
              <h3>{w.office_name || w.name}</h3>
              <p>{w.office_address || `${w.name}, ${w.city}`}</p>
              <p className="muted">🕒 {w.office_hours}</p>
              <div className="office-actions">
                {w.office_phone && <a className="btn" href={`tel:${w.office_phone}`}>📞 {w.office_phone}</a>}
                {w.office_email && <a className="btn" href={`mailto:${w.office_email}`}>✉ {w.office_email}</a>}
                <a className="btn dark" target="_blank" rel="noreferrer" href={mapsLink(w.office[0], w.office[1])}>🧭 {t.ct_directions}</a>
              </div>
            </div>
          ))}
          {cfg.wards.length === 0 && <p className="muted">{t.ct_none}</p>}
        </div>
        <WardMap points={points} selected={sel} onSelect={setSel} focus={cur ? cur.office : null} className="map office-map" />
      </section>
    </main>
  );
}
