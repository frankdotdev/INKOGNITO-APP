'use client';
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="center">
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <strong>Something went wrong</strong>
        <div className="dim">The Control Room hit an error. Try again.</div>
        <button className="btn primary" onClick={reset}>Try again</button>
      </div>
    </div>
  );
}
