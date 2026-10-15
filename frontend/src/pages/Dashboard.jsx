import React from 'react';
import { ArrowRight, ArrowUpRight, Bell, BedDouble, Building2, Check, CheckCircle2, ClipboardList, DoorOpen, MessageCircleWarning, Megaphone, Users, CalendarClock } from 'lucide-react';
import { Empty, Status, fmt } from '../components/ui.jsx';

export default function Dashboard({ user, dashboard: d, data, go, isStaff, onMarkRead }) {
  const occ = d?.rooms?.beds ? Math.round((d.rooms.occupied / d.rooms.beds) * 100) : 0;
  const a = d?.myAllocation;
  const cards = isStaff
    ? [
        { label: 'Students', value: d?.students ?? '—', note: user.role_code === 'ADMIN' ? 'Housed across all blocks' : `In Block ${user.block_code || ''}`, icon: Users, tone: 'navy', page: 'students' },
        { label: 'Beds occupied', value: d?.rooms?.occupied ?? '—', note: `${Math.max(0, (d?.rooms?.beds || 0) - (d?.rooms?.occupied || 0))} beds available`, icon: BedDouble, tone: 'teal', page: 'rooms' },
        { label: 'Open complaints', value: d?.complaints?.pending ?? '—', note: 'Need attention', icon: MessageCircleWarning, tone: 'gold', page: 'complaints' },
        { label: 'Pending approvals', value: (d?.visitorsPending || 0) + (d?.outpassesPending || 0), note: `${d?.visitorsPending || 0} visitors · ${d?.outpassesPending || 0} outpasses`, icon: ClipboardList, tone: 'plum', page: 'outpasses' },
      ]
    : [
        { label: 'Your room', value: a ? `${a.block_code}-${a.room_number}` : '—', note: a ? `Bed ${a.bed_number} · Floor ${a.floor_number}` : 'Not allocated yet', icon: BedDouble, tone: 'teal', page: 'allocations' },
        { label: 'Outpass pending', value: d?.outpassesPending ?? '—', note: 'View details', icon: DoorOpen, tone: 'navy', page: 'outpasses' },
        { label: 'Open complaints', value: d?.complaints?.pending ?? '—', note: 'View details', icon: MessageCircleWarning, tone: 'gold', page: 'complaints' },
        { label: 'Unread notices', value: d?.unreadNotifications ?? '—', note: 'View all', icon: Bell, tone: 'plum', page: 'notifications' },
      ];
  const complaints = (data.complaints || []).filter((c) => !['RESOLVED', 'REJECTED'].includes(c.status)).slice(0, 4);
  const notices = (d?.notices || []).slice(0, 3);
  const notifs = (data.notifications || []).filter((n) => !n.is_read).slice(0, 3);

  return (
    <>
      <section className="hero-card">
        <div className="hero-text">
          <span className="hero-tag"><span /> YOUR CAMPUS AT A GLANCE</span>
          <h2>Smarter hostels.<br />Happier <em>students.</em></h2>
          <p>Room allocations, complaints, visitors, outpasses and notices — all in one place.</p>
          <button className="hero-link" onClick={() => go('notices')}>Explore campus updates <ArrowRight size={16} /></button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="hero-logo"><img src="/assets/hostelbuddy-logo.jpg" alt="" /></div>
          <div className="float-note note-one"><CheckCircle2 size={16} /><span><b>One place</b><small>for hostel essentials</small></span></div>
          <div className="float-note note-two"><Bell size={16} /><span><b>Stay informed</b><small>Updates that matter</small></span></div>
        </div>
      </section>

      <section className="stats-grid">
        {cards.map((c) => {
          const I = c.icon;
          return (
            <button className="stat-card" key={c.label} onClick={() => go(c.page)}>
              <div className="stat-top"><span className={`stat-icon ${c.tone}`}><I size={19} /></span><ArrowUpRight size={17} className="stat-arrow" /></div>
              <div className="stat-value">{c.value}</div>
              <div className="stat-label">{c.label}</div>
              <div className="stat-note">{c.note}</div>
            </button>
          );
        })}
      </section>

      <section className="dashboard-grid">
        {isStaff ? (
          <article className="panel occupancy-panel">
            <div className="panel-head"><div><span className="eyebrow">SPACE &amp; COMFORT</span><h3>Room occupancy</h3></div><button className="text-link" onClick={() => go('rooms')}>View rooms <ArrowRight size={15} /></button></div>
            <div className="occupancy-content">
              <div className="donut" style={{ '--progress': `${occ}%` }} role="img" aria-label={`${occ}% of beds occupied`}><div><b>{occ}%</b><span>occupied</span></div></div>
              <div className="occupancy-detail">
                <div className="legend-row"><i className="dot filled" /><span><b>{d?.rooms?.occupied ?? 0}</b> beds occupied</span></div>
                <div className="legend-row"><i className="dot available" /><span><b>{Math.max(0, (d?.rooms?.beds || 0) - (d?.rooms?.occupied || 0))}</b> beds available</span></div>
                <div className="detail-foot"><Building2 size={15} /> {d?.rooms?.total ?? 0} rooms tracked</div>
              </div>
            </div>
          </article>
        ) : (
          <article className="panel occupancy-panel">
            <div className="panel-head"><div><span className="eyebrow">YOUR SPACE</span><h3>Current allocation</h3></div>{a && <span className="status-pill status-active"><i />Active</span>}</div>
            {a ? (
              <dl className="alloc-grid">
                <dt>Block</dt><dd>{a.block_code}</dd><dt>Room</dt><dd>{a.room_number}</dd><dt>Bed</dt><dd>{a.bed_number}</dd><dt>Floor</dt><dd>{a.floor_number}</dd><dt>Since</dt><dd>{fmt(a.allocation_start)}</dd>
              </dl>
            ) : <Empty icon={BedDouble} title="No room yet" text="Your warden will allocate a bed to you." />}
            <button className="text-link" onClick={() => go('allocations')}>View allocation history <ArrowRight size={15} /></button>
          </article>
        )}
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">THE LATEST</span><h3>Campus notices</h3></div><button className="text-link" onClick={() => go('notices')}>All notices <ArrowRight size={15} /></button></div>
          {notices.length ? notices.map((n, i) => (
            <div className="notice-row" key={n.id}>
              <div className={`notice-icon n${i}`}><Megaphone size={17} /></div>
              <div className="notice-copy"><b>{n.title}</b><p>{n.body}</p><small>{fmt(n.created_at)}{n.block_code ? ` · Block ${n.block_code}` : ''}</small></div>
            </div>
          )) : <Empty icon={Megaphone} title="No notices just yet" text="New campus updates will appear here." />}
        </article>
      </section>

      <section className="dashboard-grid lower-dashboard">
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">NEEDS A LITTLE CARE</span><h3>Recent complaints</h3></div><button className="text-link" onClick={() => go('complaints')}>View register <ArrowRight size={15} /></button></div>
          {complaints.length ? complaints.map((c) => (
            <div className="table-preview-row" key={c.id}>
              <span className={`priority-dot p-${String(c.priority).toLowerCase()}`} />
              <div className="preview-copy"><b>{c.subject}</b><span>{c.student_name || 'Your complaint'} · {fmt(c.created_at)}</span></div>
              <Status value={c.status} />
            </div>
          )) : <Empty icon={CheckCircle2} title="All quiet for now" text="No unresolved complaints to show." />}
        </article>
        <article className="panel">
          <div className="panel-head"><div><span className="eyebrow">YOUR UPDATES</span><h3>Notifications</h3></div><button className="text-link" onClick={() => go('notifications')}>See all <ArrowRight size={15} /></button></div>
          {notifs.length ? notifs.map((n) => (
            <div className="notification-row" key={n.id}>
              <span className="notification-symbol"><Bell size={16} /></span>
              <div className="notice-copy"><b>{n.title}</b><p>{n.message}</p><small>{fmt(n.created_at)}</small></div>
              <button className="read-btn" onClick={() => onMarkRead(n.id)} title="Mark as read" aria-label="Mark as read"><Check size={15} /></button>
            </div>
          )) : <Empty icon={Bell} title="You’re all caught up" text="Important updates will find their way here." />}
        </article>
      </section>
    </>
  );
}
