import type { FeedKind, Mood, Page, Post, PostService } from '@inkognito/core';
import { supabase, ensureSession, resetSession } from './supabase';

const PAGE = 20;

export async function rpc<T>(fn: string, args?: Record<string, unknown>, retried = false): Promise<T> {
  await ensureSession();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (!retried && error.message.includes('no_identity')) { resetSession(); return rpc<T>(fn, args, true); }
    throw new Error(error.message);
  }
  return data as T;
}

type Row = {
  id: string; author_name: string; author_mark: number; author_context_id: string;
  body: string; category: string | null; mood: Mood | null;
  comments_enabled: boolean; created_at: string; reactions: number; comments: number; echoes: number;
  mine: boolean; saved: boolean; reacted: boolean; echoed: boolean; allow_sharing: boolean; poll: any;
};

const toPost = (r: Row): Post => ({
  id: r.id,
  author: { contextId: r.author_context_id, name: r.author_name, mark: r.author_mark },
  body: r.body,
  category: r.category ?? undefined,
  mood: r.mood ?? undefined,
  media: [],
  poll: r.poll ? {
    question: r.poll.question,
    options: r.poll.options,
    votes: r.poll.votes ?? undefined,
    myVote: r.poll.myVote ?? undefined,
  } : undefined,
  counts: { reactions: r.reactions, comments: r.comments, echoes: r.echoes },
  mine: r.mine, saved: r.saved, reacted: r.reacted, echoed: r.echoed,
  shareable: r.allow_sharing, status: 'active', commentsEnabled: r.comments_enabled, createdAt: r.created_at,
});

const MEDIA = process.env.NEXT_PUBLIC_MEDIA_URL?.replace(/\/$/, '');
async function withMedia(posts: Post[]): Promise<Post[]> {
  if (!MEDIA || posts.length === 0) return posts;
  try {
    const rows = await rpc<{ post_id: string; r2_key: string; width: number; height: number }[]>(
      'get_media_for_posts', { p_post_ids: posts.map(p => p.id) }
    );
    return posts.map(p => ({
      ...p,
      media: rows.filter(r => r.post_id === p.id).map(r => ({ url: `${MEDIA}/m/${r.r2_key}`, width: r.width, height: r.height })),
    }));
  } catch { return posts; }
}

// ─── Seen-post tracking ───────────────────────────────────────────────────────
const SEEN_KEY = 'ink-seen-posts';
const MAX_SEEN = 800;

function getSeenIds(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'); } catch { return []; }
}
export function markSeen(ids: string[]) {
  try {
    const seen = new Set(getSeenIds());
    ids.forEach(id => seen.add(id));
    const arr = [...seen];
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr.slice(-MAX_SEEN)));
  } catch {}
}

// ─── Interest profile (category weights built from interactions) ──────────────
const INTEREST_KEY = 'ink-interests';

export function recordInterest(category: string | undefined, weight: number) {
  if (!category) return;
  try {
    const profile: Record<string, number> = JSON.parse(localStorage.getItem(INTEREST_KEY) ?? '{}');
    profile[category] = (profile[category] ?? 0) + weight;
    // Decay all weights slightly to prevent one category from dominating forever
    for (const k of Object.keys(profile)) profile[k] *= 0.98;
    localStorage.setItem(INTEREST_KEY, JSON.stringify(profile));
  } catch {}
}

function getInterests(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(INTEREST_KEY) ?? '{}'); } catch { return {}; }
}

// ─── For You client-side re-ranking & diversity ───────────────────────────────

function forYouScore(p: Post, interests: Record<string, number>, maxInterest: number): number {
  const hoursOld = Math.max(0, (Date.now() - new Date(p.createdAt).getTime()) / 3_600_000);

  // Engagement signal
  const engagement = p.counts.reactions * 1.2 + p.counts.comments * 2.5 + p.counts.echoes * 3.5;
  const engagementFactor = Math.log1p(engagement) * 1.6;

  // HN-style gravity decay: score halves every ~5h
  const recencyFactor = 8.0 / Math.pow(hoursOld + 1.5, 1.2);

  // Category affinity from local interest profile
  const catScore = p.category ? (interests[p.category] ?? 0) : 0;
  const affinityBonus = maxInterest > 0 ? (catScore / maxInterest) * 2.5 : 0;

  // Content richness
  const richness = (p.media?.length ? 0.7 : 0) + (p.poll ? 0.6 : 0);

  // Own-post suppression
  const ownPenalty = p.mine ? -2.5 : 0;

  // Controlled serendipity (smaller randomness — real signal dominates)
  const jitter = Math.random() * 1.8;

  return engagementFactor + recencyFactor + affinityBonus + richness + ownPenalty + jitter;
}

