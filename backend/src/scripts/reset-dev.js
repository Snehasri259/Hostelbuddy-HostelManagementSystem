import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { adminConnection, DB_DIR } from '../migrations.js';

if (config.isProd) { console.error('Refusing to wipe the database when NODE_ENV=production.'); process.exit(1); }
const conn = await adminConnection();
try {
  await conn.query(fs.readFileSync(path.join(DB_DIR, 'reset_dev.sql'), 'utf8'));
  console.log('All HostelBuddy tables dropped. Run: npm run db:migrate');
} finally { await conn.end(); }
