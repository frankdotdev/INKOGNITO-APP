export interface Env { SUPABASE_URL: string; SUPABASE_ANON_KEY: string; SUPABASE_SERVICE_KEY: string; ALLOWED_ORIGINS: string; DM_DATA_KEY: string }
const UUID = /^[0-9a-f-]{36}$/;
const CATEGORIES = new Set(['harassment', 'threat', 'sexual', 'childSafety', 'spam', 'scam', 'hate', 'selfHarm', 'illegal', 'other']);
const cors = (req: Request, env: Env): Record<string, string> => {
  const o = req.headers.get('Origin');
  return o && env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).includes(o)
    ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' } : { Vary: 'Origin' };
};
const json = (o: unknown, status: number, h: Record<string, string>) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...h } });
type Rpc<T> = { ok: boolean; status: number; data: T | null; text: string };
async function rpc<T>(env: Env, fn: string, args: Record<string, unknown> = {}): Promise<Rpc<T>> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const text = await r.text(); let data: T | null = null; try { data = text ? (JSON.parse(text) as T) : null; } catch {}
  return { ok: r.ok, status: r.status, data, text };
}
async function ok<T>(p: Promise<Rpc<T>>): Promise<T | null> { const r = await p; if (!r.ok) throw new Error('rpc failed'); return r.data; }

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)), unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
let keyCache: { raw: string; key: CryptoKey } | null = null;
async function key(env: Env) {
  if (keyCache?.raw === env.DM_DATA_KEY) return keyCache.key;
  const raw = unb64(env.DM_DATA_KEY); if (raw.length !== 32) throw new Error('DM_DATA_KEY must be 32 bytes, base64');
  const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); keyCache = { raw: env.DM_DATA_KEY, key: k }; return k;
}
async function encrypt(env: Env, t: string) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), new TextEncoder().encode(t))); const o = new Uint8Array(12 + ct.length); o.set(iv); o.set(ct, 12); return b64(o); }
async function decrypt(env: Env, e: string) { try { const a = unb64(e); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: a.slice(0, 12) }, await key(env), a.slice(12))); } catch { return ''; } }

