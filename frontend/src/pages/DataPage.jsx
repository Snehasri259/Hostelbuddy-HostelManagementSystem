import React, { useLayoutEffect, useRef } from 'react';
import { ArrowDownToLine, ArrowRight, BedDouble, Bell, FileText, Megaphone, Search, ShieldCheck, X } from 'lucide-react';
import { Empty, OutpassSteps, Pager, Person, Skeleton, Status, cap, fmt, fmtDT, usePaged } from '../components/ui.jsx';

const TITLES = {
  students: 'Student directory', rooms: 'Rooms & beds', allocations: 'Allocation history', complaints: 'Complaint register',
  notices: 'Campus notices', guardians: 'Parents & guardians', visitors: 'Visitor requests', outpasses: 'Outpass register', notifications: 'Your notifications',
};

const EMPTY = {
  students: ['Add a student', 'No students yet. Add one and a set-password link is created for them.', 'student'],
  rooms: ['Add a room', 'No rooms yet. Create a room and its beds appear automatically.', 'room'],
  allocations: ['Allocate a bed', 'No allocations yet. Pick a student and an eligible bed.', 'allocation'],
  complaints: ['Submit a complaint', 'Nothing reported yet. Describe an issue and the warden will respond.', 'complaint'],
  notices: ['Create a notice', 'No notices yet. Share an update with a block or the whole hostel.', 'notice'],
  guardians: ['Add a parent / guardian', 'No parent details yet. Add them so visitors can be verified.', 'guardian'],
  visitors: ['Request a visitor', 'No visitor requests yet. Ask for approval before someone visits.', 'visitor'],
  outpasses: ['Request an outpass', 'No outpass requests yet. Apply before you leave the hostel.', 'outpass'],
};
const CAN_CREATE = { students: 'staff', rooms: 'staff', allocations: 'staff', complaints: 'student', notices: 'staff', guardians: 'all', visitors: 'all', outpasses: 'all' };

const Th = ({ children }) => <th scope="col">{children}</th>;

function Actions({ children }) { return <div className="inline-actions">{children}</div>; }

