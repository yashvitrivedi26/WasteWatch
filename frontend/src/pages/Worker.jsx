import { useCallback, useEffect, useState } from 'react';
import { api, getSession } from '../api.js';

function TaskCard({ task, onDone }) {
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cleared = task.status === 'cleared';

  async function markCleared() {
    const form = new FormData();
    form.append('status', 'cleared');
    if (photo) form.append('after_photo', photo);
    setBusy(true);
    try {
      await api(`/api/tasks/${task.id}`, { method: 'PATCH', form });
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="card task">
      <div className="row-between">
        <h2>Block {task.block}</h2>
        <span className={`badge ${task.status}`}>{task.status.replace('_', ' ')}</span>
      </div>
      {task.risk && !cleared && (
        <p className="muted small">{Math.round(task.risk.prob * 100)}% risk · {task.risk.reasons.join(' · ')}</p>
      )}
      <div className="photos">
        <figure>
          {task.before_photo ? <img src={task.before_photo} alt="Before" /> : <div className="ph">No photo</div>}
          <figcaption>Before</figcaption>
        </figure>
        <figure>
          {cleared ? <img src={task.after_photo} alt="After" />
            : (
              <label className="file-btn compact">
                {preview ? <img src={preview} alt="After preview" /> : <span>Add after photo</span>}
                <input type="file" accept="image/*" capture="environment" hidden
                  onChange={(e) => { const f = e.target.files[0]; setPhoto(f); setPreview(f ? URL.createObjectURL(f) : ''); }} />
              </label>
            )}
          <figcaption>After</figcaption>
        </figure>
      </div>
      {error && <p className="error">{error}</p>}
      {!cleared && (
        <button className="primary" disabled={!photo || busy} onClick={markCleared}>
          {busy ? 'Saving…' : 'Mark cleared'}
        </button>
      )}
    </li>
  );
}

export default function Worker() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api('/api/tasks').then(setTasks).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const open = (tasks || []).filter((t) => t.status !== 'cleared');
  const done = (tasks || []).filter((t) => t.status === 'cleared').slice(0, 5);

  return (
    <main className="page narrow">
      <h1 className="page-title">{getSession()?.team} tasks</h1>
      {error && <p className="error">{error}</p>}
      {tasks && open.length === 0 && <p className="muted">No open tasks. Nice work.</p>}
      <ul className="task-list">{open.map((t) => <TaskCard key={t.id} task={t} onDone={load} />)}</ul>
      {done.length > 0 && (
        <>
          <h2 className="section-title">Recently cleared</h2>
          <ul className="task-list">{done.map((t) => <TaskCard key={t.id} task={t} onDone={load} />)}</ul>
        </>
      )}
    </main>
  );
}
