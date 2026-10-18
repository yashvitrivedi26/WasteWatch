import { Link, NavLink, useNavigate } from 'react-router-dom';
import { getSession, setSession } from '../api.js';

export default function NavBar() {
  const navigate = useNavigate();
  const s = getSession();
  return (
    <header className="topbar">
      <Link to="/" className="brand">WasteWatch</Link>
      <nav>
        <NavLink to="/report">Report</NavLink>
        <NavLink to="/officer">Officer</NavLink>
        <NavLink to="/worker">Worker</NavLink>
        {s && (
          <button className="link" onClick={() => { setSession(null); navigate('/'); }}>
            Log out {s.username}
          </button>
        )}
      </nav>
    </header>
  );
}
