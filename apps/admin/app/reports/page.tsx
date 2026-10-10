'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, friendly, type ReportRow } from '../../lib/api';
import { ReasonDialog } from '../../components/ReasonDialog';
import { IdentityLink, usePending } from '../../components/ModActions';
import { useRole } from '../../components/AuthGate';
export default function Reports() {
  const [status, setStatus] = useState('open'); const [rows, setRows] = useState<ReportRow[] | null>(null); const [err, setErr] = useState(''); const [pending, setPending] = usePending(); useRole();
  const load = useCallback(() => { setRows(null); api.reports(status).then(r => { setRows(r); setErr(''); }).catch(e => setErr(friendly(e))); }, [status]);
  useEffect(() => { load(); }, [load]);
  const ask = (title: string, confirm: string, run: (r: string) => Promise<void>, danger = false) => setPending({ title, confirm, danger, run });
  return (<div><h1>Reports</h1>
    <div className="tabs" role="tablist">{['open', 'actioned', 'dismissed'].map(s => <button key={s} role="tab" className="tab" aria-selected={s === status} onClick={() => setStatus(s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}</div>
    {err && <div className="err" role="alert">{err}</div>}
    {!rows ? <div className="dim">Loading…</div> : rows.length === 0 ? <div className="dim">Nothing {status}.</div> :
      <table><thead><tr><th>Priority</th><th>Report</th><th>Content</th><th>When</th><th>Actions</th></tr></thead><tbody>{rows.map(r => (
        <tr key={r.id}><td><span className={`badge p${r.priority}`}>{r.priority === 2 ? 'Urgent' : r.priority === 1 ? 'High' : 'Normal'}</span></td>
          <td className="cell"><strong>{r.category}</strong> on a {r.target_type}<div className="dim">{r.report_count} {r.report_count === 1 ? 'report' : 'reports'} on this item{r.description ? ` · “${r.description}”` : ''}</div></td>
          <td className="cell">{r.target_body ? <><div>{r.target_body.length > 300 ? r.target_body.slice(0, 300) + '…' : r.target_body}</div><div className="dim">{r.author_name} · {r.target_state}</div></> : <span className="dim">Content is gone (expired or deleted).</span>}</td>
          <td className="nowrap dim">{new Date(r.created_at).toLocaleString()}</td>
          <td><div className="row">
            {r.target_type === 'post' && r.status === 'open' && <><button className="btn sm danger" onClick={() => ask('Remove this post', 'Remove post', reason => api.setPost(r.target_id, 'remove', reason).then(load), true)}>Remove</button><button className="btn sm" onClick={() => ask('Lock comments on this post', 'Lock comments', reason => api.setPost(r.target_id, 'lock_comments', reason).then(load))}>Lock comments</button></>}
            {r.target_type === 'comment' && r.status === 'open' && <button className="btn sm danger" onClick={() => ask('Remove this comment', 'Remove comment', reason => api.setComment(r.target_id, 'remove', reason).then(load), true)}>Remove</button>}
            {r.target_type !== 'whisper' || r.target_body ? <IdentityLink type={r.target_type} id={r.target_id} /> : null}
            {r.status === 'open' && <><button className="btn sm" onClick={() => ask('Mark as actioned', 'Mark actioned', reason => api.resolve('content', r.id, 'actioned', reason).then(load))}>Actioned</button><button className="btn sm" onClick={() => ask('Dismiss this report', 'Dismiss', reason => api.resolve('content', r.id, 'dismissed', reason).then(load))}>Dismiss</button></>}
          </div></td></tr>))}</tbody></table>}
    {pending && <ReasonDialog title={pending.title} confirm={pending.confirm} danger={pending.danger} onConfirm={pending.run} onClose={() => setPending(null)} />}
  </div>);
}
