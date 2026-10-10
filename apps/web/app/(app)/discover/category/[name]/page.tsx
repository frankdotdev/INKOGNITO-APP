'use client';
import { use, useCallback } from 'react';
import { postService } from '../../../../../lib/postService';
import { FeedList } from '../../../../../components/FeedList';
export default function Category({ params }: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent(use(params).name);
  const load = useCallback((c?: string) => postService.byCategory(name, c), [name]);
  return (<div style={{ display: 'grid', gap: 16 }}><h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>{name}</h1>
    <FeedList load={load} emptyTitle={`Nothing in ${name} yet`} emptyHint="Be the first to write about it." /></div>);
}
