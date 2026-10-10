import { supabase, ensureSession } from './supabase';
const AI = process.env.NEXT_PUBLIC_AI_URL?.replace(/\/$/, '');
export const aiEnabled = !!AI;
export type AiMode = 'talk' | 'vent' | 'think' | 'journal' | 'perspective' | 'calm';
export const aiModes: [AiMode, string, string][] = [['talk', 'Talk', 'Just talk'], ['vent', 'Vent', 'Get it off your chest'], ['think', 'Think', 'Work something out'], ['journal', 'Journal', 'Reflect'], ['perspective', 'Perspective', 'See it differently'], ['calm', 'Calm', 'Slow down']];
export class AiError extends Error { constructor(public code: string, public remaining?: number) { super(code); } }
export type AiSession = { id: string; mode: AiMode; title: string; lastActivityAt: string };
export type AiMessage = { id: string; role: 'user' | 'assistant'; text: string };
export type Safety = 'self_harm' | 'violence' | 'abuse' | null;
async function headers(): Promise<Record<string, string>> {
  await ensureSession(); const { data } = await supabase.auth.getSession(); const t = data.session?.access_token; if (!t) throw new AiError('unauthorized');
  return { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' };
}
async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!AI) throw new AiError('ai_disabled');
  const res = await fetch(`${AI}${path}`, { ...init, headers: await headers() });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new AiError(j.error ?? 'unavailable', j.remaining);
  return j as T;
}
export const aiService = {
  usage: () => req<{ used: number; limit: number; remaining: number }>('/ai/usage'),
  sessions: async () => (await req<{ sessions: AiSession[] }>('/ai/sessions')).sessions,
  messages: async (id: string) => (await req<{ messages: AiMessage[] }>(`/ai/sessions/${id}`)).messages,
  remove: (id: string) => req<{ ok: true }>(`/ai/sessions/${id}`, { method: 'DELETE' }),
  removeAll: () => req<{ ok: true }>('/ai/sessions', { method: 'DELETE' }),
  /** Streams a reply. Throws AiError before streaming starts (quota, rate limit, bad session). */
  async chat(body: { message: string; sessionId: string | null; mode: AiMode }, on: { meta(m: { sessionId: string; remaining: number; limit: number; safety: Safety }): void; token(t: string): void }, signal?: AbortSignal): Promise<void> {
    if (!AI) throw new AiError('ai_disabled');
    const res = await fetch(`${AI}/ai/chat`, { method: 'POST', headers: await headers(), body: JSON.stringify(body), signal });
    if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); throw new AiError(j.error ?? 'unavailable', j.remaining); }
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) return;
      buf += dec.decode(value, { stream: true }); let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = block.match(/^event: (.*)$/m)?.[1], data = block.match(/^data: (.*)$/m)?.[1]; if (!ev || !data) continue;
        const d = JSON.parse(data);
        if (ev === 'meta') on.meta(d); else if (ev === 'token') on.token(d.t); else if (ev === 'error') throw new AiError(d.code); else if (ev === 'done') return;
      }
    }
  },
};
export const aiErrorText = (e: unknown) => {
  const c = e instanceof AiError ? e.code : '';
  return c === 'quota_exceeded' ? "You've used today's messages. They reset at midnight UTC." : c === 'slow_down' ? 'Give it a moment, then try again.' : c === 'ai_disabled' ? 'The companion is switched off right now.' : c === 'not_found' ? 'That conversation no longer exists.' : c === 'unauthorized' || c === 'not_allowed' ? "This identity can't use the companion." : "The companion couldn't reply. Your message wasn't counted. Try again.";
};
