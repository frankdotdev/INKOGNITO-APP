import { createClient } from '@supabase/supabase-js';
// Server-side reads for share pages. Uses the anon role, which can only call the two public share functions.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env is not configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export type PublicPost = { id: string; authorName: string; body: string; category: string | null; mood: string | null; createdAt: string; pollQuestion: string | null };
export type PublicComment = { id: string; postId: string; authorName: string; body: string; createdAt: string; postExcerpt: string };
export const excerpt = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t);
export async function getPublicPost(id: string): Promise<PublicPost | null> {
  if (!uuid.test(id)) return null;
  const { data, error } = await client().rpc('get_public_post', { p_id: id }); if (error) throw new Error(error.message);
  const r = data?.[0]; return r ? { id: r.id, authorName: r.author_name, body: r.body, category: r.category, mood: r.mood, createdAt: r.created_at, pollQuestion: r.poll_question } : null;
}
export async function getPublicComment(id: string): Promise<PublicComment | null> {
  if (!uuid.test(id)) return null;
  const { data, error } = await client().rpc('get_public_comment', { p_id: id }); if (error) throw new Error(error.message);
  const r = data?.[0]; return r ? { id: r.id, postId: r.post_id, authorName: r.author_name, body: r.body, createdAt: r.created_at, postExcerpt: r.post_excerpt } : null;
}
export type PublicAlias = { alias: string; claimedAt: string; postCount: number; posts: { id: string; body: string; created_at: string }[] };
export async function getPublicAlias(alias: string): Promise<PublicAlias | null> {
  if (!/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(alias)) return null;
  const { data, error } = await client().rpc('get_public_alias', { p_alias: alias }); if (error) throw new Error(error.message);
  const r = data?.[0]; return r ? { alias: r.alias, claimedAt: r.claimed_at, postCount: r.post_count, posts: r.posts ?? [] } : null;
}
