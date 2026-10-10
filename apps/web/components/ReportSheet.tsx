'use client';
import { useState } from 'react';
import type { ReportCategory } from '@inkognito/core';
import { reportService } from '../lib/services';
const cats: [ReportCategory, string][] = [['harassment','Harassment'],['threat','Threat'],['sexual','Sexual content'],['childSafety','Child safety'],['spam','Spam'],['scam','Scam'],['hate','Hate or abuse'],['selfHarm','Self-harm concern'],['illegal','Illegal content'],['other','Other']];
export function ReportSheet({ target, onClose, submit }: { target?: { type: 'post' | 'comment' | 'whisper'; id: string }; onClose: () => void; submit?: (c: ReportCategory) => Promise<void> }) {
  const [cat, setCat] = useState<ReportCategory | ''>(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [err, setErr] = useState('');
  const send = async () => { if (!cat) return; setBusy(true); setErr(''); try { if (submit) await submit(cat); else await reportService.report(target!, cat); setDone(true); } catch { setErr("Couldn't send the report. Try again."); } setBusy(false); };
  return (
    <div className="scrim" onClick={onClose}><div className="sheet" role="dialog" aria-modal="true" aria-label="Report" onClick={e => e.stopPropagation()}>
      {done ? <><h2>Report sent</h2><p className="meta">Thank you. Our moderators will review it.</p><button className="btn" onClick={onClose}>Close</button></> : <>
        <h2>Why are you reporting this?</h2>
        <div className="cats">{cats.map(([k, l]) => <button key={k} className="tab" aria-selected={cat === k} onClick={() => setCat(k)}>{l}</button>)}</div>
        {err && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
        <div className="row"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={!cat || busy} onClick={send}>Send report</button></div></>}
    </div></div>
  );
}
