import { useCallback, useEffect, useState } from 'react';
import { api, download, getSession } from '../api.js';
import { LEVEL_COLOR, fmtMin, fmtTime } from '../util.js';
import { ReportTip } from '../components/ui.jsx';
import WardMap from '../components/WardMap.jsx';

// The administrator panel is in English only: reports, BMC offices, teams, users and a few settings.
const SECTIONS = [
  ['overview', '📊 Overview'], ['reports', '📍 Reports'], ['wards', '🏛 Offices'],
  ['teams', '👥 Teams'], ['users', '🔑 Users'], ['settings', '⚙️ Settings'],
];

/* ---------- small building blocks ---------- */
const Cards = ({ items }) => <div className="statbar">{items.map(([v, l, k]) => <div key={l} className={k ? `s-${k}` : ''}><b>{v ?? '—'}</b>{l}</div>)}</div>;

function Table({ cols, rows, actions, empty = 'Nothing here yet.' }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr>{cols.map(([, l]) => <th key={l}>{l}</th>)}{actions && <th />}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={r.id ?? i}>{cols.map(([k, , render]) => <td key={k}>{render ? render(r) : String(r[k] ?? '')}</td>)}{actions && <td className="act">{actions(r)}</td>}</tr>)}
          {rows.length === 0 && <tr><td colSpan={cols.length + 1} className="muted">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Field({ f, value, onChange }) {
  const v = value ?? (f.type === 'checkbox' ? false : '');
  if (f.type === 'select') return <select value={v ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : f.num ? Number(e.target.value) : e.target.value)}>{f.blank && <option value="">—</option>}{f.options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
  if (f.type === 'checkbox') return <input type="checkbox" checked={!!v} onChange={(e) => onChange(e.target.checked)} />;
  return <input type={f.type || 'text'} value={v} step={f.step} placeholder={f.ph} onChange={(e) => onChange(f.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)} />;
}

function Crud({ path, title, cols, fields, blank, reload, hint }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api(`/api/admin/${path}`).then(setRows).catch((e) => setError(e.message)), [path]);
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    setError('');
    const body = { ...form };
    delete body._edit;
    try {
      if (form._edit) await api(`/api/admin/${path}/${form.id}`, { method: 'PATCH', body });
      else await api(`/api/admin/${path}`, { method: 'POST', body });
      setForm(null);
      load();
      reload?.();
    } catch (err) { setError(err.message); }
  }
  async function del(r) {
    if (!window.confirm(`Delete ${r.name || r.username || r.id}? This cannot be undone.`)) return;
    try { await api(`/api/admin/${path}/${r.id}`, { method: 'DELETE' }); load(); reload?.(); } catch (err) { setError(err.message); }
  }

  return (
    <div className="card">
      <div className="sec-bar"><h3>{title}</h3><button className="btn primary" onClick={() => { setForm({ ...blank }); setError(''); }}>+ Add</button></div>
      {hint && <p className="muted">{hint}</p>}
      {error && <p className="msg">{error}</p>}
      {form && (
        <form className="crud-form" onSubmit={save}>
          <h4>{form._edit ? 'Edit' : 'Add new'}</h4>
          <div className="crud-grid">
            {fields.map((f) => <label key={f.key}>{f.label}<Field f={f} value={form[f.key]} onChange={(v) => setForm({ ...form, [f.key]: v })} /></label>)}
          </div>
          <div className="crud-actions"><button className="btn primary">Save</button><button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      )}
      <Table cols={cols} rows={rows} actions={(r) => (<><button className="link" onClick={() => { setForm({ ...r, password: '', _edit: true }); setError(''); }}>Edit</button> <button className="link danger" onClick={() => del(r)}>Delete</button></>)} />
    </div>
  );
}

