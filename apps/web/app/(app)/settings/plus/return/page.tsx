'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { billingService, billingErrorText } from '../../../../../lib/billingClient';
/** Paystack sends people back here. We ask our server to confirm the payment with Paystack; nothing is granted just because someone opened this page. */
export default function PlusReturn() {
  const [state, setState] = useState<'checking' | 'paid' | 'pending' | 'failed' | 'review' | 'error'>('checking'); const [msg, setMsg] = useState(''); const tries = useRef(0);
  useEffect(() => {
    let ref = new URLSearchParams(window.location.search).get('reference') ?? new URLSearchParams(window.location.search).get('trxref');
    try { ref = ref ?? sessionStorage.getItem('ink-checkout'); } catch {}
    if (!ref) { setState('error'); setMsg('We could not find your payment.'); return; }
    let stop = false;
    const poll = async () => {
      try { const r = await billingService.verify(ref!); if (stop) return;
        if (r.status === 'pending' && tries.current++ < 10) { setTimeout(poll, 3000); setState('pending'); return; }
        setState(r.status); if (r.status === 'paid') { try { sessionStorage.removeItem('ink-checkout'); } catch {} } }
      catch (e) { if (!stop) { setState('error'); setMsg(billingErrorText(e)); } }
    };
    poll(); return () => { stop = true; };
  }, []);
  return (<div style={{ display: 'grid', gap: 16, justifyItems: 'start' }}><h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>{state === 'paid' ? "You're in." : 'Your payment'}</h1>
    {(state === 'checking' || state === 'pending') && <p role="status" className="meta">{state === 'checking' ? 'Confirming your payment…' : 'Still waiting for the bank to confirm. This can take a minute.'}</p>}
    {state === 'paid' && <p role="status">Thank you. Your name and Plus are ready.</p>}
    {state === 'failed' && <p role="alert" style={{ color: 'var(--danger)' }}>The payment didn't go through. You haven't been charged.</p>}
    {state === 'review' && <p role="alert">We received your payment but something needs a manual check (for example the name was taken at the same moment). Nothing is lost: we'll fix it or refund you. Please keep your payment receipt.</p>}
    {state === 'error' && <p role="alert" style={{ color: 'var(--danger)' }}>{msg}</p>}
    {state === 'pending' && <p className="meta">If you closed the payment page without paying, you can start again.</p>}
    <Link href="/settings/plus" className="btn" style={{ display: 'inline-flex', alignItems: 'center' }}>{state === 'paid' ? 'See my Plus' : 'Back'}</Link></div>);
}
