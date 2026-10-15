import test from 'node:test';
import assert from 'node:assert/strict';
import { BOY_FIRST, GIRL_FIRST, SURNAMES, MALE_ADULT, FEMALE_ADULT, STAFF, studentName, parentNames, visitorFor, demoPassCode } from '../src/scripts/names.js';

test('boy and girl first-name lists never overlap and have no duplicates', () => {
  assert.equal(new Set(BOY_FIRST).size, BOY_FIRST.length);
  assert.equal(new Set(GIRL_FIRST).size, GIRL_FIRST.length);
  assert.deepEqual(BOY_FIRST.filter((n) => GIRL_FIRST.includes(n)), []);
  assert.deepEqual(MALE_ADULT.filter((n) => FEMALE_ADULT.includes(n)), []);
  assert.deepEqual(MALE_ADULT.filter((n) => GIRL_FIRST.includes(n)), []);
});
test('surnames contain no female-coded words', () => {
  for (const bad of ['Devi', 'Kumari', 'Lakshmi', 'Rani', 'Bai']) assert.ok(!SURNAMES.includes(bad), bad);
});
test('400 boys and 400 girls get unique names from the right list', () => {
  for (const [g, list] of [['BOY', BOY_FIRST], ['GIRL', GIRL_FIRST]]) {
    const names = Array.from({ length: 400 }, (_, i) => studentName(g, i));
    assert.equal(new Set(names).size, 400);
    for (const n of names) assert.ok(list.includes(n.split(' ')[0]), n);
  }
});
test('father is male, mother is female, same surname as student', () => {
  for (let i = 0; i < 200; i++) {
    const { father, mother } = parentNames(studentName(i % 2 ? 'BOY' : 'GIRL', i), i);
    assert.ok(MALE_ADULT.includes(father.split(' ')[0]), father);
    assert.ok(FEMALE_ADULT.includes(mother.split(' ')[0]), mother);
    assert.equal(father.split(' ')[1], mother.split(' ')[1]);
  }
});
test('visitor names match their relationship', () => {
  for (let i = 0; i < 120; i++) {
    const v = visitorFor('Aarav Reddy', i); const first = v.name.split(' ')[0];
    if (['Father', 'Uncle'].includes(v.rel)) assert.ok(MALE_ADULT.includes(first), v.rel + first);
    if (['Mother', 'Aunt'].includes(v.rel)) assert.ok(FEMALE_ADULT.includes(first), v.rel + first);
    if (v.rel === 'Brother') assert.ok(BOY_FIRST.includes(first));
    if (v.rel === 'Sister') assert.ok(GIRL_FIRST.includes(first));
  }
});
test('staff: girls-block wardens and female admin have female names, boys-block wardens and male admin male names', () => {
  const female = new Set([...GIRL_FIRST, ...FEMALE_ADULT]); const male = new Set([...BOY_FIRST, ...MALE_ADULT, 'Ravindra', 'Satyanarayana', 'Venkatesh']);
  for (const c of ['W-G-A', 'W-G-B', 'W-G-C', 'W-G-D']) assert.ok(female.has(STAFF.wardens[c].split(' ')[0]), c);
  for (const c of ['W-B-E', 'W-B-F']) assert.ok(male.has(STAFF.wardens[c].split(' ')[0]), c);
  assert.ok(female.has(STAFF.admins['ADM-F-01'].split(' ')[0])); assert.ok(male.has(STAFF.admins['ADM-M-01'].split(' ')[0]));
});
test('pass codes are 8 unambiguous characters and mostly unique', () => {
  const codes = new Set(Array.from({ length: 500 }, (_, i) => demoPassCode(i + 1)));
  assert.ok(codes.size > 495);
  for (const c of codes) assert.match(c, /^[A-HJKMNP-Z2-9]{8}$/);
});
