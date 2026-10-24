import { useLang } from '../i18n/index.jsx';
import { fmtMin, fmtTime } from '../util.js';

export function LevelBadge({ level }) {
  const { t } = useLang();
  return <span className={`lvl ${level}`}>{t['lv_' + level] || level}</span>;
}

export function StatusBadge({ status }) {
  const { t } = useLang();
  return <span className={`st st-${status}`}>{t['st_' + status] || status}</span>;
}

// Content of the hover card shown over a map pin.
export function ReportTip({ r }) {
  const { t, lang } = useLang();
  return (
    <div className="tip">
      {r.photo && <img src={r.photo} alt="" />}
      <div className="tip-body">
        <div className="tip-h"><b>{r.code}</b><LevelBadge level={r.level} />{r.is_emergency && <span className="lvl em">{t.emergency}</span>}</div>
        <div className="tip-a">{r.address || `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`}</div>
        <table>
          <tbody>
            <tr><td>{t.rp_cover}</td><td>{r.coverage_pct}%</td></tr>
            <tr><td>{t.rp_eta}</td><td>{fmtMin(r.eta_min)} – {fmtMin(r.eta_max)}</td></tr>
            <tr><td>{t.type}</td><td>{t['type_' + r.type]}</td></tr>
            <tr><td>{t.of_reported}</td><td>{fmtTime(r.created_at, lang)}</td></tr>
            <tr><td>{t.of_status}</td><td>{t['st_' + r.status]}{r.task ? ` · ${r.task.team}` : ''}</td></tr>
          </tbody>
        </table>
        {r.note && <div className="tip-n">“{r.note}”</div>}
      </div>
    </div>
  );
}
