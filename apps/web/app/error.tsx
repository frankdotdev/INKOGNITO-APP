'use client';
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '96px 20px', display: 'grid', gap: 16, textAlign: 'center' }}>
      <div className="wordmark" style={{ padding: 0 }}>inkognito</div>
      <h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>Something went wrong</h1>
      <p className="meta" style={{ fontSize: 17 }}>Your draft is still on this device if you were writing. Try again.</p>
      <button className="btn" onClick={reset} style={{ justifySelf: 'center' }}>Try again</button>
    </main>
  );
}
