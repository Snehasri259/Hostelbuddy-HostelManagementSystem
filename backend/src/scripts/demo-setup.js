// One command for a fully populated LOCAL demo:  npm run demo:setup
//   migrates the DB -> loads 800 students / 200 rooms / allocations -> creates a login for every demo account
//   -> adds sample notices, complaints, visitors, outpasses, parents, notifications -> writes credentials CSV.
// Safe to re-run. Refuses in production and against non-local databases (use --allow-remote to override on a throwaway DB).
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { pool } from '../db.js';
import { DB_DIR, adminConnection, runMigrations } from '../migrations.js';
import { seedActivity } from './demo-activity.js';
import { STAFF, studentName } from './names.js';

const DEMO_PASSWORDS = { ADMIN: 'Admin@Demo2026', WARDEN: 'Warden@Demo2026', STUDENT: 'Student@Demo2026' };
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'db', 'host.docker.internal'];

if (config.isProd) { console.error('Refusing: demo data uses well-known passwords and must never be loaded when NODE_ENV=production.'); process.exit(1); }
if (!LOCAL_HOSTS.includes(config.db.host) && !process.argv.includes('--allow-remote')) {
  console.error(`Refusing: DB_HOST "${config.db.host}" is not a local database. Demo accounts use well-known passwords. Add --allow-remote only for a throwaway database.`);
  process.exit(1);
}

try {
  console.log('1/5 Applying migrations...');
  await runMigrations((m) => console.log('   ', m));

  console.log('2/5 Loading demo students, rooms and allocations...');
  const conn = await adminConnection();
  try {
    const [[{ n }]] = await conn.query('SELECT COUNT(*) n FROM students');
    if (n > 0) console.log(`    students already present (${n}) — keeping them.`);
    else { await conn.query(fs.readFileSync(path.join(DB_DIR, 'seeds', 'demo_data.sql'), 'utf8')); console.log('    loaded 800 students, 200 rooms, 800 allocations.'); }
  } finally { await conn.end(); }

  // Keep names gender-correct even on a database that was loaded with an older version of the sample data.
  const [demoStudents] = await pool.query("SELECT student_id, gender, full_name FROM students WHERE student_code REGEXP '^HB-[GB][1-4]-[0-9]{3}$' ORDER BY student_code");
  const seq = { BOY: 0, GIRL: 0 }; let renamed = 0;
  for (const st of demoStudents) {
    const nm = studentName(st.gender, seq[st.gender]++);
    if (nm !== st.full_name) { await pool.execute('UPDATE students SET full_name=? WHERE student_id=?', [nm, st.student_id]); renamed++; }
  }
  for (const [code, nm] of Object.entries(STAFF.wardens)) await pool.execute('UPDATE wardens SET full_name=? WHERE staff_code=?', [nm, code]);
  for (const [code, nm] of Object.entries(STAFF.admins)) await pool.execute('UPDATE admins SET full_name=? WHERE staff_code=?', [nm, code]);
  if (renamed) console.log(`    corrected ${renamed} student names to match gender.`);

  console.log('3/5 Creating demo logins...');
  const [roleRows] = await pool.query('SELECT role_id, role_code FROM roles');
  const role = Object.fromEntries(roleRows.map((r) => [r.role_code, r.role_id]));
  const hash = Object.fromEntries(await Promise.all(Object.entries(DEMO_PASSWORDS).map(async ([k, v]) => [k, await bcrypt.hash(v, 10)])));
  const upsert = async (rows, col, roleCode) => {
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200).map((r) => [r.email, hash[roleCode], role[roleCode], r.id]);
      await pool.query(
        `INSERT INTO app_users(username,password_hash,role_id,${col}) VALUES ?
         ON DUPLICATE KEY UPDATE username=VALUES(username), password_hash=VALUES(password_hash), is_active=TRUE,
           must_change_password=FALSE, failed_login_count=0, locked_until=NULL`, [chunk]);
    }
  };
  const [admins] = await pool.query("SELECT admin_id id, email FROM admins WHERE email LIKE '%example.test'");
  const [wardens] = await pool.query('SELECT warden_id id, email FROM wardens WHERE email IS NOT NULL');
  const [students] = await pool.query("SELECT student_id id, email FROM students WHERE email IS NOT NULL AND status='ACTIVE'");
  await upsert(admins, 'admin_id', 'ADMIN'); await upsert(wardens, 'warden_id', 'WARDEN'); await upsert(students, 'student_id', 'STUDENT');
  console.log(`    ${admins.length} admins, ${wardens.length} wardens, ${students.length} students can sign in.`);

  console.log('4/5 Resetting sample activity (notices, complaints, parents, visitors, outpasses, notifications)...');
  await seedActivity(pool, { reset: true });

  console.log('5/5 Writing credentials file...');
  const [accounts] = await pool.query(
    `SELECT r.role_code AS role_code, COALESCE(s.full_name,w.full_name,a.full_name) AS full_name, u.username AS email,
            COALESCE(wb.block_code, bl.block_code) AS block_code, ro.room_number AS room_number, be.bed_number AS bed_number
       FROM app_users u JOIN roles r ON r.role_id=u.role_id
       LEFT JOIN students s ON s.student_id=u.student_id LEFT JOIN wardens w ON w.warden_id=u.warden_id LEFT JOIN admins a ON a.admin_id=u.admin_id
       LEFT JOIN blocks wb ON wb.block_id=w.block_id
       LEFT JOIN allocations al ON al.student_id=s.student_id AND al.allocation_status='ACTIVE'
       LEFT JOIN beds be ON be.bed_id=al.bed_id LEFT JOIN rooms ro ON ro.room_id=be.room_id LEFT JOIN blocks bl ON bl.block_id=ro.block_id
      WHERE u.username LIKE '%example.test' AND u.password_hash IS NOT NULL
      ORDER BY FIELD(r.role_code,'ADMIN','WARDEN','STUDENT'), block_code, u.username`);
  const q = (v) => '"' + String(v ?? '').replaceAll('"', '""') + '"';
  const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../credentials');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'demo-login-credentials.csv');
  fs.writeFileSync(file, ['role,name,email,password,block,room,bed', ...accounts.map((x) => [x.role_code, x.full_name, x.email, DEMO_PASSWORDS[x.role_code], x.block_code, x.room_number, x.bed_number].map(q).join(','))].join('\n'));
  console.log(`    ${accounts.length} accounts written to ${file}`);

  const sample = (code) => accounts.find((x) => x.role_code === code && (code !== 'STUDENT' || x.room_number));
  console.log('\nReady. Sign in at http://localhost:5173 with any of these:');
  for (const c of ['ADMIN', 'WARDEN', 'STUDENT']) { const a = sample(c); if (a) console.log(`  ${c.padEnd(8)} ${a.email}   /   ${DEMO_PASSWORDS[c]}`); }
  console.log('\nAll admins share one password, all wardens one password, all students one password (demo only).');
} catch (e) {
  console.error('\nDemo setup failed:', e.sqlMessage || e.message);
  process.exitCode = 1;
} finally { await pool.end(); }
