import React, { useState } from 'react';
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { cap, fmt, fmtDT, initials } from '../components/ui.jsx';

function Row({ label, value }) {
  return <><dt>{label}</dt><dd>{value || '—'}</dd></>;
}

export default function Profile({ user, info, onSignOut }) {
  const p = info?.profile || {};
  const a = p.allocation;
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [msg, setMsg] = useState({ ok: false, text: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const change = async (e) => {
    e.preventDefault();
    if (form.next !== form.again) { setMsg({ ok: false, text: 'The new passwords do not match.' }); return; }
    setBusy(true); setMsg({ ok: false, text: '' });
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: form.current, newPassword: form.next } });
      setForm({ current: '', next: '', again: '' });
      setMsg({ ok: true, text: 'Password changed. Other devices have been signed out.' });
    } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };

  return (
    <div className="profile-grid">
      <section className="panel profile-card">
        <div className="profile-hero">
          <div className="profile-avatar" aria-hidden="true">{initials(user.full_name)}</div>
          <div>
            <h2>{user.full_name}</h2>
            <p>{user.email}</p>
            <span className="status-pill status-active"><i />{cap(user.role_code)}{user.block_code ? ` · Block ${user.block_code}` : ''}</span>
          </div>
        </div>
        <dl className="alloc-grid profile-details">
          {user.role_code === 'STUDENT' && <>
            <Row label="Student ID" value={p.student_code} />
            <Row label="Year / Department" value={p.btech_year ? `Year ${p.btech_year} · ${p.department}` : ''} />
            <Row label="Gender" value={cap(p.gender)} />
            <Row label="Phone" value={p.phone} />
            <Row label="Room" value={a ? `Block ${a.block_code} · Room ${a.room_number} · Bed ${a.bed_number} (Floor ${a.floor_number})` : 'Not allocated yet'} />
            {a && <Row label="Staying since" value={fmt(a.allocation_start)} />}
          </>}
          {user.role_code === 'WARDEN' && <>
            <Row label="Staff ID" value={p.staff_code} />
            <Row label="Gender" value={cap(p.gender)} />
            <Row label="Assigned block" value={p.block_code ? `Block ${p.block_code} — ${p.block_name}` : ''} />
            <Row label="Phone" value={p.phone} />
          </>}
          {user.role_code === 'ADMIN' && <>
            <Row label="Staff ID" value={p.staff_code} />
            <Row label="Gender" value={cap(p.gender)} />
            <Row label="Access" value="Hostel-wide administration" />
            <Row label="Phone" value={p.phone} />
          </>}
          <Row label="Last sign-in" value={info?.last_login_at ? fmtDT(info.last_login_at) : ''} />
        </dl>
        <button className="signout-btn" onClick={onSignOut}><LogOut size={18} /> Sign out</button>
      </section>

      <section className="panel profile-card">
        <div className="panel-head"><div><span className="eyebrow">ACCOUNT SECURITY</span><h3>Change password</h3></div><KeyRound size={20} aria-hidden="true" /></div>
        <form onSubmit={change} className="form-grid single">
          <label className="form-field"><span>Current password</span><input type="password" autoComplete="current-password" required maxLength={72} value={form.current} onChange={set('current')} /></label>
          <label className="form-field"><span>New password</span><input type="password" autoComplete="new-password" required maxLength={72} value={form.next} onChange={set('next')} /></label>
          <label className="form-field"><span>Confirm new password</span><input type="password" autoComplete="new-password" required maxLength={72} value={form.again} onChange={set('again')} /></label>
          <small className="field-hint">At least 10 characters, with a letter and a number.</small>
          {msg.text && <div className={msg.ok ? 'login-success' : 'login-error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</div>}
          <button className="primary-btn" disabled={busy}><ShieldCheck size={16} /> {busy ? 'Saving…' : 'Update password'}</button>
        </form>
      </section>
    </div>
  );
}
