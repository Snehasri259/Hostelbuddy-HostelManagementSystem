import mysql from 'mysql2/promise';
import { config } from './config.js';

const { db } = config;

export const pool = mysql.createPool({
  host: db.host,
  port: db.port,
  user: db.user,
  password: db.password,
  database: db.database,
  ssl: db.ssl,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: db.poolSize,
  queueLimit: 200,
  connectTimeout: 10_000,
  enableKeepAlive: true,
  decimalNumbers: true,
  // Everything is stored and exchanged in UTC; the browser converts to local time.
  timezone: 'Z',
  // DATE columns stay 'YYYY-MM-DD' strings so they never shift by a day across time zones.
  dateStrings: ['DATE'],
});

pool.pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

export async function ping() {
  const [rows] = await pool.query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}

/** Run fn inside a transaction; commits on success, rolls back on any error. */
export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    try { await conn.rollback(); } catch { /* connection already gone */ }
    throw e;
  } finally {
    conn.release();
  }
}
