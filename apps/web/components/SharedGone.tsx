import Link from 'next/link';
export function SharedGone() {
  return (<main style={{ maxWidth: 560, margin: '0 auto', padding: '64px 16px', display: 'grid', gap: 24, textAlign: 'center' }}>
    <div className="wordmark" style={{ padding: 0 }}>inkognito</div>
    <h1 style={{ fontSize: 24 }}>This is gone</h1><p className="meta">It was removed, it faded away, or the person chose to stop sharing it.</p>
    <Link href="/void" className="btn" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>See what else is here</Link></main>);
}
