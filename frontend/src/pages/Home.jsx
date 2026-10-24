import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useLang } from '../i18n/index.jsx';
import { fmtMin } from '../util.js';

const STEPS = [
  { icon: '📷', k: 1 },
  { icon: '🧠', k: 2 },
  { icon: '🧭', k: 3 },
  { icon: '✅', k: 4 },
];

export default function Home() {
  const { t } = useLang();
  const [stats, setStats] = useState(null);
  useEffect(() => { api('/api/public-stats').then(setStats).catch(() => {}); }, []);
  const pct = stats && stats.reports ? Math.round((stats.cleared / stats.reports) * 100) : 0;

  return (
    <main className="home">
      <section className="hm-hero">
        <div className="hm-hero-in">
          <div className="hm-copy">
            <span className="hm-eyebrow">{t.hm_eyebrow}</span>
            <h1>{t.hm_title}</h1>
            <p>{t.hm_sub}</p>
            <div className="hm-cta">
              <Link to="/report" className="btn primary big">📷 {t.ctaReport}</Link>
              <Link to="/track" className="btn big light">{t.ctaTrack}</Link>
            </div>
            <ul className="hm-trust">{t.hm_trust.map((x) => <li key={x}>✓ {x}</li>)}</ul>
          </div>

          <div className="hm-live">
            <div className="hm-live-h"><span className="dot-live" />{t.hm_live}</div>
            <div className="hm-live-grid">
              <div><b>{stats ? stats.reports : '…'}</b><small>{t.live_labels[0]}</small></div>
              <div><b>{stats ? stats.cleared : '…'}</b><small>{t.live_labels[1]}</small></div>
              <div><b>{stats ? stats.active : '…'}</b><small>{t.live_labels[2]}</small></div>
              <div><b>{stats?.avg_response_min == null ? '—' : fmtMin(stats.avg_response_min)}</b><small>{t.live_labels[3]}</small></div>
            </div>
            <div className="hm-progress"><i style={{ width: `${pct}%` }} /></div>
            <small className="hm-progress-l">{pct}% {t.hm_cleared_share}</small>
          </div>
        </div>
      </section>

      <section className="hm-sec">
        <h2>{t.hm_how}</h2>
        <ol className="hm-steps">
          {STEPS.map((s) => (
            <li key={s.k}>
              <span className="hm-step-ic">{s.icon}</span>
              <small>{t.hm_step} {s.k}</small>
              <b>{t['hm_s' + s.k]}</b>
              <p>{t['hm_s' + s.k + '_d']}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="hm-sec">
        <h2>{t.hm_who}</h2>
        <div className="hm-roles">
          {[['/report', 'citizen', '🙋'], ['/officer', 'officer', '🧑‍💼'], ['/worker', 'worker', '🧹']].map(([to, k, ic]) => (
            <Link key={k} to={to} className="hm-role">
              <span className="hm-role-ic">{ic}</span>
              <b>{t['role_' + k]}</b>
              <p>{t['hm_role_' + k]}</p>
              <span className="hm-role-go">{t['hm_go_' + k]} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="hm-sec hm-compare">
        <div className="hm-cmp old">
          <h3>{t.today}</h3>
          <ol>{t.oldList.map((l) => <li key={l}>{l}</li>)}</ol>
        </div>
        <div className="hm-cmp new">
          <h3>{t.withWW}</h3>
          <ol>{t.newList.map((l) => <li key={l}>{l}</li>)}</ol>
        </div>
      </section>

      <section className="hm-sec">
        <div className="hm-em">
          <div>
            <b>🚨 {t.em_title}</b>
            <p>{t.hm_em}</p>
          </div>
          <div className="hm-em-btns">
            <a className="btn danger-solid" href="tel:112">{t.sos_long}</a>
            <Link className="btn" to="/contact">{t.em_offices}</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
