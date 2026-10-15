import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { HttpError, asyncRoute, conflict, forbidden, int, notFound, str, badRequest } from '../utils.js';
import { roles, scope } from '../middleware/auth.js';
import { assertBlockAccess, idParam, studentContext } from '../services/students.js';
import { audit } from '../services/audit.js';
import { notifyUsers, userIdForStudent } from '../services/notify.js';

export const blocksRouter = Router();
export const roomsRouter = Router();
export const bedsRouter = Router();
export const allocationsRouter = Router();

blocksRouter.get('/', asyncRoute(async (req, res) => {
  const [rows] = await pool.query('SELECT block_id,block_code,block_name,gender,academic_year,min_year,max_year FROM blocks ORDER BY block_code');
  res.json(rows);
}));

// ---- Rooms (staff only; students never need the building inventory or other residents) ----
roomsRouter.use(roles('ADMIN', 'WARDEN'));

roomsRouter.get('/', asyncRoute(async (req, res) => {
  const u = req.user;
  const [rows] = await pool.execute(
    `SELECT ro.room_id id, ro.room_number, ro.floor_number, ro.capacity, ro.status, bl.block_id, bl.block_code block_name,
            COUNT(be.bed_id) beds, COUNT(al.allocation_id) occupied
       FROM rooms ro JOIN blocks bl ON bl.block_id=ro.block_id
       LEFT JOIN beds be ON be.room_id=ro.room_id
       LEFT JOIN allocations al ON al.bed_id=be.bed_id AND al.allocation_status='ACTIVE'
      ${u.role_code === 'WARDEN' ? 'WHERE bl.block_id=?' : ''}
      GROUP BY ro.room_id, bl.block_id, bl.block_code ORDER BY bl.block_code, ro.room_number`,
    u.role_code === 'WARDEN' ? [u.block_id] : []);
  res.json(rows);
}));

roomsRouter.post('/', asyncRoute(async (req, res) => {
  const b = req.body || {};
  const blockId = int(b.block_id, 'Block', { min: 1 });
  const roomNumber = str(b.room_number, 'Room number', { max: 12 });
  const floor = int(b.floor_number ?? 0, 'Floor number', { min: 0, max: 50 });
  const capacity = int(b.capacity ?? 4, 'Capacity', { min: 1, max: 24 });
  assertBlockAccess(req.user, blockId);
  const id = await withTransaction(async (conn) => {
    const [r] = await conn.execute('INSERT INTO rooms(block_id,room_number,floor_number,capacity) VALUES(?,?,?,?)', [blockId, roomNumber, floor, capacity]);
    const rows = Array.from({ length: capacity }, (_, i) => [r.insertId, i + 1]);
    await conn.query('INSERT INTO beds(room_id,bed_number) VALUES ?', [rows]);
    return r.insertId;
  });
  await audit(req, 'ROOM_CREATED', 'room', id, { blockId, roomNumber, capacity });
  res.status(201).json({ id, message: 'Room and bed inventory created.' });
}));

// ---- Beds ----
bedsRouter.use(roles('ADMIN', 'WARDEN'));
/**
 * GET /api/beds?available=1&student_id=123
 * With student_id, only beds the student is actually eligible for (block gender + year range) are returned,
 * so the UI can offer a real bed picker instead of asking for raw database IDs.
 */
bedsRouter.get('/', asyncRoute(async (req, res) => {
  const u = req.user;
  const where = ['1=1']; const p = [];
  if (u.role_code === 'WARDEN') { where.push('ro.block_id=?'); p.push(u.block_id); }
  if (req.query.available === '1') {
    where.push("be.status='AVAILABLE' AND ro.status='AVAILABLE' AND al.allocation_id IS NULL");
  }
  if (req.query.student_id) {
    const s = await studentContext(int(req.query.student_id, 'Student', { min: 1 }));
    if (!s) throw notFound('Student not found.');
    where.push("bl.gender=? AND (bl.min_year IS NULL OR ? BETWEEN bl.min_year AND bl.max_year)");
    p.push(s.gender === 'GIRL' ? 'GIRLS' : 'BOYS', s.btech_year);
  }
  const [rows] = await pool.execute(
    `SELECT be.bed_id, be.bed_number, be.status, ro.room_number, ro.block_id, bl.block_code, al.allocation_status, s.full_name student_name
       FROM beds be JOIN rooms ro ON ro.room_id=be.room_id JOIN blocks bl ON bl.block_id=ro.block_id
       LEFT JOIN allocations al ON al.bed_id=be.bed_id AND al.allocation_status='ACTIVE'
       LEFT JOIN students s ON s.student_id=al.student_id
      WHERE ${where.join(' AND ')} ORDER BY bl.block_code, ro.room_number, be.bed_number LIMIT 2000`, p);
  res.json(rows);
}));

