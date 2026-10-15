import React, { useState } from 'react';
import { ArrowRight, Building2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';

function PasswordInput({ value, onChange, autoComplete, placeholder, id }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <LockKeyhole size={17} aria-hidden="true" />
      <input id={id} type={show ? 'text' : 'password'} autoComplete={autoComplete} required value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} maxLength={72} />
      <button type="button" className="eye-btn" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
    </div>
  );
}

const PasswordRules = () => <small className="field-hint">At least 10 characters, with a letter and a number. Don’t include your name, email or student ID.</small>;

export function Login({ onLoggedIn, notice }) {
  const [mode, setMode] = useState('signin'); // signin | forgot
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      if (mode === 'forgot') {
        await api('/auth/forgot-password', { method: 'POST', body: { email } });
        setSent(true);
      } else {
        const r = await api('/auth/login', { method: 'POST', body: { email, password } });
        setPassword('');
        onLoggedIn(r.user);
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="login-shell">
      <section className="login-visual">
        <div className="visual-top">
          <div className="brand brand-light">
            <img src="/assets/hostelbuddy-logo.jpg" alt="HostelBuddy logo" />
            <div><b>HostelBuddy</b><span>HOSTEL MANAGEMENT SYSTEM</span></div>
          </div>
          <span className="campus-pill"><span className="live-dot" /> YOUR CAMPUS, CONNECTED</span>
        </div>
        <div className="visual-copy">
          <span className="gold-line" />
          <p className="visual-kicker">SMARTER HOSTELS. HAPPIER STUDENTS.</p>
          <h1>Welcome to<br /><em>HostelBuddy.</em></h1>
          <p className="visual-sub">Room allocations, complaints, visitors, outpasses and notices —<br />in one calm place.</p>
        </div>
        <div className="photo-frame">
          <img src="/assets/hostel-photo.jpg" alt="Hostel building" />
          <div className="photo-caption"><span><Building2 size={16} /> Your campus. Your community.</span><span>SAFE STAYS · STRONGER BONDS</span></div>
        </div>
        <div className="visual-foot"><span>ROOMS · REQUESTS · COMMUNITY</span><span>BUILT AROUND YOU <ArrowRight size={14} /></span></div>
      </section>

      <section className="login-panel">
        <div className="login-panel-top"><span className="mini-mark">HB <i>•</i> 01</span><span>Student &amp; staff portal</span></div>
        <div className="login-form-wrap">
          <div className="login-emblem"><img src="/assets/hostelbuddy-logo.jpg" alt="" /></div>
          <div className="login-welcome">
            <span className="eyebrow">WELCOME BACK</span>
            <h2>{mode === 'forgot' ? 'Reset your password' : 'Login to your account'}</h2>
            <p>{mode === 'forgot' ? 'Enter your email and we’ll send a reset link if the account exists.' : 'Access your profile and manage your hostel services.'}</p>
          </div>
          <form onSubmit={submit} noValidate={false}>
            {notice && <div className="login-success" role="status">{notice}</div>}
            <label htmlFor="email">Email address</label>
            <div className="input-wrap">
              <Mail size={17} aria-hidden="true" />
              <input id="email" type="email" autoComplete="username" required placeholder="you@college.edu" value={email} maxLength={160} onChange={(e) => { setEmail(e.target.value); setSent(false); }} />
            </div>
            {mode === 'signin' && (
              <>
                <div className="password-label">
                  <label htmlFor="password">Password</label>
                  <button type="button" className="inline-link" onClick={() => { setMode('forgot'); setError(''); }}>Forgot password?</button>
                </div>
                <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
              </>
            )}
            {error && <div className="login-error" role="alert">{error}</div>}
            {sent && <div className="login-success" role="status">If that account exists, a reset link is on its way. It expires in 30 minutes.</div>}
            <button className="sign-in-btn" disabled={busy}>{busy ? 'Please wait…' : mode === 'forgot' ? 'Send reset link' : 'Sign in securely'}<ArrowRight size={17} /></button>
            {mode === 'forgot' && <button className="back-login" type="button" onClick={() => { setMode('signin'); setSent(false); setError(''); }}>Back to sign in</button>}
          </form>
          <div className="secure-note"><ShieldCheck size={16} /><span>Your account and personal details are protected.</span></div>
        </div>
        <div className="login-panel-foot"><span>Need help? Contact your hostel warden or administrator.</span><span>HOSTELBUDDY © {new Date().getFullYear()}</span></div>
      </section>
    </div>
  );
}

/** Used for both "set your first password" (must_change_password) and voluntary change. */
export function ForcePasswordChange({ user, onDone, onSignOut }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (next !== again) { setError('The new passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      onDone();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="centered-card">
      <div className="login-form-wrap">
        <div className="login-welcome">
          <span className="eyebrow">ONE QUICK STEP</span>
          <h2>Choose a new password</h2>
          <p>Hi {String(user.full_name || '').split(' ')[0] || 'there'}, for your security please replace the temporary password before continuing.</p>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="cur">Current (temporary) password</label>
          <PasswordInput id="cur" value={current} onChange={setCurrent} autoComplete="current-password" />
          <label htmlFor="new">New password</label>
          <PasswordInput id="new" value={next} onChange={setNext} autoComplete="new-password" />
          <PasswordRules />
          <label htmlFor="again">Confirm new password</label>
          <PasswordInput id="again" value={again} onChange={setAgain} autoComplete="new-password" />
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="sign-in-btn" disabled={busy}>{busy ? 'Saving…' : 'Save and continue'}<ArrowRight size={17} /></button>
          <button className="back-login" type="button" onClick={onSignOut}>Sign out</button>
        </form>
      </div>
    </div>
  );
}

/** Opened from the e-mailed link: https://your-site/#reset=<token> (token lives in the URL fragment, never sent to the server). */
export function ResetPassword({ token, onFinished }) {
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (next !== again) { setError('The passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, newPassword: next } });
      onFinished('Password updated. Please sign in with your new password.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="centered-card">
      <div className="login-form-wrap">
        <div className="login-welcome">
          <span className="eyebrow">ACCOUNT RECOVERY</span>
          <h2>Set your password</h2>
          <p>Choose a strong password you don’t use anywhere else.</p>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="rnew">New password</label>
          <PasswordInput id="rnew" value={next} onChange={setNext} autoComplete="new-password" />
          <PasswordRules />
          <label htmlFor="ragain">Confirm password</label>
          <PasswordInput id="ragain" value={again} onChange={setAgain} autoComplete="new-password" />
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="sign-in-btn" disabled={busy}>{busy ? 'Saving…' : 'Save password'}<ArrowRight size={17} /></button>
          <button className="back-login" type="button" onClick={() => onFinished('')}>Back to sign in</button>
        </form>
      </div>
    </div>
  );
}
