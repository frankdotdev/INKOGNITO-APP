export interface Env {
  MEDIA: R2Bucket; SUPABASE_URL: string; SUPABASE_ANON_KEY: string; SUPABASE_SERVICE_KEY: string; ALLOWED_ORIGINS: string;
  SCAN_PROVIDER?: string; // 'openai' to scan every upload, anything else (or unset) to skip scanning
  OPENAI_API_KEY?: string; SCAN_BASE_URL?: string; SCAN_REVIEW_THRESHOLD?: string; // default 0.5
}
const MAX_BYTES = 2_000_000;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const KEY_RE = /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

const cors = (req: Request, env: Env): Record<string, string> => {
  const o = req.headers.get('Origin');
  return o && env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).includes(o)
    ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Width, X-Height', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' } : { 'Vary': 'Origin' };
};
const json = (o: unknown, status: number, h: Record<string, string>) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...h } });

async function rpc<T>(env: Env, fn: string, args: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const text = await r.text();
  let data: T | null = null; try { data = text ? (JSON.parse(text) as T) : null; } catch {}
  return { ok: r.ok, status: r.status, data, text };
}
async function verifyUser(env: Env, token: string): Promise<string | null> {
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = (await r.json()) as { id?: string };
  return u.id && /^[0-9a-f-]{36}$/.test(u.id) ? u.id : null;
}
const has = (bytes: Uint8Array, ascii: string, limit = 200_000) => {
  const n = Math.min(bytes.length, limit) - ascii.length;
  outer: for (let i = 0; i <= n; i++) { for (let j = 0; j < ascii.length; j++) if (bytes[i + j] !== ascii.charCodeAt(j)) continue outer; return true; }
  return false;
};
/** Confirms the bytes really are the declared image type. */
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && has(b.subarray(0, 4), 'RIFF') && has(b.subarray(8, 12), 'WEBP')) return 'image/webp';
  return null;
}
/** Uploads must already be stripped of metadata (location, camera info). The web app does this before upload. */
const hasMetadata = (b: Uint8Array, mime: string) => mime === 'image/jpeg' ? has(b, 'Exif\0\0') || has(b, 'http://ns.adobe.com/xap') : mime === 'image/png' ? has(b, 'eXIf') || has(b, 'iTXt') : has(b, 'EXIF') || has(b, 'XMP ');
type Scan = { decision: 'allow' | 'review' | 'block'; urgent: boolean; categories: Record<string, number> };
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
/** Sends the image to OpenAI's moderation model. Child-safety categories block the upload outright; other concerns go to a person. Returns null if the check could not run. */
async function scanImage(env: Env, bytes: Uint8Array, mime: string): Promise<Scan | null> {
  if (env.SCAN_PROVIDER !== 'openai' || !env.OPENAI_API_KEY) return null;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(`${env.SCAN_BASE_URL ?? 'https://api.openai.com'}/v1/moderations`, { method: 'POST', signal: ctl.signal, headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: [{ type: 'image_url', image_url: { url: `data:${mime};base64,${b64(bytes)}` } }] }) });
    if (!r.ok) return null;
    const j = (await r.json()) as { results?: { flagged?: boolean; categories?: Record<string, boolean>; category_scores?: Record<string, number> }[] };
    const res = j.results?.[0]; if (!res) return null;
    const scores = res.category_scores ?? {}, cats = res.categories ?? {}, review = Number(env.SCAN_REVIEW_THRESHOLD ?? 0.5);
    const minors = cats['sexual/minors'] === true || (scores['sexual/minors'] ?? 0) >= 0.2;
    const top = Object.fromEntries(Object.entries(scores).filter(([, v]) => v >= 0.1).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
    if (minors) return { decision: 'block', urgent: true, categories: top };
    if (res.flagged || Object.values(scores).some(v => v >= review)) return { decision: 'review', urgent: false, categories: top };
    return { decision: 'allow', urgent: false, categories: top };
  } catch { return null; } finally { clearTimeout(timer); }
}
const dim = (v: string | null) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 4096 ? n : null; };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url); const h = cors(req, env);
    if (url.pathname === '/health') return new Response('ok');

    if (url.pathname === '/upload') {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
      if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, h);
      const origin = req.headers.get('Origin'); if (origin && !h['Access-Control-Allow-Origin']) return json({ error: 'forbidden' }, 403, h);
      const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
      const user = jwt ? await verifyUser(env, jwt) : null; if (!user) return json({ error: 'unauthorized' }, 401, h);
      const mime = (req.headers.get('Content-Type') ?? '').split(';')[0].trim();
      if (!TYPES[mime]) return json({ error: 'unsupported_type' }, 415, h);
      if (Number(req.headers.get('Content-Length') ?? 0) > MAX_BYTES) return json({ error: 'too_large' }, 413, h);
      const w = dim(req.headers.get('X-Width')), ht = dim(req.headers.get('X-Height')); if (!w || !ht) return json({ error: 'bad_dimensions' }, 400, h);
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_BYTES) return json({ error: 'too_large' }, 413, h);
      if (sniff(bytes) !== mime) return json({ error: 'not_an_image' }, 400, h);
      if (hasMetadata(bytes, mime)) return json({ error: 'metadata_present' }, 400, h);
      const who = await rpc<{ identity_id: string; eligible: boolean }[]>(env, 'random_identity_for', { p_auth_user: user });
      if (!who.ok) return json({ error: 'unavailable' }, 503, h);
      if (!who.data?.[0]?.eligible) return json({ error: 'not_allowed' }, 403, h);
      const scan = await scanImage(env, bytes, mime); // null = no scanner configured, or it could not run (the post is then held if scanning is required)
      if (scan?.decision === 'block') { await rpc(env, 'media_log_block', { p_identity: who.data[0].identity_id, p_urgent: scan.urgent, p_categories: scan.categories }); return json({ error: 'image_rejected' }, 422, h); }
      const d = new Date(); const key = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${TYPES[mime]}`;
      const reg = await rpc<string>(env, 'media_register', { p_identity: who.data[0].identity_id, p_key: key, p_mime: mime, p_size: bytes.length, p_w: w, p_h: ht, p_scan: scan ? scan.decision : 'unscanned', p_categories: scan ? scan.categories : null });
      if (!reg.ok) return json({ error: reg.text.includes('rate_limited') ? 'rate_limited' : 'rejected' }, reg.text.includes('rate_limited') ? 429 : 400, h);
      try { await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: mime, cacheControl: 'public, max-age=3600' } }); }
      catch { await rpc(env, 'media_remove', { p_id: reg.data }); return json({ error: 'storage_failed' }, 500, h); }
      return json({ id: reg.data, key }, 200, h);
    }

    if (url.pathname.startsWith('/m/') && (req.method === 'GET' || req.method === 'HEAD')) {
      const key = decodeURIComponent(url.pathname.slice(3));
      if (!KEY_RE.test(key)) return new Response('Not found', { status: 404 });
      const obj = await env.MEDIA.get(key);
      if (!obj) return new Response('Not found', { status: 404 });
      return new Response(req.method === 'HEAD' ? null : obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=3600', 'ETag': obj.httpEtag, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'cross-origin' } });
    }
    return new Response('Not found', { status: 404 });
  },

  async scheduled(_c: ScheduledController, env: Env): Promise<void> {
    const r = await rpc<{ id: string; r2_key: string }[]>(env, 'media_take_deletions', { p_limit: 200 });
    if (!r.ok || !r.data?.length) return;
    await env.MEDIA.delete(r.data.map(x => x.r2_key));
    await rpc(env, 'media_confirm_deleted', { p_ids: r.data.map(x => x.id) });
  },
};
