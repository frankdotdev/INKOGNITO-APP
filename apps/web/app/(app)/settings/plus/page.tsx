'use client';
import { useCallback, useEffect, useState } from 'react';
import { billingEnabled, billingService, billingErrorText, aliasReason, type Currency, type Entitlements, type Plans } from '../../../../lib/billingClient';
import { SubscriptionCard } from '../../../../components/SubscriptionCard';
import { EmptyState, Skeleton } from '../../../../components/ui';
const h1 = { fontSize: 28, letterSpacing: '-.02em' } as const;
export default function Plus() {
  const [e, setE] = useState<Entitlements | null>(null); const [plans, setPlans] = useState<Plans | null>(null); const [err, setErr] = useState('');
  const [cur, setCur] = useState<Currency>('USD'); const [alias, setAlias] = useState(''); const [check, setCheck] = useState<{ ok: boolean; msg: string } | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(() => Promise.all([billingService.entitlements(), billingService.plans()]).then(([a, p]) => { setE(a); setPlans(p); setErr(''); }).catch(x => setErr(billingErrorText(x))), []);
  useEffect(() => { if (billingEnabled) load(); }, [load]);
  useEffect(() => { try { if (/^NG/i.test(navigator.language.split('-')[1] ?? '') || navigator.language === 'en-NG') setCur('NGN'); } catch {} }, []);
  useEffect(() => {
    const a = alias.trim(); if (!a) { setCheck(null); return; }
    const t = setTimeout(() => billingService.checkAlias(a).then(r => setCheck(r.available ? { ok: true, msg: 'Available' } : { ok: false, msg: aliasReason(r.reason) })).catch(() => setCheck(null)), 400);
    return () => clearTimeout(t);
  }, [alias]);
  if (!billingEnabled) return <EmptyState title="Plus isn't available" hint="Payments haven't been switched on for this deployment." />;
  if (err && !e) return <EmptyState title="Couldn't load this" hint={err} />;
  if (!e || !plans) return <Skeleton n={2} />;
  const buy = async (withAlias: boolean) => {
    setBusy(true); setErr('');
    try { const r = await billingService.checkout(cur, withAlias ? alias.trim() : null); try { sessionStorage.setItem('ink-checkout', r.reference); } catch {} window.location.href = r.url; }
    catch (x) { setErr(billingErrorText(x)); setBusy(false); }
  };
  const cancel = async () => { if (!confirm('Stop renewing Plus? You keep it until the end of the period you paid for, and you keep your name.')) return; setBusy(true); setErr(''); try { await billingService.cancel(); await load(); } catch (x) { setErr(billingErrorText(x)); } setBusy(false); };
  const price = plans[cur].label;
  return (<div style={{ display: 'grid', gap: 16 }}><h1 style={h1}>Inkognito Plus</h1>
    <SubscriptionCard e={e} onCancel={cancel} busy={busy} />
    {e.alias && <div className="card"><div className="name">@{e.alias}</div><p className="meta" style={{ marginTop: 6 }}>Yours for life, even if Plus ends.</p>
      <label className="row" style={{ marginTop: 10 }}><input type="checkbox" checked={e.speak_as_alias} onChange={async ev => { try { await billingService.setSpeakAsAlias(ev.target.checked); await load(); } catch { setErr("Couldn't save that."); } }} /> Speak as @{e.alias} in new threads</label>
      <p className="meta" style={{ marginTop: 6 }}>Threads you already joined keep the name you had there. <a href={`/a/${e.alias}`} style={{ color: 'var(--accent)' }}>Your public page</a></p></div>}
    {e.alias_revoked && <p role="alert" className="meta" style={{ color: 'var(--danger)' }}>Your name was removed for breaking the community rules.</p>}
    {(!e.plus || e.can_claim_alias) && <div className="card" style={{ display: 'grid', gap: 12 }}>
      <div className="name" style={{ fontSize: 18 }}>{e.can_claim_alias ? 'Choose your name' : 'Get Plus'}</div>
      <ul className="prose" style={{ paddingLeft: 18 }}>{e.can_claim_alias && <li>A name that is yours for life. One payment, and nobody else can take it.</li>}<li>More companion messages every day.</li><li>Plus extras as they arrive, for as long as you subscribe.</li></ul>
      {e.can_claim_alias && <><label>Name<div className="row"><span className="name">@</span><input className="field" value={alias} onChange={ev => setAlias(ev.target.value)} maxLength={20} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Your name" /></div></label>
        {check && <p role="status" className="meta" style={{ color: check.ok ? 'var(--success)' : 'var(--danger)' }}>{check.msg}</p>}</>}
      <div className="row" role="group" aria-label="Currency">{(['USD', 'NGN'] as Currency[]).map(c => <button key={c} className="tab" aria-selected={cur === c} onClick={() => setCur(c)}>{c === 'USD' ? 'Dollars' : 'Naira'}</button>)}</div>
      <p className="meta">{e.can_claim_alias ? `${price} today gets your name for life and a month of Plus. After that Plus is ${price} a month, and you can stop any time. If you stop, you keep your name.` : `${price} a month. Stop any time.`} We never see your card or email, and the payment isn't linked to what you post.</p>
      <p className="meta">Your name belongs to this anonymous identity. If you lose every device and have no recovery code, the name is lost with it. Names can be removed for impersonation or breaking the rules.</p>
      {err && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
      <button className="btn" disabled={busy || (e.can_claim_alias && !check?.ok)} onClick={() => buy(e.can_claim_alias)}>{busy ? 'Opening payment…' : e.can_claim_alias ? `Claim @${alias.trim() || 'name'} for ${price}` : `Subscribe for ${price}/month`}</button></div>}
    {err && e && !(!e.plus || e.can_claim_alias) && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
  </div>);
}
