import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db.js';
import { HttpError, asyncRoute, parseCookies } from '../utils.js';

const USER_SQL = `
  SELECT u.user_id, u.username, u.role_id, u.student_id, u.warden_id, u.admin_id, u.is_active,
         u.must_change_password, u.password_changed_at, r.role_code,
         COALESCE(s.full_name, w.full_name, a.full_name) AS full_name,
         COALESCE(s.email, w.email, a.email, u.username) AS email,
         COALESCE(s.status, w.employment_status, a.status) AS profile_status,
         s.student_code,
         w.block_id AS block_id, wb.block_code AS block_code,
         (SELECT ro.block_id FROM allocations al JOIN beds be ON be.bed_id=al.bed_id JOIN rooms ro ON ro.room_id=be.room_id
           WHERE al.student_id=u.student_id AND al.allocation_status='ACTIVE' LIMIT 1) AS student_block_id
    FROM app_users u
    JOIN roles r ON r.role_id=u.role_id
    LEFT JOIN students s ON s.student_id=u.student_id
    LEFT JOIN wardens w ON w.warden_id=u.warden_id
    LEFT JOIN blocks wb ON wb.block_id=w.block_id
    LEFT JOIN admins a ON a.admin_id=u.admin_id`;

export const loadUserById = async (id) => {
  const [rows] = await pool.execute(`${USER_SQL} WHERE u.user_id=? LIMIT 1`, [id]);
  return rows[0] || null;
};
export const loadUserByUsername = async (username) => {
  const [rows] = await pool.execute(`${USER_SQL} WHERE u.username=? LIMIT 1`, [username]);
  return rows[0] || null;
};

/** Fields safe to send to the browser. */
export const publicUser = (u) => ({
  user_id: u.user_id,
  full_name: u.full_name,
  email: u.email,
  role_code: u.role_code,
  student_id: u.student_id,
  student_code: u.student_code ?? null,
  block_id: u.block_id ?? null,
  block_code: u.block_code ?? null,
  must_change_password: Boolean(u.must_change_password),
});

export function setSession(res, userId) {
  const token = jwt.sign({ uid: userId }, config.jwtSecret, { algorithm: 'HS256', expiresIn: `${config.sessionHours}h` });
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
    maxAge: config.sessionHours * 3600 * 1000,
  });
}
export function clearSession(res) {
  res.clearCookie(config.cookieName, { httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite, path: '/' });
}

export const isUserUsable = (u) => Boolean(u && u.is_active && u.profile_status === 'ACTIVE');

export const authenticate = ({ allowPasswordChange = false } = {}) => asyncRoute(async (req, res, next) => {
  const token = parseCookies(req.headers.cookie)[config.cookieName];
  if (!token) throw new HttpError(401, 'Sign in to continue.');
  let payload;
  try { payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }); } catch { throw new HttpError(401, 'Session expired. Please sign in again.'); }
  const u = await loadUserById(payload.uid);
  if (!isUserUsable(u)) throw new HttpError(401, 'This account is inactive.');
  // A password change/reset invalidates every session issued before it.
  if (u.password_changed_at && Math.floor(new Date(u.password_changed_at).getTime() / 1000) > payload.iat) {
    throw new HttpError(401, 'Session expired. Please sign in again.');
  }
  if (u.must_change_password && !allowPasswordChange) {
    throw new HttpError(403, 'Please set a new password to continue.', 'PASSWORD_CHANGE_REQUIRED');
  }
  u.home_block_id = u.block_id ?? u.student_block_id ?? null;
  req.user = u;
  next();
});

export const roles = (...allowed) => (req, res, next) =>
  allowed.includes(req.user.role_code) ? next() : next(new HttpError(403, 'You do not have permission for this action.'));

/**
 * Row-level scope: ADMIN sees everything, WARDEN only their block, STUDENT only their own rows.
 * Returns { sql, params } to AND into a WHERE clause. Column names are trusted constants (never user input).
 */
export function scope(u, { student = 'student_id', block = 'block_id' } = {}) {
  if (u.role_code === 'ADMIN') return { sql: '1=1', params: [] };
  if (u.role_code === 'WARDEN') return { sql: `${block}=?`, params: [u.block_id] };
  return { sql: `${student}=?`, params: [u.student_id] };
}