/* ---------- sections ---------- */
function Overview({ reports }) {
  const [s, setS] = useState(null);
  useEffect(() => { api('/api/admin/summary').then(setS); }, []);
  const points = reports.filter((r) => ['new', 'assigned', 'in_progress'].includes(r.status)).map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, level: r.level, emergency: r.is_emergency, label: r.level[0].toUpperCase(), tip: <ReportTip r={r} /> }));
  if (!s) return <p className="muted">Loading…</p>;
  const T = s.totals;
  const max = Math.max(1, ...s.days.map((d) => Math.max(d.reports, d.cleared)));
  return (
    <>
      <Cards items={[[T.reports, 'Total reports'], [T.open, 'Open now'], [T.cleared, 'Cleared'], [T.emergency, 'Open emergencies', 'em'], [fmtMin(T.avg_response_min), 'Avg time to reach'], [fmtMin(T.avg_work_min), 'Avg time to clear']]} />
      <div className="two-cols">
        <div className="card">
          <h3>Last 14 days</h3>
          <svg viewBox="0 0 420 140" className="chart" role="img" aria-label="Reports and cleared per day">
            {s.days.map((d, i) => (
              <g key={d.date} transform={`translate(${i * 30 + 6},0)`}>
                <rect x="0" y={120 - (d.reports / max) * 110} width="11" height={(d.reports / max) * 110} fill={LEVEL_COLOR.high}><title>{d.date}: {d.reports} reports</title></rect>
                <rect x="12" y={120 - (d.cleared / max) * 110} width="11" height={(d.cleared / max) * 110} fill={LEVEL_COLOR.low}><title>{d.date}: {d.cleared} cleared</title></rect>
                <text x="11" y="134" fontSize="8" textAnchor="middle" fill="#5d6f68">{d.date.slice(8)}</text>
              </g>
            ))}
          </svg>
          <div className="legend"><span><i className="dot" style={{ background: LEVEL_COLOR.high }} />Reports received</span><span><i className="dot" style={{ background: LEVEL_COLOR.low }} />Cleared</span></div>
        </div>
        <div className="card">
          <h3>Team performance</h3>
          <Table cols={[['team', 'Team'], ['cleared', 'Cleared'], ['open', 'Open'], ['avg_response_min', 'Reach', (r) => fmtMin(r.avg_response_min)], ['avg_work_min', 'Clear', (r) => fmtMin(r.avg_work_min)]]} rows={s.teams} />
        </div>
      </div>
      <div className="card"><h3>Open reports in Bhavnagar</h3><WardMap points={points} className="map officer-map" /></div>
    </>
  );
}

function Reports({ wards, reports, reload }) {
  const [f, setF] = useState({ status: '', level: '', ward: '' });
  const [error, setError] = useState('');
  const shown = reports.filter((r) => (!f.status || r.status === f.status) && (!f.level || r.level === f.level) && (!f.ward || String(wards.find((w) => w.name === r.ward)?.id) === f.ward));
  const patch = (id, body) => api(`/api/admin/reports/${id}`, { method: 'PATCH', body }).then(reload).catch((e) => setError(e.message));
  const del = (r) => window.confirm(`Delete report ${r.code} and its tasks?`) && api(`/api/admin/reports/${r.id}`, { method: 'DELETE' }).then(reload).catch((e) => setError(e.message));
  const sel = (key, opts) => <select value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })}><option value="">All {key}s</option>{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
  return (
    <div className="card">
      <div className="sec-bar"><h3>All reports ({shown.length})</h3><div className="filters">{sel('status', ['new', 'assigned', 'in_progress', 'cleared', 'rejected'].map((x) => [x, x]))}{sel('level', ['high', 'medium', 'low'].map((x) => [x, x]))}{sel('ward', wards.map((w) => [w.id, w.name]))}
        <button className="btn" onClick={() => download('/api/admin/export', 'wastewatch_reports.csv')}>⬇ Export CSV</button></div></div>
      {error && <p className="msg">{error}</p>}
      <Table rows={shown} cols={[['code', 'ID'], ['ward', 'Ward'], ['created_at', 'Received', (r) => fmtTime(r.created_at)], ['address', 'Location', (r) => r.address || `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`],
        ['level', 'Level', (r) => <select value={r.level} onChange={(e) => patch(r.id, { level: e.target.value })}>{['high', 'medium', 'low'].map((x) => <option key={x}>{x}</option>)}</select>],
        ['status', 'Status', (r) => <select value={r.status} onChange={(e) => patch(r.id, { status: e.target.value })}>{['new', 'assigned', 'in_progress', 'cleared', 'rejected'].map((x) => <option key={x}>{x}</option>)}</select>],
        ['team', 'Team', (r) => r.task?.team || '—'], ['photo', 'Photo', (r) => <a href={r.photo} target="_blank" rel="noreferrer"><img className="thumb" src={r.photo} alt="" /></a>]]}
      actions={(r) => <button className="link danger" onClick={() => del(r)}>Delete</button>} />
    </div>
  );
}

