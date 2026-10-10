'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { dmEnabled, dmService, dmErrorText, type DmConversation } from '../../../../lib/dmClient';
import { MessagesTabs } from '../../../../components/MessagesTabs';
import { EmptyState, Skeleton } from '../../../../components/ui';
import { timeAgo } from '../../../../lib/time';
export default function DmList() {
  const [items, setItems] = useState<DmConversation[] | null>(null); const [err, setErr] = useState('');
  useEffect(() => { if (!dmEnabled) return; let live = true; const load = () => dmService.list().then(x => { if (live) { setItems(x); setErr(''); } }).catch(e => live && setErr(dmErrorText(e))); load(); const t = setInterval(() => document.visibilityState === 'visible' && load(), 8000); return () => { live = false; clearInterval(t); }; }, []);
  if (!dmEnabled) return <EmptyState title="Private chats aren't available" hint="They haven't been switched on for this deployment." />;
  return (<div style={{ display: 'grid', gap: 12 }}><MessagesTabs />
    {err && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
    {!items ? <Skeleton n={2} /> : items.length === 0 ? <EmptyState title="No private chats" hint="Open any post or comment and tap Message privately. Starting one needs Plus; replying doesn't." /> :
      items.map(c => <Link key={c.id} href={`/messages/dm/${c.id}`} className="card" style={{ display: 'block' }}><div className="row"><span className="name">{c.peer}</span><span className="grow" />{c.unread > 0 && <span className="badge" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>{c.unread} new</span>}<span className="meta">{timeAgo(c.lastAt)}</span></div>
        <div className="meta" style={{ marginTop: 6, overflowWrap: 'anywhere' }}>{c.lastFromMe ? 'You: ' : ''}{c.preview || 'No messages yet'}</div></Link>)}
  </div>);
}
