'use client';
import { useCallback, useEffect, useState } from 'react';
import type { BlockedIdentity } from '@inkognito/core';
import { blockService } from '../../../../lib/settingsServices';
import { EmptyState, Skeleton } from '../../../../components/ui';
import { timeAgo } from '../../../../lib/time';
export default function Safety() {
  const [items, setItems] = useState<BlockedIdentity[] | null>(null); const [err, setErr] = useState('');
  const load = useCallback(() => blockService.list().then(setItems).catch(() => setErr("Couldn't load your blocked list.")), []);
  useEffect(() => { load(); }, [load]);
  const unblock = async (id: string) => { setErr(''); try { await blockService.unblock(id); await load(); } catch { setErr("Couldn't unblock. Try again."); } };
  return (<div style={{ display: 'grid', gap: 16 }}><h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>Safety</h1>
    <p className="meta">Blocking hides someone's posts, comments and Whispers from you, and stops them from sending you Whispers. They aren't told. You can block from the menu on a post, or from a comment.</p>
    <h3 className="h">Blocked</h3>
    {err && <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p>}
    {!items ? <Skeleton n={1} /> : items.length === 0 ? <EmptyState title="No one blocked" hint="People you block will appear here." /> :
      items.map(b => <div key={b.id} className="list-row"><div className="grow"><div className="name">{b.label}</div><div className="meta">Blocked {timeAgo(b.blockedAt)}. This is the name they had where you blocked them.</div></div><button className="btn ghost" onClick={() => unblock(b.id)}>Unblock</button></div>)}
  </div>);
}
