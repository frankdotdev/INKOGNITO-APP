'use client';
import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { postService, rpc } from '../../../lib/postService';
import { FeedList } from '../../../components/FeedList';
import { EmptyState } from '../../../components/ui';
export default function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (use(searchParams).q ?? '').trim();
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => { if (q.length < 2) { setNames([]); return; } let live = true; rpc<{ alias: string }[]>('search_aliases', { p_query: q.replace(/^@/, '') }).then(r => live && setNames(r.map(x => x.alias))).catch(() => live && setNames([])); return () => { live = false; }; }, [q]);
  const load = useCallback((c?: string) => postService.search(q, c), [q]);
  return (<div style={{ display: 'grid', gap: 16 }}>
    <form action="/search" method="get" role="search" className="row"><input className="field" name="q" aria-label="Search" defaultValue={q} placeholder="Find something" maxLength={100} required /><button className="btn" aria-label="Search"><Search size={20} /></button></form>
    {names.length > 0 && <div><h3 className="h">Names</h3><div className="tabs">{names.map(n => <Link key={n} className="tab" style={{ border: '1px solid var(--border)' }} href={`/a/${n}`}>@{n}</Link>)}</div></div>}
    {q ? <FeedList key={q} load={load} emptyTitle="No results" emptyHint="Try different words." /> : <EmptyState title="Find something" hint="Search confessions and topics." />}
  </div>);
}
