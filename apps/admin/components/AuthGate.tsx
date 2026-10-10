'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { api, type Role } from '../lib/api';
import { captchaToken } from '../lib/captcha';
type Phase = 'loading' | 'signin' | 'enroll' | 'verify' | 'denied' | 'ready';
const IDLE_MS = 30 * 60_000;
const RoleCtx = createContext<Role>('support'); export const useRole = () => useContext(RoleCtx);
export function AuthGate({ children }: { children: (role: Role, signOut: () => void) => React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading'); const [role, setRole] = useState<Role>('support'); const [err, setErr] = useState('');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState(''); const [qr, setQr] = useState(''); const [secret, setSecret] = useState(''); const [busy, setBusy] = useState(false);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const signOut = useCallback(async () => { await supabase.auth.signOut(); setRole('support'); setPhase('signin'); }, []);
  const enroll = useCallback(async () => {
    const { data: f } = await supabase.auth.mfa.listFactors();
    for (const x of f?.all ?? []) if (x.factor_type === 'totp' && x.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: x.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Inkognito admin ${new Date().toISOString().slice(0, 10)}` });
    if (error || !data) throw new Error('enroll'); setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret);
  }, []);
  const refresh = useCallback(async () => {
    setErr('');
    try {
      const { data: s } = await supabase.auth.getSession(); if (!s.session) { setPhase('signin'); return; }
      const who = (await api.whoami())[0]; if (!who) { setPhase('denied'); return; }
      setRole(who.role);
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === 'aal2') { setPhase('ready'); return; }
      const { data: f } = await supabase.auth.mfa.listFactors(); const verified = f?.totp?.[0];
      if (verified) { setFactorId(verified.id); setPhase('verify'); } else { await enroll(); setPhase('enroll'); }
    } catch { setErr('Could not reach the server.'); setPhase('signin'); }
  }, [enroll]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (phase !== 'ready') return;
    const reset = () => { clearTimeout(idle.current); idle.current = setTimeout(signOut, IDLE_MS); };
    const ev = ['pointerdown', 'keydown', 'scroll']; ev.forEach(e => window.addEventListener(e, reset)); reset();
    return () => { ev.forEach(e => window.removeEventListener(e, reset)); clearTimeout(idle.current); };
  }, [phase, signOut]);
  const signIn = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); let token: string | undefined; try { token = await captchaToken(); } catch { setErr('Could not complete the human check. Try again.'); setBusy(false); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: token } }); setPassword(''); if (error) { setErr('Invalid email or password.'); setBusy(false); return; } setBusy(false); await refresh(); };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    const ch = await supabase.auth.mfa.challenge({ factorId }); if (ch.error) { setErr('Could not start verification.'); setBusy(false); return; }
    const v = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: code.trim() }); setCode('');
    if (v.error) { setErr('That code is not valid. Try the next one.'); setBusy(false); return; }
    setBusy(false); await refresh();
  };
  if (phase === 'loading') return <div className="center dim">Loading…</div>;
  if (phase === 'ready') return <RoleCtx.Provider value={role}>{children(role, signOut)}</RoleCtx.Provider>;
  return (<div className="center"><div className="card">
    <strong>Inkognito Control Room</strong>
    {phase === 'signin' && <form onSubmit={signIn} style={{ display: 'grid', gap: 10 }}>
      <label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%' }} /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%' }} /></label>
      <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form>}
    {phase === 'enroll' && <form onSubmit={verify} style={{ display: 'grid', gap: 10 }}>
      <div className="dim">Set up two-factor authentication. Scan this with an authenticator app, then enter the 6-digit code.</div>
      {qr && <img src={qr} alt="Authenticator QR code" width={180} height={180} style={{ background: '#fff', borderRadius: 8 }} />}<div className="mono dim">Or enter manually: {secret}</div>
      <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} aria-label="6-digit code" />
      <button className="btn primary" disabled={busy}>Verify and continue</button></form>}
    {phase === 'verify' && <form onSubmit={verify} style={{ display: 'grid', gap: 10 }}>
      <div className="dim">Enter the 6-digit code from your authenticator app.</div>
      <input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} aria-label="6-digit code" />
      <button className="btn primary" disabled={busy}>Verify</button></form>}
    {phase === 'denied' && <div style={{ display: 'grid', gap: 10 }}><div className="err">This account is not an administrator.</div></div>}
    {err && <div className="err" role="alert">{err}</div>}
    {phase !== 'signin' && <button className="btn" onClick={signOut}>Sign out</button>}
  </div></div>);
}
