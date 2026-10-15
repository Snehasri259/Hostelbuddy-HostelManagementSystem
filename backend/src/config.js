import 'dotenv/config';
import fs from 'node:fs';

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const bool = (v, d = false) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

const port = Number(env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port between 1 and 65535.');
}

const jwtSecret = env.JWT_SECRET || '';
if (jwtSecret.length < 32 || /replace-with|change_me|secret-at-least/i.test(jwtSecret)) {
  throw new Error('Set JWT_SECRET in backend/.env to a random value of at least 32 characters (see .env.example).');
}

// Render injects RENDER_EXTERNAL_URL (https://<service>.onrender.com), so no manual APP_URL is needed there.
const APP_URL_ENV = env.APP_URL || env.RENDER_EXTERNAL_URL || '';
const origins = (env.FRONTEND_ORIGIN || APP_URL_ENV || 'http://localhost:5173')
  .split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean);
const appUrl = (APP_URL_ENV || origins[0]).replace(/\/$/, '');

if (isProd) {
  const problems = [];
  if (!env.DB_PASSWORD || /change_me|your_mysql_password/i.test(env.DB_PASSWORD)) problems.push('DB_PASSWORD must be set to a real password');
  if ((env.DB_USER || 'root') === 'root') problems.push('DB_USER must not be root (create a least-privilege user, see README)');
  if (!APP_URL_ENV) problems.push('APP_URL must be your public https:// URL');
  if (APP_URL_ENV && !/^https:\/\//i.test(APP_URL_ENV) && !bool(env.ALLOW_INSECURE_HTTP)) problems.push('APP_URL must use https:// in production');
  if (problems.length) throw new Error('Unsafe production configuration:\n - ' + problems.join('\n - '));
}

// Managed MySQL (Aiven, etc.) needs TLS. Provide the provider's CA as DB_SSL_CA (PEM text or a file path) or DB_SSL_CA_BASE64.
function loadCa() {
  if (env.DB_SSL_CA_BASE64) return Buffer.from(env.DB_SSL_CA_BASE64, 'base64').toString('utf8');
  const raw = env.DB_SSL_CA || '';
  if (raw.includes('BEGIN CERTIFICATE')) return raw.replace(/\\n/g, '\n');
  if (raw && fs.existsSync(raw)) return fs.readFileSync(raw, 'utf8');
  return undefined;
}
const dbCa = loadCa();

const cookieSecure = bool(env.COOKIE_SECURE, isProd);
const cookieSameSite = String(env.COOKIE_SAMESITE || 'strict').toLowerCase();
if (!['strict', 'lax', 'none'].includes(cookieSameSite)) throw new Error('COOKIE_SAMESITE must be strict, lax or none.');
if (cookieSameSite === 'none' && !cookieSecure) throw new Error('COOKIE_SAMESITE=none requires a Secure cookie (HTTPS).');

export const config = {
  isProd,
  port,
  appUrl,
  origins,
  trustProxy: env.TRUST_PROXY ? (Number.isNaN(Number(env.TRUST_PROXY)) ? env.TRUST_PROXY : Number(env.TRUST_PROXY)) : 0,
  serveFrontend: bool(env.SERVE_FRONTEND, false),
  jwtSecret,
  sessionHours: 8,
  cookieSecure,
  cookieSameSite,
  // The __Host- prefix pins the cookie to this exact host and forbids a Domain attribute (requires Secure).
  cookieName: cookieSecure ? '__Host-hb_session' : 'hb_session',
  db: {
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'hostelbuddy',
    ssl: bool(env.DB_SSL) ? { rejectUnauthorized: !bool(env.DB_SSL_INSECURE), ...(dbCa ? { ca: dbCa } : {}) } : undefined,
    poolSize: Number(env.DB_POOL || 10),
    migrateUser: env.MIGRATE_DB_USER || env.DB_USER || 'root',
    migratePassword: env.MIGRATE_DB_PASSWORD || env.DB_PASSWORD || '',
  },
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 587),
    secure: bool(env.SMTP_SECURE),
    user: env.SMTP_USER || '',
    password: env.SMTP_PASSWORD || '',
    from: env.SMTP_FROM || 'HostelBuddy <noreply@localhost>',
  },
};
