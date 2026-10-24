import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getSession } from '../api.js';
import { useLang } from '../i18n/index.jsx';
import { fmtTime } from '../util.js';

const ICON = { report: '📍', emergency: '🚨', assigned: '📋', started: '🚛', collected: '✅' };

// Notification bell: polls every 15 s, shows a browser notification for new items if the user allowed it.
export default function Bell() {
  const { t, lang } = useLang();
  const nav = useNavigate();
  const [data, setData] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const seen = useRef(null);
  const box = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await api('/api/notifications');
      const newest = d.items[0]?.id || 0;
      if (seen.current !== null && newest > seen.current && 'Notification' in window && Notification.permission === 'granted') {
        d.items.filter((n) => n.id > seen.current && !n.read).slice(0, 3).forEach((n) => new Notification(n.title, { body: n.body }));
      }
      seen.current = Math.max(seen.current ?? 0, newest);
      setData(d);
    } catch { /* offline: try again next time */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data.unread) {
      await api('/api/notifications', { method: 'POST', body: {} });
      setData((d) => ({ ...d, unread: 0 }));
    }
  }

  const role = getSession()?.role;
  const canAsk = 'Notification' in window && Notification.permission === 'default';

  return (
    <div className="bell" ref={box}>
      <button className="btn ghost bell-btn" onClick={toggle} aria-label={t.bell}>
        🔔{data.unread > 0 && <b className="bell-n">{data.unread > 9 ? '9+' : data.unread}</b>}
      </button>
      {open && (
        <div className="bell-pop">
          <div className="bell-h"><b>{t.bell}</b>{canAsk && <button className="link" onClick={() => Notification.requestPermission().then(() => setOpen(false))}>{t.bell_allow}</button>}</div>
          {data.items.length === 0 && <p className="muted pad">{t.bell_none}</p>}
          {data.items.map((n) => (
            <div key={n.id} className={`bell-i ${n.read ? '' : 'new'} k-${n.kind}`} onClick={() => { setOpen(false); nav(role === 'worker' ? '/worker' : role === 'admin' ? '/admin' : '/officer'); }}>
              <span>{ICON[n.kind] || '•'}</span>
              <div><b>{n.title}</b><p>{n.body}</p><small>{fmtTime(n.at, lang)}</small></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
