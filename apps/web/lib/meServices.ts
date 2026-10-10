import type { ActivityService } from '@inkognito/core';
import { rpc } from './postService';
const off = (c?: string) => (c ? parseInt(c, 10) : 0);
export const activityService: ActivityService = {
  async myComments(cursor) {
    const rows = await rpc<any[]>('list_my_comments', { p_limit: 30, p_offset: off(cursor) });
    return { items: rows.map(r => ({ id: r.id, postId: r.post_id, body: r.body, postExcerpt: r.post_excerpt ?? undefined, expiresAt: r.expires_at ?? undefined, createdAt: r.created_at })), cursor: rows.length === 30 ? String(off(cursor) + 30) : undefined };
  },
  async activity(cursor) {
    const rows = await rpc<any[]>('list_activity', { p_limit: 30, p_offset: off(cursor) });
    return { items: rows.map(r => ({ kind: r.kind, postId: r.post_id, postExcerpt: r.post_excerpt, actorName: r.actor_name ?? undefined, createdAt: r.created_at })), cursor: rows.length === 30 ? String(off(cursor) + 30) : undefined };
  },
};
