'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, friendly, type RandomReportRow } from '../../lib/api';
import { ReasonDialog } from '../../components/ReasonDialog';
import { usePending } from '../../components/ModActions';
export default function RandomReports() {
  const [status, setStatus] = useState('open'); const [rows, setRows] = useState<RandomReportRow[] | null>(null); const [err, setErr] = useState(''); const [pending, setPending] = usePending();
  const load = useCallback(() => { setRows(null); api.randomReports(status).then(r => { setRows(r); setErr(''); }).catch(e => setErr(friendly(e))); }, [status]);
  useEffect(() => { load(); }, [load]);
  return (<div><h1>Random chat and private chat reports</h1>
    <p className="dim" style={{ marginBottom: 12 }}>Transcripts are the last messages before the report. Chats are not recorded otherwise.</p>
    <div className="tabs" role="tablist">{['open', 'actioned', 'dismissed'].map(s => <button key={s} role="tab" className="tab" aria-selected={s === status} onClick={() => setStatus(s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}</div>
    {err && <div className="err" role="alert">{err}</div>}
    {!rows ? <div className="dim">Loading…</div> : rows.length === 0 ? <div className="dim">Nothing {status}.</div> :
      <table><thead><tr><th>Priority</th><th>Category</th><th>Transcript</th><th>When</th><th>Actions</th></tr></thead><tbody>{rows.map(r => (
        <tr key={r.id}><td><span className={`badge p${r.priority}`}>{r.priority === 2 ? 'Urgent' : r.priority === 1 ? 'High' : 'Normal'}</span></td><td><strong>{r.category}</strong><div className="dim">{r.source === 'dm' ? 'Private chat' : 'Random chat'}</div></td>
          <td className="cell">{r.transcript.length === 0 ? <span className="dim">No messages.</span> : r.transcript.map((m, i) => <div className="bubble" key={i}><span className="dim">{m.s === 'reporter' ? 'Reporter' : m.s === 'reported' ? 'Reported person' : `Participant ${m.s.toUpperCase()}`}: </span>{m.t}</div>)}</td>
          <td className="nowrap dim">{new Date(r.created_at).toLocaleString()}</td>
          <td><div className="row"><Link className="btn sm" href={`/identities/${r.reported_identity}`}>Reported identity</Link>
            {r.status === 'open' && <><button className="btn sm" onClick={() => setPending({ title: 'Mark as actioned', confirm: 'Mark actioned', run: reason => api.resolve('random', r.id, 'actioned', reason).then(load) })}>Actioned</button><button className="btn sm" onClick={() => setPending({ title: 'Dismiss this report', confirm: 'Dismiss', run: reason => api.resolve('random', r.id, 'dismissed', reason).then(load) })}>Dismiss</button></>}</div></td></tr>))}</tbody></table>}
    {pending && <ReasonDialog title={pending.title} confirm={pending.confirm} onConfirm={pending.run} onClose={() => setPending(null)} />}
  </div>);
}
