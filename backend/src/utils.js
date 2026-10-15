// Dependency-free helpers (unit-tested in test/utils.test.js).

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}
export const badRequest = (m) => new HttpError(400, m);
export const forbidden = (m = 'You do not have permission for this action.') => new HttpError(403, m);
export const notFound = (m = 'Not found.') => new HttpError(404, m);
export const conflict = (m) => new HttpError(409, m);

export const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Validate a trimmed string. Throws a 400 with a friendly message. */
export function str(value, label, { min = 1, max = 255, required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${label} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw badRequest(`${label} must be text.`);
  const v = value.trim();
  if (!v) {
    if (required) throw badRequest(`${label} is required.`);
    return null;
  }
  if (v.length < min) throw badRequest(`${label} must be at least ${min} characters.`);
  if (v.length > max) throw badRequest(`${label} must be at most ${max} characters.`);
  // strip control characters (keep \n and \t for multi-line text)
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export function int(value, label, { min = -Infinity, max = Infinity, required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${label} is required.`);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${label} must be a whole number${Number.isFinite(min) && Number.isFinite(max) ? ` between ${min} and ${max}` : ''}.`);
  return n;
}

export function oneOf(value, allowed, label, { fallback } = {}) {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  const v = String(value ?? '').toUpperCase();
  if (!allowed.includes(v)) throw badRequest(`${label} must be one of: ${allowed.join(', ')}.`);
  return v;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function email(value, label = 'Email', { required = true } = {}) {
  const v = str(value, label, { max: 160, required });
  if (v === null) return null;
  const e = v.toLowerCase();
  if (!EMAIL_RE.test(e)) throw badRequest(`${label} is not a valid email address.`);
  return e;
}

const PHONE_RE = /^\+?[0-9][0-9\s\-()]{6,18}$/;
export function phone(value, label = 'Phone', { required = true } = {}) {
  const v = str(value, label, { max: 20, required });
  if (v === null) return null;
  if (!PHONE_RE.test(v)) throw badRequest(`${label} is not a valid phone number.`);
  return v;
}

/** Accepts ISO strings / datetime-local values. Returns a Date or throws. */
export function dateTime(value, label, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${label} is required.`);
    return null;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest(`${label} is not a valid date and time.`);
  const y = d.getUTCFullYear();
  if (y < 2000 || y > 2100) throw badRequest(`${label} is out of range.`);
  return d;
}

/** Date -> 'YYYY-MM-DD HH:MM:SS' (UTC) for MySQL DATETIME. */
export function toSql(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Escape LIKE wildcards so user input is matched literally. */
export function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, (m) => '\\' + m);
}

/** CSV cell with quote-escaping AND spreadsheet formula-injection protection. */
export function csvCell(v) {
  let s = v instanceof Date ? v.toISOString() : String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}

/** Password policy: 10-72 chars (bcrypt ignores bytes past 72), at least one letter and one digit. */
export function validateNewPassword(pw, { forbid = [] } = {}) {
  if (typeof pw !== 'string') throw badRequest('Password is required.');
  if (pw.length < 10) throw badRequest('Use at least 10 characters for the new password.');
  if (Buffer.byteLength(pw, 'utf8') > 72) throw badRequest('Password must be at most 72 bytes long.');
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) throw badRequest('Password must contain at least one letter and one number.');
  const lower = pw.toLowerCase();
  for (const f of forbid) {
    if (f && f.length >= 4 && lower.includes(String(f).toLowerCase())) throw badRequest('Password must not contain your name, email or student ID.');
  }
  return pw;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || k in out) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed */ }
  }
  return out;
}
