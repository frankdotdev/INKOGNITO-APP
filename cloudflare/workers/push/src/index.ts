import { encryptPayload, vapidHeader } from './webpush';
export interface Env { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string; VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string; VAPID_SUBJECT: string }
type Row = { id: number; kind: 'reply' | 'whisper' | 'message' | 'echo'; ref_id: string; endpoint: string; p256dh: string; auth: string };

async function rpc<T>(env: Env, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status}`); const t = await r.text(); return (t ? JSON.parse(t) : null) as T;
}
/** What the notification says. It never contains what anyone wrote, who wrote it, or any private detail. */
function message(r: Row) {
  const uuid = /^[0-9a-f-]{36}$/.test(r.ref_id) ? r.ref_id : '';
  switch (r.kind) {
    case 'reply': return { body: 'Someone replied to your confession.', url: uuid ? `/post/${uuid}` : '/me/activity' };
    case 'echo': return { body: 'Someone echoed your confession.', url: uuid ? `/post/${uuid}` : '/me/activity' };
    case 'whisper': return { body: 'You received a Whisper.', url: '/messages' };
    default: return { body: 'You have a new private message.', url: uuid ? `/messages/dm/${uuid}` : '/messages/dm' };
  }
}
async function send(env: Env, r: Row): Promise<'ok' | 'gone' | 'retry'> {
  try {
    const m = message(r);
    const body = await encryptPayload(new TextEncoder().encode(JSON.stringify({ title: 'Inkognito', body: m.body, url: m.url, tag: `${r.kind}:${r.ref_id}` })), r.p256dh, r.auth);
    const res = await fetch(r.endpoint, { method: 'POST', body, headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '43200', Urgency: 'normal', Authorization: await vapidHeader(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT, r.endpoint) } });
    if (res.status >= 200 && res.status < 300) return 'ok';
    return res.status === 404 || res.status === 410 ? 'gone' : 'retry'; // the person removed the subscription, or the push service is struggling
  } catch { return 'retry'; }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname === '/send') {
      try {
        const rows = (await rpc<Row[]>(env, 'push_take_batch', { p_limit: 100 })) ?? [];
        const delivered = new Set<number>();
        for (let i = 0; i < rows.length; i += 10) {
          await Promise.all(rows.slice(i, i + 10).map(async r => {
            const out = await send(env, r);
            if (out === 'ok') delivered.add(r.id);
            else if (out === 'gone') await rpc(env, 'push_drop_subscription', { p_endpoint: r.endpoint }).catch(() => {});
          }));
        }
        if (delivered.size) await rpc(env, 'push_mark_sent', { p_ids: [...delivered] });
        await rpc(env, 'push_prune').catch(() => {});
        return new Response(JSON.stringify({ pending: rows.length, delivered: delivered.size }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err?.message || String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return new Response('Not found', { status: 404 });
  },
  async scheduled(_c: ScheduledController, env: Env): Promise<void> {
    const rows = (await rpc<Row[]>(env, 'push_take_batch', { p_limit: 100 })) ?? [];
    const delivered = new Set<number>();
    for (let i = 0; i < rows.length; i += 10) {
      await Promise.all(rows.slice(i, i + 10).map(async r => {
        const out = await send(env, r);
        if (out === 'ok') delivered.add(r.id); else if (out === 'gone') await rpc(env, 'push_drop_subscription', { p_endpoint: r.endpoint }).catch(() => {});
      }));
    }
    if (delivered.size) await rpc(env, 'push_mark_sent', { p_ids: [...delivered] });
    await rpc(env, 'push_prune').catch(() => {});
  },
};
