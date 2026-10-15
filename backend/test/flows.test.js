import test from 'node:test';
import assert from 'node:assert/strict';
import { OUTPASS_FLOW, VISITOR_FLOW, assertTransition, nextGateAction, newGateCode, GATE_CODE_RE } from '../src/services/flows.js';

test('valid outpass transitions pass', () => {
  assertTransition(OUTPASS_FLOW, 'PENDING', 'APPROVED', 'outpass');
  assertTransition(OUTPASS_FLOW, 'APPROVED', 'OUT', 'outpass');
  assertTransition(OUTPASS_FLOW, 'OUT', 'RETURNED', 'outpass');
  assertTransition(OUTPASS_FLOW, 'OVERDUE', 'RETURNED', 'outpass');
});
test('invalid transitions are rejected with 409', () => {
  for (const [from, to] of [['RETURNED', 'APPROVED'], ['PENDING', 'OUT'], ['REJECTED', 'APPROVED'], ['APPROVED', 'RETURNED'], ['CANCELLED', 'OUT']]) {
    assert.throws(() => assertTransition(OUTPASS_FLOW, from, to, 'outpass'), (e) => e.status === 409);
  }
  assert.throws(() => assertTransition(VISITOR_FLOW, 'COMPLETED', 'APPROVED', 'visitor request'), (e) => e.status === 409);
  assert.throws(() => assertTransition(VISITOR_FLOW, 'PENDING', 'COMPLETED', 'visitor request'), (e) => e.status === 409);
});
test('gate next action', () => {
  assert.equal(nextGateAction('APPROVED'), 'OUT');
  assert.equal(nextGateAction('OUT'), 'RETURNED');
  assert.equal(nextGateAction('OVERDUE'), 'RETURNED');
  for (const s of ['PENDING', 'REJECTED', 'RETURNED', 'CANCELLED']) assert.equal(nextGateAction(s), null);
});
test('generated gate codes are well-formed and different', () => {
  const set = new Set(Array.from({ length: 300 }, newGateCode));
  assert.ok(set.size > 295);
  for (const c of set) assert.match(c, GATE_CODE_RE);
});
