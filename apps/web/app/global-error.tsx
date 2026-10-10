'use client';
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en" data-theme="obsidian">
      <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui, sans-serif', background: '#09090B', color: '#FAFAFA' }}>
        <main style={{ maxWidth: 560, padding: 24, display: 'grid', gap: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.03em' }}>inkognito</div>
          <h1 style={{ fontSize: 28, letterSpacing: '-.02em', margin: 0 }}>Something went wrong</h1>
          <p style={{ color: '#A1A1AA', margin: 0 }}>Try again. If this keeps happening, come back later.</p>
          <button onClick={reset} style={{ minHeight: 44, padding: '0 18px', borderRadius: 12, border: 0, background: '#7C5CFF', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
