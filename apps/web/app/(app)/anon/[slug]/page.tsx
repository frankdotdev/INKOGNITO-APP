'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trash2, Globe2, Lock, Users, Link2, ChevronDown, ChevronUp } from 'lucide-react';
import { anonInboxService, type AnonInbox, type AnonMessage, type AnonVisibility } from '../../../../lib/anonInboxService';
import { timeAgo } from '../../../../lib/time';

const VIS_LABELS: Record<AnonVisibility, { label: string; Icon: typeof Lock }> = {
  private: { label: 'Only me', Icon: Lock },
  link: { label: 'Anyone with link', Icon: Users },
  public: { label: 'Public', Icon: Globe2 },
};

export default function AnonInboxPage() {
  const params = useParams() as { slug: string };
  const slug = params.slug;
  const r = useRouter();

  const [inbox, setInbox] = useState<AnonInbox | null>(null);
  const [messages, setMessages] = useState<AnonMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [sendBody, setSendBody] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/anon/${slug}` : `/anon/${slug}`;

  useEffect(() => {
    anonInboxService.getBySlug(slug)
      .then(async box => {
        if (!box) { setErr('This inbox does not exist or has been removed.'); setLoading(false); return; }
        setInbox(box);
        try {
          const msgs = await anonInboxService.getMessages(slug);
          setMessages(msgs);
        } catch {
          // forbidden if visibility=private and not owner — that's fine, just hide messages
        }
        setLoading(false);
      })
      .catch(() => { setErr("Couldn't load this inbox."); setLoading(false); });
  }, [slug]);

  const send = async () => {
    if (!sendBody.trim()) return;
    setSending(true); setSendErr('');
    try {
      await anonInboxService.sendMessage(slug, sendBody.trim());
      setSent(true);
      setSendBody('');
    } catch (e: any) {
      if (e?.message?.includes('inbox_closed')) setSendErr('This inbox is closed and no longer accepting messages.');
      else setSendErr("Couldn't send. Try again.");
    }
    setSending(false);
  };

  const removeMsg = async (id: string) => {
    if (!confirm('Remove this message?')) return;
    try {
      await anonInboxService.removeMessage(id);
      setMessages(ms => ms.filter(m => m.id !== id));
    } catch {}
  };

  const changeVisibility = async (v: AnonVisibility) => {
    if (!inbox) return;
    try {
      await anonInboxService.updateVisibility(inbox.id, v);
      setInbox({ ...inbox, visibility: v });
    } catch {}
  };

  const closeInbox = async () => {
    if (!inbox || !confirm('Close this inbox? No new messages will be accepted.')) return;
    try {
      await anonInboxService.close(inbox.id);
      setInbox({ ...inbox, closed: true });
    } catch {}
  };

  const field: React.CSSProperties = {
    width: '100%',
    background: 'var(--surface-raised)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    color: 'var(--text-primary)',
    padding: '12px',
    font: 'inherit',
  };

  if (loading) return <div className="meta">Loading…</div>;
  if (err) return <div style={{ display: 'grid', gap: 16 }}><p role="alert" style={{ color: 'var(--danger)' }}>{err}</p></div>;
  if (!inbox) return null;

  const { Icon: VisIcon } = VIS_LABELS[inbox.visibility];
  const isOwner = messages.some(m => m.isMine) || true; // best-effort: always show owner controls, backend enforces actual checks

  return (
    <div style={{ display: 'grid', gap: 24, paddingBottom: 64 }}>
      {/* Header */}
      <div style={{ display: 'grid', gap: 8 }}>
        <h1 style={{ fontSize: 26, letterSpacing: '-.02em' }}>{inbox.title}</h1>
        {inbox.prompt && <p className="meta">{inbox.prompt}</p>}
        <div className="row meta" style={{ gap: 12, flexWrap: 'wrap' }}>
          <span className="row" style={{ gap: 4 }}><VisIcon size={14} />{VIS_LABELS[inbox.visibility].label}</span>
          {inbox.closed && <span style={{ color: 'var(--danger)' }}>· Closed</span>}
          <span>· {messages.length} message{messages.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Share link */}
      <div style={{ ...field, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link2 size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, wordBreak: 'break-all' }}>{shareUrl}</span>
        <button className="btn ghost" style={{ flexShrink: 0, padding: '4px 12px' }}
          onClick={() => navigator.clipboard.writeText(shareUrl).catch(() => {})}>
          Copy
        </button>
      </div>

      {/* Visibility toggle — owner only */}
      <div>
        <div className="name" style={{ marginBottom: 8, fontSize: 13 }}>Who can read replies</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {(['private', 'link', 'public'] as AnonVisibility[]).map(v => (
            <button key={v}
              className={`btn ghost${inbox.visibility === v ? '' : ''}`}
              style={{
                border: `1.5px solid ${inbox.visibility === v ? 'var(--accent)' : 'var(--border)'}`,
                background: inbox.visibility === v ? 'var(--accent-subtle, rgba(99,102,241,0.12))' : 'transparent',
                fontSize: 13, padding: '6px 14px',
              }}
              onClick={() => changeVisibility(v)}>
              {VIS_LABELS[v].label}
            </button>
          ))}
        </div>
      </div>

      {/* Send form */}
      {!inbox.closed && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="name">Leave an anonymous confession</div>
          {sent ? (
            <div style={{ background: 'var(--surface-raised)', borderRadius: 12, padding: 16 }}>
              <p style={{ marginBottom: 10 }}>Your message was sent ✦</p>
              <button className="btn ghost" onClick={() => setSent(false)} style={{ fontSize: 14 }}>Send another</button>
            </div>
          ) : (
            <form onSubmit={e => { e.preventDefault(); send(); }} style={{ display: 'grid', gap: 10 }}>
              <textarea
                value={sendBody}
                onChange={e => setSendBody(e.target.value)}
                placeholder="Say something anonymously…"
                maxLength={2000}
                rows={4}
                style={{ ...field, resize: 'vertical' }}
              />
              {sendErr && <p role="alert" style={{ color: 'var(--danger)', fontSize: 14 }}>{sendErr}</p>}
              <button type="submit" disabled={sending || !sendBody.trim()}
                style={{ ...field, background: 'var(--accent)', border: 0, fontWeight: 700, opacity: sending || !sendBody.trim() ? 0.5 : 1 }}>
                {sending ? 'Sending…' : 'Send anonymously'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="name" style={{ fontSize: 15 }}>Messages</div>
          {messages.map(m => (
            <article key={m.id} className="card" style={{ display: 'grid', gap: 8, position: 'relative' }}>
              <div className="row">
                <span className="mark" aria-hidden>{m.publicName.split(' ').map(w => w[0]).join('').slice(0, 2)}</span>
                <div>
                  <div className="name">{m.publicName}</div>
                  <div className="meta">{timeAgo(m.createdAt)}</div>
                </div>
                <span className="grow" />
                <button className="act" aria-label="Remove" title="Remove message" onClick={() => removeMsg(m.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="body">{m.body}</p>
            </article>
          ))}
        </div>
      )}

      {messages.length === 0 && inbox.visibility !== 'private' && (
        <p className="meta" style={{ textAlign: 'center', paddingTop: 24 }}>
          No messages yet. Share the link above and be the first to get one.
        </p>
      )}

      {/* Close inbox */}
      {!inbox.closed && (
        <button className="btn ghost" style={{ color: 'var(--danger)', borderColor: 'var(--danger)', justifySelf: 'start' }}
          onClick={closeInbox}>
          Close inbox
        </button>
      )}
    </div>
  );
}
