import type { Env } from './env';
const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const hmacKey = (secret: string, usage: 'sign' | 'verify') => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);

/** Room tokens name a room and a slot (a/b) only. They never carry an identity. */
export async function signRoomToken(secret: string, room: string, slot: 'a' | 'b', exp: number): Promise<string> {
  const payload = `${room}.${slot}.${exp}`;
  return `${payload}.${b64url(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(payload)))}`;
}
export async function verifyRoomToken(secret: string, token: string): Promise<{ room: string; slot: 'a' | 'b' } | null> {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [room, slot, exp, sig] = parts;
  if ((slot !== 'a' && slot !== 'b') || !/^[0-9a-f-]{36}$/.test(room) || !(Number(exp) > Date.now())) return null;
  let sigBytes: Uint8Array; try { sigBytes = unb64url(sig); } catch { return null; }
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), sigBytes, enc.encode(`${room}.${slot}.${exp}`));
  return ok ? { room, slot } : null;
}

/** Service-role call into the Supabase REST API (random_* functions are callable by service_role only). */
export async function rpc<T>(env: Env, fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`rpc ${fn} failed: ${r.status}`);
  const text = await r.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Asks Supabase Auth who owns this access token (works with any JWT signing setup). */
export async function verifyUser(env: Env, token: string): Promise<string | null> {
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = (await r.json()) as { id?: string };
  return u.id && /^[0-9a-f-]{36}$/.test(u.id) ? u.id : null;
}

export const protocolValue = (req: Request, prefix: string): string | null => {
  const found = (req.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map(s => s.trim()).find(p => p.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
};
export const originAllowed = (req: Request, env: Env): boolean => {
  const o = req.headers.get('Origin');
  return !o || env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).includes(o);
};
export const wsResponse = (client: WebSocket) => new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'ink' } });
