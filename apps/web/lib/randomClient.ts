import type { ReportCategory } from '@inkognito/core';
import { supabase, ensureSession } from './supabase';
export type RandomState = 'idle' | 'searching' | 'connecting' | 'waiting_partner' | 'chatting' | 'reconnecting' | 'peer_left' | 'ended' | 'error' | 'permission_denied';
export type ChatMessage = { id: string; mine: boolean; text: string; at: number };
export interface RandomEvents { onState(s: RandomState): void; onMessage(m: ChatMessage): void; onTyping(on: boolean): void; onNotice(text: string): void; onLocalStream?(s: MediaStream | null): void; onRemoteStream?(s: MediaStream | null): void }
const MAX_RECONNECTS = 4;
/** Text random chat over the Cloudflare Worker: one socket to find a match, then one socket to the room. */
export class RandomChat {
  private ws: WebSocket | null = null; private token: string | null = null; private destroyed = false; private attempts = 0; private state: RandomState = 'idle'; private timer?: ReturnType<typeof setTimeout>;
  constructor(private base: string, private ev: RandomEvents, private mode: 'text' | 'audio' | 'video' = 'text') {}
  private pc: RTCPeerConnection | null = null; private local: MediaStream | null = null; private pendingIce: RTCIceCandidateInit[] = []; private queued: any[] = [];
  private set(s: RandomState) { this.state = s; this.ev.onState(s); }
  private parse(d: unknown) { try { return JSON.parse(String(d)) as { type: string; [k: string]: any }; } catch { return null; } }
  private closeSocket() { const w = this.ws; this.ws = null; if (w) { w.onclose = null; w.onmessage = null; w.onerror = null; try { w.close(); } catch {} } }

  async join() {
    clearTimeout(this.timer); this.closeSocket(); this.token = null; this.attempts = 0; this.set('searching');
    try {
      await ensureSession();
      const { data } = await supabase.auth.getSession(); const at = data.session?.access_token; if (!at) throw new Error('no session');
      if (this.destroyed) return;
      const ws = new WebSocket(`${this.base}/match?mode=${this.mode}`, ['ink', `bearer.${at}`]); this.ws = ws;
      ws.onmessage = e => { const m = this.parse(e.data); if (m?.type === 'matched') { this.token = m.token; this.set('connecting'); this.closeSocket(); this.openRoom(); } else if (m?.type === 'replaced') { this.set('ended'); } };
      ws.onclose = () => { if (!this.destroyed && this.state === 'searching') this.set('error'); };
      ws.onerror = () => { if (!this.destroyed && this.state === 'searching') this.set('error'); };
    } catch { this.set('error'); }
  }
  private openRoom() {
    if (this.destroyed || !this.token) return;
    const ws = new WebSocket(`${this.base}/room`, ['ink', `room.${this.token}`]); this.ws = ws;
    ws.onmessage = e => {
      const m = this.parse(e.data); if (!m) return;
      if (m.type === 'waiting_partner') this.set('waiting_partner');
      else if (m.type === 'ready') { this.attempts = 0; this.set('chatting'); if (this.mode !== 'text') this.startMedia(m.initiator === true); }
      else if (m.type === 'signal') this.onSignal(m.data);
      else if (m.type === 'msg') this.ev.onMessage({ id: crypto.randomUUID(), mine: false, text: String(m.text), at: Number(m.at) || Date.now() });
      else if (m.type === 'typing') this.ev.onTyping(m.on === true);
      else if (m.type === 'slow_down') this.ev.onNotice('Slow down a little.');
      else if (m.type === 'report_failed' || m.type === 'block_failed') this.ev.onNotice("That didn't go through. Try again.");
      else if (m.type === 'ended') { this.stopMedia(); this.ws?.close(); this.closeSocket(); this.set(m.reason === 'peer_left' ? 'peer_left' : 'ended'); }
    };
    ws.onclose = () => this.lost();
    ws.onerror = () => {};
  }
  private lost() {
    if (this.destroyed || this.state === 'peer_left' || this.state === 'ended' || this.state === 'error' || this.state === 'permission_denied') return;
    if (this.attempts >= MAX_RECONNECTS) { this.set('error'); return; }
    this.set('reconnecting'); this.attempts++;
    this.timer = setTimeout(() => this.openRoom(), Math.min(1000 * 2 ** (this.attempts - 1), 8000));
  }
  private send(o: unknown) { if (this.ws?.readyState === WebSocket.OPEN) { this.ws.send(JSON.stringify(o)); return true; } return false; }
  sendText(text: string) { const t = text.trim(); if (!t || this.state !== 'chatting') return false; if (!this.send({ type: 'msg', text: t })) return false; this.ev.onMessage({ id: crypto.randomUUID(), mine: true, text: t, at: Date.now() }); return true; }
  typing(on: boolean) { if (this.state === 'chatting') this.send({ type: 'typing', on }); }
  report(category: ReportCategory) { return this.send({ type: 'report', category }); }
  block() { return this.send({ type: 'block' }); }
  next() { this.send({ type: 'next' }); this.stopMedia(); this.closeSocket(); return this.join(); }
  leave() { this.send({ type: 'leave' }); this.stopMedia(); this.closeSocket(); this.set('ended'); }
  destroy() { this.destroyed = true; clearTimeout(this.timer); this.stopMedia(); if (this.state === 'chatting') this.send({ type: 'leave' }); this.closeSocket(); }

