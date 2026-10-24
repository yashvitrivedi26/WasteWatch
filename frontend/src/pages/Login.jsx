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
              <button type="button" className="link" onClick={() => setShow(!show)}>{show ? t.lg_hide : t.lg_show}</button>
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
