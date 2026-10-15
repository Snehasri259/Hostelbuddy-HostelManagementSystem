import { Router } from 'express';
import { pool } from '../db.js';
import { asyncRoute, csvCell } from '../utils.js';
import { roles } from '../middleware/auth.js';
import { idParam } from '../services/students.js';
import { audit } from '../services/audit.js';

export const notificationsRouter = Router();
export const reportsRouter = Router();

notificationsRouter.get('/', asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT notification_id id, title, message, notification_type, is_read, email_status, created_at, read_at FROM notifications WHERE user_id=? ORDER BY created_at DESC, notification_id DESC LIMIT 200', [req.user.user_id]);
  res.json(rows);
}));
notificationsRouter.post('/read-all', asyncRoute(async (req, res) => {
  await pool.execute('UPDATE notifications SET is_read=TRUE, read_at=UTC_TIMESTAMP() WHERE user_id=? AND is_read=FALSE', [req.user.user_id]);
  res.json({ message: 'All notifications marked read.' });
}));
notificationsRouter.patch('/:id/read', asyncRoute(async (req, res) => {
  await pool.execute('UPDATE notifications SET is_read=TRUE, read_at=UTC_TIMESTAMP() WHERE notification_id=? AND user_id=?', [idParam(req), req.user.user_id]);
  res.json({ message: 'Notification marked read.' });
}));

reportsRouter.get('/allocations.csv', roles('ADMIN', 'WARDEN'), asyncRoute(async (req, res) => {
  const u = req.user;
  const [rows] = await pool.execute(
    `SELECT s.student_code, s.full_name, s.email, bl.block_code, ro.room_number, be.bed_number, al.allocation_start, al.allocation_end, al.allocation_status
       FROM allocations al JOIN students s ON s.student_id=al.student_id JOIN beds be ON be.bed_id=al.bed_id
       JOIN rooms ro ON ro.room_id=be.room_id JOIN blocks bl ON bl.block_id=ro.block_id
      ${u.role_code === 'WARDEN' ? 'WHERE bl.block_id=?' : ''} ORDER BY bl.block_code, ro.room_number, be.bed_number`,
    u.role_code === 'WARDEN' ? [u.block_id] : []);
  const head = 'student_code,full_name,email,block,room,bed,start,end,status';
  const lines = rows.map((r) => [r.student_code, r.full_name, r.email, r.block_code, r.room_number, r.bed_number, r.allocation_start, r.allocation_end, r.allocation_status].map(csvCell).join(','));
  await audit(req, 'REPORT_EXPORTED', 'report', 'allocations', { rows: rows.length });
  res.type('text/csv').attachment('hostelbuddy-allocations.csv').send('\uFEFF' + [head, ...lines].join('\r\n'));
}));
