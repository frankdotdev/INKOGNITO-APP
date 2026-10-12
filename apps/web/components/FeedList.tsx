'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import type { Page, Post } from '@inkognito/core';
import { ConfessionCard } from './ConfessionCard';
import { EmptyState, Skeleton } from './ui';

const SEEN_KEY = 'ink-seen-posts';
const MAX_SEEN = 500; // cap localStorage size

function getSeenIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')); } catch { return new Set(); }
}
function addSeenIds(ids: string[]) {
  try {
    const seen = getSeenIds();
    ids.forEach(id => seen.add(id));
    // Keep most recent MAX_SEEN
    const arr = [...seen];
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr.slice(-MAX_SEEN)));
  } catch {}
}

/** `load` must be memoized (useCallback); a new `load` reloads the list from the start. */
export function FeedList({ load, emptyTitle, emptyHint }: { load: (cursor?: string) => Promise<Page<Post>>; emptyTitle: string; emptyHint: string }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [err, setErr] = useState(false);
  const [more, setMore] = useState(false);
  // pending = genuinely new posts the user has NOT yet seen (arrived after initial load)
  const [pending, setPending] = useState<Post[]>([]);
  // Track the IDs that were in the very first load so the pill only fires for NEW arrivals
  const initialIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    setPosts(null);
    setPending([]);
    setErr(false);
    initialIds.current = new Set();

    load().then(p => {
      if (!live) return;
      const ids = p.items.map(i => i.id);
      initialIds.current = new Set(ids);
      addSeenIds(ids);
      setPosts(p.items);
      setCursor(p.cursor);
    }).catch(() => live && setErr(true));

    // Background poll every 10s — only when tab is visible
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      load().then(p => {
        if (!live) return;
        setPosts(prev => {
          if (!prev) return p.items;
          const prevIds = new Set(prev.map(i => i.id));
          const freshMap = new Map(p.items.map(i => [i.id, i]));

          // A "new arrival" is a post that:
          // 1. Was not present in our initial load
          // 2. Is not already in the current visible list
          const newArrivals = p.items.filter(i =>
            !prevIds.has(i.id) && !initialIds.current.has(i.id)
          );

          if (newArrivals.length > 0) {
            setPending(cur => {
              const curIds = new Set(cur.map(x => x.id));
              const truly = newArrivals.filter(x => !curIds.has(x.id));
              return truly.length > 0 ? [...truly, ...cur] : cur;
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
    }, 10_000);

    return () => { live = false; clearInterval(interval); };
  }, [load]);

  const revealNewPosts = () => {
    if (pending.length === 0) return;
    const ids = pending.map(p => p.id);
    addSeenIds(ids);
    initialIds.current = new Set([...initialIds.current, ...ids]);
    setPosts(prev => [...pending, ...(prev ?? [])]);
    setPending([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const next = async () => {
    setMore(true);
    try {
      const p = await load(cursor);
      addSeenIds(p.items.map(i => i.id));
      setPosts(x => [...(x ?? []), ...p.items]);
      setCursor(p.cursor);
    } catch { setErr(true); }
    setMore(false);
  };

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
            style={{ pointerEvents: 'all' }}
          >
            <span className="new-posts-avatars">
              {pending.slice(0, 3).map(p => (
                <span key={p.id} className="pill-avatar">
                  {p.author.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              ))}
            </span>
            <ArrowUp size={14} />
            {pending.length} new post{pending.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}
      {posts.map(p => <ConfessionCard key={p.id} post={p} />)}
      {cursor && (
        <button className="btn ghost" onClick={next} disabled={more} style={{ width: '100%', marginTop: 8 }}>
          {more ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}
