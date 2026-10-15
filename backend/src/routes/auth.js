import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { pool, withTransaction } from '../db.js';
import { HttpError, asyncRoute, badRequest, email as vEmail, validateNewPassword } from '../utils.js';
import { authenticate, clearSession, isUserUsable, loadUserByUsername, publicUser, setSession } from '../middleware/auth.js';
import { sendMail, mailEnabled } from '../mailer.js';
import { audit } from '../services/audit.js';

const router = Router();
const limiterOpts = { standardHeaders: 'draft-7', legacyHeaders: false };
const loginLimiter = rateLimit({ ...limiterOpts, windowMs: 15 * 60 * 1000, limit: 20, skipSuccessfulRequests: true, message: { message: 'Too many sign-in attempts. Please wait a few minutes and try again.' } });
const resetLimiter = rateLimit({ ...limiterOpts, windowMs: 60 * 60 * 1000, limit: 10, message: { message: 'Too many requests. Please try again later.' } });

// Compared against when the account does not exist, so response time does not reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('hostelbuddy-dummy-password', 12);
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

router.post('/login', loginLimiter, asyncRoute(async (req, res) => {
  const emailAddr = vEmail(req.body?.email, 'Email');
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password || password.length > 200) throw badRequest('Email and password are required.');
  const generic = new HttpError(401, 'Invalid email or password, or the account is temporarily locked.');

  const [[row]] = await pool.execute('SELECT user_id, password_hash, is_active, locked_until FROM app_users WHERE username=? LIMIT 1', [emailAddr]);
  const locked = row?.locked_until && new Date(row.locked_until) > new Date();
  const ok = await bcrypt.compare(password, row?.password_hash || DUMMY_HASH);
  if (!row || !row.password_hash || !ok || locked || !row.is_active) {
    if (row && !locked) {
      await pool.execute(
        `UPDATE app_users SET failed_login_count=failed_login_count+1,
           locked_until=IF(failed_login_count>=${MAX_FAILS},DATE_ADD(UTC_TIMESTAMP(),INTERVAL ${LOCK_MINUTES} MINUTE),locked_until),
           failed_login_count=IF(failed_login_count>=${MAX_FAILS},0,failed_login_count)
         WHERE user_id=?`, [row.user_id]);
    }
    await audit({ ip: req.ip }, 'LOGIN_FAILED', 'user', row?.user_id ?? null);
    throw generic;
  }
  const user = await loadUserByUsername(emailAddr);
  if (!isUserUsable(user)) throw generic;
  await pool.execute('UPDATE app_users SET failed_login_count=0, locked_until=NULL, last_login_at=UTC_TIMESTAMP() WHERE user_id=?', [user.user_id]);
  setSession(res, user.user_id);
  await audit({ ip: req.ip, user }, 'LOGIN', 'user', user.user_id);
  res.json({ user: publicUser(user) });
}));

router.post('/logout', (req, res) => { clearSession(res); res.json({ message: 'Signed out.' }); });

router.get('/me', authenticate({ allowPasswordChange: true }), (req, res) => res.json({ user: publicUser(req.user) }));

router.get('/profile', authenticate({ allowPasswordChange: true }), asyncRoute(async (req, res) => {
  const u = req.user;
  let profile = {};
  if (u.role_code === 'STUDENT') {
    const [[s]] = await pool.execute('SELECT student_code, full_name, gender, btech_year, department, email, phone, status FROM students WHERE student_id=?', [u.student_id]);
    const [[a]] = await pool.execute(
      `SELECT bl.block_code, bl.block_name, ro.room_number, ro.floor_number, be.bed_number, al.allocation_start
         FROM allocations al JOIN beds be ON be.bed_id=al.bed_id JOIN rooms ro ON ro.room_id=be.room_id JOIN blocks bl ON bl.block_id=ro.block_id
        WHERE al.student_id=? AND al.allocation_status='ACTIVE' LIMIT 1`, [u.student_id]);
    profile = { ...s, allocation: a || null };
  } else if (u.role_code === 'WARDEN') {
    const [[w]] = await pool.execute(
      'SELECT w.staff_code, w.full_name, w.gender, w.phone, w.email, bl.block_code, bl.block_name FROM wardens w JOIN blocks bl ON bl.block_id=w.block_id WHERE w.warden_id=?', [u.warden_id]);
    profile = w || {};
  } else {
    const [[a]] = await pool.execute('SELECT staff_code, full_name, gender, phone, email FROM admins WHERE admin_id=?', [u.admin_id]);
    profile = a || {};
  }
  const [[meta]] = await pool.execute('SELECT last_login_at, created_at FROM app_users WHERE user_id=?', [u.user_id]);
  res.json({ role: u.role_code, profile, last_login_at: meta?.last_login_at ?? null, account_created_at: meta?.created_at ?? null });
}));