export default function DataPage({ page, rows, user, isStaff, isAdmin, query, setQuery, act, onOpen, onExport, loading }) {
  const needle = query.trim().toLowerCase();
  const filtered = needle ? rows.filter((r) => Object.values(r).some((v) => v != null && String(v).toLowerCase().includes(needle))) : rows;
  const { page: pg, pages, setPage, slice } = usePaged(filtered, `${page}|${needle}`);
  const isStudent = !isStaff;
  const wrap = useRef(null);
  // Copy each column heading onto its cells so phones can show "label: value" cards instead of sideways-scrolling tables.
  useLayoutEffect(() => {
    wrap.current?.querySelectorAll('table').forEach((t) => {
      const heads = [...t.querySelectorAll('thead th')].map((h) => h.textContent);
      t.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => td.setAttribute('data-label', heads[i] || '')));
    });
  });

  return (
    <section className="panel data-panel">
      <div className="panel-head list-head">
        <div>
          <span className="eyebrow">HOSTELBUDDY RECORDS</span>
          <h3>{TITLES[page]} <span className="count-bubble">{filtered.length}</span></h3>
        </div>
        <div className="table-tools">
          {page !== 'notifications' && (
            <label className="search-box">
              <Search size={16} aria-hidden="true" /><span className="sr-only">Search records</span>
              <input placeholder="Search records…" value={query} maxLength={80} onChange={(e) => setQuery(e.target.value)} />
              {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}
            </label>
          )}
          {page === 'allocations' && isStaff && <button className="secondary-btn" onClick={onExport}><ArrowDownToLine size={15} /> Export CSV</button>}
          {page === 'notifications' && rows.some((r) => !r.is_read) && <button className="secondary-btn" onClick={() => act('readAll')}>Mark all read</button>}
        </div>
      </div>

      <div className="table-wrap" ref={wrap}>
        {page === 'students' && (
          <table><thead><tr><Th>STUDENT</Th><Th>STUDENT ID</Th><Th>YEAR / DEPARTMENT</Th><Th>ALLOCATION</Th><Th>STATUS</Th>{isAdmin && <Th>ACTION</Th>}</tr></thead>
            <tbody>{slice.map((r) => (
              <tr key={r.id}>
                <td><Person name={r.name} email={r.email} /></td><td className="mono">{r.student_code}</td>
                <td>Year {r.year_of_study} <small className="sub-cell">{r.course}</small></td>
                <td>{r.room_number ? <><b>{r.block_name} · {r.room_number}</b><small className="sub-cell">Bed {r.bed_number}</small></> : 'Not allocated'}</td>
                <td><Status value={r.status} /></td>
                {isAdmin && <td>{r.status === 'ACTIVE' && <button className="mini-btn danger" onClick={() => act('deactivate', r)}>Deactivate</button>}</td>}
              </tr>))}</tbody></table>
        )}
        {page === 'rooms' && (
          <table><thead><tr><Th>ROOM</Th><Th>BLOCK / FLOOR</Th><Th>BED OCCUPANCY</Th><Th>STATUS</Th><Th>ACTION</Th></tr></thead>
            <tbody>{slice.map((r) => (
              <tr key={r.id}>
                <td><div className="room-name"><span><BedDouble size={18} /></span><b>{r.room_number}</b></div></td>
                <td>Block {r.block_name}<small className="sub-cell">Floor {r.floor_number}</small></td>
                <td><div className="bed-meter"><span>{r.occupied || 0} / {r.beds || r.capacity} beds</span><i><b style={{ width: `${Math.min(100, (100 * (r.occupied || 0)) / (r.beds || r.capacity || 1))}%` }} /></i></div></td>
                <td><Status value={r.status} /></td>
                <td>{r.occupied < r.beds && r.status === 'AVAILABLE' && <button className="mini-btn" onClick={() => onOpen({ type: 'allocation', room: r })}>Allocate bed <ArrowRight size={14} /></button>}</td>
              </tr>))}</tbody></table>
        )}
        {page === 'allocations' && (
          <table><thead><tr><Th>STUDENT</Th><Th>BLOCK / ROOM</Th><Th>BED</Th><Th>START DATE</Th><Th>END DATE</Th><Th>STATUS</Th>{isStaff && <Th>ACTION</Th>}</tr></thead>
            <tbody>{slice.map((r) => (
              <tr key={r.allocation_id}>
                <td><Person name={r.student_name} email={r.student_code} /></td><td>Block {r.block_code} · {r.room_number}</td><td>{r.bed_number}</td>
                <td>{fmt(r.allocation_start)}</td><td>{fmt(r.allocation_end)}</td><td><Status value={r.allocation_status} /></td>
                {isStaff && <td>{r.allocation_status === 'ACTIVE' && <Actions><button className="mini-btn" onClick={() => onOpen({ type: 'transfer', record: r })}>Move</button><button className="mini-btn" onClick={() => act('checkout', r)}>Check out</button></Actions>}</td>}
              </tr>))}</tbody></table>
        )}
        {page === 'complaints' && (
          <table><thead><tr><Th>ISSUE</Th><Th>REPORTED BY</Th><Th>PRIORITY</Th><Th>DATE</Th><Th>STATUS</Th>{isStaff && <Th>UPDATE</Th>}</tr></thead>
            <tbody>{slice.map((r) => (
              <tr key={r.id}>
                <td><b>{r.subject}</b><small className="sub-cell issue-description">{cap(r.category)} · {r.description}</small>{r.response && <small className="response-text">Response: {r.response}</small>}</td>
                <td>{r.student_name || '—'}<small className="sub-cell">{r.student_code}</small></td>
                <td><Status value={r.priority} /></td><td>{fmt(r.created_at)}</td><td><Status value={r.status} /></td>
                {isStaff && <td><button className="mini-btn" onClick={() => onOpen({ type: 'respond', record: r })}>Respond</button></td>}
              </tr>))}</tbody></table>
        )}
        {page === 'notices' && (
          <div className="cards-list">{slice.map((r) => (
            <article className="notice-card" key={r.id}>
              <div className="notice-icon n0"><Megaphone size={18} /></div>
              <div>
                <div className="notice-card-meta"><span>{r.audience === 'BLOCK' ? `Block ${r.block_code}` : 'All hostel'}</span><span>{fmt(r.created_at)}</span></div>
                <h4>{r.title}</h4><p>{r.body}</p><small>Posted by {r.author_name || 'Hostel administration'}</small>
                {isStaff && (isAdmin || r.audience === 'BLOCK') && <div style={{ marginTop: 10 }}><button className="mini-btn danger" onClick={() => act('removeNotice', r)}>Remove</button></div>}
              </div>
            </article>))}</div>
        )}
        {page === 'guardians' && (
          <table><thead><tr><Th>PARENT / GUARDIAN</Th><Th>STUDENT</Th><Th>CONTACT</Th><Th>SUBMITTED</Th><Th>STATUS</Th>{isStaff && <Th>VERIFY</Th>}</tr></thead>
            <tbody>{slice.map((r) => (
              <tr key={r.id}>
                <td><b>{r.full_name}</b><small className="sub-cell">{r.relationship}</small></td><td>{r.student_name}<small className="sub-cell">{r.student_code}</small></td>
                <td>{r.phone}<small className="sub-cell">{r.email || 'No email provided'}</small></td><td>{fmt(r.created_at)}</td><td><Status value={r.verification_status} /></td>
                {isStaff && <td>{r.verification_status === 'PENDING' && <Actions><button className="approve-btn" onClick={() => act('guardian', r, 'VERIFIED')}>Verify</button><button className="reject-btn" onClick={() => act('guardian', r, 'REJECTED')}>Reject</button></Actions>}</td>}
              </tr>))}</tbody></table>
        )}
        {page === 'visitors' && (
          <table><thead><tr><Th>VISITOR</Th><Th>VISITING</Th><Th>PURPOSE</Th><Th>VISIT TIME</Th><Th>STATUS</Th><Th>ACTION</Th></tr></thead>
            <tbody>{slice.map((r) => (
              <tr key={r.id}>
                <td><b>{r.visitor_name}</b><small className="sub-cell">{r.visitor_phone}</small></td><td>{r.student_name}<small className="sub-cell">{r.student_code} · Block {r.block_code}</small></td>
                <td>{r.purpose}</td><td>{fmtDT(r.visit_start)}</td><td><Status value={r.status} /></td>
                <td>
                  {isStaff && r.status === 'PENDING' && <Actions><button className="approve-btn" onClick={() => act('visitor', r, 'APPROVED')}>Approve</button><button className="reject-btn" onClick={() => act('visitor', r, 'REJECTED')}>Reject</button></Actions>}
                  {isStaff && r.status === 'APPROVED' && <button className="mini-btn" onClick={() => act('visitor', r, 'COMPLETED')}>Mark completed</button>}
                  {isStudent && ['PENDING', 'APPROVED'].includes(r.status) && <button className="mini-btn danger" onClick={() => act('cancelVisitor', r)}>Cancel</button>}
                </td>
              </tr>))}</tbody></table>
        )}
        {page === 'outpasses' && (
          <table><thead><tr><Th>STUDENT</Th><Th>DESTINATION / REASON</Th><Th>DEPARTURE</Th><Th>RETURN BY</Th><Th>STATUS</Th><Th>ACTION</Th></tr></thead>
            <tbody>{slice.map((r) => (
              <tr key={r.id}>
                <td><Person name={r.student_name} email={r.student_code} /></td><td><b>{r.destination}</b><small className="sub-cell">{r.reason}</small></td>
                <td>{fmtDT(r.departure_time)}</td><td>{fmtDT(r.expected_return_time)}</td><td><Status value={r.status} /><OutpassSteps status={r.status} />{r.pass_code && ['APPROVED', 'OUT', 'OVERDUE'].includes(r.status) && <small className="gate-code">Gate code <b>{r.pass_code}</b></small>}</td>
                <td>
                  {isStaff && r.status === 'PENDING' && <Actions><button className="approve-btn" onClick={() => act('outpass', r, 'APPROVED')}>Approve</button><button className="reject-btn" onClick={() => act('outpass', r, 'REJECTED')}>Reject</button></Actions>}
                  {isStaff && r.status === 'APPROVED' && <button className="mini-btn" onClick={() => act('outpass', r, 'OUT')}>Mark departed</button>}
                  {isStaff && ['OUT', 'OVERDUE'].includes(r.status) && <button className="mini-btn" onClick={() => act('outpass', r, 'RETURNED')}>Mark returned</button>}
                  {isStudent && ['PENDING', 'APPROVED'].includes(r.status) && <button className="mini-btn danger" onClick={() => act('cancelOutpass', r)}>Cancel</button>}
                </td>
              </tr>))}</tbody></table>
        )}
        {page === 'notifications' && (
          <div className="notification-list">{slice.map((r) => (
            <article className={`full-notification ${r.is_read ? '' : 'unread'}`} key={r.id}>
              <span className="notification-symbol"><Bell size={17} /></span>
              <div><b>{r.title}</b><p>{r.message}</p><small>{fmtDT(r.created_at)}</small></div>
              {!r.is_read && <button className="mini-btn" onClick={() => act('read', r)}>Mark read</button>}
            </article>))}</div>
        )}
        {loading && rows.length === 0 && <Skeleton />}
        {!loading && filtered.length === 0 && (() => {
          const e = EMPTY[page]; const who = CAN_CREATE[page];
          const canCreate = e && !query && (who === 'all' || (who === 'staff' && isStaff) || (who === 'student' && isStudent));
          return <Empty icon={FileText} title={query ? 'No matching records' : 'Nothing here yet'} text={query ? 'Try another search term.' : (e?.[1] || 'When there are records, they will appear here.')}
            action={canCreate ? { label: e[0], onClick: () => onOpen({ type: e[2] }) } : undefined} />;
        })()}
      </div>
      <Pager page={pg} pages={pages} setPage={setPage} total={filtered.length} />
      <div className="table-footer">
        <span>Showing <b>{slice.length}</b> of <b>{filtered.length}</b> record{filtered.length === 1 ? '' : 's'}</span>
        <span><ShieldCheck size={14} /> Access filtered by your role</span>
      </div>
    </section>
  );
}
