import React, { useEffect, useState } from 'react';

const MESSAGES = ['Waking up the campus…', 'Fetching your hostel details…', 'Securing your session…', 'Almost ready…'];
export const SPLASH_MS = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 900 : 3200;

/** Branded start-up screen. App keeps it visible for at least SPLASH_MS so the animation is actually seen. */
export default function Splash() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, MESSAGES.length - 1)), SPLASH_MS / MESSAGES.length);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="splash-screen" role="status" aria-live="polite" aria-label="Loading HostelBuddy">
      <div className="splash-logo"><img src="/assets/hostelbuddy-logo.jpg" alt="" /></div>
      <b className="splash-name">HostelBuddy</b>
      <span>MAKING HOSTEL LIFE SIMPLER</span>
      <div className="splash-bar" aria-hidden="true"><i style={{ '--dur': `${SPLASH_MS}ms` }} /></div>
      <p className="splash-msg" key={i}>{MESSAGES[i]}</p>
    </div>
  );
}
