import { pool } from '../db.js';
import { forbidden, int, notFound } from '../utils.js';

/** Student plus the block they currently live in (null when not allocated). */
export async function studentContext(studentId, conn = pool) {
  const [[s]] = await conn.execute(
    `SELECT s.student_id, s.full_name, s.gender, s.btech_year, s.status, ro.block_id
       FROM students s
       LEFT JOIN allocations al ON al.student_id=s.student_id AND al.allocation_status='ACTIVE'
       LEFT JOIN beds be ON be.bed_id=al.bed_id
       LEFT JOIN rooms ro ON ro.room_id=be.room_id
      WHERE s.student_id=?`, [studentId]);
  return s || null;
}

/**
 * Resolve which student a request acts on and enforce ownership.
 * Students always act on themselves (any student_id in the body is ignored); staff must name one,
 * and wardens only for students currently housed in their block.
 */
export async function resolveTargetStudent(req, { requireAllocation = false } = {}) {
  const u = req.user;
  const sid = u.role_code === 'STUDENT' ? u.student_id : int(req.body?.student_id, 'Student', { min: 1 });
  const s = await studentContext(sid);
  if (!s) throw notFound('Student not found.');
  if (s.status !== 'ACTIVE') throw forbidden('This student record is not active.');
  if (u.role_code === 'WARDEN' && Number(s.block_id) !== Number(u.block_id)) throw forbidden('Outside your assigned block.');
  if (requireAllocation && !s.block_id) throw Object.assign(new Error('Student must have an active room allocation first.'), { status: 400, expose: true });
  return s;
}

/** :id route parameter -> positive integer or 400. */
export function idParam(req, name = 'id') {
  return int(req.params[name], 'ID', { min: 1 });
}

/** Same rule for staff acting on a record that carries block_id. */
export function assertBlockAccess(user, blockId) {
  if (user.role_code === 'WARDEN' && Number(blockId) !== Number(user.block_id)) throw forbidden('Outside your assigned block.');
}
