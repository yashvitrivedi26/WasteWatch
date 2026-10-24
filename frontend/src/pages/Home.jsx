import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useLang } from '../i18n/index.jsx';
import { fmtMin } from '../util.js';

const STEP_ROUTE = ['/report', '/report', '/officer', '/officer', '/worker'];

export default function Home() {
  const { t } = useLang();
  const [step, setStep] = useState(0);
  const [stats, setStats] = useState(null);
  useEffect(() => { api('/api/public-stats').then(setStats).catch(() => {}); }, []);
  const live = stats ? [stats.reports, stats.cleared, stats.active, stats.avg_response_min == null ? '—' : fmtMin(stats.avg_response_min), stats.avg_work_min == null ? '—' : fmtMin(stats.avg_work_min)] : [];
  return (
    <main className="wrap">
      <header className="hero">
        <div className="eyebrow">{t.eyebrow}</div>
        <h1>{t.brand}</h1>
        <p className="sub">{t.sub}</p>
        <div className="mode"><span className="pill off">{t.old}</span><span>&rarr;</span><span className="pill on">{t.nw}</span></div>
        <div className="cta-row">
          <Link to="/report" className="btn primary cta">{t.ctaReport}</Link>
          <Link to="/track" className="btn cta">{t.ctaTrack}</Link>
        </div>
      </header>

      <section className="live">
        {t.live_labels.map((l, i) => <div key={l}><b>{stats ? live[i] : '…'}</b>{l}</div>)}
      </section>

      <nav className="steps">
        {t.steps.map((s, i) => (
          <button key={i} className={`${step === i ? 'active' : ''} ${step > i ? 'done' : ''}`} onClick={() => setStep(i)}>
            <b>{i + 1}</b>{s}
          </button>
        ))}
      </nav>

      <section className="banner">
        <div>
          <div className="tag">{t.tags[step]}</div>
          <h2>{t.titles[step]}</h2>
          <p>{t.descs[step]}</p>
        </div>
        <div className="nav">
          <button className="btn ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>{t.back}</button>
          <button className="btn ghost" disabled={step === 4} onClick={() => setStep(step + 1)}>{t.next}</button>
          <Link className="btn primary" to={STEP_ROUTE[step]}>{t.openStep}</Link>
        </div>
      </section>

      <section className="roles">
        {[['/report', 'citizen'], ['/officer', 'officer'], ['/worker', 'worker']].map(([to, k]) => (
          <Link key={to} to={to} className="card role-card">
            <h3>{t['role_' + k]}</h3>
            <p className="muted">{t['role_' + k + '_d']}</p>
          </Link>
        ))}
      </section>

      <section className="emerg-strip">
        <div><b>🚨 {t.em_title}</b><p>{t.em_text}</p></div>
        <div className="em-btns"><a className="btn primary" href="tel:112">{t.sos_long}</a><Link className="btn" to="/contact">{t.em_offices}</Link></div>
      </section>

      <section className="compare">
        <div className="card"><h3>{t.today}</h3><ol>{t.oldList.map((l) => <li key={l}>{l}</li>)}</ol><div className="bad">{t.oldEnd}</div></div>
        <div className="card good"><h3>{t.withWW}</h3><ol>{t.newList.map((l) => <li key={l}>{l}</li>)}</ol><div className="gd">{t.newEnd}</div></div>
      </section>
    </main>
  );
}
