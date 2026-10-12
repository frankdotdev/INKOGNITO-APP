'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Globe2, Lock, Users } from 'lucide-react';
import { anonInboxService, type AnonVisibility } from '../../../../lib/anonInboxService';

const VISIBILITY_OPTIONS: { value: AnonVisibility; label: string; sub: string; icon: typeof Lock }[] = [
  {
    value: 'private',
    label: 'Only me can read replies',
    sub: 'Classic anonymous Q&A. You share the link, collect confessions privately, then screenshot and post what you like.',
    icon: Lock,
  },
  {
    value: 'link',
    label: 'Anyone with the link can read',
    sub: 'Replies are visible to everyone who has your link — a shared anonymous board.',
    icon: Users,
  },
  {
    value: 'public',
    label: 'Public on Inkognito',
    sub: 'The inbox and all replies appear in Discover. Anyone on the platform can find and contribute.',
    icon: Globe2,
  },
];

export default function CreateAnonInbox() {
  const r = useRouter();
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [visibility, setVisibility] = useState<AnonVisibility>('private');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ slug: string } | null>(null);

  const field: React.CSSProperties = {
    width: '100%',
    background: 'var(--surface-raised)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    color: 'var(--text-primary)',
    padding: '12px',
    minHeight: 44,
    font: 'inherit',
  };

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true); setErr('');
    try {
      const { slug } = await anonInboxService.create(title.trim(), prompt.trim(), visibility);
      setDone({ slug });
    } catch {
      setErr("Couldn't create your anonymous inbox. Try again.");
    }
    setBusy(false);
  };

  if (done) {
    const shareUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/anon/${done.slug}`
      : `/anon/${done.slug}`;
    return (
      <div style={{ display: 'grid', gap: 20, justifyItems: 'start' }}>
        <h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>Your anonymous inbox is live ✦</h1>
        <p className="meta">Share this link. Anyone who opens it can leave you an anonymous confession or reply.</p>
        <div style={{ ...field, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-raised)' }}>
          <Link2 size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ flex: 1, wordBreak: 'break-all', fontSize: 15 }}>{shareUrl}</span>
          <button
            className="btn ghost"
            style={{ flexShrink: 0 }}
            onClick={() => navigator.clipboard.writeText(shareUrl).catch(() => {})}
          >
            Copy
          </button>
        </div>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button
            className="btn"
            onClick={() => navigator.share({ title: 'Leave me an anonymous confession', url: shareUrl }).catch(() => {})}
          >
            Share link
          </button>
        )}
        <button className="btn ghost" onClick={() => r.push(`/anon/${done.slug}`)}>
          View inbox
        </button>
        <button className="btn ghost" onClick={() => r.push('/me/anon')}>
          All my inboxes
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={e => { e.preventDefault(); submit(); }} style={{ display: 'grid', gap: 20 }}>
      <h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>Create an anonymous inbox</h1>
      <p className="meta">
        Share a link. Anyone who opens it can leave you a confession anonymously — no sign-up needed.
        You get a random name for every sender so you never know who said what.
      </p>

      <label>
        <div className="name" style={{ marginBottom: 6 }}>Your question or invitation</div>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. What do you really think of me?"
          maxLength={200}
          required
          style={field}
        />
      </label>

      <label>
        <div className="name" style={{ marginBottom: 6 }}>Extra context <span className="meta">(optional)</span></div>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Add a description or rules if you like…"
          maxLength={500}
          rows={3}
          style={{ ...field, resize: 'vertical' }}
        />
      </label>

      <div>
        <div className="name" style={{ marginBottom: 10 }}>Who can read the replies?</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {VISIBILITY_OPTIONS.map(opt => {
            const Icon = opt.icon;
            const active = visibility === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setVisibility(opt.value)}
                style={{
                  textAlign: 'left',
                  background: active ? 'var(--accent-subtle, rgba(99,102,241,0.12))' : 'var(--surface-raised)',
                  border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 14,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                  transition: 'border-color .15s',
                }}
              >
                <Icon size={20} style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)', marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div className="name" style={{ marginBottom: 4 }}>{opt.label}</div>
                  <div className="meta">{opt.sub}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {err && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}

      <button
        type="submit"
        disabled={busy || !title.trim()}
        style={{ ...field, background: 'var(--accent)', border: 0, fontWeight: 700, opacity: busy || !title.trim() ? 0.5 : 1 }}
      >
        {busy ? 'Creating…' : 'Create inbox & get link'}
      </button>
    </form>
  );
}
