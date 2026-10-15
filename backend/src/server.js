import { config } from './config.js';
import { pool, ping } from './db.js';
import { pendingMigrations } from './migrations.js';
import { createApp } from './app.js';
import { startJobs } from './jobs.js';

async function main() {
  try {
    await ping();
  } catch (e) {
    console.error(`Cannot connect to MySQL at ${config.db.host}:${config.db.port} as "${config.db.user}": ${e.code || e.message}\nCheck DB_* settings in backend/.env and that MySQL is running.`);
    process.exit(1);
  }
  const pending = await pendingMigrations(pool);
  if (pending.length) {
    console.error(`Database is not up to date. Run: npm run db:migrate   (pending: ${pending.join(', ')})`);
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`HostelBuddy API listening on port ${config.port} (${config.isProd ? 'production' : 'development'})`);
  });
  server.keepAliveTimeout = 65_000; // longer than common load-balancer idle timeouts
  server.on('error', (err) => {
    console.error(err.code === 'EADDRINUSE'
      ? `Port ${config.port} is already in use. Stop the other process or set a different PORT in backend/.env.`
      : `HostelBuddy API failed to start: ${err.message}`);
    process.exit(1);
  });

  const stopJobs = process.env.RUN_JOBS === 'false' ? () => {} : startJobs();
  let closing = false;
  const shutdown = (signal) => {
    if (closing) return;
    closing = true;
    console.log(`${signal} received: shutting down...`);
    stopJobs();
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    server.close(async () => { await pool.end().catch(() => {}); process.exit(0); });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => { console.error('[uncaughtException]', e); process.exit(1); });

main();
