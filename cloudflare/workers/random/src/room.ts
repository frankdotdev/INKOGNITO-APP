import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { rpc, wsResponse } from './lib';

type Slot = 'a' | 'b';
type BufMsg = { s: Slot; t: string; at: number };
const OPEN = 1;
const JOIN_DEADLINE_MS = 90_000, GRACE_MS = 30_000, MAX_LIFE_MS = 2 * 3600_000;
const MAX_TEXT = 1000, BUFFER = 30, MAX_FRAME = 4096;
const CATEGORIES = new Set(['harassment', 'threat', 'sexual', 'childSafety', 'spam', 'scam', 'hate', 'selfHarm', 'illegal', 'other']);

/** One two-person room. Messages are relayed, never stored, except a short rolling buffer kept only so a report can include context. */
export class Room extends DurableObject<Env> {
  private sent = new Map<Slot, number[]>(); // per-slot send times for rate limiting (best effort)
  private signals = new Map<Slot, number[]>();

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') {
      if (await this.ctx.storage.get('init')) return new Response('exists', { status: 409 });
      const { room, a, b, mode } = await req.json<{ room: string; a: string; b: string; mode?: string }>();
      if (!room || !a || !b || a === b) return new Response('bad', { status: 400 });
      const now = Date.now();
      await this.ctx.storage.put({ init: true, room, a, b, mode: mode === 'audio' || mode === 'video' ? mode : 'text', buf: [], maxAt: now + MAX_LIFE_MS });
      await this.ctx.storage.setAlarm(now + JOIN_DEADLINE_MS);
      return new Response('ok');
    }
    const slot = req.headers.get('X-Slot');
    if ((slot !== 'a' && slot !== 'b') || !(await this.ctx.storage.get('init'))) return new Response('Gone', { status: 410 });
    for (const old of this.ctx.getWebSockets(slot)) { try { old.close(1000, 'replaced'); } catch {} } // reconnect replaces the old socket
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [slot]);
    await this.announce();
    return wsResponse(client);
  }

  private open(): { ws: WebSocket; slot: Slot }[] {
    return this.ctx.getWebSockets().filter(w => w.readyState === OPEN).map(ws => ({ ws, slot: this.ctx.getTags(ws)[0] as Slot }));
  }
  private send(ws: WebSocket, o: unknown) { try { ws.send(JSON.stringify(o)); } catch {} }
  private peerOf(slot: Slot) { return this.open().find(x => x.slot !== slot)?.ws; }

  private async announce() {
    const sockets = this.open();
    if (new Set(sockets.map(s => s.slot)).size === 2) {
      const mode = (await this.ctx.storage.get<string>('mode')) ?? 'text';
      for (const s of sockets) this.send(s.ws, { type: 'ready', initiator: s.slot === 'a', mode }); // the 'a' side makes the WebRTC offer
      await this.ctx.storage.setAlarm((await this.ctx.storage.get<number>('maxAt')) ?? Date.now() + MAX_LIFE_MS);
    } else for (const s of sockets) this.send(s.ws, { type: 'waiting_partner' });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string' || message.length > MAX_FRAME) return;
    const slot = this.ctx.getTags(ws)[0] as Slot;
    let m: { type?: string; text?: unknown; on?: unknown; category?: unknown; data?: unknown };
    try { m = JSON.parse(message); } catch { return; }
    const peer = this.peerOf(slot);

    if (m.type === 'msg') {
      const text = typeof m.text === 'string' ? m.text.trim().slice(0, MAX_TEXT) : '';
      if (!text || !peer) return;
      const now = Date.now(), recent = (this.sent.get(slot) ?? []).filter(t => now - t < 5000);
      if (recent.length >= 6) { this.send(ws, { type: 'slow_down' }); return; }
      this.sent.set(slot, [...recent, now]);
      this.send(peer, { type: 'msg', text, at: now });
      const buf = (await this.ctx.storage.get<BufMsg[]>('buf')) ?? [];
      await this.ctx.storage.put('buf', [...buf, { s: slot, t: text, at: now }].slice(-BUFFER));
    } else if (m.type === 'signal') { // WebRTC offer/answer/ICE relay for audio and video rooms; the media itself never passes through here
      if ((await this.ctx.storage.get<string>('mode')) === 'text' || !peer || typeof (m as { data?: unknown }).data !== 'object' || message.length > 12_000) return;
      const now = Date.now(), recent = (this.signals.get(slot) ?? []).filter(t => now - t < 10_000);
      if (recent.length >= 80) return; this.signals.set(slot, [...recent, now]);
      this.send(peer, { type: 'signal', data: (m as { data: unknown }).data });
    } else if (m.type === 'typing') {
      if (peer) this.send(peer, { type: 'typing', on: m.on === true });
    } else if (m.type === 'next' || m.type === 'leave') {
      await this.end('left', slot);
    } else if (m.type === 'report' && typeof m.category === 'string' && CATEGORIES.has(m.category)) {
      const identity = await this.ctx.storage.get<string>(slot);
      const transcript = (await this.ctx.storage.get<BufMsg[]>('buf')) ?? [];
      try { await rpc(this.env, 'random_file_report', { p_session: await this.ctx.storage.get<string>('room'), p_reporter: identity, p_category: m.category, p_transcript: transcript }); this.send(ws, { type: 'reported' }); }
      catch { this.send(ws, { type: 'report_failed' }); return; }
      await this.end('left', slot);
    } else if (m.type === 'block') {
      const identity = await this.ctx.storage.get<string>(slot);
      try { await rpc(this.env, 'random_block_peer', { p_session: await this.ctx.storage.get<string>('room'), p_blocker: identity }); this.send(ws, { type: 'blocked' }); }
      catch { this.send(ws, { type: 'block_failed' }); return; }
      await this.end('left', slot);
    }
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try { ws.close(code, 'closed'); } catch {}
    if (!(await this.ctx.storage.get('init'))) return;
    const slot = this.ctx.getTags(ws)[0] as Slot;
    const peer = this.peerOf(slot);
    if (peer) { this.send(peer, { type: 'peer_reconnecting' }); await this.ctx.storage.setAlarm(Date.now() + GRACE_MS); } // peer has 30s to come back
  }
  async webSocketError(ws: WebSocket) { await this.webSocketClose(ws, 1011); }

  async alarm() {
    if (!(await this.ctx.storage.get('init'))) return;
    const both = new Set(this.open().map(x => x.slot)).size === 2;
    const maxAt = (await this.ctx.storage.get<number>('maxAt')) ?? 0;
    if (both && Date.now() < maxAt) { await this.ctx.storage.setAlarm(maxAt); return; }
    await this.end(both ? 'timeout' : 'peer_lost');
  }

  /** Tells everyone why it ended, closes sockets, and erases all room state (including the report buffer). */
  private async end(reason: 'left' | 'timeout' | 'peer_lost', initiator?: Slot) {
    const sockets = this.open();
    for (const s of sockets) {
      const why = reason === 'left' ? (s.slot === initiator ? 'you_left' : 'peer_left') : reason === 'peer_lost' ? 'peer_left' : 'timeout';
      this.send(s.ws, { type: 'ended', reason: why });
      try { s.ws.close(1000, 'ended'); } catch {}
    }
    const room = await this.ctx.storage.get<string>('room');
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    if (room) await rpc(this.env, 'random_close_session', { p_id: room, p_reason: reason }).catch(() => {});
  }
}
