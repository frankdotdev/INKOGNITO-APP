'use client';
import { useEffect, useState } from 'react';
import { api, friendly, type AuditRow } from '../../lib/api';
export default function Audit() {
  const [rows, setRows] = useState<AuditRow[] | null>(null); const [err, setErr] = useState('');
  useEffect(() => { api.audit().then(setRows).catch(e => setErr(friendly(e))); }, []);
  if (err) return <div className="err" role="alert">{err}</div>;
  if (!rows) return <div className="dim">Loading…</div>;
  return (<div><h1>Audit log</h1><p className="dim" style={{ marginBottom: 12 }}>Every moderation action and identity lookup, with who did it and why. Entries can't be edited from this app.</p>
    <table><thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Reason</th></tr></thead><tbody>{rows.map(a => (
      <tr key={a.id}><td className="nowrap dim">{new Date(a.created_at).toLocaleString()}</td><td>{a.admin_email ?? 'unknown'}<div className="dim">{a.admin_role}</div></td><td>{a.action}</td><td className="cell mono">{a.target_type}{a.target_id ? ` ${a.target_id}` : ''}</td><td className="cell">{a.reason}</td></tr>))}</tbody></table></div>);
}
