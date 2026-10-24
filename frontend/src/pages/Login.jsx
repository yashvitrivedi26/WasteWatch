import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, setSession } from '../api.js';
import { useLang } from '../i18n/index.jsx';

const ROLES = ['officer', 'worker', 'admin'];
const ICON = { officer: '🧑‍💼', worker: '🧹', admin: '🛡️' };

export default function Login() {
  const { t } = useLang();
  const [params] = useSearchParams();
  const [role, setRole] = useState(ROLES.includes(params.get('role')) ? params.get('role') : 'officer');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const s = await api('/api/auth/login', { method: 'POST', body: { username, password, role } });
      setSession(s);
      navigate(`/${s.role}`);
    } catch (err) {
      setError(err.code === 'wrong_role' ? t.lg_wrong_role : err.code === 'network' ? err.message : t.lg_bad);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <section className="login-main">
        <form className="login-card" onSubmit={submit}>
          <i className="logo big" />
          <h2>{t.lg_welcome}</h2>
          <p className="muted">{t.lg_sub}</p>
          <div className="role-tabs" role="tablist">
            {ROLES.map((r) => (
              <button type="button" role="tab" aria-selected={role === r} key={r} className={role === r ? 'on' : ''} onClick={() => { setRole(r); setError(''); }}>
                <span>{ICON[r]}</span>{t['role_' + r]}
              </button>
            ))}
          </div>
          <label>{t.lg_user}
            <input value={username} onChange={(e) => setUsername(e.target.value)} required autoCapitalize="none" autoComplete="username" placeholder={t.lg_user_ph} />
          </label>
          <label>{t.lg_pass}
            <span className="pw">
              <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              <button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? t.lg_hide : t.lg_show} aria-pressed={show} title={show ? t.lg_hide : t.lg_show}>
                {show ? (
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.6 3.7M6.2 6.3C4.3 7.6 2.8 9.6 2 12c1 2.5 5 7 10 7 1.6 0 3-.4 4.3-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
                )}
              </button>
            </span>
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" disabled={busy}>{busy ? t.lg_signing : t.lg_btn}</button>
          <p className="muted center">{t.lg_help}</p>
        </form>
      </section>
    </main>
  );
}
