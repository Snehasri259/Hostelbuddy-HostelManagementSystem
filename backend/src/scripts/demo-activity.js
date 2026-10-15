// Sample day-to-day activity for the demo: notices, complaints, parents, visitors, outpasses and notifications.
import { toSql } from '../utils.js';
import { demoPassCode, parentNames, visitorFor } from './names.js';

const at = (hours) => toSql(new Date(Date.now() + hours * 3600_000));
const PER_BLOCK = 6;

const COMPLAINTS = [
  ['Ceiling fan making noise', 'ELECTRICAL', 'The fan in our room wobbles and makes a loud noise at night. Please check the mounting.', 'MEDIUM'],
  ['No hot water on 2nd floor', 'WATER', 'Geyser has not worked since Monday morning on the second floor washrooms.', 'HIGH'],
  ['Wi-Fi very slow in evenings', 'INTERNET', 'Speed drops below 1 Mbps after 8 pm, which makes online classes difficult.', 'MEDIUM'],
  ['Corridor lights flickering', 'ELECTRICAL', 'Two tube lights in the corridor keep flickering and one is completely dead.', 'LOW'],
  ['Washroom needs cleaning', 'CLEANLINESS', 'The common washroom was not cleaned for two days and has a bad smell.', 'HIGH'],
  ['Broken window latch', 'MAINTENANCE', 'The window latch is broken and the window does not close properly.', 'MEDIUM'],
];
const STATUS_C = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'OPEN', 'REJECTED', 'RESOLVED'];
const RESPONSES = { IN_PROGRESS: 'Maintenance team has been informed and will visit within 24 hours.', RESOLVED: 'Fixed and verified. Please report again if the problem returns.', REJECTED: 'Duplicate of an existing complaint that is already being handled.' };

