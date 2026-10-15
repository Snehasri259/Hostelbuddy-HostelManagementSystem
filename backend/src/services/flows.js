import crypto from 'node:crypto';
import { conflict } from '../utils.js';

/** Allowed status transitions: from -> [to...]. Anything else is rejected with 409. */
export const VISITOR_FLOW = { PENDING: ['APPROVED', 'REJECTED'], APPROVED: ['COMPLETED'] };
export const OUTPASS_FLOW = { PENDING: ['APPROVED', 'REJECTED'], APPROVED: ['OUT'], OUT: ['RETURNED'], OVERDUE: ['RETURNED'] };

export const lower = (s) => String(s).replaceAll('_', ' ').toLowerCase();

export function assertTransition(flow, from, to, label) {
  if (!flow[from]?.includes(to)) throw conflict(`A ${label} that is ${lower(from)} cannot be marked ${lower(to)}.`);
}

/** What the gate should do next for an outpass in this status (null = nothing). */
export const nextGateAction = (status) => (status === 'APPROVED' ? 'OUT' : ['OUT', 'OVERDUE'].includes(status) ? 'RETURNED' : null);

export const GATE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1
export const GATE_CODE_RE = /^[A-HJKMNP-Z2-9]{8}$/;
export function newGateCode() {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => GATE_CODE_ALPHABET[b % GATE_CODE_ALPHABET.length]).join('');
}
