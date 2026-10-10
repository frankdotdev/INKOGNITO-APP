'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, friendly, type OrderRow } from '../../lib/api';
import { ReasonDialog } from '../../components/ReasonDialog';
import { usePending } from '../../components/ModActions';
const money = (o: OrderRow) => (o.currency === 'USD' ? `$${(o.amount / 100).toFixed(2)}` : `₦${(o.amount / 100).toLocaleString('en-US')}`);
export default function Orders() {
  const [status, setStatus] = useState('needs_review'); const [rows, setRows] = useState<OrderRow[] | null>(null); const [err, setErr] = useState(''); const [pending, setPending] = usePending();
  const load = useCallback(() => { setRows(null); api.orders(status).then(r => { setRows(r); setErr(''); }).catch(e => setErr(friendly(e))); }, [status]);
  useEffect(() => { load(); }, [load]);
  return (<div><h1>Orders</h1>
    <p className="dim" style={{ marginBottom: 12 }}>Orders that need a person: the amount didn't match, or the name was taken at the moment of payment. Fix or refund it in the Paystack dashboard (use the provider reference), then record what you did here. Paid orders can be refunded here within 30 days: Paystack is asked to refund, renewals stop, and when Paystack confirms, the name and the Plus month that payment bought are taken back.</p>
    <div className="tabs" role="tablist">{[['needs_review', 'Needs review'], ['paid', 'Paid'], ['refund_pending', 'Refund pending'], ['refunded', 'Refunded'], ['resolved', 'Resolved']].map(([s, l]) => <button key={s} role="tab" className="tab" aria-selected={s === status} onClick={() => setStatus(s)}>{l}</button>)}</div>
    {err && <div className="err" role="alert">{err}</div>}
    {!rows ? <div className="dim">Loading…</div> : rows.length === 0 ? <div className="dim">Nothing here.</div> :
      <table><thead><tr><th>Order</th><th>Amount</th><th>Wanted name</th><th>When</th><th>Actions</th></tr></thead><tbody>{rows.map(o => (
        <tr key={o.reference}><td className="cell mono">{o.reference}<div className="dim">Paystack ref {o.provider_ref ?? 'none'}</div></td><td className="nowrap">{money(o)}</td><td>{o.alias ? `@${o.alias}` : 'Plus only'}</td>
          <td className="nowrap dim">{new Date(o.created_at).toLocaleString()}</td>
          <td><div className="row"><Link className="btn sm" href={`/identities/${o.identity_id}`}>Identity</Link>
            {o.status === 'paid' && <button className="btn sm danger" onClick={() => setPending({ title: 'Refund this payment', confirm: 'Refund', danger: true, run: reason => api.refund(o.reference, reason).then(() => load()) })}>Refund</button>}
            {o.status === 'needs_review' && <button className="btn sm" onClick={() => setPending({ title: 'Mark as resolved', confirm: 'Mark resolved', run: reason => api.resolveOrder(o.reference, reason).then(load) })}>Resolve</button>}</div></td></tr>))}</tbody></table>}
    {pending && <ReasonDialog title={pending.title} confirm={pending.confirm} onConfirm={pending.run} onClose={() => setPending(null)} />}
  </div>);
}
