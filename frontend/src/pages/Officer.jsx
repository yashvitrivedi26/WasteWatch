import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import WardMap, { LEVEL_COLOR } from '../components/WardMap.jsx';

const TOGGLES = [
  { key: 'rain', label: 'Rain' },
  { key: 'market_day', label: 'Market day' },
  { key: 'missed_pickup', label: 'Missed pickup' },
];

export default function Officer() {
  const [scenario, setScenario] = useState({ rain: false, market_day: false, missed_pickup: false });
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    const q = Object.entries(scenario).filter(([, v]) => v).map(([k]) => `${k}=1`).join('&');
    api(`/api/risk-map${q ? `?${q}` : ''}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, [scenario]);

  useEffect(load, [load]);

  const blocks = data?.blocks || [];
  const priority = useMemo(() => blocks.filter((b) => b.level !== 'low').sort((a, b) => b.prob - a.prob), [blocks]);
  const counts = useMemo(() => blocks.reduce((a, b) => ({ ...a, [b.level]: (a[b.level] || 0) + 1 }), {}), [blocks]);
  const sel = blocks.find((b) => b.code === selected);
  const whatIf = Object.values(scenario).some(Boolean);

  async function assign(code, team) {
    try {
      await api('/api/tasks', { method: 'POST', body: { block: code, team } });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <main className="layout">
      <section className="map-wrap">
        <div className="row-between map-head">
          <div>
            <h2>Ward 7 · 48 h hotspot forecast</h2>
            <p className="muted small">
              {data ? `Rain next 48 h: ${data.weather.rain_mm_48h} mm (${data.weather.source})` : ''}
              {whatIf && ' · showing what-if scenario'}
            </p>
          </div>
          <div className="legend">
            {['high', 'medium', 'low'].map((l) => (
              <span key={l}><i style={{ background: LEVEL_COLOR[l] }} />{l} {counts[l] || 0}</span>
            ))}
          </div>
        </div>
        <WardMap blocks={blocks} landmarks={data?.landmarks || []} selected={selected} onSelect={setSelected} />
        <p className="muted small map-note">M market · B bus stand · C construction · P open plot</p>
      </section>

      <aside className="panel">
        {error && <p className="error card">{error}</p>}
        <div className="card">
          <h2>What if tomorrow…</h2>
          <div className="toggles">
            {TOGGLES.map((t) => (
              <label key={t.key} className={`toggle ${scenario[t.key] ? 'on' : ''}`}>
                <input type="checkbox" checked={scenario[t.key]}
                  onChange={(e) => setScenario((s) => ({ ...s, [t.key]: e.target.checked }))} />
                {t.label}
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          {sel ? (
            <>
              <div className="row-between">
                <h2>Block {sel.code}</h2>
                <span className={`pill ${sel.level}`}>{Math.round(sel.prob * 100)}%</span>
              </div>
              <p className="muted small">Chance of becoming a hotspot in the next 48 h</p>
              <ol className="reasons">{sel.reasons.map((r) => <li key={r}>{r}</li>)}</ol>
              {sel.task && <p className="small">{sel.task.team} · <b>{sel.task.status.replace('_', ' ')}</b></p>}
            </>
          ) : (
            <p className="muted">Tap a block to see its risk and top reasons.</p>
          )}
        </div>

        <div className="card">
          <h2>Priority list</h2>
          {data && priority.length === 0 && <p className="muted small">No medium or high risk blocks.</p>}
          <ul className="priority">
            {priority.map((b) => (
              <li key={b.code} className={b.code === selected ? 'active' : ''} onClick={() => setSelected(b.code)}>
                <div className="row-between">
                  <span><span className={`dot ${b.level}`} /> <b>{b.code}</b> <span className="muted small">{b.reasons[0]}</span></span>
                  <span className="prob">{Math.round(b.prob * 100)}%</span>
                </div>
                <div className="actions" onClick={(e) => e.stopPropagation()}>
                  {b.task ? (
                    <span className="small status">{b.task.team} · {b.task.status.replace('_', ' ')}</span>
                  ) : (
                    <select value="" onChange={(e) => e.target.value && assign(b.code, e.target.value)} aria-label={`Assign team to ${b.code}`}>
                      <option value="">Assign team</option>
                      {data.teams.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}
