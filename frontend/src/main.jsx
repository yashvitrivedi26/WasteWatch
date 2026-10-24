import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import Header from './components/Header.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Report from './pages/Report.jsx';
import Track from './pages/Track.jsx';
import Contact from './pages/Contact.jsx';
import Officer from './pages/Officer.jsx';
import Worker from './pages/Worker.jsx';
import Admin from './pages/Admin.jsx';
import { getSession } from './api.js';
import { LangProvider, useLang } from './i18n/index.jsx';

function RequireRole({ role, children }) {
  const s = getSession();
  // administrators may open the officer view as well (they pick a ward there)
  const ok = s?.role === role || (role === 'officer' && s?.role === 'admin');
  return ok ? children : <Navigate to={`/login?role=${role}`} replace />;
}

function Footer() {
  const { t } = useLang();
  return (
    <footer className="foot">
      <div>{t.foot}</div>
      <div className="foot-links"><a href="/contact">{t.nav_contact}</a> · <a href="/track">{t.nav_track}</a> · <a href="tel:112">{t.sos_long}</a></div>
    </footer>
  );
}

// Installable app: register the service worker (needs https:// or localhost).
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
// Keep the browser's install prompt so the header can offer an "Install app" button.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__wwInstall = e;
  window.dispatchEvent(new Event('ww-installable'));
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LangProvider>
      <BrowserRouter>
        <Header />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/report" element={<Report />} />
          <Route path="/track" element={<Track />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/officer" element={<RequireRole role="officer"><Officer /></RequireRole>} />
          <Route path="/worker" element={<RequireRole role="worker"><Worker /></RequireRole>} />
          <Route path="/admin" element={<RequireRole role="admin"><Admin /></RequireRole>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Footer />
      </BrowserRouter>
    </LangProvider>
  </React.StrictMode>
);
