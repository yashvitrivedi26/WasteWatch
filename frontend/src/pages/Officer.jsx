import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getSession } from '../api.js';
import { fmt, useLang } from '../i18n/index.jsx';
import { ago, fmtClock, fmtDur, fmtMin, fmtTime, LEVEL_COLOR, levelOf, reasonText } from '../util.js';
import { LevelBadge, ReportTip, StatusBadge } from '../components/ui.jsx';
import WardMap from '../components/WardMap.jsx';

export const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
function quickDeadline(k) {
  const d = new Date();
  if (k === 'eod') { d.setHours(18, 0, 0, 0); if (d < Date.now() + 30 * 60000) d.setDate(d.getDate() + 1); return d; }
  if (k === 'tmr') { d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; }
  return new Date(Date.now() + k * 3600000);
}

const FILTERS = ['all', 'new', 'emergency', 'high', 'medium', 'low'];
const RANK = { high: 0, medium: 1, low: 2 };
const isEm = (r) => r.is_emergency || r.emergency_status === 'pending';

function Kpi({ label, value, sub, tone, children }) {
  return (
    <div className={`kpi ${tone || ''}`}>
      <small>{label}</small>
      <b>{value}</b>
      {sub && <span>{sub}</span>}
      {children}
    </div>
  );
}

function ReportRow({ r, active, checked, onCheck, onOpen }) {
  const { t, lang } = useLang();
  return (
    <li className={`rrow ${active ? 'active' : ''} ${isEm(r) ? 'em' : ''}`} onClick={onOpen}>
      <div className="rrow-pick" onClick={(e) => e.stopPropagation()}>
        {r.status === 'new'
          ? <input type="checkbox" checked={checked} onChange={onCheck} aria-label={`${t.of_select} ${r.code}`} />
          : <span className="rrow-dot" style={{ background: LEVEL_COLOR[r.level] }} />}
      </div>
      <img className="rrow-img" src={r.photo} alt="" loading="lazy" />
      <div className="rrow-main">
        <div className="rrow-top">
          <b>{r.code}</b>
          <LevelBadge level={r.level} />
          {r.emergency_status === 'pending' && <span className="em-req">🚨 {t.em_pending}</span>}
          {r.is_emergency && <span className="lvl em">{t.emergency}</span>}
        </div>
        <div className="rrow-addr">{r.address || `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`}</div>
        <div className="rrow-meta">
          <span>{ago(r.created_at, t)}</span>
          <span>{t.od_eta} {fmtMin(r.eta_min)}+</span>
          {r.overdue && <span className="late">⏰ {t.of_overdue}</span>}
        </div>
        {r.task ? (
          <div className={`rrow-task ${r.task.late ? 'late' : ''}`}>
            {r.task.team} · {t['st_' + r.status]}
            {r.task.deadline && <> · {r.task.late ? t.dl_missed : `${t.dl_due} ${fmtClock(r.task.deadline, lang)}`}</>}
          </div>
        ) : <div className="rrow-task new">{t.od_waiting}</div>}
      </div>
    </li>
  );
}

