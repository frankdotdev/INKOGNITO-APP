import { supabase, rpc } from './supabase';

export type AnonVisibility = 'private' | 'link' | 'public';

export interface AnonInbox {
  id: string;
  title: string;
  prompt: string | null;
  visibility: AnonVisibility;
  slug: string;
  createdAt: string;
  closed: boolean;
  messageCount?: number;
}

export interface AnonMessage {
  id: string;
  publicName: string;
  body: string;
  createdAt: string;
  isMine: boolean;
}

function toInbox(r: any): AnonInbox {
  return {
    id: r.id,
    title: r.title,
    prompt: r.prompt ?? null,
    visibility: r.visibility,
    slug: r.slug,
    createdAt: r.created_at,
    closed: r.closed ?? false,
    messageCount: r.message_count !== undefined ? Number(r.message_count) : undefined,
  };
}

function toMessage(r: any): AnonMessage {
  return {
    id: r.id,
    publicName: r.public_name,
    body: r.body,
    createdAt: r.created_at,
    isMine: r.is_mine ?? false,
  };
}

export const anonInboxService = {
  async create(title: string, prompt: string, visibility: AnonVisibility): Promise<{ id: string; slug: string }> {
    const rows = await rpc<{ id: string; slug: string }[]>('create_anon_inbox', {
      p_title: title,
      p_prompt: prompt || null,
      p_visibility: visibility,
    });
    return rows[0];
  },

  async updateVisibility(id: string, visibility: AnonVisibility): Promise<void> {
    await rpc('update_anon_inbox', { p_id: id, p_visibility: visibility });
  },

  async close(id: string): Promise<void> {
    await rpc('close_anon_inbox', { p_id: id });
  },

  async getBySlug(slug: string): Promise<AnonInbox | null> {
    const rows = await rpc<any[]>('get_anon_inbox', { p_slug: slug });
    if (!rows.length) return null;
    return toInbox({ ...rows[0], slug });
  },

  async sendMessage(slug: string, body: string): Promise<void> {
    await rpc('send_anon_message', { p_slug: slug, p_body: body });
  },

  async getMessages(slug: string, limit = 50, offset = 0): Promise<AnonMessage[]> {
    const rows = await rpc<any[]>('get_anon_messages', { p_slug: slug, p_limit: limit, p_offset: offset });
    return rows.map(toMessage);
  },

  async removeMessage(id: string): Promise<void> {
    await rpc('remove_anon_message', { p_id: id });
  },

  async myInboxes(limit = 20, offset = 0): Promise<AnonInbox[]> {
    const rows = await rpc<any[]>('my_anon_inboxes', { p_limit: limit, p_offset: offset });
    return rows.map(toInbox);
  },

  async publicInboxes(limit = 30, offset = 0): Promise<AnonInbox[]> {
    const rows = await rpc<any[]>('get_public_inboxes', { p_limit: limit, p_offset: offset });
    return rows.map(toInbox);
  },
};