const STATUS_V = ['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'PENDING', 'CANCELLED'];

const OUTPASSES = [
  ['Family function', 'Home town'],
  ['Medical check-up', 'City Hospital'],
  ['Weekend home visit', 'Railway station / home'],
  ['Shopping for exam supplies', 'Main market'],
  ['Cousin’s wedding', 'Banquet hall, Sector 12'],
  ['Internship interview', 'Tech Park, Phase 2'],
];
const STATUS_O = ['PENDING', 'APPROVED', 'OUT', 'RETURNED', 'OVERDUE', 'REJECTED'];

export async function seedActivity(pool, { reset = false, log = console.log } = {}) {
  if (reset) {
    for (const t of ['notifications', 'visitor_requests', 'outpasses', 'guardians', 'complaints', 'notices']) await pool.query(`DELETE FROM ${t}`);
    log('    cleared previous sample activity.');
  }
  const [[c]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM complaints)+(SELECT COUNT(*) FROM notices)+(SELECT COUNT(*) FROM visitor_requests)
          +(SELECT COUNT(*) FROM outpasses)+(SELECT COUNT(*) FROM guardians) AS n`);
  if (Number(c.n) > 0) { log('Sample activity already present — skipped (run `npm run db:reset-dev` for a clean start).'); return false; }

  const [[admin]] = await pool.query(
    `SELECT u.user_id FROM app_users u JOIN roles r ON r.role_id=u.role_id WHERE r.role_code='ADMIN' AND u.password_hash IS NOT NULL ORDER BY u.user_id LIMIT 1`);
  const [wardenRows] = await pool.query(
    `SELECT u.user_id, w.block_id FROM app_users u JOIN wardens w ON w.warden_id=u.warden_id WHERE u.password_hash IS NOT NULL`);
  const warden = Object.fromEntries(wardenRows.map((w) => [w.block_id, w.user_id]));
  if (!admin) throw new Error('No admin login found. Create logins first.');

  const [stu] = await pool.query(
    `SELECT s.student_id, s.full_name, ro.block_id, u.user_id FROM students s
       JOIN allocations al ON al.student_id=s.student_id AND al.allocation_status='ACTIVE'
       JOIN beds be ON be.bed_id=al.bed_id JOIN rooms ro ON ro.room_id=be.room_id
       JOIN app_users u ON u.student_id=s.student_id AND u.is_active=TRUE ORDER BY ro.block_id, s.student_id`);
  const picked = {};
  for (const s of stu) { (picked[s.block_id] ||= []); if (picked[s.block_id].length < PER_BLOCK) picked[s.block_id].push(s); }

  // ---- notices ----
  const notices = [
    ['Welcome to the new academic year', 'Please keep your ID card with you at all times and update your parent details in HostelBuddy.', 'ALL', null, admin.user_id, -96],
    ['Water supply maintenance on Saturday', 'Water supply will be paused from 10 am to 2 pm for tank cleaning. Please store water in advance.', 'ALL', null, admin.user_id, -48],
    ['Mess timings during exams', 'Breakfast will start at 6:30 am and dinner will stay open till 10 pm during the examination fortnight.', 'ALL', null, admin.user_id, -20],
    ['Fire-safety drill on Friday', 'A short evacuation drill will be held at 5 pm. All residents must assemble at the front lawn.', 'BLOCK', 1, warden[1] ?? admin.user_id, -30],
    ['Common room Wi-Fi upgrade', 'The common room router will be replaced tomorrow; expect a short outage in the morning.', 'BLOCK', 3, warden[3] ?? admin.user_id, -10],
    ['Laundry schedule updated', 'Laundry pick-up is now on Tuesdays and Fridays. Drop your bags before 8 am.', 'BLOCK', 6, warden[6] ?? admin.user_id, -6],
  ].map(([t, b, a, blk, by, h]) => [t, b, a, blk, by, at(h)]);
  await pool.query('INSERT INTO notices(title,body,audience,block_id,created_by_user_id,created_at) VALUES ?', [notices]);

  const complaints = []; const guardians = []; const visitors = []; const outpasses = []; const notifs = [];
  const note = (user, title, message, type, h, read) => notifs.push([user, title, message, type, null, null, read ? 1 : 0, 'NOT_CONFIGURED', at(h), read ? at(h + 1) : null]);

  for (const [blockId, list] of Object.entries(picked)) {
    const wUser = warden[blockId] ?? admin.user_id;
    list.forEach((s, i) => {
      const [subject, category, description, priority] = COMPLAINTS[i];
      const cs = STATUS_C[i];
      complaints.push([s.student_id, blockId, subject, category, description, priority, cs, RESPONSES[cs] ?? null, cs === 'OPEN' ? null : wUser, at(-24 * (i + 1))]);

      if (i < 4) {
        const f = String(s.student_id).padStart(6, '0');
        const { father, mother } = parentNames(s.full_name, s.student_id);
        guardians.push([s.student_id, father, 'Father', `91${blockId}${f}`.slice(0, 12), null, ['VERIFIED', 'VERIFIED', 'PENDING', 'REJECTED'][i], i < 2 || i === 3 ? wUser : null, i < 2 || i === 3 ? at(-12) : null, at(-72 + i)]);
        guardians.push([s.student_id, mother, 'Mother', `92${blockId}${f}`.slice(0, 12), null, i % 2 ? 'PENDING' : 'VERIFIED', i % 2 ? null : wUser, i % 2 ? null : at(-11), at(-71 + i)]);
      }

      const { name: vn, rel, purpose } = visitorFor(s.full_name, i); const vs = STATUS_V[i];
      const vStart = vs === 'COMPLETED' ? -5 : vs === 'APPROVED' ? 6 : vs === 'REJECTED' ? -20 : 30 + i;
      const decided = ['APPROVED', 'COMPLETED', 'REJECTED'].includes(vs);
      visitors.push([s.student_id, blockId, vn, `98${blockId}${String(s.student_id).padStart(7, '0')}`.slice(0, 12), `${purpose} (${rel})`, at(vStart), at(vStart + 2), vs,
        decided ? wUser : null, decided ? at(Math.min(vStart - 3, -1)) : null, vs === 'REJECTED' ? 'Visiting hours had already ended.' : null, vs === 'COMPLETED' ? at(vStart + 2) : null, at(-30 + i)]);

      const [reason, dest] = OUTPASSES[i]; const os = STATUS_O[i];
      const dep = { PENDING: 30, APPROVED: 5, OUT: -3, RETURNED: -50, OVERDUE: -30, REJECTED: 20 }[os];
      const ret = { PENDING: 78, APPROVED: 30, OUT: 6, RETURNED: -26, OVERDUE: -2, REJECTED: 40 }[os];
      const dec = !['PENDING'].includes(os);
      outpasses.push([s.student_id, blockId, reason, dest, at(dep), at(ret), os, dec ? wUser : null, dec ? at(Math.min(dep - 4, -1)) : null, os === 'REJECTED' ? 'Please attach a guardian confirmation and apply again.' : null,
        ['APPROVED', 'OUT', 'RETURNED', 'OVERDUE'].includes(os) ? demoPassCode(s.student_id * 10 + i) : null,
        ['OUT', 'RETURNED', 'OVERDUE'].includes(os) ? at(dep + 0.2) : null, os === 'RETURNED' ? at(ret - 1) : null, at(Math.min(dep - 8, -2 - i))]);

      // notifications for the student
      note(s.user_id, 'Room allocated', 'A bed has been allocated to you. Open the dashboard to see your room.', 'ALLOCATION', -100, true);
      note(s.user_id, `Complaint ${cs === 'OPEN' ? 'received' : 'updated'}`, `Your complaint “${subject}” is ${cs.replace('_', ' ').toLowerCase()}.`, 'COMPLAINT', -22 + i, i % 3 === 0);
      note(s.user_id, `Outpass ${os.toLowerCase()}`, `Your outpass for “${reason}” is now ${os.toLowerCase()}.`, 'OUTPASS', -4 - i, false);
    });
    if (wUser !== admin.user_id) {
      note(wUser, 'Outpass approval requested', 'A student in your block is waiting for an outpass decision.', 'OUTPASS', -2, false);
      note(wUser, 'Visitor approval requested', 'A visitor request is waiting for your review.', 'VISITOR', -3, false);
      note(wUser, 'New complaint', 'A new complaint was submitted in your block.', 'COMPLAINT', -5, true);
    }
  }
  note(admin.user_id, 'Weekly occupancy summary', 'All six blocks are active. Review pending approvals on the dashboard.', 'GENERAL', -8, false);
  note(admin.user_id, 'Pending approvals', 'Several outpass and visitor requests are waiting across blocks.', 'GENERAL', -2, false);
  note(admin.user_id, 'Welcome to HostelBuddy', 'Demo data has been loaded so you can explore every module.', 'GENERAL', -1, true);

  await pool.query('INSERT INTO complaints(student_id,block_id,subject,category,description,priority,status,response,responded_by_user_id,created_at) VALUES ?', [complaints]);
  await pool.query('INSERT INTO guardians(student_id,full_name,relationship,phone,email,verification_status,verified_by_user_id,verified_at,created_at) VALUES ?', [guardians]);
  await pool.query('INSERT INTO visitor_requests(student_id,block_id,visitor_name,visitor_phone,purpose,visit_start,visit_end,status,decided_by_user_id,decided_at,decision_note,checked_out_at,created_at) VALUES ?', [visitors]);
  await pool.query('INSERT INTO outpasses(student_id,block_id,reason,destination,departure_time,expected_return_time,status,decided_by_user_id,decided_at,decision_note,pass_code,actual_departure_at,actual_return_at,created_at) VALUES ?', [outpasses]);
  await pool.query('INSERT INTO notifications(user_id,title,message,notification_type,entity_type,entity_id,is_read,email_status,created_at,read_at) VALUES ?', [notifs]);
  log(`Sample activity created: ${notices.length} notices, ${complaints.length} complaints, ${guardians.length} parent records, ${visitors.length} visitor requests, ${outpasses.length} outpasses, ${notifs.length} notifications.`);
  return true;
}
