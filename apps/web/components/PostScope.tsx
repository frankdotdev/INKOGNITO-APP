'use client';
import { useCallback } from 'react';
import type { MyScope } from '@inkognito/core';
import { postService } from '../lib/postService';
import { FeedList } from './FeedList';
export function PostScope({ scope, title, emptyTitle, emptyHint }: { scope: MyScope; title: string; emptyTitle: string; emptyHint: string }) {
  const load = useCallback((c?: string) => postService.mine(scope, c), [scope]);
  return <div style={{ display: 'grid', gap: 16 }}><h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>{title}</h1><FeedList load={load} emptyTitle={emptyTitle} emptyHint={emptyHint} /></div>;
}
