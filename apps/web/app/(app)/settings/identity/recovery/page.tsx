'use client';
import { useState } from 'react';
import { identityService } from '../../../../../lib/identityService';
export default function Recovery() {
  const [code, setCode] = useState(''); const [saved, setSaved] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [input, setInput] = useState(''); const [msg, setMsg] = useState('');
  const create = async () => { if (!confirm('Create a new recovery code? Any previous code will stop working.')) return; setBusy(true); setErr(''); try { setCode(await identityService.createRecoveryCode()); setSaved(false); } catch { setErr("Couldn't create a recovery code."); } setBusy(false); };
  const download = () => { const b = new Blob([`Inkognito recovery code\n\n${code}\n\nAnyone with this code can take over your anonymous identity. Keep it private.\n`], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'inkognito-recovery.txt'; a.click(); URL.revokeObjectURL(a.href); };
  const recover = async () => {
    setBusy(true); setMsg('');
    try { const r = await identityService.recover(input); if (r === 'ok') { window.location.href = '/void'; return; }
      setMsg(r === 'rate_limited' ? 'Too many tries. Wait an hour and try again.' : r === 'device_has_content' ? "This device already has its own posts, so it can't be replaced. Purge it first (Settings, Identity, Purge or delete)." : "That code isn't right."); }
    catch { setMsg("Couldn't reach Inkognito. Try again."); }
    setBusy(false);
  };
  return (<div style={{ display: 'grid', gap: 16 }}><h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>Recovery code</h1>
    <p className="meta">If you lose all your devices and have no recovery code, your anonymous identity is gone for good. We can't reset it, because we don't know who you are.</p>
    {code ? <div className="card" style={{ display: 'grid', gap: 12 }}><div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 22, letterSpacing: 1, wordBreak: 'break-all' }} aria-label="Your recovery code">{code}</div>
        <p className="meta">This is shown once. We only keep a fingerprint of it, so we can't show it again. Anyone with this code can take over your identity.</p>
        <div className="row"><button className="btn ghost" onClick={() => navigator.clipboard.writeText(code)}>Copy</button><button className="btn ghost" onClick={download}>Download file</button></div>
        <label className="row"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} /> I've saved it somewhere safe</label>
        {saved && <button className="btn" onClick={() => setCode('')}>Done</button>}</div>
      : <button className="btn" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create a recovery code'}</button>}
    {err && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
    <h3 className="h" style={{ marginTop: 16 }}>Recover an identity on this device</h3>
    <input className="field" aria-label="Recovery code" value={input} onChange={e => setInput(e.target.value)} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
    {msg && <p role="alert" style={{ color: 'var(--danger)' }}>{msg}</p>}
    <button className="btn ghost" disabled={busy || input.trim().length < 10} onClick={recover}>Recover identity</button></div>);
}
