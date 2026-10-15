import { runMigrations } from '../migrations.js';
runMigrations().then(() => process.exit(0)).catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
