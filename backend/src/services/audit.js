import { pool } from '../db.js';

/** Best-effort audit trail. Never breaks the request it is attached to. */
export async function audit(req, action, entityType, entityId = null, details = null) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)',
      [req?.user?.user_id ?? null, action, entityType, entityId == null ? null : String(entityId), JSON.stringify({ ip: req?.ip ?? null, ...(details || {}) })],
    );
  } catch (e) {
    console.error('[audit] failed:', e.message);
  }
}
