import { Router } from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { pool, withTransaction } from '../db.js';
import { asyncRoute, badRequest, email as vEmail, escapeLike, int, notFound, oneOf, phone as vPhone, str } from '../utils.js';
import { roles } from '../middleware/auth.js';
import { idParam } from '../services/students.js';
import { audit } from '../services/audit.js';
import { mailEnabled, sendMail } from '../mailer.js';

const router = Router();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

router.get('/', asyncRoute(async (req, res) => {
  const u = req.user;
  const where = ['1=1']; const p = [];
  if (u.role_code === 'STUDENT') { where.push('s.student_id=?'); p.push(u.student_id); }
  if (u.role_code === 'WARDEN') { where.push('bl.block_id=?'); p.push(u.block_id); }
  if (req.query.q) {
    const like = `%${escapeLike(String(req.query.q).slice(0, 80))}%`;
    where.push('(s.full_name LIKE ? OR s.student_code LIKE ? OR s.email LIKE ?)');
    p.push(like, like, like);
  }
  const [rows] = await pool.execute(
    `SELECT s.student_id id, s.student_code, s.full_name name, s.gender, s.btech_year year_of_study, s.department course,
            s.email, s.phone, s.status, bl.block_code block_name, ro.room_number, be.bed_number
       FROM students s
       LEFT JOIN allocations al ON al.student_id=s.student_id AND al.allocation_status='ACTIVE'
       LEFT JOIN beds be ON be.bed_id=al.bed_id LEFT JOIN rooms ro ON ro.room_id=be.room_id LEFT JOIN blocks bl ON bl.block_id=ro.block_id
      WHERE ${where.join(' AND ')} ORDER BY s.full_name LIMIT 1000`, p);
  res.json(rows);
}));

router.post('/', roles('ADMIN', 'WARDEN'), asyncRoute(async (req, res) => {
  const b = req.body || {};
  const rec = {
    code: str(b.student_code, 'Student ID', { max: 24 }),
    name: str(b.full_name, 'Full name', { max: 120 }),
    gender: oneOf(b.gender, ['GIRL', 'BOY'], 'Gender'),
    year: int(b.btech_year, 'B.Tech year', { min: 1, max: 4 }),
    dept: str(b.department, 'Department', { max: 20 }),
    email: vEmail(b.email, 'Email'),
    phone: vPhone(b.phone, 'Phone', { required: false }),
  };
  const token = crypto.randomBytes(32).toString('hex');
  const created = await withTransaction(async (conn) => {
    const [r] = await conn.execute('INSERT INTO students(student_code,full_name,gender,btech_year,department,email,phone) VALUES(?,?,?,?,?,?,?)',
      [rec.code, rec.name, rec.gender, rec.year, rec.dept, rec.email, rec.phone]);
    const [[role]] = await conn.execute("SELECT role_id FROM roles WHERE role_code='STUDENT'");
    const [ur] = await conn.execute('INSERT INTO app_users(username,password_hash,role_id,student_id,must_change_password) VALUES(?,NULL,?,?,TRUE)', [rec.email, role.role_id, r.insertId]);
    await conn.execute("INSERT INTO auth_tokens(user_id,token_hash,token_type,expires_at) VALUES(?,?,'SET_PASSWORD',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 72 HOUR))", [ur.insertId, sha256(token)]);
    return r.insertId;
  });
  const link = `${config.appUrl}/#reset=${token}`;
  let invite = 'NOT_SENT';
  if (mailEnabled()) {
    invite = (await sendMail({ to: rec.email, subject: 'Your HostelBuddy account', text: `Hello ${rec.name},\n\nYour hostel account is ready. Set your password here (valid for 72 hours):\n\n${link}\n` })) === 'SENT' ? 'EMAILED' : 'EMAIL_FAILED';
  }
  await audit(req, 'STUDENT_CREATED', 'student', created, { student_code: rec.code });
  res.status(201).json({
    id: created,
    message: invite === 'EMAILED' ? 'Student created and a set-password link was e-mailed.' : 'Student created. Share the one-time set-password link below with the student.',
    // Only returned when e-mail is not configured/failed, and only to the signed-in staff member who created the record.
    inviteLink: invite === 'EMAILED' ? undefined : link,
  });
}));

router.patch('/:id', roles('ADMIN'), asyncRoute(async (req, res) => {
  const id = idParam(req);
  const b = req.body || {};
  const sets = []; const p = [];
  if (b.full_name !== undefined) { sets.push('full_name=?'); p.push(str(b.full_name, 'Full name', { max: 120 })); }
  if (b.phone !== undefined) { sets.push('phone=?'); p.push(vPhone(b.phone, 'Phone', { required: false })); }
  if (b.department !== undefined) { sets.push('department=?'); p.push(str(b.department, 'Department', { max: 20 })); }
  if (b.btech_year !== undefined) { sets.push('btech_year=?'); p.push(int(b.btech_year, 'B.Tech year', { min: 1, max: 4 })); }
  const newStatus = b.status !== undefined ? oneOf(b.status, ['ACTIVE', 'INACTIVE', 'GRADUATED'], 'Status') : null;
  if (newStatus) { sets.push('status=?'); p.push(newStatus); }
  if (!sets.length) throw badRequest('Nothing to update.');
  await withTransaction(async (conn) => {
    const [r] = await conn.execute(`UPDATE students SET ${sets.join(',')} WHERE student_id=?`, [...p, id]);
    if (!r.affectedRows) throw notFound('Student not found.');
    if (newStatus && newStatus !== 'ACTIVE') {
      await conn.execute("UPDATE allocations SET allocation_status='ENDED', allocation_end=CURDATE() WHERE student_id=? AND allocation_status='ACTIVE'", [id]);
      await conn.execute('UPDATE app_users SET is_active=FALSE WHERE student_id=?', [id]);
    } else if (newStatus === 'ACTIVE') {
      await conn.execute('UPDATE app_users SET is_active=TRUE WHERE student_id=?', [id]);
    }
  });
  await audit(req, 'STUDENT_UPDATED', 'student', id, { fields: Object.keys(b) });
  res.json({ message: 'Student updated.' });
}));

export default router;