/**
 * Enforces category diversity: no category appears more than `maxRun` times
 * consecutively, and no category takes more than `maxShare` of the total feed.
 */
function diversify(posts: Post[], maxRun = 3, maxShare = 0.4): Post[] {
  const result: Post[] = [];
  const catCounts: Record<string, number> = {};
  const remaining = [...posts];

  while (result.length < posts.length && remaining.length > 0) {
    // Determine what the last `maxRun` categories were
    const recentCats = result.slice(-maxRun).map(p => p.category ?? '__none__');
    const lastCat = recentCats[recentCats.length - 1];
    const isRun = recentCats.length >= maxRun && recentCats.every(c => c === lastCat);

    // Find the first post from remaining that breaks the run (if we're in a run)
    let picked = -1;
    for (let i = 0; i < remaining.length; i++) {
      const cat = remaining[i].category ?? '__none__';
      // Check share cap
      const totalSoFar = result.length || 1;
      if ((catCounts[cat] ?? 0) / totalSoFar > maxShare && remaining.length > 1) continue;
      // Break run if needed
      if (isRun && cat === lastCat && remaining.length > 1) continue;
      picked = i;
      break;
    }

    if (picked === -1) picked = 0; // fallback: just take next

    const post = remaining.splice(picked, 1)[0];
    const cat = post.category ?? '__none__';
    catCounts[cat] = (catCounts[cat] ?? 0) + 1;
    result.push(post);
  }

  return result;
}

function rankForYou(posts: Post[]): Post[] {
  const interests = getInterests();
  const maxInterest = Math.max(0, ...Object.values(interests));
  const scored = [...posts].sort((a, b) => forYouScore(b, interests, maxInterest) - forYouScore(a, interests, maxInterest));
  return diversify(scored);
}

// ─── Feed fetcher ─────────────────────────────────────────────────────────────

async function feed(kind: FeedKind, cursor: string | undefined, query?: string, category?: string): Promise<Page<Post>> {
  const offset = cursor ? parseInt(cursor, 10) : 0;

  // For forYou: pass seen IDs to the server so it skips them in its candidate pool.
  // We send up to 200 most-recent seen IDs to avoid URL bloat.
  const seenIds = kind === 'forYou' ? getSeenIds().slice(-200) : null;

  const rows = await rpc<Row[]>('get_feed', {
    p_kind: kind,
    p_query: query ?? null,
    p_category: category ?? null,
    p_limit: PAGE,
    p_offset: offset,
    p_seen_ids: seenIds && seenIds.length > 0 ? seenIds : null,
  });

  let items = await withMedia(rows.map(toPost));

  if (kind === 'forYou') {
    items = rankForYou(items);
  }

  // Mark all fetched IDs as seen
  markSeen(items.map(p => p.id));

  return { items, cursor: rows.length === PAGE ? String(offset + PAGE) : undefined };
}

// ─── Service ──────────────────────────────────────────────────────────────────

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
    if (!rows[0]) throw new Error('not_found');
    return (await withMedia([toPost(rows[0])]))[0];
  },
  async takeMeSomewhere() {
    const rows = await rpc<Row[]>('get_feed', { p_kind: 'random', p_limit: 1 });
    if (!rows[0]) throw new Error('not_found');
    return (await withMedia([toPost(rows[0])]))[0];
  },
  async createPost(i) {
    const id = await rpc<string>('create_post', {
      p_body: i.body, p_category: i.category ?? null, p_mood: i.mood ?? null,
      p_poll_question: i.poll?.question ?? null, p_fading_hours: i.fadingHours ?? null,
      p_comments_enabled: i.commentsEnabled, p_allow_sharing: i.allowSharing ?? true,
    });
    let held = false;
    if (i.mediaIds?.length) {
      try { held = await rpc<boolean>('attach_post_media', { p_post: id, p_media: i.mediaIds }); }
      catch (e) { await rpc('delete_own_post', { p_id: id }).catch(() => {}); throw e; }
    }
    // New post: record category interest since the creator clearly cares about it
    if (i.category) recordInterest(i.category, 2.0);
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
