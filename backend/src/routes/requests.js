import { Router } from 'express';
import { pool } from '../db.js';
import { asyncRoute, badRequest, conflict, dateTime, forbidden, int, notFound, oneOf, phone as vPhone, email as vEmail, str, toSql } from '../utils.js';
import { roles, scope } from '../middleware/auth.js';
import { assertBlockAccess, idParam, resolveTargetStudent } from '../services/students.js';
import { GATE_CODE_RE, OUTPASS_FLOW, VISITOR_FLOW, assertTransition, lower, newGateCode, nextGateAction } from '../services/flows.js';
import { audit } from '../services/audit.js';
import { notifyUsers, userIdForStudent, wardenUserIds } from '../services/notify.js';

export const guardiansRouter = Router();
export const visitorsRouter = Router();
export const outpassesRouter = Router();

const GRACE_MS = 10 * 60 * 1000; // allow "now" even if the form was filled a few minutes ago
const MAX_PENDING = 10;

// ---------------- Guardians ----------------
guardiansRouter.get('/', asyncRoute(async (req, res) => {
  const u = req.user;
  const where = ['1=1']; const p = [];
  if (u.role_code === 'STUDENT') { where.push('g.student_id=?'); p.push(u.student_id); }
  if (u.role_code === 'WARDEN') { where.push('bl.block_id=?'); p.push(u.block_id); }
  const [rows] = await pool.execute(
    `SELECT g.guardian_id id, g.student_id, g.full_name, g.relationship, g.phone, g.email, g.verification_status, g.verification_note, g.created_at,
            s.full_name student_name, s.student_code, bl.block_code
       FROM guardians g JOIN students s ON s.student_id=g.student_id
       LEFT JOIN allocations al ON al.student_id=s.student_id AND al.allocation_status='ACTIVE'
       LEFT JOIN beds be ON be.bed_id=al.bed_id LEFT JOIN rooms ro ON ro.room_id=be.room_id LEFT JOIN blocks bl ON bl.block_id=ro.block_id
      WHERE ${where.join(' AND ')} ORDER BY g.created_at DESC, g.guardian_id DESC LIMIT 1000`, p);
  res.json(rows);
}));

guardiansRouter.post('/', asyncRoute(async (req, res) => {
  const b = req.body || {};
  const rec = {
    name: str(b.full_name, 'Name', { max: 120 }),
    rel: str(b.relationship, 'Relationship', { max: 40 }),
    phone: vPhone(b.phone, 'Phone'),
    email: vEmail(b.email, 'Email', { required: false }),
  };
  const s = await resolveTargetStudent(req);
  const [[cnt]] = await pool.execute('SELECT COUNT(*) c FROM guardians WHERE student_id=?', [s.student_id]);
  if (cnt.c >= 5) throw badRequest('A maximum of 5 parents/guardians can be registered per student.');
  const [r] = await pool.execute('INSERT INTO guardians(student_id,full_name,relationship,phone,email) VALUES(?,?,?,?,?)', [s.student_id, rec.name, rec.rel, rec.phone, rec.email]);
  await audit(req, 'GUARDIAN_ADDED', 'guardian', r.insertId);
  res.status(201).json({ id: r.insertId, message: 'Parent/guardian submitted for verification.' });
}));

guardiansRouter.patch('/:id/verify', roles('ADMIN', 'WARDEN'), asyncRoute(async (req, res) => {
  const id = idParam(req);
  const status = oneOf(req.body?.status, ['VERIFIED', 'REJECTED'], 'Status', { fallback: 'VERIFIED' });
  const note = str(req.body?.note, 'Note', { max: 500, required: false });
  const [[g]] = await pool.execute(
    `SELECT g.student_id, g.verification_status, ro.block_id FROM guardians g
       LEFT JOIN allocations al ON al.student_id=g.student_id AND al.allocation_status='ACTIVE'
       LEFT JOIN beds be ON be.bed_id=al.bed_id LEFT JOIN rooms ro ON ro.room_id=be.room_id WHERE g.guardian_id=?`, [id]);
  if (!g) throw notFound('Parent record not found.');
  assertBlockAccess(req.user, g.block_id);
  if (g.verification_status !== 'PENDING') throw conflict('This record has already been reviewed.');
  await pool.execute('UPDATE guardians SET verification_status=?, verified_by_user_id=?, verified_at=UTC_TIMESTAMP(), verification_note=? WHERE guardian_id=?', [status, req.user.user_id, note, id]);
  await audit(req, 'GUARDIAN_REVIEWED', 'guardian', id, { status });
  await notifyUsers(await userIdForStudent(g.student_id), { title: 'Parent details reviewed', message: `Your parent/guardian details were ${status.toLowerCase()}.`, type: 'GUARDIAN', entityType: 'guardian', entityId: id });
  res.json({ message: `Parent details ${status.toLowerCase()}.` });
}));

