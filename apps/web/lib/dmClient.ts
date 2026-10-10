import { supabase, ensureSession } from './supabase';
const DM = process.env.NEXT_PUBLIC_DM_URL?.replace(/\/$/, '');
export const dmEnabled = !!DM;
export class DmError extends Error { constructor(public code: string) { super(code); } }
export type DmConversation = { id: string; peer: string; preview: string; lastAt: string; lastFromMe: boolean; unread: number };
export type DmMessage = { id: string; mine: boolean; text: string; at: string };
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!DM) throw new DmError('disabled');
  await ensureSession(); const { data } = await supabase.auth.getSession(); if (!data.session) throw new DmError('unauthorized');
  const res = await fetch(`${DM}${path}`, { ...init, headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' } });
  const j = await res.json().catch(() => ({})); if (!res.ok) throw new DmError(j.error ?? 'unavailable'); return j as T;
}
const post = (path: string, body?: unknown) => call<{ ok?: true }>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
export const dmService = {
  start: (type: 'post' | 'comment' | 'whisper', id: string) => call<{ id: string }>('/dm/start', { method: 'POST', body: JSON.stringify({ type, id }) }),
  list: async () => (await call<{ conversations: DmConversation[] }>('/dm/conversations')).conversations,
  messages: (id: string) => call<{ peer: string; messages: DmMessage[] }>(`/dm/conversations/${id}/messages`),
  send: (id: string, text: string) => call<{ id: string; at: string }>(`/dm/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ text }) }),
  read: (id: string) => post(`/dm/conversations/${id}/read`), leave: (id: string) => post(`/dm/conversations/${id}/leave`),
  block: (id: string) => post(`/dm/conversations/${id}/block`), report: (id: string, category: string) => post(`/dm/conversations/${id}/report`, { category }),
};
export const dmErrorText = (e: unknown) => { const c = e instanceof DmError ? e.code : ''; return c === 'plus_required' ? 'Starting a private chat is a Plus feature.' : c === 'rate_limited' ? 'Slow down a little, then try again.' : c === 'not_found' || c === 'closed' ? 'This conversation has ended.' : "That didn't go through. Try again."; };
