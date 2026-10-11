'use client';
import { useEffect, useState } from 'react';
import type { Page, Post } from '@inkognito/core';
import { ConfessionCard } from './ConfessionCard';
import { EmptyState, Skeleton } from './ui';
/** `load` must be memoized (useCallback); a new `load` reloads the list from the start. */
export function FeedList({ load, emptyTitle, emptyHint }: { load: (cursor?: string) => Promise<Page<Post>>; emptyTitle: string; emptyHint: string }) {
  const [posts, setPosts] = useState<Post[] | null>(null); const [cursor, setCursor] = useState<string | undefined>(); const [err, setErr] = useState(false); const [more, setMore] = useState(false);
  useEffect(() => {
    let live = true;
    setPosts(null);
    setErr(false);
    load().then(p => { if (live) { setPosts(p.items); setCursor(p.cursor); } }).catch(() => live && setErr(true));

    // Live background polling every 8s when user is on the tab
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      load().then(p => {
        if (!live) return;
        setPosts(prev => {
          if (!prev) return p.items;
          const freshMap = new Map(p.items.map(i => [i.id, i]));
          return prev.map(existing => {
            const fresh = freshMap.get(existing.id);
            return fresh
              ? { ...existing, counts: fresh.counts, poll: fresh.poll, reacted: existing.reacted, echoed: existing.echoed, saved: existing.saved }
              : existing;
          });
        });
      }).catch(() => {});
    }, 8_000);

    return () => { live = false; clearInterval(interval); };
  }, [load]);
  const next = async () => { setMore(true); try { const p = await load(cursor); setPosts(x => [...(x ?? []), ...p.items]); setCursor(p.cursor); } catch { setErr(true); } setMore(false); };
  if (err) return <EmptyState title="Couldn't load this" hint="Check your connection and try again." />;
  if (!posts) return <Skeleton />;
  if (posts.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  return <>{posts.map(p => <ConfessionCard key={p.id} post={p} onRemoved={() => setPosts(x => (x ? x.filter(y => y.id !== p.id) : x))} />)}
    {cursor && <button className="btn ghost" style={{ width: '100%' }} disabled={more} onClick={next}>{more ? 'Loading…' : 'Load more'}</button>}</>;
}