// ---------------- Visitors ----------------
visitorsRouter.get('/', asyncRoute(async (req, res) => {
  const sc = scope(req.user, { student: 'v.student_id', block: 'v.block_id' });
  const [rows] = await pool.execute(
    `SELECT v.visitor_request_id id, v.visitor_name, v.visitor_phone, v.purpose, v.visit_start, v.visit_end, v.status, v.decision_note, v.created_at,
            s.full_name student_name, s.student_code, bl.block_code
       FROM visitor_requests v JOIN students s ON s.student_id=v.student_id JOIN blocks bl ON bl.block_id=v.block_id
      WHERE ${sc.sql} ORDER BY v.created_at DESC, v.visitor_request_id DESC LIMIT 500`, sc.params);
  res.json(rows);
}));

visitorsRouter.post('/', asyncRoute(async (req, res) => {
  const b = req.body || {};
  const name = str(b.visitor_name, 'Visitor name', { max: 120 });
  const vphone = vPhone(b.visitor_phone, 'Visitor phone');
  const purpose = str(b.purpose, 'Purpose', { max: 500 });
  const start = dateTime(b.visit_start, 'Visit start');
  const end = dateTime(b.visit_end, 'Visit end', { required: false });
  if (start.getTime() < Date.now() - GRACE_MS) throw badRequest('Visit start cannot be in the past.');
  if (end && end <= start) throw badRequest('Visit end must be after the start.');
  const s = await resolveTargetStudent(req, { requireAllocation: true });
  let guardianId = null;
  if (b.guardian_id) {
    guardianId = int(b.guardian_id, 'Guardian', { min: 1 });
    const [[g]] = await pool.execute('SELECT guardian_id FROM guardians WHERE guardian_id=? AND student_id=?', [guardianId, s.student_id]); // ownership check
    if (!g) throw badRequest('That guardian does not belong to this student.');
  }
  const [[pend]] = await pool.execute("SELECT COUNT(*) c FROM visitor_requests WHERE student_id=? AND status='PENDING'", [s.student_id]);
  if (pend.c >= MAX_PENDING) throw badRequest('Too many pending visitor requests. Wait for a decision first.');
  const [r] = await pool.execute(
    'INSERT INTO visitor_requests(student_id,block_id,guardian_id,visitor_name,visitor_phone,purpose,visit_start,visit_end) VALUES(?,?,?,?,?,?,?,?)',
    [s.student_id, s.block_id, guardianId, name, vphone, purpose, toSql(start), end ? toSql(end) : null]);
  await audit(req, 'VISITOR_REQUESTED', 'visitor', r.insertId);
  await notifyUsers(await wardenUserIds(s.block_id), { title: 'Visitor approval requested', message: `A visitor request for ${name} is waiting for review.`, type: 'VISITOR', entityType: 'visitor', entityId: r.insertId });
  res.status(201).json({ id: r.insertId, message: 'Visitor request submitted.' });
}));