// ---- Allocations ----
allocationsRouter.get('/', asyncRoute(async (req, res) => {
  const sc = scope(req.user, { student: 's.student_id', block: 'bl.block_id' });
  const [rows] = await pool.execute(
    `SELECT al.allocation_id, al.student_id, al.bed_id, al.allocation_start, al.allocation_end, al.allocation_status,
            s.full_name student_name, s.student_code, bl.block_code, ro.room_number, be.bed_number
       FROM allocations al JOIN students s ON s.student_id=al.student_id JOIN beds be ON be.bed_id=al.bed_id
       JOIN rooms ro ON ro.room_id=be.room_id JOIN blocks bl ON bl.block_id=ro.block_id
      WHERE ${sc.sql} ORDER BY al.created_at DESC, al.allocation_id DESC LIMIT 1000`, sc.params);
  res.json(rows);
}));

/** Shared rules for allocate + transfer. Throws a friendly 400/409 when the student cannot take this bed. */
function assertEligible(student, bed) {
  if (student.status !== 'ACTIVE') throw badRequest('Only active students can be allocated a bed.');
  if ((student.gender === 'GIRL') !== (bed.block_gender === 'GIRLS')) throw badRequest('Student gender does not match this block.');
  if (bed.min_year != null && (student.btech_year < bed.min_year || student.btech_year > bed.max_year)) {
    throw badRequest(`This block is for B.Tech year ${bed.min_year === bed.max_year ? bed.min_year : `${bed.min_year}–${bed.max_year}`} students.`);
  }
  if (bed.bed_status !== 'AVAILABLE' || bed.room_status !== 'AVAILABLE') throw conflict('Bed or room is not available.');
}

const lockStudent = async (conn, sid) => (await conn.execute('SELECT student_id,gender,btech_year,status FROM students WHERE student_id=? FOR UPDATE', [sid]))[0][0];
const lockBed = async (conn, bid) => (await conn.execute(
  `SELECT be.bed_id, be.status bed_status, ro.status room_status, ro.block_id, bl.gender block_gender, bl.min_year, bl.max_year
     FROM beds be JOIN rooms ro ON ro.room_id=be.room_id JOIN blocks bl ON bl.block_id=ro.block_id WHERE be.bed_id=? FOR UPDATE`, [bid]))[0][0];

allocationsRouter.post('/', roles('ADMIN', 'WARDEN'), asyncRoute(async (req, res) => {
  const sid = int(req.body?.student_id, 'Student', { min: 1 });
  const bid = int(req.body?.bed_id, 'Bed', { min: 1 });
  const allocationId = await withTransaction(async (conn) => {
    const student = await lockStudent(conn, sid);
    const bed = await lockBed(conn, bid);
    if (!student || !bed) throw notFound('Student or bed not found.');
    assertBlockAccess(req.user, bed.block_id);
    assertEligible(student, bed);
    const [[active]] = await conn.execute("SELECT allocation_id FROM allocations WHERE student_id=? AND allocation_status='ACTIVE' FOR UPDATE", [sid]);
    if (active) throw conflict('Student already has an active allocation. Use Transfer to move them, or check them out first.');
    const [[taken]] = await conn.execute("SELECT allocation_id FROM allocations WHERE bed_id=? AND allocation_status='ACTIVE' FOR UPDATE", [bid]);
    if (taken) throw conflict('That bed is already occupied.');
    const [r] = await conn.execute("INSERT INTO allocations(student_id,bed_id,allocation_start,allocation_status,allocated_by_user_id) VALUES(?,?,CURDATE(),'ACTIVE',?)", [sid, bid, req.user.user_id]);
    return r.insertId;
  });
  await audit(req, 'BED_ALLOCATED', 'allocation', allocationId, { student_id: sid, bed_id: bid });
  await notifyUsers(await userIdForStudent(sid), { title: 'Room allocated', message: 'A bed has been allocated to you. Open "Overview" to see your room.', type: 'ALLOCATION', entityType: 'allocation', entityId: allocationId });
  res.status(201).json({ message: 'Bed allocated successfully. History preserved.', allocation_id: allocationId });
}));

