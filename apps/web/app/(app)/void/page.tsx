'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import type { FeedKind } from '@inkognito/core';
import { postService } from '../../../lib/postService';
import { FeedList } from '../../../components/FeedList';
const tabs: [FeedKind, string][] = [['forYou', 'For you'], ['fresh', 'Fresh'], ['trending', 'Trending'], ['questions', 'Questions'], ['polls', 'Polls']];
export default function Void() {
  const [kind, setKind] = useState<FeedKind>('forYou');
  const load = useCallback((c?: string) => postService.getFeed(kind, c), [kind]);
  return (<>
    <Link href="/create" className="composer">What's on your mind?</Link>
    <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" className="tab" aria-selected={k === kind} onClick={() => setKind(k)}>{l}</button>)}</div>
    <FeedList load={load} emptyTitle="Nothing here yet" emptyHint="Be the first to write something." />
  </>);
}
