const BASE = import.meta.env.VITE_API_URL || '';

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem('ww_session')) || null;
  } catch {
    return null;
  }
}

export function setSession(s) {
  if (s) localStorage.setItem('ww_session', JSON.stringify(s));
  else localStorage.removeItem('ww_session');
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const session = getSession();
  if (session?.token) headers.Authorization = `Token ${session.token}`;
  let payload;
  if (form) payload = form; // FormData: browser sets multipart headers
  else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  } catch {
    throw Object.assign(new Error('Cannot reach the server. Check that the backend is running.'), { code: 'network' });
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401 && session) {
    // token no longer valid (e.g. account reset by the administrator)
    setSession(null);
    window.location.href = '/login';
  }
  if (!res.ok) {
    const msg = data?.detail || data?.non_field_errors?.[0] || (data && Object.entries(data).map(([k, v]) => `${k}: ${[].concat(v).join(' ')}`)[0]) || `Error ${res.status}`;
    throw Object.assign(new Error(msg), { code: data?.code, status: res.status });
  }
  return data;
}

export async function download(path, filename) {
  const s = getSession();
  const res = await fetch(`${BASE}${path}`, { headers: s?.token ? { Authorization: `Token ${s.token}` } : {} });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
