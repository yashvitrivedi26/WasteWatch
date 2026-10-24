import InstallApp from './InstallApp.jsx';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { getSession, setSession } from '../api.js';
import { LANGS, useLang } from '../i18n/index.jsx';
import Bell from './Bell.jsx';

const HOME = { officer: '/officer', worker: '/worker', admin: '/admin' };

export default function Header() {
  const { t, lang, setLang } = useLang();
  const navigate = useNavigate();
  const s = getSession();
  return (
    <header className="topbar">
      <Link to="/" className="brand"><i className="logo" />{t.brand}</Link>
      <nav>
        <NavLink to="/" end>{t.nav_home}</NavLink>
        <NavLink to="/report">{t.nav_report}</NavLink>
        <NavLink to="/track">{t.nav_track}</NavLink>
        <NavLink to="/contact">{t.nav_contact}</NavLink>
        {s && HOME[s.role] && <NavLink to={HOME[s.role]}>{t['nav_' + s.role]}</NavLink>}
      </nav>
      <div className="tools">
        <InstallApp />
        <a className="btn sos" href="tel:112">{t.sos}</a>
        <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
          {LANGS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        {s && <Bell />}
        {s ? (
          <button className="btn ghost" onClick={() => { setSession(null); navigate('/'); }}>{t.nav_logout} ({s.name || s.username})</button>
        ) : (
          <Link className="btn ghost" to="/login">{t.nav_login}</Link>
        )}
      </div>
    </header>
  );
}