/** Move a student to another bed in one safe step: old allocation ends, new one starts, history is kept. */
allocationsRouter.post('/transfer', roles('ADMIN', 'WARDEN'), asyncRoute(async (req, res) => {
  const sid = int(req.body?.student_id, 'Student', { min: 1 });
  const bid = int(req.body?.bed_id, 'New bed', { min: 1 });
  const allocationId = await withTransaction(async (conn) => {
    const student = await lockStudent(conn, sid);
    const bed = await lockBed(conn, bid);
    if (!student || !bed) throw notFound('Student or bed not found.');
    const [[cur]] = await conn.execute(
      `SELECT al.allocation_id, al.bed_id, ro.block_id FROM allocations al JOIN beds be ON be.bed_id=al.bed_id JOIN rooms ro ON ro.room_id=be.room_id
        WHERE al.student_id=? AND al.allocation_status='ACTIVE' FOR UPDATE`, [sid]);
    if (!cur) throw badRequest('This student has no active bed to move from. Use Allocate bed instead.');
    assertBlockAccess(req.user, cur.block_id);
    assertBlockAccess(req.user, bed.block_id);
    if (Number(cur.bed_id) === Number(bid)) throw badRequest('The student is already in that bed.');
    assertEligible(student, bed);
    const [[taken]] = await conn.execute("SELECT allocation_id FROM allocations WHERE bed_id=? AND allocation_status='ACTIVE' FOR UPDATE", [bid]);
    if (taken) throw conflict('That bed is already occupied.');
    await conn.execute("UPDATE allocations SET allocation_status='ENDED', allocation_end=CURDATE() WHERE allocation_id=?", [cur.allocation_id]);
    const [r] = await conn.execute("INSERT INTO allocations(student_id,bed_id,allocation_start,allocation_status,allocated_by_user_id) VALUES(?,?,CURDATE(),'ACTIVE',?)", [sid, bid, req.user.user_id]);
    return r.insertId;
  });
  await audit(req, 'BED_TRANSFERRED', 'allocation', allocationId, { student_id: sid, bed_id: bid });
  await notifyUsers(await userIdForStudent(sid), { title: 'Room changed', message: 'You have been moved to a new bed. Open "Overview" to see your new room.', type: 'ALLOCATION', entityType: 'allocation', entityId: allocationId });
  res.status(201).json({ message: 'Student moved. The previous allocation is kept in history.', allocation_id: allocationId });
}));

allocationsRouter.post('/students/:id/checkout', roles('ADMIN', 'WARDEN'), asyncRoute(async (req, res) => {
  const sid = idParam(req);
  await withTransaction(async (conn) => {
    const [[a]] = await conn.execute(
      `SELECT al.allocation_id, ro.block_id FROM allocations al JOIN beds be ON be.bed_id=al.bed_id JOIN rooms ro ON ro.room_id=be.room_id
        WHERE al.student_id=? AND al.allocation_status='ACTIVE' FOR UPDATE`, [sid]);
    if (!a) throw notFound('No active allocation found.');
    assertBlockAccess(req.user, a.block_id);
    await conn.execute("UPDATE allocations SET allocation_status='ENDED', allocation_end=CURDATE() WHERE allocation_id=?", [a.allocation_id]);
  });
  await audit(req, 'CHECKOUT', 'student', sid);
  await notifyUsers(await userIdForStudent(sid), { title: 'Checked out', message: 'Your hostel allocation has ended.', type: 'ALLOCATION', entityType: 'student', entityId: sid });
  res.json({ message: 'Checkout completed; bed released and history retained.' });
}));
