'use client';
import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import type { Page, Post } from '@inkognito/core';
import { ConfessionCard } from './ConfessionCard';
import { EmptyState, Skeleton } from './ui';
/** `load` must be memoized (useCallback); a new `load` reloads the list from the start. */
export function FeedList({ load, emptyTitle, emptyHint }: { load: (cursor?: string) => Promise<Page<Post>>; emptyTitle: string; emptyHint: string }) {
  const [posts, setPosts] = useState<Post[] | null>(null); const [cursor, setCursor] = useState<string | undefined>(); const [err, setErr] = useState(false); const [more, setMore] = useState(false);
  const [pending, setPending] = useState<Post[]>([]);
  useEffect(() => {
    let live = true;
    setPosts(null);
    setPending([]);
    setErr(false);
    load().then(p => { if (live) { setPosts(p.items); setCursor(p.cursor); } }).catch(() => live && setErr(true));

    // Live background polling every 8s when user is on the tab
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      load().then(p => {
        if (!live) return;
        setPosts(prev => {
          if (!prev) return p.items;
          const prevIds = new Set(prev.map(i => i.id));
          const freshMap = new Map(p.items.map(i => [i.id, i]));

          // Find brand new posts that were posted after our initial load
          const newArrivals = p.items.filter(i => !prevIds.has(i.id));
          if (newArrivals.length > 0) {
            setPending(cur => {
              const curIds = new Set(cur.map(x => x.id));
              const newlyDiscovered = newArrivals.filter(x => !curIds.has(x.id));
              return newlyDiscovered.length > 0 ? [...newlyDiscovered, ...cur] : cur;
            });
          }

          // Update counts on currently visible posts without shifting their position
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

  const revealNewPosts = () => {
    if (pending.length === 0) return;
    setPosts(prev => [...pending, ...(prev ?? [])]);
    setPending([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const next = async () => { setMore(true); try { const p = await load(cursor); setPosts(x => [...(x ?? []), ...p.items]); setCursor(p.cursor); } catch { setErr(true); } setMore(false); };
  if (err) return <EmptyState title="Couldn't load this" hint="Check your connection and try again." />;
  if (!posts) return <Skeleton />;
  if (posts.length === 0 && pending.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  return (
    <>
      {pending.length > 0 && (
        <div style={{ position: 'sticky', top: 12, zIndex: 40, display: 'flex', justifyContent: 'center', pointerEvents: 'none', marginBottom: 12 }}>
          <button
            type="button"
            className="new-posts-pill"
            onClick={revealNewPosts}
            aria-label={`${pending.length} new confessions. Tap to view.`}
            style={{ pointerEvents: 'auto' }}
          >
            <div className="new-posts-avatars">
              {pending.slice(0, 3).map(p => (
                <span key={p.id} className="pill-avatar">
                  {p.author.name.slice(0, 1)}
                </span>
              ))}
            </div>
            <span>{pending.length === 1 ? '1 new post' : `${pending.length} new posts`}</span>
            <ArrowUp size={15} />
          </button>
        </div>
      )}
      {posts.map(p => <ConfessionCard key={p.id} post={p} onRemoved={() => setPosts(x => (x ? x.filter(y => y.id !== p.id) : x))} />)}
      {cursor && <button className="btn ghost" style={{ width: '100%' }} disabled={more} onClick={next}>{more ? 'Loading…' : 'Load more'}</button>}
    </>
  );
}
