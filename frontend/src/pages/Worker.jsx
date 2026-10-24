import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getSession } from '../api.js';
import { getDevicePosition } from '../geo.js';
import { fmt, useLang } from '../i18n/index.jsx';
import { estLeg, fmtClock, fmtDur, fmtHM, fmtKm, fmtMin, fmtTime, levelOf, mapsLink, mapsRouteLink } from '../util.js';
import { hasGoogle } from '../maps.js';
import { LevelBadge } from '../components/ui.jsx';
import WardMap from '../components/WardMap.jsx';

function Elapsed({ since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  return <b className="timer">{fmtDur((now - new Date(since).getTime()) / 1000)}</b>;
}

// Time left to finish this stop inside the target (before photo time + the longest estimated clearing time).
function TargetLeft({ since, minutes }) {
  const { t } = useLang();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const left = (new Date(since).getTime() + minutes * 60000 - now) / 1000;
  return left >= 0
    ? <div className="tl ok">⏳ {t.wk_time_left}: <b>{fmtDur(left)}</b></div>
    : <div className="tl late">⚠ {t.wk_late}: <b>{fmtDur(-left)}</b></div>;
}

// Countdown to the deadline the ward officer set for this batch.
function Deadline({ at }) {
  const { t, lang } = useLang();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  if (!at) return null;
  const left = (new Date(at).getTime() - now) / 1000;
  const cls = left < 0 ? 'late' : left < 3600 ? 'soon' : 'ok';
  return (
    <div className={`deadline ${cls}`}>
      <span>⏱ {t.dl_label}: <b>{fmtTime(at, lang)}</b></span>
      <b>{left >= 0 ? fmt(t.dl_left, { t: fmtDur(left) }) : fmt(t.dl_over, { t: fmtDur(-left) })}</b>
    </div>
  );
}

function Stop({ task, plan, onDone, onFocus }) {
  const { t, lang } = useLang();
  const r = task.report;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(e, kind) {
    const photo = e.target.files[0];
    if (!photo) return;
    const form = new FormData();
    form.append(kind === 'start' ? 'before_photo' : 'after_photo', photo);
    setBusy(true);
    setError('');
    try {
      const p = await getDevicePosition({ goodM: 25, maxMs: 10000 }).catch(() => null); // the phone's position proves the worker is at the spot
      if (p) { form.append('lat', p.lat); form.append('lng', p.lng); }
      await api(`/api/worker/tasks/${task.id}/${kind === 'start' ? 'start' : 'finish'}`, { method: 'POST', form });
      onDone();
    } catch (err) {
      setError(t['err_' + err.code] || err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  const cleared = task.status === 'cleared';
  return (
    <div className={`item stop ${cleared ? 'is-done' : ''}`} onClick={onFocus}>
      <div className="r"><div>#{task.stop_no} · {r.code}</div><LevelBadge level={levelOf(r) === 'cleared' ? r.level : r.level} /></div>
      <p>📍 {r.address || `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`}</p>
      <div className="r2"><span>{r.coverage_pct}% · {t.type}: {t['type_' + r.type]}</span><span>{t.rp_eta}: {fmtMin(r.eta_min)}–{fmtMin(r.eta_max)}</span></div>
      {r.note && <p>“{r.note}”</p>}
      {r.is_emergency && <div className="od">🚨 {t.emergency}</div>}
      {!cleared && <a className="btn full" target="_blank" rel="noreferrer" href={mapsLink(r.lat, r.lng)} onClick={(e) => e.stopPropagation()}>🧭 {t.wk_navigate}</a>}

      {plan && !cleared && (
        <div className="wk-plan">
          {task.status === 'assigned' && <div>🚗 {t.wk_drive}: <b>{fmtDur(plan.travel_s)}</b> · {fmtKm(plan.distance_m)}</div>}
          <div>🧹 {t.wk_clear_target}: <b>{fmtMin(r.eta_min)} – {fmtMin(r.eta_max)}</b></div>
          {task.status === 'assigned'
            ? <div>⏰ {t.wk_reach_by} <b>{fmtHM(plan.reach_at, lang)}</b> · {t.wk_done_by} <b>{fmtHM(plan.done_at, lang)}</b></div>
            : <TargetLeft since={task.before_at} minutes={r.eta_max} />}
        </div>
      )}

      <div className="wk-times">
        <div><small>{t.wk_notified}</small><b>{fmtClock(task.notified_at, lang)}</b></div>
        <div><small>{t.wk_before_time}</small><b>{task.before_at ? fmtClock(task.before_at, lang) : '—'}</b></div>
        <div><small>{t.wk_after_time}</small><b>{task.after_at ? fmtClock(task.after_at, lang) : '—'}</b></div>
      </div>

      <div className="photos">
        {r.photo && <figure><img className="photo" src={r.photo} alt="" /><figcaption>{t.wk_report_photo}</figcaption></figure>}
        {task.before_photo && <figure><img className="photo" src={task.before_photo} alt="" /><figcaption>{t.wk_before}</figcaption></figure>}
        {task.after_photo && <figure><img className="photo" src={task.after_photo} alt="" /><figcaption>{t.wk_after}</figcaption></figure>}
      </div>

      {task.status === 'in_progress' && <div className="working">⏱ {t.wk_working} <Elapsed since={task.before_at} /></div>}
      {cleared && (
        <div className="ok">
          ✅ {fmt(t.wk_summary, { a: fmtDur(task.response_sec), b: fmtDur(task.work_sec) })}
          {task.verification === 'review' && <div className="od">{t.wk_review}</div>}
        </div>
      )}
      {task.distance_m != null && task.distance_m > 200 && <p className="od">{fmt(t.wk_far, { m: task.distance_m })}</p>}
      {error && <p className="msg">{error}</p>}
      {task.status === 'assigned' && (
        <label className="btn dark full">{busy ? t.wk_saving : `📷 ${t.wk_upload_before}`}
          <input type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => upload(e, 'start')} />
        </label>
      )}
      {task.status === 'in_progress' && (
        <label className="btn primary full">{busy ? t.wk_saving : `📷 ${t.wk_upload_after}`}
          <input type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => upload(e, 'finish')} />
        </label>
      )}
    </div>
  );
}

export default function Worker() {
  const { t, lang } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState(null);
  const [origin, setOrigin] = useState(null); // where the worker is now (live GPS); the ward office is used when GPS is off
  const [locMsg, setLocMsg] = useState('');
  const [road, setRoad] = useState(null); // legs from Google Directions
  const load = useCallback(() => api('/api/worker/batches').then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);
  const locate = useCallback(() => {
    setLocMsg('');
    getDevicePosition().then((p) => setOrigin({ lat: p.lat, lng: p.lng, live: true })).catch((e) => setLocMsg(t['geo_' + e.code] || t.geo_unavailable));
  }, [t]);
  useEffect(() => { locate(); }, []); // eslint-disable-line

  const batches = data?.batches || [];
  const openBatches = batches.filter((b) => b.tasks.some((x) => x.status !== 'cleared'));
  const doneBatches = batches.filter((b) => !openBatches.includes(b));
  const current = openBatches[0];
  const stops = useMemo(() => (current ? current.tasks.filter((x) => x.status !== 'cleared') : []), [data]); // eslint-disable-line
  const start = origin || (data?.office ? { lat: data.office.lat, lng: data.office.lng, live: false } : null);
  const pts = useMemo(() => stops.map((x) => ({ lat: x.report.lat, lng: x.report.lng })), [stops]);

  // ---- plan: drive time to every stop and the clearing target, in route order
  const legs = useMemo(() => {
    if (road && road.length === pts.length) return road;
    return pts.map((p, i) => estLeg(i === 0 ? start || p : pts[i - 1], p));
  }, [road, pts, start]);
  const plan = useMemo(() => {
    let clock = Date.now();
    let drive = 0, dist = 0, clear = 0;
    const rows = {};
    stops.forEach((x, i) => {
      const going = x.status === 'assigned'; // an in-progress stop means the worker is already there
      const leg = legs[i] || { duration_s: 0, distance_m: 0 };
      const travel = going ? leg.duration_s : 0;
      const meters = going ? leg.distance_m : 0;
      clock += travel * 1000;
      const reach = clock;
      const target = (x.report.eta_max || 20) * 60;
      const done = going ? reach + target * 1000 : new Date(x.before_at).getTime() + target * 1000;
      clock = Math.max(done, going ? done : Date.now());
      drive += travel; dist += meters; clear += target;
      rows[x.id] = { travel_s: travel, distance_m: meters, reach_at: reach, done_at: done };
    });
    return { rows, drive, dist, clear, finish: clock };
  }, [stops, legs]);

  const points = [
    ...stops.map((x) => ({ id: x.id, lat: x.report.lat, lng: x.report.lng, level: x.report.level, label: x.stop_no, emergency: x.report.is_emergency, tip: <div className="tip-body"><b>#{x.stop_no} {x.report.code}</b><div className="tip-a">{x.report.address}</div></div> })),
    ...(start ? [{ id: 'start', kind: 'office', lat: start.lat, lng: start.lng, label: 'S', tip: <div className="tip-body"><b>{start.live ? t.wk_from_you : t.wk_from_office}</b></div> }] : []),
  ];
  const route = start && pts.length ? [[start.lat, start.lng], ...pts.map((p) => [p.lat, p.lng])] : null;
  const directions = useMemo(() => (start && pts.length ? { origin: { lat: start.lat, lng: start.lng }, stops: pts } : null), [start, pts]);
  const onDirections = useCallback((r) => setRoad(r.ok ? r.legs : null), []);
  const lastBatch = current || batches[0];

  return (
    <main className="wrap">
      {data && (
        <section className="assign-banner">
          <span className="tick sm">✓</span>
          <div className="ab-main">
            <b>{fmt(t.wk_assigned_title, { team: data.team })}</b>
            <div className="muted">
              {data.ward} · {data.office?.name}
              {lastBatch?.assigned_by && ` · ${fmt(t.wk_assigned_by, { name: lastBatch.assigned_by, time: fmtTime(lastBatch.created_at, lang) })}`}
            </div>
            {!current && <div className="muted">{t.wk_no_assign}</div>}
            {data.members?.length > 0 && <div className="ab-members"><small>{t.wk_members}:</small>{data.members.map((m) => <span key={m} className="chip">{m}</span>)}</div>}
          </div>
          <div className="ab-count"><b>{stops.length}</b><small>{t.wk_open_stops}</small></div>
        </section>
      )}
      <section className="stage worker-stage">
        <aside className="card list-card">
          <div className="list-h"><b>{t.mytasks}</b><small className="muted">{getSession()?.name} · {data?.team}</small></div>
          {error && <div className="bubble">{error}</div>}
          {!data && !error && <div className="bubble">{t.loading}</div>}
          {data && openBatches.length === 0 && <div className="bubble">{t.wk_none}</div>}
          {openBatches.map((b, bi) => (
            <div key={b.id} className="batch">
              <div className="batch-h"><b>{b.name}</b><small>{fmt(t.wk_stops, { n: b.tasks.length })}</small></div>
              <Deadline at={b.deadline} />
              {b.note && <small className="muted">“{b.note}”</small>}
              {b.tasks.map((x) => <Stop key={x.id} task={x} plan={bi === 0 ? plan.rows[x.id] : null} onDone={load} onFocus={() => setFocus([x.report.lat, x.report.lng])} />)}
            </div>
          ))}
          {doneBatches.length > 0 && <div className="hint">{t.wk_recent}</div>}
          {doneBatches.map((b) => b.tasks.map((x) => <Stop key={x.id} task={x} onDone={load} onFocus={() => {}} />))}
        </aside>
        <div className="card map-card">
          <h3>{t.wk_route}</h3>
          <p className="muted">{t.wk_route_sub}</p>
          {stops.length > 0 && (
            <>
              <div className="plan-sum">
                <div><b>{stops.length}</b>{t.wk_open_stops}</div>
                <div><b>{fmtDur(plan.drive)}</b>{t.wk_total_drive} · {fmtKm(plan.dist)}</div>
                <div><b>{fmtDur(plan.clear)}</b>{t.wk_total_clear}</div>
                <div><b>{fmtHM(plan.finish, lang)}</b>{t.wk_all_done_by}</div>
              </div>
              <div className="plan-tools">
                <a className="btn primary" target="_blank" rel="noreferrer" href={mapsRouteLink(start, pts)}>🧭 {t.wk_open_gmaps}</a>
                <button className="btn" onClick={locate}>📍 {t.wk_update_loc}</button>
                <span className="muted">{start?.live ? t.wk_from_you : t.wk_from_office}</span>
              </div>
              {locMsg && <p className="msg">{locMsg}</p>}
              {!hasGoogle && <p className="muted">{t.wk_est}</p>}
            </>
          )}
          <WardMap points={points} route={route} directions={directions} onDirections={onDirections} focus={focus} className="map officer-map" />
          {stops.length > 0 && (
            <div className="steps-box">
              <h4>{t.wk_steps}</h4>
              {road && road.length === stops.length
                ? stops.map((x, i) => road[i].steps.length > 0 && (
                  <details key={x.id}>
                    <summary>#{x.stop_no} {x.report.address || x.report.code} · {fmtDur(road[i].duration_s)} · {fmtKm(road[i].distance_m)}</summary>
                    <ol>{road[i].steps.map((st, k) => <li key={k}><span dangerouslySetInnerHTML={{ __html: st.html }} /> <small className="muted">{st.distance}</small></li>)}</ol>
                  </details>
                ))
                : <p className="muted">{t.wk_no_steps}</p>}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
