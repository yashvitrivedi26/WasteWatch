import { useEffect, useState } from 'react';
import { useLang } from '../i18n/index.jsx';

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

// "Install app" button: Android / Chrome / Edge use the browser prompt; iPhone gets the Share → Add to Home Screen steps.
export default function InstallApp({ variant = 'header' }) {
  const { t } = useLang();
  const [ready, setReady] = useState(Boolean(window.__wwInstall));
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(standalone());
  useEffect(() => {
    const on = () => setReady(true);
    const done = () => { setInstalled(true); setReady(false); };
    window.addEventListener('ww-installable', on);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('ww-installable', on); window.removeEventListener('appinstalled', done); };
  }, []);
  if (installed) return null;
  if (!ready && !isIOS() && variant === 'header') return null;

  async function install() {
    if (window.__wwInstall) {
      window.__wwInstall.prompt();
      const r = await window.__wwInstall.userChoice;
      if (r.outcome === 'accepted') setInstalled(true);
      window.__wwInstall = null;
      setReady(false);
    } else setHelp(true);
  }

  return (
    <>
      <button className={variant === 'header' ? 'btn install-btn' : 'btn primary big'} onClick={install}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3v12m0 0l-5-5m5 5l5-5M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {t.app_install}
      </button>
      {help && (
        <div className="install-help" role="dialog" aria-label={t.app_install} onClick={() => setHelp(false)}>
          <div className="install-card" onClick={(e) => e.stopPropagation()}>
            <img src="/icon-192.png" alt="" width="56" height="56" />
            <h3>{t.app_install}</h3>
            {isIOS() ? <ol><li>{t.app_ios_1}</li><li>{t.app_ios_2}</li><li>{t.app_ios_3}</li></ol>
              : <ol><li>{t.app_and_1}</li><li>{t.app_and_2}</li></ol>}
            <button className="btn primary full" onClick={() => setHelp(false)}>{t.app_ok}</button>
          </div>
        </div>
      )}
    </>
  );
}
