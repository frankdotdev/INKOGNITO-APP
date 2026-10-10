import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { rpc, signRoomToken, wsResponse } from './lib';

type Att = { identity: string; since: number; claimed: boolean; mode: string };
const OPEN = 1;
const RECENT_MS = 10 * 60_000;
const ROOM_TTL_MS = 2 * 3600_000;

/** One global instance. Waiting sockets are the queue; they hibernate, so the queue survives idle periods. */
export class Matchmaker extends DurableObject<Env> {
  private recent = new Map<string, { peer: string; at: number }>(); // best effort: avoids instant rematching
  private joins = new Map<string, number[]>();

  async fetch(req: Request): Promise<Response> {
    const identity = req.headers.get('X-Identity'), mode = req.headers.get('X-Mode') ?? 'text';
    if (!identity || !['text', 'audio', 'video'].includes(mode)) return new Response('Bad request', { status: 400 });
    const now = Date.now();
    const recentJoins = (this.joins.get(identity) ?? []).filter(t => now - t < 60_000);
    if (recentJoins.length >= 20) return new Response('Too many attempts', { status: 429 });
    this.joins.set(identity, [...recentJoins, now]);

    for (const ws of this.ctx.getWebSockets()) { // one waiting socket per identity
      if ((ws.deserializeAttachment() as Att | null)?.identity === identity) { try { ws.send(JSON.stringify({ type: 'replaced' })); ws.close(1000, 'replaced'); } catch {} }
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ identity, since: now, claimed: false, mode } satisfies Att);
    server.send(JSON.stringify({ type: 'searching' }));
    this.ctx.waitUntil(this.tryMatch(server));
    return wsResponse(client);
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === 'string' && message.length < 100 && message.includes('cancel')) { try { ws.close(1000, 'cancelled'); } catch {} }
  }
  webSocketClose(ws: WebSocket, code: number) { try { ws.close(code, 'closed'); } catch {} }

  private att(ws: WebSocket) { return ws.deserializeAttachment() as Att | null; }

  private async tryMatch(me: WebSocket) {
    const mine = this.att(me);
    if (!mine) return;
    const others = this.ctx.getWebSockets()
      .filter(s => s !== me && s.readyState === OPEN)
      .map(s => ({ s, a: this.att(s) }))
      .filter((x): x is { s: WebSocket; a: Att } => !!x.a && !x.a.claimed && x.a.identity !== mine.identity)
      .sort((x, y) => x.a.since - y.a.since);

    for (const c of others.slice(0, 8)) {
      if (me.readyState !== OPEN || this.att(me)?.claimed) return;
      if (this.recentlyMatched(mine.identity, c.a.identity)) continue;
      let blocked: boolean;
      try { blocked = await rpc<boolean>(this.env, 'random_blocked', { p_a: mine.identity, p_b: c.a.identity }); } catch { continue; } // fail closed
      if (blocked) continue;
      // Re-check after the await, then claim both synchronously so no other join can take either.
      const meNow = this.att(me), cNow = this.att(c.s);
      if (me.readyState !== OPEN || !meNow || meNow.claimed) return;
      if (c.s.readyState !== OPEN || !cNow || cNow.claimed) continue;
      meNow.claimed = true; cNow.claimed = true; me.serializeAttachment(meNow); c.s.serializeAttachment(cNow);
      if (await this.makeRoom(me, meNow, c.s, cNow)) return;
      meNow.claimed = false; cNow.claimed = false;
      try { me.serializeAttachment(meNow); } catch {} try { c.s.serializeAttachment(cNow); } catch {}
    }
  }

  private async makeRoom(x: WebSocket, xa: Att, y: WebSocket, ya: Att): Promise<boolean> {
    const room = crypto.randomUUID();
    try {
      const init = await this.env.ROOM.get(this.env.ROOM.idFromName(room)).fetch('https://room/init', { method: 'POST', body: JSON.stringify({ room, a: xa.identity, b: ya.identity, mode: xa.mode }) });
      if (!init.ok) return false;
      await rpc(this.env, 'random_open_session', { p_id: room, p_mode: xa.mode, p_a: xa.identity, p_b: ya.identity });
    } catch { return false; }
    const exp = Date.now() + ROOM_TTL_MS;
    for (const [ws, slot] of [[x, 'a'], [y, 'b']] as const) {
      try { ws.send(JSON.stringify({ type: 'matched', token: await signRoomToken(this.env.ROOM_SECRET, room, slot, exp) })); ws.close(1000, 'matched'); } catch {}
    }
    this.recent.set(xa.identity, { peer: ya.identity, at: Date.now() }); this.recent.set(ya.identity, { peer: xa.identity, at: Date.now() });
    if (this.recent.size > 5000) { const cutoff = Date.now() - RECENT_MS; for (const [k, v] of this.recent) if (v.at < cutoff) this.recent.delete(k); }
    return true;
  }
  private recentlyMatched(a: string, b: string) { const r = this.recent.get(a); return !!r && r.peer === b && Date.now() - r.at < RECENT_MS; }
}
