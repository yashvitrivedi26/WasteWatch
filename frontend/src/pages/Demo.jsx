import { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Rectangle, CircleMarker, Tooltip } from 'react-leaflet';
import { BLOCKS, LANDMARKS, TEAMS, blockBounds, blockCenter, ORIGIN, COLS, ROWS } from '../mockData.js';
import { predict, level, LEVEL_COLOR } from '../risk.js';

const TOGGLES = [
  { key: 'rain', label: 'Rain' },
  { key: 'marketDay', label: 'Market day' },
  { key: 'missedPickup', label: 'Missed pickup' },
];

const LANDMARK_ICON = { market: 'M', bus: 'B', construction: 'C', plot: 'P' };

export default function Demo() {
  const [scenario, setScenario] = useState({ rain: false, marketDay: false, missedPickup: false });
  const [blocks, setBlocks] = useState(BLOCKS);
  const [tasks, setTasks] = useState({}); // blockId -> { team, status }
  const [selectedId, setSelectedId] = useState(null);

  const scored = useMemo(
    () =>
      blocks
        .map((b) => ({ ...b, ...predict(b, scenario) }))
        .map((b) => ({ ...b, level: level(b.prob) })),
    [blocks, scenario]
  );
  const byId = useMemo(() => Object.fromEntries(scored.map((b) => [b.id, b])), [scored]);
  const priority = useMemo(
    () => scored.filter((b) => b.level !== 'low').sort((a, b) => b.prob - a.prob),
    [scored]
  );
  const counts = useMemo(
    () => scored.reduce((acc, b) => ({ ...acc, [b.level]: (acc[b.level] || 0) + 1 }), {}),
    [scored]
  );

  const selected = selectedId ? byId[selectedId] : null;
  const center = [ORIGIN.lat + (ROWS * 0.0009) / 2, ORIGIN.lng + (COLS * 0.000967) / 2];

  function assign(id, team) {
    setTasks((t) => ({ ...t, [id]: { team, status: 'assigned' } }));
  }

  function clear(id) {
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, reports7d: 0, daysSincePickup: 0 } : b)));
    setTasks((t) => ({ ...t, [id]: { ...t[id], status: 'cleared' } }));
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>WasteWatch</h1>
          <p className="muted">Ward 7, Bhavnagar · 48 h garbage risk forecast</p>
        </div>
        <div className="legend">
          <span><i style={{ background: LEVEL_COLOR.high }} />High {counts.high || 0}</span>
          <span><i style={{ background: LEVEL_COLOR.medium }} />Medium {counts.medium || 0}</span>
          <span><i style={{ background: LEVEL_COLOR.low }} />Low {counts.low || 0}</span>
        </div>
      </header>

      <main className="layout">
        <section className="map-wrap">
          <MapContainer center={center} zoom={17} scrollWheelZoom className="map">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {scored.map((b) => (
              <Rectangle
                key={b.id}
                bounds={blockBounds(b.row, b.col)}
                pathOptions={{
                  color: b.id === selectedId ? '#111827' : '#ffffff',
                  weight: b.id === selectedId ? 3 : 1,
                  fillColor: LEVEL_COLOR[b.level],
                  fillOpacity: 0.55,
                }}
                eventHandlers={{ click: () => setSelectedId(b.id) }}
              >
                <Tooltip direction="center" className="cell-label" permanent={false}>
                  {b.id} · {Math.round(b.prob * 100)}%
                </Tooltip>
              </Rectangle>
            ))}
            {LANDMARKS.map((l) => (
              <CircleMarker
                key={l.id}
                center={blockCenter(l.row, l.col)}
                radius={9}
                pathOptions={{ color: '#111827', weight: 2, fillColor: '#ffffff', fillOpacity: 1 }}
                interactive={false}
              >
                <Tooltip permanent direction="center" className="landmark-label">
                  {LANDMARK_ICON[l.type]}
                </Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
          <p className="muted small map-note">
            M market · B bus stand · C construction · P open plot. Tap a block for details.
          </p>
        </section>

        <aside className="panel">
          <div className="card">
            <h2>What if tomorrow…</h2>
            <div className="toggles">
              {TOGGLES.map((t) => (
                <label key={t.key} className={`toggle ${scenario[t.key] ? 'on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={scenario[t.key]}
                    onChange={(e) => setScenario((s) => ({ ...s, [t.key]: e.target.checked }))}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          <div className="card">
            {selected ? (
              <>
                <div className="row-between">
                  <h2>Block {selected.id}</h2>
                  <span className={`pill ${selected.level}`}>{Math.round(selected.prob * 100)}%</span>
                </div>
                <p className="muted small">Chance of becoming a hotspot in next 48 h</p>
                <ol className="reasons">
                  {selected.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
                {tasks[selected.id] && (
                  <p className="small">
                    {tasks[selected.id].team} · <b>{tasks[selected.id].status}</b>
                  </p>
                )}
              </>
            ) : (
              <p className="muted">Select a block on the map to see its risk and top reasons.</p>
            )}
          </div>

          <div className="card">
            <h2>Priority list</h2>
            {priority.length === 0 && <p className="muted small">No medium or high risk blocks.</p>}
            <ul className="priority">
              {priority.map((b) => {
                const task = tasks[b.id];
                return (
                  <li
                    key={b.id}
                    className={b.id === selectedId ? 'active' : ''}
                    onClick={() => setSelectedId(b.id)}
                  >
                    <div className="row-between">
                      <span>
                        <span className={`dot ${b.level}`} /> <b>{b.id}</b>{' '}
                        <span className="muted small">{b.reasons[0]}</span>
                      </span>
                      <span className="prob">{Math.round(b.prob * 100)}%</span>
                    </div>
                    <div className="actions" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={task?.status === 'assigned' ? task.team : ''}
                        onChange={(e) => e.target.value && assign(b.id, e.target.value)}
                        aria-label={`Assign team to ${b.id}`}
                      >
                        <option value="">Assign team</option>
                        {TEAMS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <button disabled={task?.status !== 'assigned'} onClick={() => clear(b.id)}>
                        Mark cleared
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
