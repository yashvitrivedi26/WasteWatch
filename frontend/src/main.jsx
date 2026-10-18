import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import NavBar from './components/NavBar.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Report from './pages/Report.jsx';
import Officer from './pages/Officer.jsx';
import Worker from './pages/Worker.jsx';
import { getSession } from './api.js';

function RequireRole({ role, children }) {
  const s = getSession();
  return s?.role === role ? children : <Navigate to={`/login?role=${role}`} replace />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/report" element={<Report />} />
        <Route path="/officer" element={<RequireRole role="officer"><Officer /></RequireRole>} />
        <Route path="/worker" element={<RequireRole role="worker"><Worker /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
