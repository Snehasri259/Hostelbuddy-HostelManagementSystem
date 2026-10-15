import { pool } from './db.js';
import { notifyUsers, userIdForStudent, wardenUserIds } from './services/notify.js';

/** Marks outpasses whose student has not returned as OVERDUE, and expires never-used ones. Idempotent. */
export async function sweepOutpasses() {
  const [late] = await pool.query("SELECT outpass_id, student_id, block_id FROM outpasses WHERE status='OUT' AND expected_return_time < UTC_TIMESTAMP()");
  for (const o of late) {
    const [r] = await pool.execute("UPDATE outpasses SET status='OVERDUE' WHERE outpass_id=? AND status='OUT'", [o.outpass_id]);
    if (!r.affectedRows) continue;
    const msg = 'An outpass has passed its expected return time and is now marked overdue.';
    await notifyUsers([...(await userIdForStudent(o.student_id)), ...(await wardenUserIds(o.block_id))], { title: 'Outpass overdue', message: msg, type: 'OUTPASS', entityType: 'outpass', entityId: o.outpass_id });
  }
  await pool.query("UPDATE outpasses SET status='CANCELLED', decision_note=COALESCE(decision_note,'Expired without departure') WHERE status IN ('PENDING','APPROVED') AND expected_return_time < UTC_TIMESTAMP()");
}

export function startJobs() {
  const run = () => sweepOutpasses().catch((e) => console.error('[jobs] outpass sweep failed:', e.message));
  const timer = setInterval(run, 5 * 60 * 1000);
  timer.unref();
  setTimeout(run, 10_000).unref();
  return () => clearInterval(timer);
}
