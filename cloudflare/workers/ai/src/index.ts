import type { Env } from './env';
import { decrypt, encrypt } from './crypto';
import { detectCrisis } from './safety';
import { MODES, systemPrompt, type Mode } from './prompts';
import { geminiComplete, streamGroq, type Msg, type Result } from './providers';

const UUID = /^[0-9a-f-]{36}$/;
const cors = (req: Request, env: Env): Record<string, string> => {
  const o = req.headers.get('Origin');
  return o && env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).includes(o)
    ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', Vary: 'Origin' } : { Vary: 'Origin' };
};
const json = (o: unknown, status: number, h: Record<string, string>) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...h } });
async function rpc<T>(env: Env, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status}`);
  const t = await r.text(); return (t ? JSON.parse(t) : null) as T;
}
async function identityFor(env: Env, req: Request): Promise<string | 'unauthorized' | 'forbidden' | 'unavailable'> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, ''); if (!jwt) return 'unauthorized';
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` } });
  if (!r.ok) return r.status >= 500 ? 'unavailable' : 'unauthorized';
  const u = (await r.json()) as { id?: string }; if (!u.id || !UUID.test(u.id)) return 'unauthorized';
  const rows = await rpc<{ identity_id: string; eligible: boolean }[]>(env, 'random_identity_for', { p_auth_user: u.id }).catch(() => null);
  if (!rows) return 'unavailable'; return rows[0]?.eligible ? rows[0].identity_id : 'forbidden';
}
const sse = (w: WritableStreamDefaultWriter<Uint8Array>) => { const e = new TextEncoder(); return (event: string, data: unknown) => w.write(e.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); };