function Settings() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api('/api/admin/settings').then(setS); }, []);
  if (!s) return <p className="muted">Loading…</p>;
  const set = (k, v) => setS({ ...s, [k]: v });
  const num = (k, label, hint, step = 1) => <label key={k}>{label}<input type="number" step={step} value={s[k]} onChange={(e) => set(k, Number(e.target.value))} /><small className="muted">{hint}</small></label>;
  async function save() {
    try { setS(await api('/api/admin/settings', { method: 'PUT', body: s })); setMsg('Saved. New photos use these values straight away.'); } catch (e) { setMsg(e.message); }
  }
  return (
    <div className="card">
      <div className="sec-bar"><h3>Settings</h3><button className="btn primary" onClick={save}>Save settings</button></div>
      {msg && <p className="msg ok">{msg}</p>}
      <h4>OpenCV waste level</h4>
      <div className="crud-grid">
        {num('level_medium_pct', 'MEDIUM from (% of photo covered)', 'Below this = LOW', 0.5)}
        {num('level_high_pct', 'HIGH from (% of photo covered)', 'At or above = HIGH', 0.5)}
        {num('eta_base_min', 'Base clearing time (min)', 'For a tiny pile, 2-person team')}
        {num('eta_per_pct', 'Extra minutes per 1% coverage', 'e.g. 1.2 → a 20% pile adds 24 min', 0.1)}
      </div>
      <h4>Verification and forecast</h4>
      <div className="crud-grid">
        {num('after_max_ratio', 'After-photo waste limit (share of before)', '0.5 = at most half of the before waste may remain', 0.05)}
        {num('geofence_m', 'Worker distance warning (m)', 'Warn if the worker photo is farther than this from the report')}
        {num('forecast_radius_m', 'Hotspot radius (m)', 'Reports closer than this form one forecast hotspot')}
      </div>
      <h4>Target times to reach a report (hours)</h4>
      <div className="crud-grid">{['high', 'medium', 'low'].map((l) => <label key={l}>{l}<input type="number" value={s.sla_hours[l]} onChange={(e) => set('sla_hours', { ...s.sla_hours, [l]: Number(e.target.value) })} /></label>)}</div>
      <h4>Emergency numbers (shown on the Contact page and the report form)</h4>
      {s.emergency_contacts.map((c, i) => (
        <div className="em-edit" key={i}>
          <input value={c.label} onChange={(e) => set('emergency_contacts', s.emergency_contacts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <input value={c.number} onChange={(e) => set('emergency_contacts', s.emergency_contacts.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))} />
          <button className="link danger" onClick={() => set('emergency_contacts', s.emergency_contacts.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button className="btn" onClick={() => set('emergency_contacts', [...s.emergency_contacts, { label: '', number: '' }])}>+ Add number</button>
      <label className="note-edit">Helpline note<textarea rows={3} value={s.helpline_note} onChange={(e) => set('helpline_note', e.target.value)} /></label>
    </div>
  );
}

/* ---------- page ---------- */
export default function Admin() {
  const [tab, setTab] = useState(() => window.location.hash.slice(1) || 'overview');
  const [wards, setWards] = useState([]);
  const [teams, setTeams] = useState([]);
  const [reports, setReports] = useState([]);
  const loadRef = useCallback(() => {
    api('/api/admin/wards').then(setWards).catch(() => {});
    api('/api/admin/teams').then(setTeams).catch(() => {});
  }, []);
  const loadReports = useCallback(() => api('/api/admin/reports').then(setReports).catch(() => {}), []);
  useEffect(() => { loadRef(); loadReports(); const id = setInterval(loadReports, 30000); return () => clearInterval(id); }, [loadRef, loadReports]);
  const go = (k) => { setTab(k); window.location.hash = k; };

  const wardOpts = wards.map((w) => [w.id, w.name]);
  const wardCols = [['office_name', 'Office'], ['name', 'Area'], ['code', 'Code'], ['office_phone', 'Phone'], ['office_address', 'Address'], ['is_active', 'Active', (r) => (r.is_active ? 'Yes' : 'No')]];
  const wardFields = [
    { key: 'name', label: 'Ward name' }, { key: 'code', label: 'Short code (unique)' }, { key: 'city', label: 'City' },
    { key: 'center_lat', label: 'Centre latitude', type: 'number', step: 'any' }, { key: 'center_lng', label: 'Centre longitude', type: 'number', step: 'any' },
    { key: 'radius_km', label: 'Service radius (km)', type: 'number', step: 'any' }, { key: 'office_name', label: 'Office name' }, { key: 'office_address', label: 'Office address' },
    { key: 'office_phone', label: 'Office phone' }, { key: 'office_email', label: 'Office email' }, { key: 'office_hours', label: 'Office hours' },
    { key: 'office_lat', label: 'Office latitude (map pin)', type: 'number', step: 'any' }, { key: 'office_lng', label: 'Office longitude (map pin)', type: 'number', step: 'any' },
    { key: 'is_active', label: 'Active', type: 'checkbox' },
  ];
  const userFields = [
    { key: 'username', label: 'Username' }, { key: 'first_name', label: 'First name' }, { key: 'last_name', label: 'Last name' },
    { key: 'role', label: 'Role', type: 'select', options: [['officer', 'Ward officer'], ['worker', 'Sanitation worker'], ['admin', 'Administrator']] },
    { key: 'ward', label: 'Ward', type: 'select', blank: true, num: true, options: wardOpts },
    { key: 'team', label: 'Team (workers)', type: 'select', blank: true, num: true, options: teams.map((t) => [t.id, `${t.ward_name} / ${t.name}`]) },
    { key: 'phone', label: 'Phone' }, { key: 'password', label: 'Password (leave empty to keep)', type: 'password' }, { key: 'is_active', label: 'Active', type: 'checkbox' },
  ];

  return (
    <main className="wrap admin">
      <div className="dash-head"><div><h1 className="page-h">Administrator</h1><p className="muted">{getSession()?.name} · reports, BMC offices, teams and staff accounts</p></div></div>
      <div className="admin-grid">
        <nav className="admin-nav">{SECTIONS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(k)}>{l}</button>)}</nav>
        <div className="admin-body">
          {tab === 'overview' && <Overview reports={reports} />}
          {tab === 'reports' && <Reports wards={wards} reports={reports} reload={loadReports} />}
          {tab === 'wards' && <Crud path="wards" title="BMC offices" hint="These are the real Bhavnagar Municipal Corporation offices shown on the public Contact page. A citizen’s report goes to the nearest office. To move a pin, change its latitude and longitude." cols={wardCols} fields={wardFields} reload={loadRef}
            blank={{ name: '', code: '', city: 'Bhavnagar', center_lat: 21.7645, center_lng: 72.149, radius_km: 3, office_hours: 'Mon-Sat, 10:00 AM - 6:00 PM', is_active: true }} />}
          {tab === 'teams' && <Crud path="teams" title="Sanitation teams" cols={[['ward_name', 'Ward'], ['name', 'Team']]} fields={[{ key: 'ward', label: 'Ward', type: 'select', num: true, options: wardOpts }, { key: 'name', label: 'Team name' }]} blank={{ ward: wards[0]?.id, name: '' }} reload={loadRef} />}
          {tab === 'users' && <Crud path="users" title="Officers, workers and administrators" hint="Set or reset a password here. Staff accounts are created by the administrator only." reload={loadRef}
            cols={[['username', 'Username'], ['first_name', 'Name', (r) => `${r.first_name} ${r.last_name}`], ['role', 'Role'], ['ward', 'Ward', (r) => wards.find((w) => w.id === r.ward)?.name || '—'], ['team', 'Team', (r) => teams.find((t) => t.id === r.team)?.name || '—'], ['is_active', 'Active', (r) => (r.is_active ? 'Yes' : 'No')]]}
            fields={userFields} blank={{ username: '', first_name: '', last_name: '', role: 'worker', ward: wards[0]?.id, team: null, phone: '', password: '', is_active: true }} />}
          {tab === 'settings' && <Settings />}
        </div>
      </div>
    </main>
  );
}
