'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, friendly, type ReviewItem } from '../../lib/api';
import { ReasonDialog } from '../../components/ReasonDialog';
import { IdentityLink, usePending } from '../../components/ModActions';
const MEDIA = process.env.NEXT_PUBLIC_MEDIA_URL?.replace(/\/$/, '');
export default function Review() {
  const [rows, setRows] = useState<ReviewItem[] | null>(null); const [err, setErr] = useState(''); const [pending, setPending] = usePending(); const [busy, setBusy] = useState('');
  const load = useCallback(() => { api.reviewQueue().then(r => { setRows(r); setErr(''); }).catch(e => setErr(friendly(e))); }, []);
  useEffect(() => { load(); }, [load]);
  const approve = async (id: string) => { setBusy(id); try { await api.setPost(id, 'approve', 'approved after image review'); load(); } catch (e) { setErr(friendly(e)); } setBusy(''); };
  return (<div><h1>Image review</h1>
    <p className="dim" style={{ marginBottom: 12 }}>Posts with images wait here until you approve them. Reject anything illegal, sexual, violent, or that exposes someone. For anything involving children, reject it, then follow your child-safety procedure before doing anything else.</p>
    {!MEDIA && <div className="err" role="alert">Set NEXT_PUBLIC_MEDIA_URL so images can be shown here.</div>}
    {err && <div className="err" role="alert">{err}</div>}
    {!rows ? <div className="dim">Loading…</div> : rows.length === 0 ? <div className="dim">Nothing is waiting.</div> :
      <div style={{ display: 'grid', gap: 12 }}>{rows.map(p => (
        <div key={p.id} className="metric"><div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: '0 1 60%' }}>{p.media.map(m => MEDIA ? <a key={m.key} href={`${MEDIA}/m/${m.key}`} target="_blank" rel="noopener noreferrer"><img src={`${MEDIA}/m/${m.key}`} alt="Uploaded image" width={Math.min(m.width, 280)} style={{ maxWidth: 280, height: 'auto', borderRadius: 6 }} /></a> : null)}</div>
          <div style={{ flex: 1, minWidth: 220 }}><div style={{ overflowWrap: 'anywhere' }}>{p.body}</div><div className="dim" style={{ margin: '6px 0' }}>{p.author_name} · {new Date(p.created_at).toLocaleString()}</div>
            <div className="row"><button className="btn primary sm" disabled={busy === p.id} onClick={() => approve(p.id)}>Approve</button><button className="btn danger sm" onClick={() => setPending({ title: 'Reject this post', confirm: 'Reject', danger: true, run: reason => api.setPost(p.id, 'reject', reason).then(load) })}>Reject</button><IdentityLink type="post" id={p.id} /></div></div></div></div>))}</div>}
    {pending && <ReasonDialog title={pending.title} confirm={pending.confirm} danger={pending.danger} onConfirm={pending.run} onClose={() => setPending(null)} />}
  </div>);
}
