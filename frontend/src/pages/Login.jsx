import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, setSession } from '../api.js';

const DEMO = { officer: 'officer1', worker: 'worker1' };

export default function Login() {
  const [params] = useSearchParams();
  const wanted = params.get('role') || 'officer';
  const [username, setUsername] = useState(DEMO[wanted] || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const s = await api('/api/auth/login', { method: 'POST', body: { username, password } });
      setSession(s);
      navigate(s.role === 'officer' ? '/officer' : s.role === 'worker' ? '/worker' : '/report');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="page narrow">
      <form className="card form" onSubmit={submit}>
        <h2>Log in as {wanted}</h2>
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary">Log in</button>
        <p className="muted small">Demo: officer1, worker1 (Team A), worker2 (Team B) · password demo1234</p>
      </form>
    </main>
  );
}
