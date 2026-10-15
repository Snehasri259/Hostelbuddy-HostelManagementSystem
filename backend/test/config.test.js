import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const run = (env) => spawnSync(process.execPath, ['-e', "import('./src/config.js').then(m=>console.log(JSON.stringify({ssl:!!m.config.db.ssl,ca:m.config.db.ssl&&m.config.db.ssl.ca,rej:m.config.db.ssl&&m.config.db.ssl.rejectUnauthorized})))"],
  { cwd: new URL('..', import.meta.url).pathname, env: { PATH: process.env.PATH, JWT_SECRET: 'x'.repeat(40), DB_PASSWORD: 'p', ...env }, encoding: 'utf8' });

test('CA certificate via base64 and \\n-escaped PEM is decoded', () => {
  const pem = '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----';
  let r = run({ DB_SSL: 'true', DB_SSL_CA_BASE64: Buffer.from(pem).toString('base64') });
  assert.equal(JSON.parse(r.stdout).ca, pem);
  r = run({ DB_SSL: 'true', DB_SSL_CA: pem.replaceAll('\n', '\\n') });
  assert.equal(JSON.parse(r.stdout).ca, pem);
});
test('TLS verification is on unless explicitly disabled', () => {
  assert.equal(JSON.parse(run({ DB_SSL: 'true' }).stdout).rej, true);
  assert.equal(JSON.parse(run({ DB_SSL: 'true', DB_SSL_INSECURE: 'true' }).stdout).rej, false);
  assert.equal(JSON.parse(run({}).stdout).ssl, false);
});
test('production refuses unsafe settings', () => {
  const r = run({ NODE_ENV: 'production', DB_USER: 'root', APP_URL: 'http://x.com' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Unsafe production configuration/);
  const ok = run({ NODE_ENV: 'production', DB_USER: 'app', APP_URL: 'https://x.com' });
  assert.equal(ok.status, 0);
});
test('weak JWT secret is rejected', () => {
  const r = run({ JWT_SECRET: 'short' });
  assert.notEqual(r.status, 0);
});
test('on Render the automatic RENDER_EXTERNAL_URL is accepted as the public URL', () => {
  const ok = run({ NODE_ENV: 'production', DB_USER: 'app', RENDER_EXTERNAL_URL: 'https://hostelbuddy.onrender.com' });
  assert.equal(ok.status, 0);
  const bad = run({ NODE_ENV: 'production', DB_USER: 'app' });
  assert.notEqual(bad.status, 0);
});