visitorsRouter.patch('/:id/decision', roles('ADMIN', 'WARDEN'), asyncRoute(async (req, res) => {
  const id = idParam(req);
  const status = oneOf(req.body?.status, ['APPROVED', 'REJECTED', 'COMPLETED'], 'Decision');
  const note = str(req.body?.note, 'Note', { max: 500, required: false });
  const [[v]] = await pool.execute('SELECT block_id, student_id, status FROM visitor_requests WHERE visitor_request_id=?', [id]);
  if (!v) throw notFound('Visitor request not found.');
  assertBlockAccess(req.user, v.block_id);
  assertTransition(VISITOR_FLOW, v.status, status, 'visitor request');
  // Conditional UPDATE guards against two staff members deciding at the same moment.
  const [r] = await pool.execute(
    `UPDATE visitor_requests SET status=?, decision_note=COALESCE(?,decision_note),
       decided_by_user_id=IF(?<>'COMPLETED',?,decided_by_user_id), decided_at=IF(?<>'COMPLETED',UTC_TIMESTAMP(),decided_at),
       checked_out_at=IF(?='COMPLETED',UTC_TIMESTAMP(),checked_out_at)
     WHERE visitor_request_id=? AND status=?`, [status, note, status, req.user.user_id, status, status, id, v.status]);
  if (!r.affectedRows) throw conflict('This request was just updated by someone else. Refresh and try again.');
  await audit(req, 'VISITOR_DECISION', 'visitor', id, { status });
  await notifyUsers(await userIdForStudent(v.student_id), { title: 'Visitor request updated', message: `Your visitor request was ${lower(status)}.`, type: 'VISITOR', entityType: 'visitor', entityId: id });
  res.json({ message: `Visitor request ${lower(status)}.` });
}));

visitorsRouter.patch('/:id/cancel', roles('STUDENT'), asyncRoute(async (req, res) => {
  const id = idParam(req);
  const [r] = await pool.execute("UPDATE visitor_requests SET status='CANCELLED' WHERE visitor_request_id=? AND student_id=? AND status IN ('PENDING','APPROVED')", [id, req.user.student_id]);
  if (!r.affectedRows) throw notFound('No cancellable visitor request found.');
  await audit(req, 'VISITOR_CANCELLED', 'visitor', id);
  res.json({ message: 'Visitor request cancelled.' });
}));

// ---------------- Outpasses ----------------
outpassesRouter.get('/', asyncRoute(async (req, res) => {
  const sc = scope(req.user, { student: 'o.student_id', block: 'o.block_id' });
  const [rows] = await pool.execute(
    `SELECT o.outpass_id id, o.reason, o.destination, o.departure_time, o.expected_return_time, o.status, o.decision_note,
            o.pass_code, o.actual_departure_at, o.actual_return_at, o.created_at, s.full_name student_name, s.student_code, bl.block_code
       FROM outpasses o JOIN students s ON s.student_id=o.student_id JOIN blocks bl ON bl.block_id=o.block_id
      WHERE ${sc.sql} ORDER BY o.created_at DESC, o.outpass_id DESC LIMIT 500`, sc.params);
  res.json(rows);
}));

outpassesRouter.post('/', asyncRoute(async (req, res) => {
  const b = req.body || {};
  const reason = str(b.reason, 'Reason', { max: 500 });
  const destination = str(b.destination, 'Destination', { max: 250 });
  const dep = dateTime(b.departure_time, 'Departure time');
  const ret = dateTime(b.expected_return_time, 'Expected return time');
  if (dep.getTime() < Date.now() - GRACE_MS) throw badRequest('Departure time cannot be in the past.');
  if (ret <= dep) throw badRequest('Return time must be after the departure time.');
  if (ret.getTime() - dep.getTime() > 30 * 24 * 3600 * 1000) throw badRequest('An outpass can cover at most 30 days.');
  const s = await resolveTargetStudent(req, { requireAllocation: true });
  const [[overlap]] = await pool.execute(
    "SELECT outpass_id FROM outpasses WHERE student_id=? AND status IN ('PENDING','APPROVED','OUT','OVERDUE') AND departure_time<? AND expected_return_time>? LIMIT 1",
    [s.student_id, toSql(ret), toSql(dep)]);
  if (overlap) throw conflict('You already have an active outpass request that overlaps this time.');
  const [r] = await pool.execute('INSERT INTO outpasses(student_id,block_id,reason,destination,departure_time,expected_return_time) VALUES(?,?,?,?,?,?)', [s.student_id, s.block_id, reason, destination, toSql(dep), toSql(ret)]);
  await audit(req, 'OUTPASS_REQUESTED', 'outpass', r.insertId);
  await notifyUsers(await wardenUserIds(s.block_id), { title: 'Outpass approval requested', message: `An outpass request for ${dep.toISOString().slice(0, 16).replace('T', ' ')} UTC is waiting for review.`, type: 'OUTPASS', entityType: 'outpass', entityId: r.insertId });
  res.status(201).json({ id: r.insertId, message: 'Outpass request submitted.' });
}));

