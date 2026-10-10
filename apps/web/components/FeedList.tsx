'use client';
import { useEffect, useState } from 'react';
import type { Page, Post } from '@inkognito/core';
import { ConfessionCard } from './ConfessionCard';
import { EmptyState, Skeleton } from './ui';
/** `load` must be memoized (useCallback); a new `load` reloads the list from the start. */
export function FeedList({ load, emptyTitle, emptyHint }: { load: (cursor?: string) => Promise<Page<Post>>; emptyTitle: string; emptyHint: string }) {
  const [posts, setPosts] = useState<Post[] | null>(null); const [cursor, setCursor] = useState<string | undefined>(); const [err, setErr] = useState(false); const [more, setMore] = useState(false);
  useEffect(() => { let live = true; setPosts(null); setErr(false); load().then(p => { if (live) { setPosts(p.items); setCursor(p.cursor); } }).catch(() => live && setErr(true)); return () => { live = false; }; }, [load]);
  const next = async () => { setMore(true); try { const p = await load(cursor); setPosts(x => [...(x ?? []), ...p.items]); setCursor(p.cursor); } catch { setErr(true); } setMore(false); };
  if (err) return <EmptyState title="Couldn't load this" hint="Check your connection and try again." />;
  if (!posts) return <Skeleton />;
  if (posts.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  return <>{posts.map(p => <ConfessionCard key={p.id} post={p} onRemoved={() => setPosts(x => (x ? x.filter(y => y.id !== p.id) : x))} />)}
    {cursor && <button className="btn ghost" style={{ width: '100%' }} disabled={more} onClick={next}>{more ? 'Loading…' : 'Load more'}</button>}</>;
}
