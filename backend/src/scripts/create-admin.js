// Creates (or re-provisions) an administrator with a random one-time password.
// Usage: npm run create-admin -- --email=you@college.edu --name="Full Name" [--staff-code=ADM-01] [--gender=FEMALE|MALE] [--phone=9000000000]
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { email as vEmail, str, oneOf, phone as vPhone } from '../utils.js';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const pw = (() => { for (;;) { const s = Array.from(crypto.randomBytes(16), (b) => ALPHA[b % ALPHA.length]).join(''); if (/[0-9]/.test(s) && /[A-Za-z]/.test(s)) return s; } })();

try {
  const email = vEmail(arg('email'), '--email');
  const name = str(arg('name'), '--name', { max: 120 });
  const staffCode = str(arg('staff-code') || `ADM-${Date.now().toString(36).toUpperCase()}`, '--staff-code', { max: 20 });
  const gender = oneOf(arg('gender'), ['FEMALE', 'MALE'], '--gender', { fallback: 'FEMALE' });
  const phone = vPhone(arg('phone'), '--phone', { required: false });
  const [[role]] = await pool.query("SELECT role_id FROM roles WHERE role_code='ADMIN'");
  if (!role) throw new Error('Run `npm run db:migrate` first.');
  const hash = await bcrypt.hash(pw, 12);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[ex]] = await conn.execute('SELECT admin_id FROM admins WHERE email=?', [email]);
    let adminId = ex?.admin_id;
    if (!adminId) {
      const [r] = await conn.execute('INSERT INTO admins(staff_code,full_name,gender,phone,email) VALUES(?,?,?,?,?)', [staffCode, name, gender, phone, email]);
      adminId = r.insertId;
    }
    await conn.execute(
      `INSERT INTO app_users(username,password_hash,role_id,admin_id,is_active,must_change_password,password_changed_at)
       VALUES(?,?,?,?,TRUE,TRUE,UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), must_change_password=TRUE, is_active=TRUE, password_changed_at=UTC_TIMESTAMP(), failed_login_count=0, locked_until=NULL`,
      [email, hash, role.role_id, adminId]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  console.log(`\nAdministrator ready.\n  email:    ${email}\n  password: ${pw}\n\nThis password is shown ONCE and must be changed at first sign-in.`);
} catch (e) {
  console.error('Could not create admin:', e.sqlMessage || e.message);
  process.exitCode = 1;
} finally { await pool.end(); }
