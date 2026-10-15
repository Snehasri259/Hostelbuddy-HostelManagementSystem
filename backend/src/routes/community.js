import { Router } from 'express';
import { pool } from '../db.js';
import { asyncRoute, badRequest, forbidden, int, notFound, oneOf, str } from '../utils.js';
import { roles, scope } from '../middleware/auth.js';
import { assertBlockAccess, idParam, resolveTargetStudent } from '../services/students.js';
import { audit } from '../services/audit.js';
import { allActiveUserIds, blockUserIds, notifyUsers, userIdForStudent } from '../services/notify.js';
import { NOTICE_VISIBLE_SQL, noticeAudience } from './dashboard.js';

export const complaintsRouter = Router();
export const noticesRouter = Router();

const CATEGORIES = ['MAINTENANCE', 'CLEANLINESS', 'ELECTRICAL', 'WATER', 'INTERNET', 'SAFETY', 'OTHER'];

// ---------------- Complaints ----------------
complaintsRouter.get('/', asyncRoute(async (req, res) => {
  const sc = scope(req.user, { student: 'c.student_id', block: 'c.block_id' });
  const [rows] = await pool.execute(
    `SELECT c.complaint_id id, c.subject, c.description, c.category, c.priority, c.status, c.response, c.created_at, c.updated_at,
            s.full_name student_name, s.student_code, bl.block_code
       FROM complaints c JOIN students s ON s.student_id=c.student_id JOIN blocks bl ON bl.block_id=c.block_id
      WHERE ${sc.sql} ORDER BY c.created_at DESC, c.complaint_id DESC LIMIT 1000`, sc.params);
  res.json(rows);
}));

complaintsRouter.post('/', asyncRoute(async (req, res) => {
  const b = req.body || {};
  const subject = str(b.subject, 'Subject', { max: 180 });
  const description = str(b.description, 'Description', { max: 4000 });
  const category = oneOf(b.category, CATEGORIES, 'Category', { fallback: 'OTHER' });
  const priority = oneOf(b.priority, ['LOW', 'MEDIUM', 'HIGH'], 'Priority', { fallback: 'MEDIUM' });
  const s = await resolveTargetStudent(req, { requireAllocation: true });
  const [r] = await pool.execute('INSERT INTO complaints(student_id,block_id,subject,description,category,priority) VALUES(?,?,?,?,?,?)', [s.student_id, s.block_id, subject, description, category, priority]);
  await audit(req, 'COMPLAINT_CREATED', 'complaint', r.insertId);
  res.status(201).json({ id: r.insertId, message: 'Complaint submitted.' });
}));

complaintsRouter.patch('/:id', roles('ADMIN', 'WARDEN'), asyncRoute(async (req, res) => {
  const id = idParam(req);
  const status = oneOf(req.body?.status, ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'], 'Status');
  const response = str(req.body?.response, 'Response', { max: 2000, required: false });
  const [[c]] = await pool.execute('SELECT block_id, student_id FROM complaints WHERE complaint_id=?', [id]);
  if (!c) throw notFound('Complaint not found.');
  assertBlockAccess(req.user, c.block_id);
  await pool.execute('UPDATE complaints SET status=?, response=COALESCE(?,response), responded_by_user_id=? WHERE complaint_id=?', [status, response, req.user.user_id, id]);
  await audit(req, 'COMPLAINT_UPDATED', 'complaint', id, { status });
  await notifyUsers(await userIdForStudent(c.student_id), { title: 'Complaint updated', message: `Your complaint status is now ${status.replaceAll('_', ' ').toLowerCase()}.`, type: 'COMPLAINT', entityType: 'complaint', entityId: id });
  res.json({ message: 'Complaint updated.' });
}));

// ---------------- Notices ----------------
noticesRouter.get('/', asyncRoute(async (req, res) => {
  const na = noticeAudience(req.user);
  const [rows] = await pool.execute(
    `SELECT n.notice_id id, n.title, n.body, n.audience, n.block_id, n.created_at, bl.block_code,
            COALESCE(a.full_name, w.full_name) author_name
       FROM notices n LEFT JOIN blocks bl ON bl.block_id=n.block_id
       LEFT JOIN app_users u ON u.user_id=n.created_by_user_id
       LEFT JOIN admins a ON a.admin_id=u.admin_id LEFT JOIN wardens w ON w.warden_id=u.warden_id
      WHERE ${NOTICE_VISIBLE_SQL} AND ${na.sql} ORDER BY n.created_at DESC, n.notice_id DESC LIMIT 200`, na.params);
  res.json(rows);
}));

noticesRouter.post('/', roles('ADMIN', 'WARDEN'), asyncRoute(async (req, res) => {
  const b = req.body || {};
  const u = req.user;
  const title = str(b.title, 'Title', { max: 180 });
  const body = str(b.body, 'Message', { max: 4000 });
  // Wardens can only ever address their own block; admins choose all-hostel or a specific block.
  const audience = u.role_code === 'WARDEN' ? 'BLOCK' : oneOf(b.audience, ['ALL', 'BLOCK'], 'Audience', { fallback: 'ALL' });
  let blockId = null;
  if (audience === 'BLOCK') {
    blockId = u.role_code === 'WARDEN' ? u.block_id : int(b.block_id, 'Block', { min: 1 });
    const [[blk]] = await pool.execute('SELECT block_id FROM blocks WHERE block_id=?', [blockId]);
    if (!blk) throw badRequest('Selected block does not exist.');
  }
  const [r] = await pool.execute('INSERT INTO notices(title,body,audience,block_id,created_by_user_id) VALUES(?,?,?,?,?)', [title, body, audience, blockId, u.user_id]);
  const recipients = blockId ? await blockUserIds(blockId) : await allActiveUserIds();
  await notifyUsers(recipients.filter((id) => id !== u.user_id), { title, message: body.slice(0, 500), type: 'NOTICE', entityType: 'notice', entityId: r.insertId });
  await audit(req, 'NOTICE_PUBLISHED', 'notice', r.insertId, { audience, blockId });
  res.status(201).json({ id: r.insertId, message: 'Notice published.' });
}));

noticesRouter.delete('/:id', roles('ADMIN', 'WARDEN'), asyncRoute(async (req, res) => {
  const id = idParam(req);
  const [[n]] = await pool.execute('SELECT block_id, audience FROM notices WHERE notice_id=? AND is_active=TRUE', [id]);
  if (!n) throw notFound('Notice not found.');
  if (req.user.role_code === 'WARDEN' && (n.audience !== 'BLOCK' || Number(n.block_id) !== Number(req.user.block_id))) throw forbidden('You can only remove notices for your own block.');
  await pool.execute('UPDATE notices SET is_active=FALSE WHERE notice_id=?', [id]);
  await audit(req, 'NOTICE_REMOVED', 'notice', id);
  res.json({ message: 'Notice removed.' });
}));
