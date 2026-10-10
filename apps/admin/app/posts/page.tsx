'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, friendly, type PostRow } from '../../lib/api';
import { ReasonDialog } from '../../components/ReasonDialog';
import { IdentityLink, usePending } from '../../components/ModActions';
export default function Posts() {
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [rows, setRows] = useState<PostRow[] | null>(null); const [err, setErr] = useState(''); const [pending, setPending] = usePending();
  const load = useCallback(() => { setRows(null); api.posts(q, status).then(r => { setRows(r); setErr(''); }).catch(e => setErr(friendly(e))); }, [q, status]);
  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const ask = (title: string, confirm: string, run: (r: string) => Promise<void>, danger = false) => setPending({ title, confirm, danger, run });
  return (<div><h1>Posts</h1>
    <form className="row" style={{ marginBottom: 12 }} onSubmit={e => { e.preventDefault(); load(); }}><input placeholder="Search text" value={q} onChange={e => setQ(e.target.value)} style={{ width: 280 }} />
      <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="">All</option><option value="active">Active</option><option value="moderated">Removed by moderators</option><option value="deleted">Deleted by author</option></select><button className="btn">Search</button></form>
    {err && <div className="err" role="alert">{err}</div>}
    {!rows ? <div className="dim">Loading…</div> : rows.length === 0 ? <div className="dim">No posts match.</div> :
      <table><thead><tr><th>Post</th><th>State</th><th>When</th><th>Actions</th></tr></thead><tbody>{rows.map(p => (
        <tr key={p.id}><td className="cell"><div>{p.body}</div><div className="dim">{p.author_name}{p.report_count > 0 ? ` · ${p.report_count} reports` : ''}</div></td>
          <td className="nowrap">{p.status}/{p.moderation_state}{!p.comments_enabled && <div className="dim">comments locked</div>}</td><td className="nowrap dim">{new Date(p.created_at).toLocaleString()}</td>
          <td><div className="row">
            {p.status === 'active' && <button className="btn sm danger" onClick={() => ask('Remove this post', 'Remove post', r => api.setPost(p.id, 'remove', r).then(load), true)}>Remove</button>}
            {p.status === 'moderated' && <button className="btn sm" onClick={() => ask('Restore this post', 'Restore post', r => api.setPost(p.id, 'restore', r).then(load))}>Restore</button>}
            {p.status !== 'deleted' && (p.comments_enabled ? <button className="btn sm" onClick={() => ask('Lock comments', 'Lock comments', r => api.setPost(p.id, 'lock_comments', r).then(load))}>Lock comments</button> : <button className="btn sm" onClick={() => ask('Unlock comments', 'Unlock comments', r => api.setPost(p.id, 'unlock_comments', r).then(load))}>Unlock comments</button>)}
            <IdentityLink type="post" id={p.id} /></div></td></tr>))}</tbody></table>}
    {pending && <ReasonDialog title={pending.title} confirm={pending.confirm} danger={pending.danger} onConfirm={pending.run} onClose={() => setPending(null)} />}
  </div>);
}
