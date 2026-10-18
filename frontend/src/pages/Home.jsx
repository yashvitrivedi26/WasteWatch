import { Link } from 'react-router-dom';

const ROLES = [
  { to: '/report', title: 'Citizen', text: 'Report a garbage spot with a photo and your location.' },
  { to: '/officer', title: 'Ward officer', text: 'See the 48 h hotspot forecast and assign teams.' },
  { to: '/worker', title: 'Sanitation worker', text: 'See your tasks and upload an after photo when cleared.' },
];

export default function Home() {
  return (
    <main className="page narrow">
      <h1 className="hero">Clean blocks before they become garbage spots.</h1>
      <p className="muted">
        WasteWatch predicts which 100 m blocks of the ward are likely to become garbage hotspots in the next 48 hours,
        so teams can be sent early.
      </p>
      <div className="role-grid">
        {ROLES.map((r) => (
          <Link key={r.to} to={r.to} className="card role-card">
            <h2>{r.title}</h2>
            <p className="muted small">{r.text}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
