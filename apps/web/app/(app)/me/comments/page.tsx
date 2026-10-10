'use client';
import Link from 'next/link';
import type { MyComment } from '@inkognito/core';
import { activityService } from '../../../../lib/meServices';
import { PagedList } from '../../../../components/PagedList';
import { timeAgo, timeLeft } from '../../../../lib/time';
const load = (c?: string) => activityService.myComments(c);
export default function MyComments() {
  return (<div style={{ display: 'grid', gap: 16 }}><h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>My comments</h1>
    <PagedList load={load} emptyTitle="No comments yet" emptyHint="Your comments will appear here, only for you."
      render={(c: MyComment) => <Link key={c.id} href={`/post/${c.postId}`} className="card" style={{ display: 'block' }}>
        <p className="body" style={{ fontSize: 16, margin: '0 0 8px' }}>{c.body}</p>
        <div className="meta">{timeAgo(c.createdAt)}{c.expiresAt ? ` · fades, ${timeLeft(c.expiresAt)}` : ''}{c.postExcerpt ? ` · on “${c.postExcerpt}”` : ' · the post is gone'}</div></Link>} /></div>);
}
