import React, { useEffect, useRef, useState } from 'react';
import { DoorOpen, Send, X } from 'lucide-react';
import { api } from '../api.js';
import { Status, cap, fmtDT, localToIso } from '../components/ui.jsx';

const TITLES = { student: 'Add a student', room: 'Add a room', notice: 'Create a notice', complaint: 'Submit a complaint', guardian: 'Register a parent / guardian', visitor: 'Request a visitor', outpass: 'Request an outpass', allocation: 'Allocate a bed', transfer: 'Move student to another bed', gate: 'Gate check', respond: 'Respond to complaint' };
const NEEDS_STUDENT = ['guardian', 'visitor', 'outpass', 'allocation'];
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'your device time zone';
const GATE_LABEL = { OUT: 'Mark departed', RETURNED: 'Mark returned' };

export default function Modal({ modal, user, blocks, onClose, onSubmit }) {
  const { type } = modal;
  const isStaff = user.role_code !== 'STUDENT';
  const [form, setForm] = useState(type === 'respond' ? { status: modal.record.status, response: modal.record.response || '' } : {});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [students, setStudents] = useState([]);
  const [beds, setBeds] = useState([]);
  const [result, setResult] = useState(null);
  const [gate, setGate] = useState({ code: '', found: null });
  const box = useRef(null);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => { box.current?.querySelector('input,select,textarea')?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !box.current) return;
      const f = [...box.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    if (isStaff && NEEDS_STUDENT.includes(type)) api('/students').then((r) => setStudents(r.filter((s) => s.status === 'ACTIVE'))).catch((e) => setError(e.message));
  }, [type, isStaff]);
  useEffect(() => {
    const sid = type === 'transfer' ? modal.record.student_id : form.student_id;
    if (!['allocation', 'transfer'].includes(type) || !sid) { setBeds([]); return; }
    api(`/beds?available=1&student_id=${encodeURIComponent(sid)}`).then((r) => setBeds(modal.room ? r.filter((b) => b.room_number === modal.room.room_number && b.block_code === modal.room.block_name) : r)).catch((e) => setError(e.message));
  }, [type, form.student_id, modal.room, modal.record]);

  const blockOpts = (blocks || []).map((b) => ({ value: b.block_id, label: `Block ${b.block_code} — ${b.block_name}` }));
  const studentOpts = students.map((s) => ({ value: s.id, label: `${s.name} · ${s.student_code}` }));
  const bedOpts = beds.map((b) => ({ value: b.bed_id, label: `Block ${b.block_code} · Room ${b.room_number} · Bed ${b.bed_number}` }));

  const field = (name, label, placeholder = '', o = {}) => {
    const id = `f_${name}`;
    const required = o.required !== false;
    return (
      <label className="form-field" htmlFor={id}>
        <span>{label}{required ? '' : ' (optional)'}</span>
        {o.options ? (
          <select id={id} required={required} value={form[name] ?? ''} onChange={(e) => set(name, e.target.value)}>
            <option value="" disabled>{o.options.length ? `Select ${label.toLowerCase()}` : o.empty || 'No options available'}</option>
            {o.options.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        ) : o.textarea ? (
          <textarea id={id} required={required} placeholder={placeholder} maxLength={o.max || 2000} value={form[name] ?? ''} onChange={(e) => set(name, e.target.value)} />
        ) : (
          <input id={id} required={required} type={o.type || 'text'} placeholder={placeholder} maxLength={o.max || 160} min={o.min} max={o.type === 'number' ? o.maxN : undefined} value={form[name] ?? ''} onChange={(e) => set(name, e.target.value)} />
        )}
      </label>
    );
  };

  const lookup = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { setGate((g) => ({ ...g, found: null })); const r = await api('/outpasses/gate', { method: 'POST', body: { code: gate.code } }); setGate((g) => ({ ...g, found: r })); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const confirmGate = async () => {
    setError(''); setBusy(true);
    try { await onSubmit(`/outpasses/${gate.found.id}/decision`, { status: gate.found.next_action }, 'PATCH'); onClose(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const send = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      let path = ''; let method = 'POST'; let body = { ...form };
      if (type === 'student') { path = '/students'; body.btech_year = Number(body.btech_year); }
      if (type === 'room') { path = '/rooms'; body.block_id = Number(body.block_id || user.block_id); body.floor_number = Number(body.floor_number || 0); body.capacity = Number(body.capacity || 4); }
      if (type === 'notice') { path = '/notices'; if (user.role_code === 'WARDEN') { body.audience = 'BLOCK'; body.block_id = user.block_id; } else if (body.audience === 'BLOCK') body.block_id = Number(body.block_id); }
      if (type === 'complaint') path = '/complaints';
      if (type === 'guardian') path = '/guardians';
      if (type === 'visitor') { path = '/visitors'; body.visit_start = localToIso(body.visit_start); body.visit_end = localToIso(body.visit_end); }
      if (type === 'outpass') { path = '/outpasses'; body.departure_time = localToIso(body.departure_time); body.expected_return_time = localToIso(body.expected_return_time); }
      if (type === 'allocation') { path = '/allocations'; body = { student_id: Number(form.student_id), bed_id: Number(form.bed_id) }; }
      if (type === 'transfer') { path = '/allocations/transfer'; body = { student_id: Number(modal.record.student_id), bed_id: Number(form.bed_id) }; }
      if (type === 'respond') { path = `/complaints/${modal.record.id}`; method = 'PATCH'; }
      if (isStaff && NEEDS_STUDENT.includes(type) && body.student_id) body.student_id = Number(body.student_id);
      const r = await onSubmit(path, body, method);
      if (r?.inviteLink) setResult(r); else onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const studentField = isStaff && NEEDS_STUDENT.includes(type) && field('student_id', 'Student', '', { options: studentOpts, empty: 'Loading students…' });

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={box}>
        <div className="modal-head">
          <div><span className="eyebrow">HOSTELBUDDY WORKSPACE</span><h3 id="modal-title">{TITLES[type]}</h3></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        {type === 'gate' ? (
          <div className="gate-box">
            <form onSubmit={lookup} className="gate-form">
              <label className="form-field" htmlFor="gate_code"><span>8-character gate code</span>
                <input id="gate_code" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="e.g. K7M2QX9P" maxLength={16} value={gate.code} onChange={(e) => setGate({ code: e.target.value.toUpperCase(), found: null })} className="mono-input" required />
              </label>
              <button className="primary-btn" disabled={busy || gate.code.trim().length < 8}><DoorOpen size={16} /> {busy && !gate.found ? 'Checking…' : 'Look up'}</button>
            </form>
            {gate.found && (
              <div className="gate-result" role="status">
                <div className="gate-result-head"><div><b>{gate.found.student_name}</b><small>{gate.found.student_code} · Block {gate.found.block_code}</small></div><Status value={gate.found.status} /></div>
                <dl className="alloc-grid"><dt>Destination</dt><dd>{gate.found.destination}</dd><dt>Reason</dt><dd>{gate.found.reason}</dd><dt>Leaves</dt><dd>{fmtDT(gate.found.departure_time)}</dd><dt>Back by</dt><dd>{fmtDT(gate.found.expected_return_time)}</dd></dl>
                {gate.found.next_action
                  ? <button className="primary-btn" onClick={confirmGate} disabled={busy}>{GATE_LABEL[gate.found.next_action]}</button>
                  : <p className="field-hint">Nothing to do: this outpass is {cap(gate.found.status).toLowerCase()}.</p>}
              </div>
            )}
            {error && <div className="login-error" role="alert">{error}</div>}
          </div>
        ) : result ? (
          <div style={{ padding: 22 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{result.message}</p>
            <div className="copy-box"><input readOnly value={result.inviteLink} onFocus={(e) => e.target.select()} aria-label="One-time set-password link" /><button className="secondary-btn" type="button" onClick={() => navigator.clipboard?.writeText(result.inviteLink)}>Copy</button></div>
            <small className="field-hint">The link works once and expires in 72 hours. It is not stored anywhere you can see it again.</small>
            <div className="modal-actions"><button className="primary-btn" onClick={onClose}>Done</button></div>
          </div>
        ) : (
          <form onSubmit={send}>
            <div className="form-grid">
              {type === 'student' && <>{field('student_code', 'Student ID', 'HB-G1-101', { max: 24 })}{field('full_name', 'Full name', 'Student full name', { max: 120 })}{field('email', 'Email address', 'student@college.edu', { type: 'email' })}{field('phone', 'Phone number', '9876543210', { type: 'tel', required: false, max: 20 })}{field('gender', 'Gender', '', { options: [{ value: 'GIRL', label: 'Girl' }, { value: 'BOY', label: 'Boy' }] })}{field('btech_year', 'B.Tech year', '', { options: [1, 2, 3, 4].map((x) => ({ value: x, label: `Year ${x}` })) })}{field('department', 'Department', 'CSE', { max: 20 })}</>}
              {type === 'room' && <>{user.role_code === 'ADMIN' ? field('block_id', 'Block', '', { options: blockOpts }) : null}{field('room_number', 'Room number', 'A201', { max: 12 })}{field('floor_number', 'Floor number', '1', { type: 'number', min: 0, maxN: 50 })}{field('capacity', 'Bed capacity', '4', { type: 'number', min: 1, maxN: 24 })}</>}
              {type === 'notice' && <>{field('title', 'Notice title', 'e.g. Water maintenance', { max: 180 })}{user.role_code === 'ADMIN' && field('audience', 'Audience', '', { options: [{ value: 'ALL', label: 'All hostel blocks' }, { value: 'BLOCK', label: 'One block' }] })}{user.role_code === 'ADMIN' && form.audience === 'BLOCK' && field('block_id', 'Block', '', { options: blockOpts })}{field('body', 'Message', 'Write the notice…', { textarea: true, max: 4000 })}{user.role_code === 'WARDEN' && <small className="field-hint">This notice will be sent to residents of your block.</small>}</>}
              {type === 'complaint' && <>{field('subject', 'Subject', 'What needs attention?', { max: 180 })}{field('category', 'Category', '', { options: ['MAINTENANCE', 'CLEANLINESS', 'ELECTRICAL', 'WATER', 'INTERNET', 'SAFETY', 'OTHER'].map((x) => ({ value: x, label: cap(x) })) })}{field('priority', 'Priority', '', { options: ['LOW', 'MEDIUM', 'HIGH'].map((x) => ({ value: x, label: cap(x) })) })}{field('description', 'Describe the issue', 'Add useful details…', { textarea: true, max: 4000 })}</>}
              {type === 'guardian' && <>{studentField}{field('full_name', 'Parent / guardian name', 'Full name', { max: 120 })}{field('relationship', 'Relationship', 'Mother, father, guardian…', { max: 40 })}{field('phone', 'Phone number', 'Mobile number', { type: 'tel', max: 20 })}{field('email', 'Email address', 'name@example.com', { type: 'email', required: false })}</>}
              {type === 'visitor' && <>{studentField}{field('visitor_name', 'Visitor name', 'Full name', { max: 120 })}{field('visitor_phone', 'Visitor phone', 'Mobile number', { type: 'tel', max: 20 })}{field('purpose', 'Purpose of visit', 'Why are they visiting?', { max: 500 })}{field('visit_start', 'Visit date & time', '', { type: 'datetime-local' })}{field('visit_end', 'Expected end', '', { type: 'datetime-local', required: false })}<small className="field-hint wide">Times use your device time zone ({TZ}).</small></>}
              {type === 'outpass' && <>{studentField}{field('reason', 'Reason for outing', 'Reason', { max: 500 })}{field('destination', 'Destination', 'Where are you going?', { max: 250 })}{field('departure_time', 'Departure date & time', '', { type: 'datetime-local' })}{field('expected_return_time', 'Expected return', '', { type: 'datetime-local' })}<small className="field-hint wide">Times use your device time zone ({TZ}). A gate code is created when the outpass is approved.</small></>}
              {type === 'allocation' && <>{studentField}{field('bed_id', 'Available bed', '', { options: bedOpts, empty: form.student_id ? 'No eligible beds available' : 'Choose a student first' })}</>}
              {type === 'transfer' && <>
                <div className="transfer-summary wide"><span>Moving</span><b>{modal.record.student_name}</b><small>Currently Block {modal.record.block_code} · Room {modal.record.room_number} · Bed {modal.record.bed_number}</small></div>
                {field('bed_id', 'New bed', '', { options: bedOpts, empty: 'No eligible beds available' })}
                <small className="field-hint wide">The old allocation is closed and kept in history. The student is notified.</small>
              </>}
              {type === 'respond' && <>{field('status', 'Status', '', { options: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'].map((x) => ({ value: x, label: cap(x) })) })}{field('response', 'Response to student', 'Share an update…', { textarea: true, required: false, max: 2000 })}</>}
            </div>
            {error && <div className="login-error" role="alert">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={onClose}>Cancel</button>
              <button className="primary-btn" disabled={busy}><Send size={15} /> {busy ? 'Saving…' : 'Save record'}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
