export const metadata = { title: "You're offline · Inkognito" };
export default function Offline() {
  return (<main style={{ maxWidth: 560, margin: '0 auto', padding: '96px 20px', display: 'grid', gap: 16, textAlign: 'center' }}>
    <div className="wordmark" style={{ padding: 0 }}>inkognito</div>
    <h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>You're offline</h1>
    <p className="meta" style={{ fontSize: 17 }}>Nothing you do will be sent until you're back online. Your draft is saved on this device.</p>
    <a className="btn" href="/void" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Try again</a></main>);
}
