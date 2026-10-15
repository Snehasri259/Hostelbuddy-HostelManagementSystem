import { pool } from '../db.js';
import { mailEnabled, sendMail } from '../mailer.js';

const CHUNK = 500;

/**
 * Bulk-insert in-app notifications (one INSERT per 500 users) and deliver e-mail in the background,
 * so a notice to 800+ users never blocks or times out the HTTP request.
 */
export async function notifyUsers(userIds, { title, message, type = 'GENERAL', entityType = null, entityId = null }) {
  const ids = [...new Set(userIds.map(Number).filter(Boolean))];
  if (!ids.length) return 0;
  const status = mailEnabled() ? 'PENDING' : 'NOT_CONFIGURED';
  const eid = entityId == null ? null : String(entityId);
  for (let i = 0; i < ids.length; i += CHUNK) {
    const rows = ids.slice(i, i + CHUNK).map((id) => [id, title, message, type, entityType, eid, status]);
    await pool.query('INSERT INTO notifications(user_id,title,message,notification_type,entity_type,entity_id,email_status) VALUES ?', [rows]);
  }
  if (mailEnabled()) setImmediate(() => deliverEmails(ids, title, message, entityType, eid).catch((e) => console.error('[notify] email batch failed:', e.message)));
  return ids.length;
}

async function deliverEmails(ids, title, message, entityType, eid) {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const [users] = await pool.query(
      `SELECT u.user_id, COALESCE(s.email,w.email,a.email,u.username) email
         FROM app_users u
         LEFT JOIN students s ON s.student_id=u.student_id
         LEFT JOIN wardens w ON w.warden_id=u.warden_id
         LEFT JOIN admins a ON a.admin_id=u.admin_id
        WHERE u.user_id IN (?)`, [slice]);
    for (const u of users) {
      const result = await sendMail({ to: u.email, subject: `HostelBuddy: ${title}`, text: message });
      await pool.execute(
        `UPDATE notifications SET email_status=? WHERE user_id=? AND title=? AND email_status='PENDING' AND entity_type<=>? AND entity_id<=>?`,
        [result, u.user_id, title, entityType, eid]);
    }
  }
}

export const userIdForStudent = async (studentId) => {
  const [[r]] = await pool.execute('SELECT user_id FROM app_users WHERE student_id=? AND is_active=TRUE', [studentId]);
  return r ? [r.user_id] : [];
};

export async function wardenUserIds(blockId) {
  const [rows] = await pool.execute(
    'SELECT u.user_id FROM app_users u JOIN wardens w ON w.warden_id=u.warden_id WHERE w.block_id=? AND u.is_active=TRUE', [blockId]);
  return rows.map((r) => r.user_id);
}

export async function blockUserIds(blockId) {
  const [rows] = await pool.execute(
    `SELECT u.user_id FROM app_users u
       JOIN allocations al ON al.student_id=u.student_id AND al.allocation_status='ACTIVE'
       JOIN beds be ON be.bed_id=al.bed_id JOIN rooms ro ON ro.room_id=be.room_id
      WHERE ro.block_id=? AND u.is_active=TRUE
     UNION
     SELECT u.user_id FROM app_users u JOIN wardens w ON w.warden_id=u.warden_id WHERE w.block_id=? AND u.is_active=TRUE`,
    [blockId, blockId]);
  return rows.map((r) => r.user_id);
}

export async function allActiveUserIds() {
  const [rows] = await pool.query('SELECT user_id FROM app_users WHERE is_active=TRUE');
  return rows.map((r) => r.user_id);
}
