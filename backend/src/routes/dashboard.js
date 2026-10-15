import { Router } from 'express';
import { pool } from '../db.js';
import { asyncRoute } from '../utils.js';
import { scope } from '../middleware/auth.js';

const router = Router();

export const NOTICE_VISIBLE_SQL = `n.is_active=TRUE AND n.publish_at<=UTC_TIMESTAMP() AND (n.expires_at IS NULL OR n.expires_at>UTC_TIMESTAMP())`;
export function noticeAudience(u) {
  if (u.role_code === 'ADMIN') return { sql: '1=1', params: [] };
  return { sql: "(n.audience='ALL' OR n.block_id=?)", params: [u.home_block_id] };
}

router.get('/', asyncRoute(async (req, res) => {
  const u = req.user;
  const isStaff = u.role_code !== 'STUDENT';
  const cScope = scope(u, { student: 'student_id', block: 'block_id' });
  const count = async (table, extra = '') => {
    const [[r]] = await pool.execute(`SELECT COUNT(*) pending FROM ${table} WHERE ${extra} AND ${cScope.sql}`, cScope.params);
    return Number(r.pending);
  };

  const [[complaints]] = await pool.execute(
    `SELECT COUNT(*) total, COALESCE(SUM(status IN ('OPEN','IN_PROGRESS')),0) pending FROM complaints WHERE ${cScope.sql}`, cScope.params);

  let students = null; let rooms = null; let myAllocation = null;
  if (isStaff) {
    const blockCond = u.role_code === 'WARDEN' ? 'ro.block_id=?' : '1=1';
    const bp = u.role_code === 'WARDEN' ? [u.block_id] : [];
    const [[st]] = await pool.execute(
      `SELECT COUNT(DISTINCT al.student_id) total FROM allocations al JOIN beds be ON be.bed_id=al.bed_id JOIN rooms ro ON ro.room_id=be.room_id
        WHERE al.allocation_status='ACTIVE' AND ${blockCond}`, bp);
    students = Number(st.total);
    const [[rm]] = await pool.execute(
      `SELECT COUNT(DISTINCT ro.room_id) total, COUNT(be.bed_id) beds, COUNT(al.allocation_id) occupied
         FROM rooms ro JOIN beds be ON be.room_id=ro.room_id
         LEFT JOIN allocations al ON al.bed_id=be.bed_id AND al.allocation_status='ACTIVE'
        WHERE ${blockCond}`, bp);
    rooms = { total: Number(rm.total), beds: Number(rm.beds), occupied: Number(rm.occupied) };
  } else {
    const [[a]] = await pool.execute(
      `SELECT bl.block_code, ro.room_number, ro.floor_number, be.bed_number, al.allocation_start
         FROM allocations al JOIN beds be ON be.bed_id=al.bed_id JOIN rooms ro ON ro.room_id=be.room_id JOIN blocks bl ON bl.block_id=ro.block_id
        WHERE al.student_id=? AND al.allocation_status='ACTIVE' LIMIT 1`, [u.student_id]);
    myAllocation = a || null;
  }

  const na = noticeAudience(u);
  const [notices] = await pool.execute(
    `SELECT n.notice_id id, n.title, n.body, n.audience, n.created_at, b.block_code
       FROM notices n LEFT JOIN blocks b ON b.block_id=n.block_id
      WHERE ${NOTICE_VISIBLE_SQL} AND ${na.sql} ORDER BY n.created_at DESC LIMIT 5`, na.params);
  const [[un]] = await pool.execute('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND is_read=FALSE', [u.user_id]);

  res.json({
    role: u.role_code,
    students, rooms, myAllocation, notices,
    complaints: { total: Number(complaints.total), pending: Number(complaints.pending) },
    visitorsPending: await count('visitor_requests', "status='PENDING'"),
    outpassesPending: await count('outpasses', "status='PENDING'"),
    unreadNotifications: Number(un.c),
  });
}));

export default router;
