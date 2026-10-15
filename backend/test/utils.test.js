import test from 'node:test';
import assert from 'node:assert/strict';
import { str, int, oneOf, email, phone, dateTime, toSql, escapeLike, csvCell, validateNewPassword, parseCookies, HttpError } from '../src/utils.js';

test('str trims, enforces length and strips control chars', () => {
  assert.equal(str('  hi  ', 'X'), 'hi');
  assert.throws(() => str('', 'X'), HttpError);
  assert.equal(str('', 'X', { required: false }), null);
  assert.throws(() => str('a'.repeat(300), 'X', { max: 255 }), /at most 255/);
  assert.equal(str('a\u0000b', 'X'), 'ab');
  assert.throws(() => str({ $ne: 1 }, 'X'), /must be text/);
});
test('int validates range and integer-ness', () => {
  assert.equal(int('4', 'N', { min: 1, max: 24 }), 4);
  assert.throws(() => int('4.5', 'N'), HttpError);
  assert.throws(() => int(99, 'N', { min: 1, max: 24 }), /between 1 and 24/);
});
test('oneOf is case-insensitive and supports fallback', () => {
  assert.equal(oneOf('girl', ['GIRL', 'BOY'], 'G'), 'GIRL');
  assert.equal(oneOf(undefined, ['LOW', 'MEDIUM'], 'P', { fallback: 'MEDIUM' }), 'MEDIUM');
  assert.throws(() => oneOf('x', ['A'], 'L'), HttpError);
});
test('email/phone validation', () => {
  assert.equal(email(' A@B.com ', 'E'), 'a@b.com');
  assert.throws(() => email('nope', 'E'), HttpError);
  assert.equal(phone('+91 98765-43210', 'P'), '+91 98765-43210');
  assert.throws(() => phone('abc', 'P'), HttpError);
});
test('dateTime + toSql', () => {
  const d = dateTime('2026-10-13T10:30:00.000Z', 'D');
  assert.equal(toSql(d), '2026-10-13 10:30:00');
  assert.throws(() => dateTime('garbage', 'D'), HttpError);
  assert.throws(() => dateTime('1999-01-01', 'D'), /out of range/);
});
test('escapeLike escapes wildcards', () => {
  assert.equal(escapeLike('100%_x\\'), '100\\%\\_x\\\\');
});
test('csvCell blocks formula injection and escapes quotes', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+1'), `"'+1"`);
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell(null), '""');
});
test('password policy', () => {
  assert.throws(() => validateNewPassword('short1'), /at least 10/);
  assert.throws(() => validateNewPassword('onlyletterslong'), /letter and one number/);
  assert.throws(() => validateNewPassword('x'.repeat(80) + '1'), /72 bytes/);
  assert.throws(() => validateNewPassword('HB-G1-001-pass1', { forbid: ['hb-g1-001'] }), /must not contain/);
  assert.equal(validateNewPassword('Correct-horse-9'), 'Correct-horse-9');
});
test('parseCookies', () => {
  assert.deepEqual(parseCookies('a=1; b=hello%20world; a=2'), { a: '1', b: 'hello world' });
  assert.deepEqual(parseCookies(undefined), {});
});
