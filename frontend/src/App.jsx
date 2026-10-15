import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BedDouble, Building2, CalendarClock, CheckCircle2, ChevronDown, DoorOpen, HeartHandshake, LayoutDashboard, LogOut, Menu, Megaphone, MessageCircleWarning, Plus, ShieldCheck, User, UserRoundCheck, Users, X } from 'lucide-react';
import { api, setUnauthorizedHandler } from './api.js';
import { cap, initials } from './components/ui.jsx';
import { ForcePasswordChange, Login, ResetPassword } from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DataPage from './pages/DataPage.jsx';
import Modal from './pages/Modal.jsx';
import Profile from './pages/Profile.jsx';
import Splash, { SPLASH_MS } from './components/Splash.jsx';

const NAV = [
  ['dashboard', 'Overview', LayoutDashboard, 'all'],
  ['students', 'Students', Users, 'staff'],
  ['rooms', 'Rooms & beds', BedDouble, 'staff'],
  ['allocations', 'Allocations', Building2, 'all'],
  ['complaints', 'Complaints', MessageCircleWarning, 'all'],
  ['notices', 'Notices', Megaphone, 'all'],
  ['guardians', 'Parents & guardians', HeartHandshake, 'all'],
  ['visitors', 'Visitors', UserRoundCheck, 'all'],
  ['outpasses', 'Outpasses', CalendarClock, 'all'],
  ['notifications', 'Notifications', Bell, 'all'],
  ['profile', 'My profile', User, 'all'],
];
const DESCRIPTIONS = {
  students: 'A carefully maintained directory of your campus community.',
  rooms: 'Room and bed availability across the permitted blocks.',
  allocations: 'Every room move keeps the previous allocation in history.',
  complaints: 'Track issues from submission through resolution.',
  notices: 'Keep students informed with timely campus updates.',
  guardians: 'Parent and guardian records with transparent verification.',
  visitors: 'Review and track visitor requests and visits.',
  outpasses: 'A clear approval trail for student outings and returns.',
  notifications: 'Updates and decisions, gathered in one place.',
  profile: 'Your details, room and account security.',
};
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; };
const resetTokenFromHash = () => (window.location.hash.match(/^#reset=([a-f0-9]{64})$/) || [])[1] || '';

export default function App() {
  const [resetToken, setResetToken] = useState(resetTokenFromHash);
  const [checking, setChecking] = useState(true);
  const [splashDone, setSplashDone] = useState(false);
  const [user, setUser] = useState(null);
  const [loginNotice, setLoginNotice] = useState('');
  const [page, setPage] = useState('dashboard');
  const [data, setData] = useState({});
  const [dashboard, setDashboard] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  const seq = useRef(0);

  const signedOut = useCallback((notice = '') => { setUser(null); setData({}); setDashboard(null); setModal(null); setMobile(false); setMenu(false); setQuery(''); setError(''); setPage('dashboard'); setLoginNotice(notice); window.scrollTo(0, 0); }, []);
  useEffect(() => { setUnauthorizedHandler(() => signedOut('Your session has ended. Please sign in again.')); }, [signedOut]);

  // Restore the session from the httpOnly cookie.
  useEffect(() => {
    if (resetToken) { setChecking(false); return; }
    api('/auth/me').then((r) => setUser(r.user)).catch(() => {}).finally(() => setChecking(false));
  }, [resetToken]);

  // Keep the branded splash on screen long enough to be seen, even when the session check is instant.
  useEffect(() => { const t = setTimeout(() => setSplashDone(true), SPLASH_MS); return () => clearTimeout(t); }, []);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); } return undefined; }, [toast]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (e.type === 'keydown' ? e.key === 'Escape' : !menuRef.current?.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [menu]);

  const isAdmin = user?.role_code === 'ADMIN';
  const isStaff = isAdmin || user?.role_code === 'WARDEN';
  const needsPassword = Boolean(user?.must_change_password);

  const load = useCallback(async () => {
    if (!user || needsPassword) return;
    const mine = ++seq.current;
    setLoading(true); setError('');
    try {
      if (page === 'dashboard') {
        const [d, complaints, notifications] = await Promise.all([api('/dashboard'), api('/complaints'), api('/notifications')]);
        if (mine !== seq.current) return;
        setDashboard(d); setData((o) => ({ ...o, complaints, notifications }));
      } else if (page === 'profile') {
        const [info, d] = await Promise.all([api('/auth/profile'), api('/dashboard')]);
        if (mine !== seq.current) return;
        setData((o) => ({ ...o, profile: info })); setDashboard(d);
      } else {
        const [rows, d] = await Promise.all([api(`/${page}`), api('/dashboard')]);
        if (mine !== seq.current) return;
        setData((o) => ({ ...o, [page]: rows })); setDashboard(d);
      }
    } catch (e) { if (mine === seq.current) setError(e.message); } finally { if (mine === seq.current) setLoading(false); }
  }, [user, page, needsPassword]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (user && !needsPassword && !blocks.length) api('/blocks').then(setBlocks).catch(() => {}); }, [user, needsPassword, blocks.length]);

  const run = async (fn, success) => {
    setError('');
    try { const r = await fn(); if (success) setToast(typeof success === 'function' ? success(r) : success); await load(); return r; } catch (e) { setError(e.message); return undefined; }
  };

  const submit = async (path, body, method = 'POST') => {
    const r = await api(path, { method, body });
    setToast(r?.inviteLink ? 'Student created' : 'Saved successfully');
    await load();
    return r;
  };

  const act = (kind, row, extra) => {
    switch (kind) {
      case 'checkout': return window.confirm(`Check out ${row.student_name}? Their bed will be released.`) && run(() => api(`/allocations/students/${row.student_id}/checkout`, { method: 'POST', body: {} }), 'Checkout completed');
      case 'deactivate': return window.confirm(`Deactivate ${row.name}? Their login is disabled and any bed is released.`) && run(() => api(`/students/${row.id}`, { method: 'PATCH', body: { status: 'INACTIVE' } }), 'Student deactivated');
      case 'guardian': return run(() => api(`/guardians/${row.id}/verify`, { method: 'PATCH', body: { status: extra } }), 'Status updated');
      case 'visitor': return run(() => api(`/visitors/${row.id}/decision`, { method: 'PATCH', body: { status: extra } }), 'Status updated');
      case 'outpass': return run(() => api(`/outpasses/${row.id}/decision`, { method: 'PATCH', body: { status: extra } }), 'Status updated');
      case 'cancelVisitor': return window.confirm('Cancel this visitor request?') && run(() => api(`/visitors/${row.id}/cancel`, { method: 'PATCH', body: {} }), 'Request cancelled');
      case 'cancelOutpass': return window.confirm('Cancel this outpass?') && run(() => api(`/outpasses/${row.id}/cancel`, { method: 'PATCH', body: {} }), 'Outpass cancelled');
      case 'removeNotice': return window.confirm('Remove this notice for everyone?') && run(() => api(`/notices/${row.id}`, { method: 'DELETE' }), 'Notice removed');
      case 'read': return run(() => api(`/notifications/${row.id}/read`, { method: 'PATCH', body: {} }));
      case 'readAll': return run(() => api('/notifications/read-all', { method: 'POST', body: {} }), 'All caught up');
      default: return undefined;
    }
  };

  const exportCsv = () => run(async () => {
    const res = await api('/reports/allocations.csv', { raw: true });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = 'hostelbuddy-allocations.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const signOut = async () => { try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { /* cookie expires anyway */ } signedOut('You have been signed out.'); };

  if (checking || !splashDone) return <Splash />;
  if (resetToken) return <ResetPassword token={resetToken} onFinished={(msg) => { window.history.replaceState(null, '', window.location.pathname); setResetToken(''); setLoginNotice(msg); }} />;
  if (!user) return <Login onLoggedIn={(u) => { setUser(u); setLoginNotice(''); }} notice={loginNotice} />;
  if (needsPassword) return <ForcePasswordChange user={user} onSignOut={signOut} onDone={() => api('/auth/me').then((r) => setUser(r.user)).catch(() => signedOut())} />;

  const items = NAV.filter(([, , , who]) => who === 'all' || isStaff);
  const active = NAV.find((n) => n[0] === page) || NAV[0];
  const unread = dashboard?.unreadNotifications || 0;
  const addBtn = (type, label) => <button className="primary-btn" onClick={() => setModal({ type })}><Plus size={17} /> {label}</button>;

  return (
    <div className="app-shell">
      <a href="#main-content" className="sr-only">Skip to content</a>
      <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`} aria-label="Primary">
        <div className="brand">
          <img src="/assets/hostelbuddy-logo.jpg" alt="HostelBuddy logo" />
          <div><b>HostelBuddy</b><span>HOSTEL MANAGEMENT</span></div>
          <button className="mobile-close icon-btn" onClick={() => setMobile(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          {items.map(([id, label, Icon]) => (
            <button key={id} className={`nav-item ${page === id ? 'selected' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => { setPage(id); setMobile(false); setError(''); setQuery(''); }}>
              <Icon size={18} /><span>{label}</span>{id === 'notifications' && unread > 0 && <i className="nav-count">{unread}</i>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="profile-row profile-link" onClick={() => { setPage('profile'); setMobile(false); }} aria-label="Open my profile">
            <div className="avatar" aria-hidden="true">{initials(user.full_name)}</div>
            <div className="profile-text"><b>{user.full_name || user.email}</b><span>{cap(user.role_code)}{user.block_code ? ` · Block ${user.block_code}` : ''}</span></div>
          </button>
          <button className="sidebar-signout" onClick={signOut}><LogOut size={18} /> Sign out</button>
        </div>
      </aside>

      <main className="main" id="main-content">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setMobile(!mobile)} aria-label="Open menu" aria-expanded={mobile}><Menu size={20} /></button>
          <div className="crumb"><span>HostelBuddy</span><span className="crumb-slash" aria-hidden="true">/</span><b>{active[1]}</b></div>
          <div className="top-actions">
            <div className="today"><span className="live-dot" /> {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
            <button className="icon-btn notification-btn" onClick={() => setPage('notifications')} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}><Bell size={19} />{unread > 0 && <i />}</button>
            <div className="user-menu" ref={menuRef}>
              <button className="user-menu-btn" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu">
                <span className="top-avatar" aria-hidden="true">{initials(user.full_name)}</span>
                <span className="user-menu-name">{(user.full_name || '').split(' ')[0]}</span><ChevronDown size={15} aria-hidden="true" />
              </button>
              {menu && (
                <div className="menu-pop" role="menu">
                  <div className="menu-head"><b>{user.full_name}</b><span>{user.email}</span><small>{cap(user.role_code)}{user.block_code ? ` · Block ${user.block_code}` : ''}</small></div>
                  <button role="menuitem" onClick={() => { setPage('profile'); setMenu(false); }}><User size={16} /> My profile</button>
                  <button role="menuitem" className="menu-danger" onClick={signOut}><LogOut size={16} /> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">{isAdmin ? 'HOSTEL-WIDE MANAGEMENT' : isStaff ? `BLOCK ${user.block_code || '—'} OPERATIONS` : 'YOUR HOSTEL SPACE'}</div>
              <h1>{page === 'dashboard' ? `Good ${greeting()}, ${(user.full_name || 'there').split(' ')[0]}` : active[1]}</h1>
              <p>{page === 'dashboard' ? 'Here’s what’s happening with your hostel today.' : DESCRIPTIONS[page]}</p>
            </div>
            <div className="heading-actions">
              {isStaff && page === 'students' && addBtn('student', 'Add student')}
              {isStaff && page === 'rooms' && addBtn('room', 'Add room')}
              {isStaff && page === 'notices' && addBtn('notice', 'Create notice')}
              {isStaff && page === 'allocations' && addBtn('allocation', 'Allocate bed')}
              {isStaff && page === 'outpasses' && <button className="secondary-btn" onClick={() => setModal({ type: 'gate' })}><DoorOpen size={17} /> Gate check</button>}
              {!isStaff && page === 'complaints' && addBtn('complaint', 'New complaint')}
              {page === 'guardians' && addBtn('guardian', 'Add parent')}
              {page === 'visitors' && addBtn('visitor', 'Request visitor')}
              {page === 'outpasses' && addBtn('outpass', 'New outpass')}
            </div>
          </div>

          {error && <div className="alert error-alert" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss"><X size={16} /></button></div>}
          {loading && <div className="loading-line" role="progressbar" aria-label="Loading"><span /></div>}

          {page === 'profile'
            ? <Profile user={user} info={data.profile} onSignOut={signOut} />
            : page === 'dashboard'
            ? <Dashboard user={user} dashboard={dashboard} data={data} go={setPage} isStaff={isStaff} onMarkRead={(id) => act('read', { id })} />
            : <DataPage page={page} rows={data[page] || []} user={user} isStaff={isStaff} isAdmin={isAdmin} query={query} setQuery={setQuery} act={act} onOpen={setModal} onExport={exportCsv} loading={loading} />}

          <div className="footer"><span>© {new Date().getFullYear()} HostelBuddy</span><span><ShieldCheck size={14} /> Role-protected campus workspace</span></div>
        </div>
      </main>

      {mobile && <button className="mobile-backdrop" onClick={() => setMobile(false)} aria-label="Close navigation" />}
      {modal && <Modal modal={modal} user={user} blocks={blocks} onClose={() => setModal(null)} onSubmit={submit} />}
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}</div>}
    </div>
  );
}
