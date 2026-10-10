import type { Entitlements } from '../lib/billingClient';
export function SubscriptionCard({ e, onCancel, busy }: { e: Entitlements; onCancel?: () => void; busy?: boolean }) {
  const until = e.plus_until ? new Date(e.plus_until).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  return (<div className="card" style={{ borderColor: e.plus ? 'var(--accent)' : undefined }}>
    <div className="name" style={{ fontSize: 18 }}>Inkognito Plus {e.plus ? <span className="meta">· active</span> : <span className="meta">· not active</span>}</div>
    {e.plus && until && <p className="meta" style={{ marginTop: 6 }}>{e.auto_renews ? `Renews on ${until}.` : `Ends on ${until}. It won't renew.`}</p>}
    {!e.plus && e.alias && <p className="meta" style={{ marginTop: 6 }}>Your name @{e.alias} is still yours. Plus extras are off.</p>}
    <p className="meta" style={{ marginTop: 6 }}>{e.ai_daily_limit} companion messages a day.</p>
    {e.plus && e.auto_renews && onCancel && <button className="btn ghost" style={{ marginTop: 12 }} disabled={busy} onClick={onCancel}>{busy ? 'Cancelling…' : 'Stop renewing'}</button>}
  </div>);
}
