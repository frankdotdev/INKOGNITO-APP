import type { Env } from './env';
import { originAllowed, protocolValue, rpc, verifyRoomToken, verifyUser } from './lib';
export { Matchmaker } from './matchmaker';
export { Room } from './room';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname === '/rtc/ice') return iceServers(req, env, url);
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    if (!originAllowed(req, env)) return new Response('Forbidden', { status: 403 });

    if (url.pathname === '/match') {
      const mode = url.searchParams.get('mode') ?? '';
      if (!['text', 'audio', 'video'].includes(mode)) return new Response('Unknown mode', { status: 400 });
      const jwt = protocolValue(req, 'bearer.');
      const user = jwt ? await verifyUser(env, jwt) : null;
      if (!user) return new Response('Unauthorized', { status: 401 });
      const rows = await rpc<{ identity_id: string; allowed: boolean; reason: string }[]>(env, 'random_mode_check', { p_auth_user: user, p_mode: mode }).catch(() => null);
      if (!rows) return new Response('Service unavailable', { status: 503 });
      if (!rows[0]?.allowed) return new Response(rows[0]?.reason ?? 'not_allowed', { status: 403 }); // disabled, adult_required or not_allowed
      const fwd = new Request(req);
      fwd.headers.set('X-Identity', rows[0].identity_id);
      fwd.headers.set('X-Mode', mode);
      fwd.headers.set('Sec-WebSocket-Protocol', 'ink');
      return env.MATCHMAKER.get(env.MATCHMAKER.idFromName(mode)).fetch(fwd); // one queue per mode, so modes never mix
    }

    if (url.pathname === '/room') {
      const token = protocolValue(req, 'room.');
      const claim = token ? await verifyRoomToken(env.ROOM_SECRET, token) : null;
      if (!claim) return new Response('Unauthorized', { status: 401 });
      const fwd = new Request(req);
      fwd.headers.set('X-Slot', claim.slot);
      fwd.headers.set('Sec-WebSocket-Protocol', 'ink');
      return env.ROOM.get(env.ROOM.idFromName(claim.room)).fetch(fwd);
    }
    return new Response('Not found', { status: 404 });
  },
};

/** ICE servers for audio/video. Uses Cloudflare Realtime TURN when configured, otherwise public STUN only. Requires the same checks as joining. */
async function iceServers(req: Request, env: Env, url: URL): Promise<Response> {
  const origin = req.headers.get('Origin'), allowed = origin && env.ALLOWED_ORIGINS.split(',').map(x => x.trim()).includes(origin);
  const h: Record<string, string> = allowed ? { 'Access-Control-Allow-Origin': origin!, 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' } : { Vary: 'Origin' };
  const reply = (o: unknown, status: number) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...h } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (origin && !allowed) return reply({ error: 'forbidden' }, 403);
  const mode = url.searchParams.get('mode') ?? '';
  if (mode !== 'audio' && mode !== 'video') return reply({ error: 'bad_request' }, 400);
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const user = jwt ? await verifyUser(env, jwt).catch(() => null) : null; if (!user) return reply({ error: 'unauthorized' }, 401);
  const rows = await rpc<{ allowed: boolean }[]>(env, 'random_mode_check', { p_auth_user: user, p_mode: mode }).catch(() => null);
  if (!rows?.[0]?.allowed) return reply({ error: 'not_allowed' }, 403);
  const stun = [{ urls: ['stun:stun.cloudflare.com:3478'] }];
  if (!env.CF_TURN_KEY_ID || !env.CF_TURN_API_TOKEN) return reply({ iceServers: stun, relay: false }, 200);
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.CF_TURN_KEY_ID}/credentials/generate-ice-servers`, { method: 'POST', headers: { Authorization: `Bearer ${env.CF_TURN_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ttl: 3600 }) });
    const j = (await r.json()) as { iceServers?: unknown };
    if (r.ok && Array.isArray(j.iceServers) && j.iceServers.length) return reply({ iceServers: j.iceServers, relay: true }, 200);
  } catch {}
  return reply({ iceServers: stun, relay: false }, 200); // degrade to STUN rather than failing the call
}
