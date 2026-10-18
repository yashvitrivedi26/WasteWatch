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
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.detail || data?.non_field_errors?.[0] || (data && Object.values(data).flat()[0]) || `Error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}
