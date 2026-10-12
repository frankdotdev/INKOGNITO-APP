'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Globe2, Lock, Users, MessageSquare } from 'lucide-react';
import { anonInboxService, type AnonInbox, type AnonVisibility } from '../../../../lib/anonInboxService';
import { timeAgo } from '../../../../lib/time';

const VIS_ICONS: Record<AnonVisibility, typeof Lock> = { private: Lock, link: Users, public: Globe2 };

export default function MyAnonInboxes() {
  const [inboxes, setInboxes] = useState<AnonInbox[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    anonInboxService.myInboxes().then(setInboxes).catch(() => setErr("Couldn't load your inboxes."));
  }, []);

  if (!inboxes) return <div className="meta">Loading…</div>;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 26, letterSpacing: '-.02em' }}>My Anonymous Inboxes</h1>
        <Link href="/anon/create" className="btn" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 18px' }}>
          <Plus size={18} /> New
        </Link>
      </div>

      {err && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}

      {inboxes.length === 0 && (
        <div style={{ display: 'grid', gap: 14, justifyItems: 'start', paddingTop: 24 }}>
          <p className="meta">You have no anonymous inboxes yet.</p>
          <Link href="/anon/create" className="btn">Create your first inbox</Link>
        </div>
      )}

      {inboxes.map(box => {
        const Icon = VIS_ICONS[box.visibility];
        return (
          <Link key={box.id} href={`/anon/${box.slug}`} className="card" style={{ display: 'grid', gap: 8, textDecoration: 'none', color: 'inherit' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="name" style={{ fontSize: 17 }}>{box.title}</span>
              <span className="meta row" style={{ gap: 6 }}>
                <Icon size={13} />
                {box.visibility === 'private' ? 'Private' : box.visibility === 'link' ? 'Link' : 'Public'}
              </span>
            </div>
            {box.prompt && <p className="meta" style={{ fontSize: 13 }}>{box.prompt.slice(0, 100)}{box.prompt.length > 100 ? '…' : ''}</p>}
            <div className="row meta" style={{ gap: 12 }}>
              <span className="row" style={{ gap: 5 }}><MessageSquare size={13} />{box.messageCount ?? 0} message{(box.messageCount ?? 0) !== 1 ? 's' : ''}</span>
              <span>· {timeAgo(box.createdAt)}</span>
              {box.closed && <span style={{ color: 'var(--danger)' }}>· Closed</span>}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