router.post('/change-password', authenticate({ allowPasswordChange: true }), asyncRoute(async (req, res) => {
  const current = String(req.body?.currentPassword ?? '');
  const next = validateNewPassword(req.body?.newPassword, { forbid: [req.user.email?.split('@')[0], req.user.student_code, req.user.full_name] });
  const [[u]] = await pool.execute('SELECT password_hash FROM app_users WHERE user_id=?', [req.user.user_id]);
  if (!u?.password_hash || !(await bcrypt.compare(current, u.password_hash))) throw badRequest('Current password does not match.');
  if (current === next) throw badRequest('Choose a password different from your current one.');
  await pool.execute('UPDATE app_users SET password_hash=?, must_change_password=FALSE, password_changed_at=UTC_TIMESTAMP() WHERE user_id=?', [await bcrypt.hash(next, 12), req.user.user_id]);
  // Everything issued before this moment is now invalid; give THIS browser a fresh session.
  setSession(res, req.user.user_id);
  await audit(req, 'PASSWORD_CHANGED', 'user', req.user.user_id);
  res.json({ message: 'Password changed successfully.' });
}));

router.post('/forgot-password', resetLimiter, asyncRoute(async (req, res) => {
  const addr = vEmail(req.body?.email, 'Email');
  // Respond immediately and identically for known/unknown accounts; do the work afterwards.
  res.json({ message: 'If that account exists, password reset instructions will be sent.' });
  try {
    const [[u]] = await pool.execute('SELECT user_id FROM app_users WHERE username=? AND is_active=TRUE', [addr]);
    if (!u) return;
    const token = crypto.randomBytes(32).toString('hex');
    await withTransaction(async (conn) => {
      await conn.execute("UPDATE auth_tokens SET used_at=UTC_TIMESTAMP() WHERE user_id=? AND token_type='RESET_PASSWORD' AND used_at IS NULL", [u.user_id]);
      await conn.execute("INSERT INTO auth_tokens(user_id,token_hash,token_type,expires_at) VALUES(?,?,'RESET_PASSWORD',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))", [u.user_id, sha256(token)]);
    });
    const link = `${config.appUrl}/#reset=${token}`; // fragment: never sent to servers or leaked via Referer
    if (mailEnabled()) {
      await sendMail({ to: addr, subject: 'HostelBuddy password reset', text: `Open this link to choose a new password (valid for 30 minutes):\n\n${link}\n\nIf you did not request this, you can ignore this email.` });
    } else if (!config.isProd) {
      console.info('[dev] password reset link:', link);
    }
  } catch (e) { console.error('[forgot-password]', e.message); }
}));

router.post('/reset-password', resetLimiter, asyncRoute(async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  if (!/^[a-f0-9]{64}$/.test(token)) throw badRequest('Reset link is invalid or expired.');
  const password = req.body?.newPassword;
  await withTransaction(async (conn) => {
    const [[t]] = await conn.execute(
      `SELECT t.token_id, t.user_id, COALESCE(s.email,w.email,a.email,u.username) AS email, s.student_code
         FROM auth_tokens t JOIN app_users u ON u.user_id=t.user_id
         LEFT JOIN students s ON s.student_id=u.student_id LEFT JOIN wardens w ON w.warden_id=u.warden_id LEFT JOIN admins a ON a.admin_id=u.admin_id
        WHERE t.token_hash=? AND t.token_type IN ('RESET_PASSWORD','SET_PASSWORD') AND t.used_at IS NULL AND t.expires_at>UTC_TIMESTAMP() AND u.is_active=TRUE
        FOR UPDATE`, [sha256(token)]);
    if (!t) throw badRequest('Reset link is invalid or expired.');
    validateNewPassword(password, { forbid: [t.email?.split('@')[0], t.student_code] }); // throws -> rollback -> token stays valid
    await conn.execute('UPDATE app_users SET password_hash=?, must_change_password=FALSE, password_changed_at=UTC_TIMESTAMP(), failed_login_count=0, locked_until=NULL WHERE user_id=?', [await bcrypt.hash(password, 12), t.user_id]);
    await conn.execute('UPDATE auth_tokens SET used_at=UTC_TIMESTAMP() WHERE user_id=? AND used_at IS NULL', [t.user_id]);
    await audit({ ip: req.ip }, 'PASSWORD_RESET', 'user', t.user_id);
  });
  res.json({ message: 'Password updated. You can now sign in.' });
}));

export default router;
