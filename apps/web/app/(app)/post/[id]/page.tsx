'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { Post } from '@inkognito/core';
import { postService } from '../../../../lib/postService';
import { ConfessionCard } from '../../../../components/ConfessionCard';
import { CommentThread } from '../../../../components/CommentThread';
import { WhisperComposer } from '../../../../components/WhisperComposer';
import { StartDm } from '../../../../components/StartDm';
import { EmptyState, Skeleton } from '../../../../components/ui';
export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const router = useRouter();
  const [post, setPost] = useState<Post | null>(null); const [state, setState] = useState<'loading' | 'gone' | 'error'>('loading');
  useEffect(() => { postService.getPost(id).then(setPost).catch(e => setState(e.message === 'not_found' ? 'gone' : 'error')); }, [id]);
  return (<>
    <button className="act" onClick={() => router.back()} aria-label="Back"><ArrowLeft size={20} />Back</button>
    {post ? <div style={{ display: 'grid', gap: 16 }}>
      <ConfessionCard post={post} detail onRemoved={() => router.replace('/void')} />
      {!post.mine && <><WhisperComposer postId={post.id} /><div><StartDm type="post" id={post.id} /></div></>}
      <CommentThread postId={post.id} enabled={post.commentsEnabled} shareable={post.shareable} /></div>
      : state === 'loading' ? <Skeleton n={2} />
      : state === 'gone' ? <EmptyState title="This is gone" hint="It was removed, deleted, or it faded away." />
      : <EmptyState title="Couldn't load this post" hint="Check your connection and try again." />}
  </>);
}
