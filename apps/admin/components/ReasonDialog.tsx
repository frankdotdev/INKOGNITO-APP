'use client';
import { useState } from 'react';
import { friendly } from '../lib/api';
/** Every moderation action asks for a reason; it is stored in the audit log. */
export function ReasonDialog({ title, confirm, danger, onConfirm, onClose }: { title: string; confirm: string; danger?: boolean; onConfirm: (reason: string) => Promise<void>; onClose: () => void }) {
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => { setBusy(true); setErr(''); try { await onConfirm(reason.trim()); onClose(); } catch (e) { setErr(friendly(e)); setBusy(false); } };
  return (<div className="scrim" onClick={onClose}><div className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
    <strong>{title}</strong><label className="dim">Reason (kept in the audit log)<textarea autoFocus rows={3} value={reason} onChange={e => setReason(e.target.value)} style={{ width: '100%', marginTop: 4 }} /></label>
    {err && <div className="err" role="alert">{err}</div>}
    <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Cancel</button><button className={`btn ${danger ? 'danger' : 'primary'}`} disabled={busy || reason.trim().length < 5} onClick={go}>{busy ? 'Working…' : confirm}</button></div></div></div>);
}
