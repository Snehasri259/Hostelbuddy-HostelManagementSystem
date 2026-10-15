import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Date or timestamp -> "13 Oct 2026". DATE columns arrive as plain strings and are never shifted by time zone. */
export const fmt = (d) => {
  if (!d) return '—';
  const v = DATE_ONLY.test(d) ? new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) : new Date(d);
  return Number.isNaN(v.getTime()) ? '—' : v.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const fmtDT = (d) => {
  if (!d) return '—';
  const v = new Date(d);
  return Number.isNaN(v.getTime()) ? '—' : v.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
export const cap = (s) => String(s ?? '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
export const initials = (name) => String(name || 'U').split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
/** <input type="datetime-local"> value -> ISO string (UTC) so the server never has to guess the browser's time zone. */
export const localToIso = (v) => (v ? new Date(v).toISOString() : null);

export function Person({ name, email }) {
  return (
    <div className="person-cell">
      <div className="person-avatar" aria-hidden="true">{initials(name)}</div>
      <div><b>{name || '—'}</b><small>{email || '—'}</small></div>
    </div>
  );
}

export function Status({ value }) {
  const v = String(value || 'UNKNOWN');
  return <span className={`status-pill status-${v.toLowerCase().replaceAll('_', '-')}`}><i />{cap(v)}</span>;
}

export function Empty({ icon: Icon = FileText, title, text, action }) {
  return (
    <div className="empty-state">
      <span><Icon size={21} /></span>
      <b>{title}</b>
      <p>{text}</p>
      {action && <button className="primary-btn" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

const STEPS = ['Requested', 'Approved', 'Out', 'Returned'];
const STEP_INDEX = { PENDING: 0, APPROVED: 1, OUT: 2, OVERDUE: 2, RETURNED: 3 };
/** Mini progress tracker for an outpass (hidden for rejected / cancelled). */
export function OutpassSteps({ status }) {
  const idx = STEP_INDEX[status];
  if (idx === undefined) return null;
  return (
    <ol className="steps" aria-label={`Outpass progress: ${cap(status)}`}>
      {STEPS.map((label, i) => (
        <li key={label} className={status === 'RETURNED' || i < idx ? 'done' : i === idx ? (status === 'OVERDUE' ? 'late' : 'now') : ''}><i /><span>{label}</span></li>
      ))}
    </ol>
  );
}

export function Skeleton({ rows = 5 }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => <div className="skeleton-row" key={i}><i /><i /><i /></div>)}
    </div>
  );
}

export const PAGE_SIZE = 25;

/** Client-side pagination so large lists (800 students) stay fast. */
export function usePaged(rows, resetKey) {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [resetKey, rows.length]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safe = Math.min(page, pages - 1);
  return { page: safe, pages, setPage, slice: rows.slice(safe * PAGE_SIZE, safe * PAGE_SIZE + PAGE_SIZE) };
}

export function Pager({ page, pages, setPage, total }) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="pager" role="navigation" aria-label="Pagination">
      <button className="mini-btn" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={14} /> Prev</button>
      <span>Page <b>{page + 1}</b> of {pages}</span>
      <button className="mini-btn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page">Next <ChevronRight size={14} /></button>
    </div>
  );
}
