'use client';
import Link from 'next/link';
import type { ActivityItem } from '@inkognito/core';
import { activityService } from '../../../../lib/meServices';
import { PagedList } from '../../../../components/PagedList';
import { timeAgo } from '../../../../lib/time';
const load = (c?: string) => activityService.activity(c);
const text = (a: ActivityItem) => a.kind === 'comment' ? `${a.actorName ?? 'Someone'} replied to your confession` : a.kind === 'reaction' ? 'Someone reacted to your confession' : a.kind === 'echo' ? 'Someone Echoed your confession' : 'You received a Whisper';
export default function ActivityPage() {
  return (<div style={{ display: 'grid', gap: 16 }}><h1 style={{ fontSize: 28, letterSpacing: '-.02em' }}>Activity</h1>
    <PagedList load={load} emptyTitle="Nothing yet" emptyHint="Replies, reactions, Echoes and Whispers on your confessions will show up here."
      render={(a: ActivityItem) => <Link key={`${a.kind}-${a.postId}-${a.createdAt}`} href={a.kind === 'whisper' ? '/messages' : `/post/${a.postId}`} className="card" style={{ display: 'block' }}>
        <div className="name">{text(a)}</div><div className="meta">{timeAgo(a.createdAt)} · “{a.postExcerpt}”</div></Link>} /></div>);
}
