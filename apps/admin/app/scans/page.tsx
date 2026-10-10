'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, friendly, type ScanEvent } from '../../lib/api';
export default function Scans() {
  const [rows, setRows] = useState<ScanEvent[] | null>(null); const [err, setErr] = useState('');
  useEffect(() => { api.scanEvents().then(setRows).catch(e => setErr(friendly(e))); }, []);
  if (err) return <div className="err" role="alert">{err}</div>;
  if (!rows) return <div className="dim">Loading…</div>;
  return (<div><h1>Image scans</h1>
    <p className="dim" style={{ marginBottom: 12 }}>Uploads the automated check stopped or sent for review. Blocked images are never stored. Anything marked urgent matched a child-safety category: follow your child-safety procedure first. The scanner can be wrong in both directions, and it does not replace Cloudflare's CSAM scanning.</p>
    {rows.length === 0 ? <div className="dim">Nothing flagged.</div> :
      <table><thead><tr><th>Result</th><th>Categories (score)</th><th>When</th><th>Identity</th></tr></thead><tbody>{rows.map(e => (
        <tr key={e.id}><td><span className={`badge ${e.urgent ? 'p2' : e.result === 'block' ? 'p1' : ''}`}>{e.urgent ? 'Urgent: blocked' : e.result === 'block' ? 'Blocked' : 'Sent for review'}</span></td>
          <td className="cell mono">{Object.entries(e.categories).map(([k, v]) => `${k} ${typeof v === 'number' ? v : ''}`).join(', ') || '—'}</td><td className="nowrap dim">{new Date(e.created_at).toLocaleString()}</td>
          <td><Link className="btn sm" href={`/identities/${e.identity_id}`}>Open record</Link></td></tr>))}</tbody></table>}
  </div>);
}