async function chat(req: Request, env: Env, ctx: ExecutionContext, identity: string, h: Record<string, string>): Promise<Response> {
  let body: { message?: unknown; sessionId?: unknown; mode?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400, h); }
  const cfg = await rpc<{ enabled: boolean; max_chars: number; context_messages: number }>(env, 'ai_config').catch(() => null);
  if (!cfg) return json({ error: 'unavailable' }, 503, h);
  if (!cfg.enabled) return json({ error: 'ai_disabled' }, 503, h);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const mode = (typeof body.mode === 'string' ? body.mode : 'talk') as Mode;
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
  if (!message || message.length > cfg.max_chars || !MODES.includes(mode) || (sessionId !== null && !UUID.test(sessionId))) return json({ error: 'bad_request' }, 400, h);

  const turn = (await rpc<{ allowed: boolean; reason: string; session_id: string; remaining: number; daily_limit: number }[]>(env, 'ai_begin_turn', { p_identity: identity, p_session: sessionId, p_mode: mode }))[0];
  if (!turn.allowed) return json({ error: turn.reason, remaining: turn.remaining, limit: turn.daily_limit }, turn.reason === 'not_found' ? 404 : 429, h);

  const crisis = detectCrisis(message);
  if (crisis) ctx.waitUntil(rpc(env, 'ai_log_safety', { p_identity: identity, p_session: turn.session_id, p_kind: crisis }).catch(() => {})); // kind only, never the text

  let history: Msg[] = [];
  if (sessionId) {
    const rows = await rpc<{ role: 'user' | 'assistant'; content_enc: string }[]>(env, 'ai_get_messages', { p_identity: identity, p_session: sessionId, p_limit: cfg.context_messages }).catch(() => []);
    history = (await Promise.all(rows.reverse().map(async r => ({ role: r.role, content: await decrypt(env, r.content_enc).catch(() => '') })))).filter(m => m.content);
  }
  const msgs: Msg[] = [{ role: 'system', content: systemPrompt(mode, crisis) }, ...history, { role: 'user', content: message }];

  const { readable, writable } = new TransformStream<Uint8Array>(); const writer = writable.getWriter(); const send = sse(writer);
  ctx.waitUntil((async () => {
    try {
      await send('meta', { sessionId: turn.session_id, remaining: turn.remaining, limit: turn.daily_limit, safety: crisis });
      let result: Result | null = null;
      let lastErr = '';
      try {
        result = await streamGroq(env, msgs, t => send('token', { t }));
      } catch (ge: any) {
        lastErr = `Groq: ${ge?.message || ge}`;
        console.error('Groq failed:', ge?.message || ge);
        try {
          result = await geminiComplete(env, msgs);
          await send('token', { t: result.text });
        } catch (me: any) {
          lastErr += ` | Gemini: ${me?.message || me}`;
          console.error('Gemini failed:', me?.message || me);
          result = null;
        }
      }
      if (!result) {
        await rpc(env, 'ai_refund_turn', { p_identity: identity }).catch(() => {});
        await send('error', { code: 'unavailable', details: lastErr });
        return;
      }
      const title = history.length === 0 ? await encrypt(env, message.slice(0, 48)) : null;
      await rpc(env, 'ai_record_exchange', { p_identity: identity, p_session: turn.session_id, p_user_enc: await encrypt(env, message), p_assistant_enc: await encrypt(env, result.text), p_in: result.tokensIn, p_out: result.tokensOut, p_provider: result.provider, p_title_enc: title });
      await send('done', { remaining: turn.remaining });
    } catch { try { await send('error', { code: 'failed' }); } catch {} }
    finally { try { await writer.close(); } catch {} }
  })());
  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', ...h } });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url); const h = cors(req, env);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname === '/ai/diagnostic') {
      const groqRes = await fetch(`${env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1'}/models`, {
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` }
      }).then(r => r.json()).catch(e => ({ error: String(e) }));

      const geminiRes = await fetch(`${env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com'}/v1beta/models?key=${env.GEMINI_API_KEY}`)
        .then(r => r.json()).catch(e => ({ error: String(e) }));

      return json({
        hasGroqKey: !!env.GROQ_API_KEY,
        hasGeminiKey: !!env.GEMINI_API_KEY,
        configuredGroqModel: env.AI_GROQ_MODEL,
        configuredGeminiModel: env.AI_GEMINI_MODEL,
        groqModels: groqRes,
        geminiModels: geminiRes,
      }, 200, h);
    }
    if (!url.pathname.startsWith('/ai/')) return new Response('Not found', { status: 404 });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const origin = req.headers.get('Origin'); if (origin && !h['Access-Control-Allow-Origin']) return json({ error: 'forbidden' }, 403, h);
    const who = await identityFor(env, req).catch(() => 'unavailable' as const);
    if (who === 'unauthorized') return json({ error: 'unauthorized' }, 401, h);
    if (who === 'forbidden') return json({ error: 'not_allowed' }, 403, h);
    if (who === 'unavailable') return json({ error: 'unavailable' }, 503, h);

    try {
      if (url.pathname === '/ai/chat' && req.method === 'POST') return await chat(req, env, ctx, who, h);
      if (url.pathname === '/ai/usage' && req.method === 'GET') { const u = (await rpc<{ used: number; daily_limit: number }[]>(env, 'ai_usage_today', { p_identity: who }))[0]; return json({ used: u.used, limit: u.daily_limit, remaining: Math.max(u.daily_limit - u.used, 0) }, 200, h); }
      if (url.pathname === '/ai/sessions' && req.method === 'GET') {
        const rows = await rpc<{ id: string; mode: string; title_enc: string | null; last_activity_at: string }[]>(env, 'ai_list_sessions', { p_identity: who });
        return json({ sessions: await Promise.all(rows.map(async r => ({ id: r.id, mode: r.mode, title: r.title_enc ? await decrypt(env, r.title_enc).catch(() => 'Conversation') : 'Conversation', lastActivityAt: r.last_activity_at }))) }, 200, h);
      }
      if (url.pathname === '/ai/sessions' && req.method === 'DELETE') { await rpc(env, 'ai_delete_all', { p_identity: who }); return json({ ok: true }, 200, h); }
      const m = url.pathname.match(/^\/ai\/sessions\/([0-9a-f-]{36})$/);
      if (m && req.method === 'GET') {
        const rows = await rpc<{ id: string; role: string; content_enc: string; created_at: string }[]>(env, 'ai_get_messages', { p_identity: who, p_session: m[1], p_limit: 200 });
        if (rows.length === 0) return json({ error: 'not_found' }, 404, h);
        return json({ messages: await Promise.all(rows.reverse().map(async r => ({ id: r.id, role: r.role, text: await decrypt(env, r.content_enc).catch(() => ''), at: r.created_at }))) }, 200, h);
      }
      if (m && req.method === 'DELETE') { await rpc(env, 'ai_delete_session', { p_identity: who, p_session: m[1] }); return json({ ok: true }, 200, h); }
    } catch { return json({ error: 'unavailable' }, 503, h); }
    return json({ error: 'not_found' }, 404, h);
  },
};
