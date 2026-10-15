import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DB_DIR = process.env.DATABASE_DIR || path.resolve(here, '../../database');
export const MIGRATIONS_DIR = path.join(DB_DIR, 'migrations');

export function migrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
}

const safeDbName = (n) => {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(n)) throw new Error('DB_NAME may only contain letters, digits and underscores.');
  return n;
};

/** Connection with multipleStatements enabled. ONLY used by admin scripts, never by the web server. */
export async function adminConnection({ withDatabase = true } = {}) {
  const { db } = config;
  return mysql.createConnection({
    host: db.host, port: db.port, user: db.migrateUser, password: db.migratePassword,
    database: withDatabase ? safeDbName(db.database) : undefined,
    ssl: db.ssl, multipleStatements: true, charset: 'utf8mb4', timezone: 'Z', dateStrings: ['DATE'],
  });
}

export async function ensureDatabase() {
  const name = safeDbName(config.db.database);
  const conn = await adminConnection({ withDatabase: false });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  } finally { await conn.end(); }
}

const checksum = (sql) => crypto.createHash('sha256').update(sql).digest('hex');

export async function runMigrations(log = console.log) {
  await ensureDatabase();
  const conn = await adminConnection();
  try {
    await conn.query("SET time_zone='+00:00'");
    const [[lock]] = await conn.query("SELECT GET_LOCK('hostelbuddy_migrate', 30) AS got");
    if (!lock.got) throw new Error('Another migration is running. Try again shortly.');
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(190) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);
    const [done] = await conn.query('SELECT name, checksum FROM schema_migrations');
    const applied = new Map(done.map((r) => [r.name, r.checksum]));
    let ran = 0;
    for (const file of migrationFiles()) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const sum = checksum(sql);
      if (applied.has(file)) {
        if (applied.get(file) !== sum) throw new Error(`Migration ${file} was modified after it was applied. Add a new migration instead.`);
        continue;
      }
      log(`-> applying ${file}`);
      await conn.query(sql); // MySQL DDL auto-commits; each file is idempotent up to its failure point, so fix and re-run.
      await conn.query('INSERT INTO schema_migrations(name, checksum) VALUES(?,?)', [file, sum]);
      ran++;
    }
    await conn.query("SELECT RELEASE_LOCK('hostelbuddy_migrate')");
    log(ran ? `Applied ${ran} migration(s).` : 'Database is up to date.');
    return ran;
  } finally { await conn.end(); }
}

/** Names of migration files not yet applied (used for a fail-fast check at server start). */
export async function pendingMigrations(pool) {
  let applied = new Set();
  try {
    const [rows] = await pool.query('SELECT name FROM schema_migrations');
    applied = new Set(rows.map((r) => r.name));
  } catch (e) {
    if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
  }
  return migrationFiles().filter((f) => !applied.has(f));
}
