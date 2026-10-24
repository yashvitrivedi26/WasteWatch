import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getSession } from '../api.js';
import { fmt, useLang } from '../i18n/index.jsx';
import { fmtDur, fmtMin, fmtTime, levelOf, reasonText } from '../util.js';
import { LevelBadge, ReportTip, StatusBadge } from '../components/ui.jsx';
import WardMap from '../components/WardMap.jsx';
import { LEVEL_COLOR } from '../util.js';

export const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
function quickDeadline(k) {
  const d = new Date();
  if (k === 'eod') { d.setHours(18, 0, 0, 0); if (d < Date.now() + 30 * 60000) d.setDate(d.getDate() + 1); return d; }
  if (k === 'tmr') { d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; }
  return new Date(Date.now() + k * 3600000);
}

const FILTERS = ['all', 'new', 'high', 'medium', 'low', 'emergency'];

export default function Officer() {
  const { t, lang } = useLang();
  const session = getSession();
  const [wards, setWards] = useState([]);
  const [wardId, setWardId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState([]);
  const [team, setTeam] = useState('');
  const [filter, setFilter] = useState('all');
  const [layer, setLayer] = useState('reports'); // reports | forecast | both
  const [focus, setFocus] = useState(null);
  const [flash, setFlash] = useState('');
  const [deadline, setDeadline] = useState(''); // datetime-local value; empty = automatic from the level (SLA)

  useEffect(() => {
    if (session?.role === 'admin') api('/api/public-config').then((c) => { setWards(c.wards); setWardId(String(c.wards[0]?.id || '')); });
  }, []); // eslint-disable-line

  const load = useCallback(() => {
    if (session?.role === 'admin' && !wardId) return;
    api(`/api/officer/overview${wardId ? `?ward=${wardId}` : ''}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, [wardId]); // eslint-disable-line
  useEffect(() => { load(); const id = setInterval(load, 20000); return () => clearInterval(id); }, [load]);

  const reports = data?.reports || [];
  const active = reports; // a cleared report leaves the list and the map as soon as the worker uploads the after photo
  const rank = { high: 0, medium: 1, low: 2 };
  const list = useMemo(() => active.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'new') return r.status === 'new';
    if (filter === 'emergency') return r.is_emergency || r.emergency_status === 'pending';
    return r.level === filter;
  }).sort((a, b) => ((b.emergency_status === 'pending') - (a.emergency_status === 'pending')) || (b.is_emergency - a.is_emergency) || (rank[a.level] - rank[b.level]) || (b.coverage_pct - a.coverage_pct)), [active, filter]); // eslint-disable-line
  const sel = reports.find((r) => r.id === selected);
  const points = active.map((r) => ({
    id: r.id, lat: r.lat, lng: r.lng, level: levelOf(r), emergency: r.is_emergency,
    label: r.task ? r.task.team.slice(-1) : r.level[0].toUpperCase(), tip: <ReportTip r={r} />,
  }));
  const circles = layer === 'reports' ? [] : (data?.forecast || []).map((h) => ({
    lat: h.lat, lng: h.lng, radius: h.radius_m, level: h.level,
    tip: <div className="tip-body"><b>{t.fc_title} #{h.id}</b><div>{Math.round(h.prob * 100)}% · {t['lv_' + h.level]}</div>{h.reasons.map((r, i) => <div key={i} className="tip-n">{reasonText(t, r)}</div>)}</div>,
  }));
  const count = (l) => active.filter((r) => r.level === l).length;
  const s = data?.stats;

  const toggle = (id) => setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const newOnes = list.filter((r) => r.status === 'new');
  const bestTeam = data?.teams?.length ? [...data.teams].sort((a, b) => a.open - b.open)[0].id : '';

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

  const stats = s ? [[s.open, t.of_s_open], [s.high, t.lv_high, 'high'], [s.medium, t.lv_medium, 'medium'], [s.low, t.lv_low, 'low'], [s.emergency, t.emergency, 'em'], [s.emergency_pending, t.em_pending, 'em'],
    [s.overdue, t.of_overdue, 'em'], [s.late_tasks, t.dl_late_tasks, 'em'], [s.cleared_today, t.of_cleared_today], [fmtMin(s.avg_response_min), t.of_avg_resp], [fmtMin(s.avg_work_min), t.of_avg_work]] : [];

  return (
    <main className="wrap">
      <div className="dash-head">
        <div>
          <h1 className="page-h">{t.of_title}{data ? ` · ${data.ward.name}` : ''}</h1>
          <p className="muted">{session?.name} · {t.role_officer}{data && ` · ${fmt(t.of_rain, { mm: data.weather.rain_mm_48h, src: data.weather.source })}`}</p>
        </div>
        {wards.length > 1 && <select value={wardId} onChange={(e) => { setWardId(e.target.value); setData(null); setSelected(null); setChecked([]); }}>{wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}
      </div>
      {error && <div className="msg">{error}</div>}
      {flash && <div className="msg ok" onClick={() => setFlash('')}>{flash}</div>}

      <section className="statbar">{stats.map(([v, l, k], i) => <div key={i} className={k ? `s-${k}` : ''}><b>{v}</b>{l}</div>)}</section>

      <section className="stage">
        <aside className="card list-card">
          <div className="list-h"><b>{t.plist}</b><small className="muted">{list.length}</small></div>
          <div className="chips">
            {FILTERS.map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{t['f_' + f]}</button>)}
          </div>
          {data && list.length === 0 && <div className="bubble">{reports.length ? t.of_none : t.of_empty}</div>}
          {list.map((r, i) => (
            <div key={r.id} className={`item ${r.id === selected ? 'active' : ''} ${r.is_emergency ? 'emg' : ''}`} onClick={() => { setSelected(r.id); setFocus([r.lat, r.lng]); }}>
              <div className="r">
                <div>
                  {r.status === 'new' && <input type="checkbox" checked={checked.includes(r.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(r.id)} aria-label={`${t.of_select} ${r.code}`} />}
                  {' '}{i + 1}. {r.code}
                </div>
                <LevelBadge level={r.level} />
              </div>
              <p>{r.address || `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`}</p>
              <div className="r2">
                <span>{r.coverage_pct}% · {fmtMin(r.eta_min)}+</span>
                {r.overdue && <span className="od">⏰ {t.of_overdue}</span>}
                {r.is_emergency && <span className="od">🚨</span>}
                {r.emergency_status === 'pending' && <span className="em-req">🚨 {t.em_pending}</span>}
              </div>
              {r.task ? (
                <div className="ok">{t.assigned} {r.task.team} · {t['st_' + r.status]}
                  {r.task.deadline && <span className={`dl ${r.task.late ? 'late' : ''}`}> · ⏱ {r.task.late ? t.dl_missed : t.dl_due} {fmtTime(r.task.deadline, lang)}</span>}
                </div>
              ) : <div className="mini">{t.st_new}</div>}
            </div>
          ))}
        </aside>

        <div className="card map-card">
          <div className="map-head">
            <div className="legend">
              {['high', 'medium', 'low'].map((l) => <span key={l}><i className="dot" style={{ background: LEVEL_COLOR[l] }} />{t['lv_' + l]} ({count(l)})</span>)}
            </div>
            <div className="map-tools">
              <div className="seg">
                {[['reports', t.of_l_reports], ['forecast', t.of_l_forecast], ['both', t.of_l_both]].map(([k, l]) => <button key={k} className={layer === k ? 'on' : ''} onClick={() => setLayer(k)}>{l}</button>)}
              </div>
            </div>
          </div>
          <WardMap points={layer === 'forecast' ? [] : points} circles={circles} selected={selected} onSelect={(id) => setSelected(id)} focus={focus} center={data?.ward.center} className="map officer-map" fitKey={data ? `${data.ward.id}|${points.length}` : 'x'} />
          {points.length === 0 && data && <p className="muted center">{t.of_empty}</p>}

          {checked.length > 0 && (
            <div className="assign-bar">
              <b>{fmt(t.of_n_selected, { n: checked.length })}</b>
              <select value={team || bestTeam} onChange={(e) => setTeam(e.target.value)}>
                {data.teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name} · {fmt(t.of_team_load, { n: tm.open })}</option>)}
              </select>
              <label className="dl-pick">⏱ {t.dl_label}
                <input type="datetime-local" value={deadline} min={toLocalInput(new Date(Date.now() + 10 * 60000))} onChange={(e) => setDeadline(e.target.value)} />
              </label>
              <div className="dl-quick">
                {[[2, '+2 h'], [6, '+6 h'], ['eod', t.dl_today], ['tmr', t.dl_tomorrow]].map(([k, l]) => (
                  <button key={k} type="button" className="chip-btn" onClick={() => setDeadline(toLocalInput(quickDeadline(k)))}>{l}</button>
                ))}
              </div>
              {!deadline && <small className="muted">{t.dl_auto}</small>}
              <button className="btn primary" onClick={assign}>{t.of_assign_batch}</button>
              <button className="btn ghost" onClick={() => setChecked([])}>{t.cancel}</button>
            </div>
          )}
          {newOnes.length > 0 && checked.length === 0 && <button className="link" onClick={() => setChecked(newOnes.map((r) => r.id))}>{fmt(t.of_select_all, { n: newOnes.length })}</button>}
        </div>
      </section>

      {sel && (
        <section className="card detail">
          <div className="detail-photos">
            <figure><img src={sel.photo} alt="" /><figcaption>{t.of_photo}</figcaption></figure>
            {sel.overlay && <figure><img src={sel.overlay} alt="" /><figcaption>{t.rp_show_detect}</figcaption></figure>}
            {sel.task?.before_photo && <figure><img src={sel.task.before_photo} alt="" /><figcaption>{t.wk_before}</figcaption></figure>}
            {sel.task?.after_photo && <figure><img src={sel.task.after_photo} alt="" /><figcaption>{t.wk_after}</figcaption></figure>}
          </div>
          <div className="detail-info">
            <h3>{sel.code} <LevelBadge level={sel.level} /> <StatusBadge status={sel.status} /> {sel.is_emergency && <span className="lvl em">{t.emergency}</span>}</h3>
            <p>📍 {sel.address || '—'} <span className="muted">({sel.lat.toFixed(5)}, {sel.lng.toFixed(5)}{sel.accuracy_m ? ` · ±${sel.accuracy_m} m` : ''})</span></p>
            <div className="kv">
              <div><small>{t.rp_cover}</small><b>{sel.coverage_pct}%</b></div>
              <div><small>{t.rp_eta}</small><b>{fmtMin(sel.eta_min)} – {fmtMin(sel.eta_max)}</b></div>
              <div><small>{t.type}</small><b>{t['type_' + sel.type]}</b></div>
              <div><small>{t.of_reported}</small><b>{fmtTime(sel.created_at, lang)}</b></div>
              {sel.phone && <div><small>{t.rp_phone}</small><b><a href={`tel:${sel.phone}`}>{sel.phone}</a></b></div>}
            </div>
            {sel.note && <p>“{sel.note}”</p>}
            {sel.emergency_status && (
              <div className={`em-decide ${sel.emergency_status}`}>
                <div><b>🚨 {t.em_request_title}</b> · {t['em_cat_' + sel.emergency_category] || ''} · <i>{t['em_st_' + sel.emergency_status]}</i></div>
                <p>“{sel.emergency_reason}”</p>
                {sel.emergency_place && <p className="muted">{t.em_osm}: {sel.emergency_place}</p>}
                {sel.emergency_status === 'pending' && (
                  <div className="detail-actions">
                    <button className="btn primary" onClick={() => patch(sel.id, { emergency_decision: 'confirm' })}>{t.em_confirm}</button>
                    <button className="btn" onClick={() => patch(sel.id, { emergency_decision: 'reject' })}>{t.em_reject}</button>
                  </div>
                )}
              </div>
            )}
            {sel.task && (
              <div className="kv task-kv">
                <div><small>{t.assigned}</small><b>{sel.task.team}</b></div>
                <div><small>{t.of_notified}</small><b>{fmtTime(sel.task.notified_at, lang)}</b></div>
                <div><small>{t.of_before_at}</small><b>{sel.task.before_at ? fmtTime(sel.task.before_at, lang) : '—'}</b></div>
                <div><small>{t.of_reached_in}</small><b>{fmtDur(sel.task.response_sec)}</b></div>
                {sel.task.deadline && <div className={sel.task.late ? 'late-kv' : ''}><small>{t.dl_label}</small><b>{fmtTime(sel.task.deadline, lang)}{sel.task.late ? ` · ${t.dl_missed}` : ''}</b></div>}
              </div>
            )}
            {sel.status === 'new' && (
              <div className="detail-actions">
                <select value={sel.level} onChange={(e) => patch(sel.id, { level: e.target.value })} aria-label={t.rp_level}>{['high', 'medium', 'low'].map((l) => <option key={l} value={l}>{t.of_set_level}: {t['lv_' + l]}</option>)}</select>
                <button className="btn" onClick={() => patch(sel.id, { is_emergency: !sel.is_emergency })}>{sel.is_emergency ? t.of_unmark_em : t.of_mark_em}</button>
                <button className="btn ghost" onClick={() => window.confirm(t.of_reject_q) && patch(sel.id, { status: 'rejected' })}>{t.of_reject}</button>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="card teams-card">
        <h3>{t.of_teams}</h3>
        <p className="muted">{t.of_teams_sub}</p>
        <div className="team-list">
          {data?.teams.map((tm) => (
            <div key={tm.id} className="team-row">
              <div><b>{tm.name}</b><p className="muted">{tm.members.length ? tm.members.join(', ') : '—'}</p></div>
              <span className={`st ${tm.open ? 'st-assigned' : 'st-cleared'}`}>{tm.open ? fmt(t.of_team_busy, { n: tm.open }) : t.of_team_free}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="two-cols">
        <div className="card">
          <h3>{t.fc_title}</h3>
          <p className="muted">{t.fc_sub}</p>
          {data && data.forecast.length === 0 && <p className="muted">{t.fc_empty}</p>}
          {data?.forecast.map((h) => (
            <div key={h.id} className={`fc-row ${h.level}`} onClick={() => { setFocus([h.lat, h.lng]); setLayer((l) => (l === 'reports' ? 'both' : l)); }}>
              <div className="fc-p"><b>{Math.round(h.prob * 100)}%</b><LevelBadge level={h.level} /></div>
              <div><b>{h.address || `${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`}</b>
                <div className="muted">{h.codes.join(', ')}</div>
                {h.reasons.map((r, i) => <div key={i} className="why">{reasonText(t, r)}</div>)}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>{t.of_collected}</h3>
          <p className="muted">{t.of_collected_sub}</p>
          {data && data.completed.length === 0 && <p className="muted">{t.of_collected_none}</p>}
          {data?.completed.slice(0, 8).map((c) => (
            <div key={c.id} className="done-row">
              <div className="photos mini-photos">{c.before_photo && <img src={c.before_photo} alt="" />}{c.after_photo && <img src={c.after_photo} alt="" />}</div>
              <div>
                <b>{c.code}</b> · {c.team} <span className={`st ${c.verification === 'review' ? 'st-new' : 'st-cleared'}`}>{c.verification === 'review' ? t.of_review : t.of_verified}</span>
                <div className="muted">{t.of_reached_in}: <b>{fmtDur(c.response_sec)}</b> · {t.of_cleared_in}: <b>{fmtDur(c.work_sec)}</b></div>
                <div className="muted">{fmtTime(c.after_at, lang)}{c.distance_m != null && ` · ${fmt(t.of_dist, { m: c.distance_m })}`}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