  // ---- audio and video (WebRTC). Media goes peer to peer or through Cloudflare TURN; the Worker only relays signalling. ----
  private httpBase() { return this.base.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'); }
  private async startMedia(initiator: boolean) {
    if (this.pc || this.local || this.mode === 'text') return;
    try { this.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: this.mode === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false }); }
    catch { this.send({ type: 'leave' }); this.closeSocket(); this.set('permission_denied'); return; } // the other person is told we left
    this.ev.onLocalStream?.(this.local);
    let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];
    try { const { data } = await supabase.auth.getSession(); const r = await fetch(`${this.httpBase()}/rtc/ice?mode=${this.mode}`, { headers: { Authorization: `Bearer ${data.session?.access_token}` } }); if (r.ok) iceServers = (await r.json()).iceServers; } catch {}
    const pc = new RTCPeerConnection({ iceServers }); this.pc = pc;
    this.local.getTracks().forEach(t => pc.addTrack(t, this.local!));
    pc.ontrack = e => this.ev.onRemoteStream?.(e.streams[0] ?? null);
    pc.onicecandidate = e => { if (e.candidate) this.send({ type: 'signal', data: { candidate: e.candidate.toJSON() } }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this.ev.onNotice("The call couldn't connect. Try Next."); };
    for (const d of this.queued.splice(0)) await this.process(d);
    if (initiator) { const offer = await pc.createOffer(); await pc.setLocalDescription(offer); this.send({ type: 'signal', data: { sdp: pc.localDescription } }); }
  }
  private async onSignal(d: any) { if (!d || typeof d !== 'object') return; if (!this.pc) { this.queued.push(d); return; } await this.process(d); }
  private async process(d: any) {
    const pc = this.pc!;
    try {
      if (d.sdp) {
        await pc.setRemoteDescription(d.sdp);
        if (d.sdp.type === 'offer') { const a = await pc.createAnswer(); await pc.setLocalDescription(a); this.send({ type: 'signal', data: { sdp: pc.localDescription } }); }
        for (const c of this.pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      } else if (d.candidate) { if (pc.remoteDescription) await pc.addIceCandidate(d.candidate).catch(() => {}); else this.pendingIce.push(d.candidate); }
    } catch {}
  }
  private stopMedia() {
    this.local?.getTracks().forEach(t => t.stop()); this.local = null; try { this.pc?.close(); } catch {} this.pc = null; this.pendingIce = []; this.queued = [];
    this.ev.onLocalStream?.(null); this.ev.onRemoteStream?.(null);
  }
  setMic(on: boolean) { this.local?.getAudioTracks().forEach(t => (t.enabled = on)); }
  setCamera(on: boolean) { this.local?.getVideoTracks().forEach(t => (t.enabled = on)); }
}
