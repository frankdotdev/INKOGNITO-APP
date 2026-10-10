import type { Comment, CommentService, MessageService, ModerationService, Page, ReactionService, Whisper } from '@inkognito/core';
import { rpc } from './postService';
const PAGE = 50;
type CRow = { id: string; parent_id: string | null; author_name: string; author_mark: number; author_context_id: string; body: string; expires_at: string | null; created_at: string; mine: boolean };
type WRow = { id: string; post_id: string; from_name: string; from_mark: number; body: string; mine: boolean; expires_at: string; created_at: string };
export const commentService: CommentService = {
  async list(postId, cursor): Promise<Page<Comment>> {
    const offset = cursor ? parseInt(cursor, 10) : 0;
    const rows = await rpc<CRow[]>('list_comments', { p_post: postId, p_limit: PAGE, p_offset: offset });
    return { items: rows.map(r => ({ id: r.id, postId, parentId: r.parent_id ?? undefined, mine: r.mine, body: r.body, status: 'active' as const,
      author: { contextId: r.author_context_id, name: r.author_name, mark: r.author_mark }, expiresAt: r.expires_at ?? undefined, createdAt: r.created_at })),
      cursor: rows.length === PAGE ? String(offset + PAGE) : undefined };
  },
  reply: (postId, body, parentId, fading) => rpc<string>('add_comment', { p_post: postId, p_body: body, p_parent: parentId ?? null, p_fading: !!fading }),
};
export const reactionService: ReactionService = {
  async react(t, kind) { await rpc('toggle_reaction', { p_type: t.type, p_id: t.id, p_kind: kind }); },
  async echo(postId, on, commentary) { await rpc('set_echo', { p_post: postId, p_on: on, p_commentary: commentary ?? null }); },
  async bookmark(postId, on) { await rpc('set_bookmark', { p_post: postId, p_on: on }); },
  vote: (postId, option) => rpc('vote_poll', { p_post: postId, p_option: option }),
};
export const messageService: MessageService = {
  async sendWhisper(postId, body) { await rpc('send_whisper', { p_post: postId, p_body: body }); },
  async listWhispers(): Promise<Page<Whisper>> {
    const rows = await rpc<WRow[]>('list_whispers', { p_limit: 100, p_offset: 0 });
    return { items: rows.map(r => ({ id: r.id, postId: r.post_id, mine: r.mine, body: r.body, from: { contextId: r.post_id, name: r.from_name, mark: r.from_mark }, expiresAt: r.expires_at, createdAt: r.created_at })) };
  },
};
export const moderationService: ModerationService = {
  async report(t, category, description) { await rpc('report_content', { p_type: t.type, p_id: t.id, p_category: category, p_description: description ?? null }); },
};