async function identityFor(env: Env, req: Request): Promise<string | 'unauthorized' | 'forbidden' | 'unavailable'> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, ''); if (!jwt) return 'unauthorized';
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` } });
  if (!r.ok) return r.status >= 500 ? 'unavailable' : 'unauthorized';
  const u = (await r.json()) as { id?: string }; if (!u.id || !UUID.test(u.id)) return 'unauthorized';
  const rows = (await rpc<{ identity_id: string; eligible: boolean }[]>(env, 'random_identity_for', { p_auth_user: u.id })).data;
  if (!rows) return 'unavailable'; return rows[0]?.eligible ? rows[0].identity_id : 'forbidden';
}
const errCode = (t: string) => t.includes('plus_required') ? 'plus_required' : t.includes('rate_limited') ? 'rate_limited' : t.includes('closed') ? 'closed' : t.includes('not_found') ? 'not_found' : 'failed';
const status = (c: string) => c === 'plus_required' ? 402 : c === 'rate_limited' ? 429 : c === 'closed' || c === 'not_found' ? 404 : 502;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url), h = cors(req, env);
    if (url.pathname === '/health') return new Response('ok');
    if (!url.pathname.startsWith('/dm/')) return new Response('Not found', { status: 404 });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const origin = req.headers.get('Origin'); if (origin && !h['Access-Control-Allow-Origin']) return json({ error: 'forbidden' }, 403, h);
    const who = await identityFor(env, req).catch(() => 'unavailable' as const);
    if (who === 'unauthorized') return json({ error: 'unauthorized' }, 401, h);
    if (who === 'forbidden') return json({ error: 'not_allowed' }, 403, h);
    if (who === 'unavailable') return json({ error: 'unavailable' }, 503, h);
    try {
      if (url.pathname === '/dm/start' && req.method === 'POST') {
        const b = (await req.json().catch(() => ({}))) as { type?: unknown; id?: unknown };
        if (!['post', 'comment', 'whisper'].includes(String(b.type)) || typeof b.id !== 'string' || !UUID.test(b.id)) return json({ error: 'bad_request' }, 400, h);
        const r = await rpc<string>(env, 'dm_start', { p_identity: who, p_type: b.type, p_id: b.id });
        if (!r.ok) { const c = errCode(r.text); return json({ error: c }, status(c), h); }
        return json({ id: r.data }, 200, h);
      }
      if (url.pathname === '/dm/conversations' && req.method === 'GET') {
        const rows = (await ok<{ conversation_id: string; peer_name: string; peer_mark: number; last_enc: string | null; last_at: string; last_from_me: boolean | null; unread: number }[]>(rpc(env, 'dm_list', { p_identity: who }))) ?? [];
        return json({ conversations: await Promise.all(rows.map(async r => ({ id: r.conversation_id, peer: r.peer_name, preview: r.last_enc ? (await decrypt(env, r.last_enc).catch(() => ''))?.slice(0, 80) : '', lastAt: r.last_at, lastFromMe: !!r.last_from_me, unread: r.unread }))) }, 200, h);
      }
      const m = url.pathname.match(/^\/dm\/conversations\/([0-9a-f-]{36})\/(messages|read|leave|block|report)$/);
      if (m) {
        const conv = m[1], act = m[2];
        if (act === 'messages' && req.method === 'GET') {
          const before = url.searchParams.get('before'); if (before && Number.isNaN(Date.parse(before))) return json({ error: 'bad_request' }, 400, h);
          const peer = await ok<string>(rpc(env, 'dm_peer_name', { p_identity: who, p_conv: conv })); if (!peer) return json({ error: 'not_found' }, 404, h);
          const rows = (await ok<{ id: string; mine: boolean; content_enc: string; created_at: string }[]>(rpc(env, 'dm_messages', { p_identity: who, p_conv: conv, p_before: before, p_limit: 50 }))) ?? [];
          return json({ peer, messages: await Promise.all(rows.reverse().map(async r => ({ id: r.id, mine: r.mine, text: await decrypt(env, r.content_enc).catch(() => '[Unable to decrypt message]'), at: r.created_at }))) }, 200, h);
        }
        if (req.method !== 'POST') return json({ error: 'not_found' }, 404, h);
        if (act === 'messages') {
          const b = (await req.json().catch(() => ({}))) as { text?: unknown }; const text = typeof b.text === 'string' ? b.text.trim() : '';
          if (!text || text.length > 2000) return json({ error: 'bad_request' }, 400, h);
          const r = await rpc<{ id: string; created_at: string }[]>(env, 'dm_send', { p_identity: who, p_conv: conv, p_enc: await encrypt(env, text) });
          if (!r.ok) { const c = errCode(r.text); return json({ error: c }, status(c), h); }
          return json({ id: r.data![0].id, at: r.data![0].created_at }, 200, h);
        }
        if (act === 'read') { await ok(rpc(env, 'dm_mark_read', { p_identity: who, p_conv: conv })); return json({ ok: true }, 200, h); }
        if (act === 'leave') { await ok(rpc(env, 'dm_leave', { p_identity: who, p_conv: conv })); return json({ ok: true }, 200, h); }
        if (act === 'block') { const r = await rpc(env, 'dm_block_peer', { p_identity: who, p_conv: conv }); if (!r.ok) return json({ error: 'not_found' }, 404, h); return json({ ok: true }, 200, h); }
        if (act === 'report') {
          const b = (await req.json().catch(() => ({}))) as { category?: unknown }; if (typeof b.category !== 'string' || !CATEGORIES.has(b.category)) return json({ error: 'bad_request' }, 400, h);
          const rows = (await ok<{ id: string; mine: boolean; content_enc: string; created_at: string }[]>(rpc(env, 'dm_messages', { p_identity: who, p_conv: conv, p_before: null, p_limit: 20 }))) ?? [];
          if (rows.length === 0 && !(await ok<string>(rpc(env, 'dm_peer_name', { p_identity: who, p_conv: conv })))) return json({ error: 'not_found' }, 404, h);
          const transcript = await Promise.all(rows.reverse().map(async r => ({ s: r.mine ? 'reporter' : 'reported', t: await decrypt(env, r.content_enc), at: r.created_at })));
          const r = await rpc(env, 'dm_file_report', { p_identity: who, p_conv: conv, p_category: b.category, p_transcript: transcript });
          if (!r.ok) { const c = errCode(r.text); return json({ error: c }, status(c), h); }
          return json({ ok: true }, 200, h);
        }
      }
    } catch { return json({ error: 'unavailable' }, 503, h); }
    return json({ error: 'not_found' }, 404, h);
  },
};
