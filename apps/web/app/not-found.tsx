import Link from 'next/link';
export default function NotFound() {
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '96px 20px', display: 'grid', gap: 16, textAlign: 'center' }}>
      <div className="wordmark" style={{ padding: 0 }}>inkognito</div>
      <h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>This isn't here</h1>
      <p className="meta" style={{ fontSize: 17 }}>The link may have expired, been removed, or never existed.</p>
      <Link className="btn" href="/void" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Back to the Void</Link>
    </main>
  );
}
