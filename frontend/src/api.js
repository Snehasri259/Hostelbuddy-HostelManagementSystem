const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

/** Thin fetch wrapper: cookie session, CSRF header, JSON, timeout and uniform errors. */
export async function api(path, { method = 'GET', body, raw = false } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      signal: ctrl.signal,
      headers: { 'X-HB-CSRF': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? 'The server took too long to respond.' : 'Cannot reach the server. Check your connection.', 0);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let b = {};
    try { b = await res.json(); } catch { /* non-JSON error */ }
    if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/me')) onUnauthorized();
    throw new ApiError(b.message || `Request failed (${res.status})`, res.status, b.code);
  }
  if (raw) return res;
  return res.status === 204 ? null : res.json();
}
