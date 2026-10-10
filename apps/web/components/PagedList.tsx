'use client';
import { useEffect, useState } from 'react';
import type { Page } from '@inkognito/core';
import { EmptyState, Skeleton } from './ui';
/** `load` must be memoized (module-level or useCallback). */
export function PagedList<T>({ load, render, emptyTitle, emptyHint }: { load: (cursor?: string) => Promise<Page<T>>; render: (item: T) => React.ReactNode; emptyTitle: string; emptyHint: string }) {
  const [items, setItems] = useState<T[] | null>(null); const [cursor, setCursor] = useState<string | undefined>(); const [err, setErr] = useState(false); const [more, setMore] = useState(false);
  useEffect(() => { let live = true; load().then(p => { if (live) { setItems(p.items); setCursor(p.cursor); } }).catch(() => live && setErr(true)); return () => { live = false; }; }, [load]);
  const next = async () => { setMore(true); try { const p = await load(cursor); setItems(x => [...(x ?? []), ...p.items]); setCursor(p.cursor); } catch { setErr(true); } setMore(false); };
  if (err) return <EmptyState title="Couldn't load this" hint="Check your connection and try again." />;
  if (!items) return <Skeleton />;
  if (items.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  return <>{items.map(render)}{cursor && <button className="btn ghost" style={{ width: '100%' }} disabled={more} onClick={next}>{more ? 'Loading…' : 'Load more'}</button>}</>;
}
