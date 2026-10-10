'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { FeedKind } from '@inkognito/core';
import { postService } from '../../../lib/postService';
import { categories } from '../../../lib/categories';
import { FeedList } from '../../../components/FeedList';
import { TakeMeSomewhere } from '../../../components/TakeMeSomewhere';
const tabs: [FeedKind, string][] = [['trending', 'Trending'], ['fresh', 'Fresh'], ['deep', 'Deep'], ['questions', 'Questions'], ['polls', 'Polls'], ['echoed', 'Echoed']];
export default function Discover() {
  const [kind, setKind] = useState<FeedKind>('trending');
  const load = useCallback((c?: string) => postService.getFeed(kind, c), [kind]);
  return (<div style={{ display: 'grid', gap: 16 }}>
    <h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>Explore</h1>
    <form action="/search" method="get" role="search" className="row"><input className="field" name="q" aria-label="Search" placeholder="Find something" maxLength={100} required /><button className="btn" aria-label="Search"><Search size={20} /></button></form>
    <TakeMeSomewhere />
    <div className="tabs" aria-label="Topics">{categories.map(c => <Link key={c} className="tab" style={{ border: '1px solid var(--border)' }} href={`/discover/category/${encodeURIComponent(c)}`}>{c}</Link>)}</div>
    <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" className="tab" aria-selected={k === kind} onClick={() => setKind(k)}>{l}</button>)}</div>
    <FeedList load={load} emptyTitle="Nothing here yet" emptyHint="Check back soon, or write something yourself." />
  </div>);
}