export default function Officer() {
  const { t, lang } = useLang();
  const session = getSession();
  const [wards, setWards] = useState([]);
  const [wardId, setWardId] = useState('');
  const [data, setData] = useState(null);
  const [updated, setUpdated] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState([]);
  const [team, setTeam] = useState('');
  const [deadline, setDeadline] = useState('');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [layer, setLayer] = useState('reports');
  const [focus, setFocus] = useState(null);
  const [overlay, setOverlay] = useState(false);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    if (session?.role === 'admin') api('/api/public-config').then((c) => { setWards(c.wards); setWardId(String(c.wards[0]?.id || '')); });
  }, []); // eslint-disable-line

  const load = useCallback(() => {
    if (session?.role === 'admin' && !wardId) return;
    api(`/api/officer/overview${wardId ? `?ward=${wardId}` : ''}`)
      .then((d) => { setData(d); setError(''); setUpdated(new Date()); })
      .catch((e) => setError(e.message));
  }, [wardId]); // eslint-disable-line
  useEffect(() => { load(); const id = setInterval(load, 20000); return () => clearInterval(id); }, [load]);

  const reports = data?.reports || [];
  const counts = useMemo(() => ({
    all: reports.length, new: reports.filter((r) => r.status === 'new').length, emergency: reports.filter(isEm).length,
    high: reports.filter((r) => r.level === 'high').length, medium: reports.filter((r) => r.level === 'medium').length,
    low: reports.filter((r) => r.level === 'low').length,
  }), [reports]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return reports.filter((r) => {
      if (needle && !(`${r.code} ${r.address}`.toLowerCase().includes(needle))) return false;
      if (filter === 'all') return true;
      if (filter === 'new') return r.status === 'new';
      if (filter === 'emergency') return isEm(r);
      return r.level === filter;
    }).sort((a, b) => ((b.emergency_status === 'pending') - (a.emergency_status === 'pending')) || (b.is_emergency - a.is_emergency)
      || ((a.status === 'new' ? 0 : 1) - (b.status === 'new' ? 0 : 1)) || (RANK[a.level] - RANK[b.level]) || (new Date(a.created_at) - new Date(b.created_at)));
  }, [reports, filter, q]);
  const sel = reports.find((r) => r.id === selected);
  const newOnes = list.filter((r) => r.status === 'new');
  const bestTeam = data?.teams?.length ? [...data.teams].sort((a, b) => a.open - b.open)[0].id : '';
  const s = data?.stats;

  const points = reports.map((r) => ({
    id: r.id, lat: r.lat, lng: r.lng, level: levelOf(r), emergency: isEm(r),
    label: r.task ? r.task.team.slice(-1) : r.level[0].toUpperCase(), tip: <ReportTip r={r} />,
  }));
  const circles = layer === 'reports' ? [] : (data?.forecast || []).map((h) => ({
    lat: h.lat, lng: h.lng, radius: h.radius_m, level: h.level,
    tip: <div className="tip-body"><b>{t.fc_title} #{h.id}</b><div>{Math.round(h.prob * 100)}% · {t['lv_' + h.level]}</div>{h.reasons.map((r, i) => <div key={i} className="tip-n">{reasonText(t, r)}</div>)}</div>,
  }));

  const open = (r) => { setSelected(r.id); setFocus([r.lat, r.lng]); setOverlay(false); };
  const toggle = (id) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  async function assign() {
    const ids = checked.filter((id) => reports.find((r) => r.id === id)?.status === 'new');
    try {
      const body = { team: Number(team || bestTeam), reports: ids };
      if (deadline) body.deadline = new Date(deadline).toISOString();
      const r = await api('/api/officer/batches', { method: 'POST', body });
      setFlash(`${fmt(t.of_assigned_ok, { n: r.stops, b: r.batch })} ${t.dl_due}: ${fmtTime(r.deadline, lang)}`);
      setChecked([]);
      setDeadline('');
      load();
    } catch (e) { setError(e.message); }
  }

  async function patch(id, body) {
    try { await api(`/api/officer/reports/${id}`, { method: 'PATCH', body }); load(); } catch (e) { setError(e.message); }
  }

  const split = s ? [['high', s.high], ['medium', s.medium], ['low', s.low]] : [];

  return (
    <main className="wrap odash">
      <header className="od-head">
        <div>
          <small className="eyebrow">{t.role_officer} · {session?.name}</small>
          <h1>{data ? data.ward.name : t.loading}</h1>
          <div className="od-sub">
            {data && <span className="chip-soft">🌧 {fmt(t.of_rain, { mm: data.weather.rain_mm_48h, src: data.weather.source })}</span>}
            {updated && <span className="muted">{fmt(t.od_updated, { t: fmtClock(updated.toISOString(), lang) })}</span>}
          </div>
        </div>
        <div className="od-head-r">
          {wards.length > 1 && <select value={wardId} onChange={(e) => { setWardId(e.target.value); setData(null); setSelected(null); setChecked([]); }}>{wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}
          <button className="btn" onClick={load}>↻ {t.od_refresh}</button>
        </div>
      </header>

      {error && <div className="toast err" onClick={() => setError('')}>{error}</div>}
      {flash && <div className="toast ok" onClick={() => setFlash('')}>✓ {flash}</div>}

      {s && (
        <section className="kpis">
          <Kpi label={t.of_s_open} value={s.open} sub={fmt(t.od_split, { h: s.high, m: s.medium, l: s.low })}>
            <div className="kpi-bar">{split.map(([k, v]) => v > 0 && <i key={k} style={{ flex: v, background: LEVEL_COLOR[k] }} />)}</div>
          </Kpi>
          <Kpi label={t.od_waiting} value={counts.new} sub={t.od_waiting_sub} tone={counts.new ? 'warn' : ''} />
          <Kpi label={t.emergency} value={s.emergency} sub={s.emergency_pending ? fmt(t.od_em_pending, { n: s.emergency_pending }) : t.od_em_none} tone={s.emergency || s.emergency_pending ? 'bad' : ''} />
          <Kpi label={t.dl_late_tasks} value={s.late_tasks} sub={fmt(t.od_overdue_sub, { n: s.overdue })} tone={s.late_tasks || s.overdue ? 'bad' : ''} />
          <Kpi label={t.of_cleared_today} value={s.cleared_today} sub={`${t.of_avg_resp} ${s.avg_response_min == null ? '—' : fmtMin(s.avg_response_min)} · ${t.of_avg_work} ${s.avg_work_min == null ? '—' : fmtMin(s.avg_work_min)}`} tone="good" />
        </section>
      )}

      <section className="od-main">
        <aside className="card inbox">
          <div className="inbox-h">
            <h2>{t.plist}</h2>
            <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.od_search} aria-label={t.od_search} />
            <div className="tabs" role="tablist">
              {FILTERS.map((f) => (
                <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                  {f === 'emergency' ? t.od_f_emergency : t['f_' + f]} <span>{counts[f]}</span>
                </button>
              ))}
            </div>
            {newOnes.length > 0 && checked.length === 0 && <button className="link" onClick={() => setChecked(newOnes.map((r) => r.id))}>{fmt(t.of_select_all, { n: newOnes.length })}</button>}
          </div>

          <ul className="rlist">
            {!data && <li className="empty">{t.loading}</li>}
            {data && list.length === 0 && <li className="empty">{reports.length ? t.of_none : t.of_empty}</li>}
            {list.map((r) => <ReportRow key={r.id} r={r} active={r.id === selected} checked={checked.includes(r.id)} onCheck={() => toggle(r.id)} onOpen={() => open(r)} />)}
          </ul>

          {checked.length > 0 && (
            <div className="assign">
              <div className="assign-top"><b>{fmt(t.of_n_selected, { n: checked.length })}</b><button className="link" onClick={() => setChecked([])}>{t.cancel}</button></div>
              <label>{t.od_team}
                <select value={team || bestTeam} onChange={(e) => setTeam(e.target.value)}>
                  {data.teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name} · {fmt(t.of_team_load, { n: tm.open })}</option>)}
                </select>
              </label>
              <label>{t.dl_label}
                <input type="datetime-local" value={deadline} min={toLocalInput(new Date(Date.now() + 10 * 60000))} onChange={(e) => setDeadline(e.target.value)} />
              </label>
              <div className="dl-quick">
                {[[2, '+2 h'], [6, '+6 h'], ['eod', t.dl_today], ['tmr', t.dl_tomorrow]].map(([k, l]) => (
                  <button key={k} type="button" className="chip-btn" onClick={() => setDeadline(toLocalInput(quickDeadline(k)))}>{l}</button>
                ))}
              </div>
              {!deadline && <small className="muted">{t.dl_auto}</small>}
              <button className="btn primary full" onClick={assign}>{t.of_assign_batch}</button>
            </div>
          )}
        </aside>

        <div className="od-right">
          <div className="card map-card">
            <div className="map-head">
              <div className="legend">
                {['high', 'medium', 'low'].map((l) => <span key={l}><i style={{ background: LEVEL_COLOR[l] }} />{t['lv_' + l]} ({counts[l]})</span>)}
              </div>
              <div className="seg">
                {[['reports', t.of_l_reports], ['forecast', t.of_l_forecast], ['both', t.of_l_both]].map(([k, l]) => <button key={k} className={layer === k ? 'on' : ''} onClick={() => setLayer(k)}>{l}</button>)}
              </div>
            </div>
            <WardMap points={layer === 'forecast' ? [] : points} circles={circles} selected={selected}
              onSelect={(id) => { const r = reports.find((x) => x.id === id); if (r) open(r); }}
              focus={focus} center={data?.ward.center} className="map od-map" fitKey={data ? `${data.ward.id}|${points.length}` : 'x'} />
          </div>

          <div className="card detail2">
            {!sel ? <p className="empty">{t.od_pick}</p> : (
              <>
                <div className="d2-head">
                  <div>
                    <h3>{sel.code}</h3>
                    <div className="d2-badges"><LevelBadge level={sel.level} /><StatusBadge status={sel.status} />{sel.is_emergency && <span className="lvl em">{t.emergency}</span>}</div>
                  </div>
                  <button className="link" onClick={() => setSelected(null)} aria-label={t.cancel} title={t.cancel}>✕</button>
                </div>
                <div className="d2-body">
                  <figure className="d2-photo">
                    <img src={overlay && sel.overlay ? sel.overlay : sel.photo} alt="" />
                    {sel.overlay && <label className="check"><input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> {t.rp_show_detect}</label>}
                  </figure>
                  <div className="d2-info">
                    <p className="d2-addr">📍 {sel.address || '—'}<small>{sel.lat.toFixed(5)}, {sel.lng.toFixed(5)}{sel.accuracy_m ? ` · ±${sel.accuracy_m} m` : ''}</small></p>
                    <dl className="d2-kv">
                      <div><dt>{t.rp_cover}</dt><dd>{sel.coverage_pct}%</dd></div>
                      <div><dt>{t.rp_eta}</dt><dd>{fmtMin(sel.eta_min)} – {fmtMin(sel.eta_max)}</dd></div>
                      <div><dt>{t.type}</dt><dd>{t['type_' + sel.type]}</dd></div>
                      <div><dt>{t.of_reported}</dt><dd>{fmtTime(sel.created_at, lang)}</dd></div>
                      {sel.task && <div><dt>{t.assigned}</dt><dd>{sel.task.team}</dd></div>}
                      {sel.task?.deadline && <div className={sel.task.late ? 'late-kv' : ''}><dt>{t.dl_label}</dt><dd>{fmtTime(sel.task.deadline, lang)}</dd></div>}
                      {sel.task?.before_at && <div><dt>{t.of_reached_in}</dt><dd>{fmtDur(sel.task.response_sec)}</dd></div>}
                      {sel.phone && <div><dt>{t.rp_phone}</dt><dd><a href={`tel:${sel.phone}`}>{sel.phone}</a></dd></div>}
                    </dl>
                    {sel.note && <p className="d2-note">“{sel.note}”</p>}
                  </div>
                </div>
                {sel.emergency_status && (
                  <div className={`em-decide ${sel.emergency_status}`}>
                    <div><b>🚨 {t.em_request_title}</b> · {t['em_cat_' + sel.emergency_category] || ''} · <i>{t['em_st_' + sel.emergency_status]}</i></div>
                    <p>“{sel.emergency_reason}”</p>
                    {sel.emergency_place && <p className="muted">{t.em_osm}: {sel.emergency_place}</p>}
                    {sel.emergency_status === 'pending' && (
                      <div className="d2-actions">
                        <button className="btn primary" onClick={() => patch(sel.id, { emergency_decision: 'confirm' })}>{t.em_confirm}</button>
                        <button className="btn" onClick={() => patch(sel.id, { emergency_decision: 'reject' })}>{t.em_reject}</button>
                      </div>
                    )}
                  </div>
                )}
                {sel.status === 'new' && (
                  <div className="d2-actions">
                    <button className="btn primary" onClick={() => setChecked((c) => (c.includes(sel.id) ? c : [...c, sel.id]))}>{t.od_add_batch}</button>
                    <select value={sel.level} onChange={(e) => patch(sel.id, { level: e.target.value })} aria-label={t.rp_level}>{['high', 'medium', 'low'].map((l) => <option key={l} value={l}>{t.of_set_level}: {t['lv_' + l]}</option>)}</select>
                    {!sel.emergency_status && <button className="btn" onClick={() => patch(sel.id, { is_emergency: !sel.is_emergency })}>{sel.is_emergency ? t.of_unmark_em : t.of_mark_em}</button>}
                    <button className="btn ghost danger" onClick={() => window.confirm(t.of_reject_q) && patch(sel.id, { status: 'rejected' })}>{t.of_reject}</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section className="od-bottom">
        <div className="card">
          <h3>{t.of_teams}</h3>
          <div className="teams2">
            {data?.teams.map((tm) => (
              <div key={tm.id} className="team2">
                <div className="team2-av">{tm.name.slice(-1)}</div>
                <div className="team2-main"><b>{tm.name}</b><small>{tm.members.length ? tm.members.join(', ') : '—'}</small></div>
                <span className={`st ${tm.open ? 'st-assigned' : 'st-cleared'}`}>{tm.open ? fmt(t.of_team_busy, { n: tm.open }) : t.of_team_free}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>{t.fc_title}</h3>
          <p className="muted">{t.fc_sub}</p>
          {data && data.forecast.length === 0 && <p className="empty">{t.fc_empty}</p>}
          {data?.forecast.slice(0, 5).map((h) => (
            <button key={h.id} className={`fc2 ${h.level}`} onClick={() => { setFocus([h.lat, h.lng]); setLayer((l) => (l === 'reports' ? 'both' : l)); }}>
              <b className="fc2-p">{Math.round(h.prob * 100)}%</b>
              <span className="fc2-main"><b>{h.address || `${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`}</b>
                <small>{h.reasons.slice(0, 2).map((r) => reasonText(t, r)).join(' · ')}</small></span>
            </button>
          ))}
        </div>

        <div className="card">
          <h3>{t.of_collected}</h3>
          {data && data.completed.length === 0 && <p className="empty">{t.of_collected_none}</p>}
          {data?.completed.slice(0, 5).map((c) => (
            <div key={c.id} className="done2">
              <div className="done2-ph">{c.before_photo && <img src={c.before_photo} alt="" />}{c.after_photo && <img src={c.after_photo} alt="" />}</div>
              <div>
                <b>{c.code}</b> · {c.team} <span className={`st ${c.verification === 'review' ? 'st-new' : 'st-cleared'}`}>{c.verification === 'review' ? t.of_review : t.of_verified}</span>
                <small>{t.of_reached_in} {fmtDur(c.response_sec)} · {t.of_cleared_in} {fmtDur(c.work_sec)}{c.late ? ` · ${t.dl_missed}` : ''}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
