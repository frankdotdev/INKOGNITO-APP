import type { FeedKind, Mood, Page, Post, PostService } from '@inkognito/core';
import { supabase, ensureSession, resetSession } from './supabase';
const PAGE = 20;
export async function rpc<T>(fn: string, args?: Record<string, unknown>, retried = false): Promise<T> {
  await ensureSession();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    // This device was removed from its identity (revoked or purged): start a fresh anonymous identity once.
    if (!retried && error.message.includes('no_identity')) { resetSession(); return rpc<T>(fn, args, true); }
    throw new Error(error.message);
  }
  return data as T;
}
type Row = { id: string; author_name: string; author_mark: number; author_context_id: string; body: string; category: string | null; mood: Mood | null;
  comments_enabled: boolean; created_at: string; reactions: number; comments: number; echoes: number; mine: boolean; saved: boolean; reacted: boolean; echoed: boolean; allow_sharing: boolean; poll: any };
const toPost = (r: Row): Post => ({
  id: r.id, author: { contextId: r.author_context_id, name: r.author_name, mark: r.author_mark }, body: r.body,
  category: r.category ?? undefined, mood: r.mood ?? undefined, media: [],
  poll: r.poll ? { question: r.poll.question, options: r.poll.options, votes: r.poll.votes ?? undefined, myVote: r.poll.myVote ?? undefined } : undefined,
  counts: { reactions: r.reactions, comments: r.comments, echoes: r.echoes }, mine: r.mine, saved: r.saved, reacted: r.reacted, echoed: r.echoed, shareable: r.allow_sharing,
  status: 'active', commentsEnabled: r.comments_enabled, createdAt: r.created_at,
});
const MEDIA = process.env.NEXT_PUBLIC_MEDIA_URL?.replace(/\/$/, '');
async function withMedia(posts: Post[]): Promise<Post[]> {
  if (!MEDIA || posts.length === 0) return posts;
  try {
    const rows = await rpc<{ post_id: string; r2_key: string; width: number; height: number }[]>('get_media_for_posts', { p_post_ids: posts.map(p => p.id) });
    return posts.map(p => ({ ...p, media: rows.filter(r => r.post_id === p.id).map(r => ({ url: `${MEDIA}/m/${r.r2_key}`, width: r.width, height: r.height })) }));
  } catch { return posts; } // a media lookup failure should not hide the text
}
async function feed(kind: FeedKind, cursor: string | undefined, query?: string, category?: string): Promise<Page<Post>> {
  const offset = cursor ? parseInt(cursor, 10) : 0;
  const rows = await rpc<Row[]>('get_feed', { p_kind: kind, p_query: query ?? null, p_category: category ?? null, p_limit: PAGE, p_offset: offset });
  return { items: await withMedia(rows.map(toPost)), cursor: rows.length === PAGE ? String(offset + PAGE) : undefined };
}
export const postService: PostService = {
  async setSharing(id, on) { await rpc('set_post_sharing', { p_id: id, p_on: on }); },
  async remove(id) { await rpc('delete_own_post', { p_id: id }); },
  getFeed: (kind, cursor) => feed(kind, cursor),
  search: (q, cursor) => feed('fresh', cursor, q),
  async mine(scope, cursor) {
    const offset = cursor ? parseInt(cursor, 10) : 0;
    const rows = await rpc<Row[]>('get_my_feed', { p_scope: scope, p_limit: PAGE, p_offset: offset });
    return { items: await withMedia(rows.map(toPost)), cursor: rows.length === PAGE ? String(offset + PAGE) : undefined };
  },
  byCategory: (c, cursor) => feed('fresh', cursor, undefined, c),
  async getPost(id) {
    const rows = await rpc<Row[]>('get_feed', { p_id: id, p_limit: 1 });
    if (!rows[0]) throw new Error('not_found'); return (await withMedia([toPost(rows[0])]))[0];
  },
  async takeMeSomewhere() {
    const rows = await rpc<Row[]>('get_feed', { p_kind: 'random', p_limit: 1 });
    if (!rows[0]) throw new Error('not_found'); return (await withMedia([toPost(rows[0])]))[0];
  },
  async createPost(i) {
    const id = await rpc<string>('create_post', { p_body: i.body, p_category: i.category ?? null, p_mood: i.mood ?? null,
      p_poll_question: i.poll?.question ?? null, p_fading_hours: i.fadingHours ?? null, p_comments_enabled: i.commentsEnabled, p_allow_sharing: i.allowSharing ?? true });
    let held = false; // image posts may wait for a moderator before anyone sees them
    if (i.mediaIds?.length) {
      try { held = await rpc<boolean>('attach_post_media', { p_post: id, p_media: i.mediaIds }); }
      catch (e) { await rpc('delete_own_post', { p_id: id }).catch(() => {}); throw e; } // never leave a half-posted confession
    }
    return { id, pendingReview: held };
  },
};
export const friendlyError = (e: unknown) => {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('rate_limited')) return "You're doing that too fast. Try again in a bit.";
  if (m.includes('restricted')) return 'Your account is restricted from posting.';
  if (m.includes('not_found')) return 'That is no longer available.';
  if (m.includes('own_post')) return "You can't whisper to your own confession.";
  if (m.includes('invalid_body')) return 'Write something first, within the length limit.';
  return "Couldn't reach Inkognito. Check your connection and try again.";
};
