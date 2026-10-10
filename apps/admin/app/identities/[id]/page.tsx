'use client';
import { use, useCallback, useEffect, useState } from 'react';
import { api, friendly, type IdentityRecord } from '../../../lib/api';
import { ReasonDialog } from '../../../components/ReasonDialog';
import { usePending } from '../../../components/ModActions';
import { useRole } from '../../../components/AuthGate';
export default function Identity({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const role = useRole(); const [rec, setRec] = useState<IdentityRecord | null>(null); const [err, setErr] = useState(''); const [pending, setPending] = usePending();
  const load = useCallback(() => api.identity(id).then(r => { setRec(r); setErr(''); }).catch(e => setErr(friendly(e))), [id]);
  useEffect(() => { load(); }, [load]);
  if (err) return <div className="err" role="alert">{err}</div>;
  if (!rec) return <div className="dim">Loading…</div>;
  const act = (title: string, action: 'restrict' | 'suspend' | 'ban' | 'restore', danger = false) => setPending({ title, confirm: title, danger, run: reason => api.setIdentity(id, action, reason).then(load) });
  const canAct = role === 'super_admin' || role === 'moderator' || role === 'safety_moderator', canRestore = role === 'super_admin' || role === 'safety_moderator';
  return (<div><h1>Identity record</h1>
    <dl className="kv"><dt>Anonymous ID</dt><dd className="mono">{rec.id}</dd><dt>Status</dt><dd><strong>{rec.status}</strong> (risk {rec.risk_level}, trust {rec.trust_level})</dd>
      <dt>Created</dt><dd>{new Date(rec.created_at).toLocaleString()}</dd><dt>Last active</dt><dd>{new Date(rec.last_seen_at).toLocaleString()}</dd><dt>Devices</dt><dd>{rec.devices}</dd>
      <dt>Posts / comments</dt><dd>{rec.posts} / {rec.comments}</dd><dt>Reports against</dt><dd>{rec.reports_against} content, {rec.random_reports_against} random chat</dd><dt>Reports filed</dt><dd>{rec.reports_filed}</dd></dl>
    <p className="dim" style={{ margin: '12px 0' }}>This record holds no name, email, phone or network address, because Inkognito doesn't collect them.</p>
    {canAct && <div className="row">{rec.status === 'active' && <><button className="btn" onClick={() => act('Restrict', 'restrict')}>Restrict (read-only)</button><button className="btn" onClick={() => act('Suspend', 'suspend')}>Suspend</button></>}
      {rec.status !== 'banned' && <button className="btn danger" onClick={() => act('Ban', 'ban', true)}>Ban</button>}
      {rec.status !== 'active' && canRestore && <button className="btn primary" onClick={() => act('Restore', 'restore')}>Restore</button>}</div>}
    <h2>Recent actions</h2>{rec.recent_actions.length === 0 ? <div className="dim">None.</div> : <table><thead><tr><th>When</th><th>Action</th><th>By</th><th>Reason</th></tr></thead><tbody>{rec.recent_actions.map((a, i) => <tr key={i}><td className="nowrap dim">{new Date(a.at).toLocaleString()}</td><td>{a.action}</td><td>{a.role}</td><td className="cell">{a.reason}</td></tr>)}</tbody></table>}
    {pending && <ReasonDialog title={pending.title} confirm={pending.confirm} danger={pending.danger} onConfirm={pending.run} onClose={() => setPending(null)} />}</div>);
}