/** Gate check: staff enter the 8-character code to see the outpass and what to do next (depart / return). */
outpassesRouter.post('/gate', roles('ADMIN', 'WARDEN'), asyncRoute(async (req, res) => {
  const code = str(req.body?.code, 'Gate code', { max: 16 }).toUpperCase().replace(/[\s-]/g, '');
  if (!GATE_CODE_RE.test(code)) throw badRequest('Gate codes have 8 letters or numbers, for example K7M2QX9P.');
  const [[o]] = await pool.execute(
    `SELECT o.outpass_id id, o.block_id, o.reason, o.destination, o.departure_time, o.expected_return_time, o.status, o.pass_code,
            s.full_name student_name, s.student_code, bl.block_code
       FROM outpasses o JOIN students s ON s.student_id=o.student_id JOIN blocks bl ON bl.block_id=o.block_id WHERE o.pass_code=?`, [code]);
  if (!o) throw notFound('No outpass found for that code.');
  assertBlockAccess(req.user, o.block_id);
  await audit(req, 'GATE_LOOKUP', 'outpass', o.id);
  res.json({ ...o, next_action: nextGateAction(o.status) });
}));

outpassesRouter.patch('/:id/decision', roles('ADMIN', 'WARDEN'), asyncRoute(async (req, res) => {
  const id = idParam(req);
  const status = oneOf(req.body?.status, ['APPROVED', 'REJECTED', 'OUT', 'RETURNED'], 'Status');
  const note = str(req.body?.note, 'Note', { max: 500, required: false });
  const [[o]] = await pool.execute('SELECT block_id, student_id, status FROM outpasses WHERE outpass_id=?', [id]);
  if (!o) throw notFound('Outpass not found.');
  assertBlockAccess(req.user, o.block_id);
  assertTransition(OUTPASS_FLOW, o.status, status, 'outpass');
  const decision = ['APPROVED', 'REJECTED'].includes(status) ? 1 : 0;
  const gateCode = newGateCode();
  const [r] = await pool.execute(
    `UPDATE outpasses SET status=?, decision_note=COALESCE(?,decision_note),
       decided_by_user_id=IF(?,?,decided_by_user_id), decided_at=IF(?,UTC_TIMESTAMP(),decided_at),
       actual_departure_at=IF(?='OUT',UTC_TIMESTAMP(),actual_departure_at), actual_return_at=IF(?='RETURNED',UTC_TIMESTAMP(),actual_return_at),
       pass_code=IF(?='APPROVED',COALESCE(pass_code,?),pass_code)
     WHERE outpass_id=? AND status=?`, [status, note, decision, req.user.user_id, decision, status, status, status, gateCode, id, o.status]);
  if (!r.affectedRows) throw conflict('This outpass was just updated by someone else. Refresh and try again.');
  await audit(req, 'OUTPASS_DECISION', 'outpass', id, { status });
  const extra = status === 'APPROVED' ? ` Show gate code ${gateCode} at the gate.` : '';
  await notifyUsers(await userIdForStudent(o.student_id), { title: 'Outpass updated', message: `Your outpass status is now ${lower(status)}.${extra}`, type: 'OUTPASS', entityType: 'outpass', entityId: id });
  res.json({ message: `Outpass ${lower(status)}.` });
}));

outpassesRouter.patch('/:id/cancel', roles('STUDENT'), asyncRoute(async (req, res) => {
  const id = idParam(req);
  const [r] = await pool.execute("UPDATE outpasses SET status='CANCELLED' WHERE outpass_id=? AND student_id=? AND status IN ('PENDING','APPROVED')", [id, req.user.student_id]);
  if (!r.affectedRows) throw notFound('No cancellable outpass found.');
  await audit(req, 'OUTPASS_CANCELLED', 'outpass', id);
  res.json({ message: 'Outpass cancelled.' });
}));
