import Link from 'next/link';
export function SharedCard({ name, meta, body, context, poll, href, cta }: { name: string; meta: string; body: string; context?: string; poll?: string | null; href: string; cta: string }) {
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 16px', display: 'grid', gap: 24 }}>
      <div className="wordmark" style={{ padding: 0 }}>inkognito</div>
      <article className="card">
        <div className="row"><span className="mark" aria-hidden>{name.split(' ').map(w => w[0]).join('')}</span><div><div className="name">{name}</div><div className="meta">{meta}</div></div></div>
        {context && <p className="meta" style={{ marginTop: 12 }}>{context}</p>}
        <p className="body">{body}</p>
        {poll && <div className="poll"><div className="name">{poll}</div><div className="meta">Vote to see the results.</div></div>}
      </article>
      <Link href={href} className="btn" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>{cta}</Link>
      <p className="meta" style={{ textAlign: 'center' }}>No account needed. You stay anonymous.</p>
    </main>
  );
}
